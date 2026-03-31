import { task, metadata, logger } from "@trigger.dev/sdk/v3";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelligenceScanPayload {
  profileId: string;
  jobId: string;
  city?: string; // null = scan all target cities
}

export interface IntelligenceScanStatus {
  step: "loading" | "scanning" | "crawling" | "analyzing" | "classifying" | "detecting" | "matching" | "summarizing" | "completed" | "failed";
  label: string;
  city?: string;
  citiesCompleted?: number;
  citiesTotal?: number;
  businessesFound?: number;
  matchesFound?: number;
  progress?: number;
}

interface ScanCityResult {
  city: string;
  businessesFound: number;
  newBusinesses: number;
  updatedBusinesses: number;
}

// ---------------------------------------------------------------------------
// Standalone Prisma (Trigger.dev worker context)
// ---------------------------------------------------------------------------

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Main Orchestrator Task
// ---------------------------------------------------------------------------

export const intelligenceScanTask = task({
  id: "intelligence-scan",
  queue: {
    name: "intelligence-scan",
    concurrencyLimit: 2, // Max 2 scans at a time
  },
  maxDuration: 1800, // 30 minutes max
  retry: {
    maxAttempts: 1, // Don't retry orchestrator
  },
  run: async (payload: IntelligenceScanPayload) => {
    const { profileId, jobId, city } = payload;
    const prisma = createPrisma();

    try {
      // Step 1: Load profile
      setStatus({
        step: "loading",
        label: "Profiel laden...",
        progress: 5,
      });

      const profile = await prisma.intelligenceProfile.findUnique({
        where: { id: profileId },
      });

      if (!profile) throw new Error(`Profile not found: ${profileId}`);

      // Mark job as running
      await prisma.intelligenceScanJob.update({
        where: { id: jobId },
        data: { status: "running", startedAt: new Date() },
      });

      // Determine cities to scan
      const citiesToScan = city ? [city] : profile.targetCities;

      // Build keyword set: profile keywords + concept as primary,
      // generic horeca terms as secondary (for conversion candidates).
      // We pass only primary keywords to scanCity and let it handle
      // generic keyword merging via includeGenericHoreca option,
      // so progress tracking can distinguish keyword sources.
      const { planProfileScan } = await import("@/lib/intelligence/pipeline");
      const keywordSet = planProfileScan(profile);
      const keywords = keywordSet.primary;

      logger.info("Starting intelligence scan", {
        profileId,
        cities: citiesToScan,
        primaryKeywords: keywordSet.primary,
        secondaryKeywords: keywordSet.secondary,
        totalKeywords: keywordSet.all.length,
      });

      // Step 2: Scan each city
      let totalBusinessesFound = 0;
      let totalNewBusinesses = 0;
      const cityResults: ScanCityResult[] = [];

      for (let i = 0; i < citiesToScan.length; i++) {
        const currentCity = citiesToScan[i];

        setStatus({
          step: "scanning",
          label: `Scanning ${currentCity}...`,
          city: currentCity,
          citiesCompleted: i,
          citiesTotal: citiesToScan.length,
          businessesFound: totalBusinessesFound,
          progress: Math.round(10 + (i / citiesToScan.length) * 40),
        });

        try {
          const result = await scanSingleCity(prisma, currentCity, keywords, profile);
          cityResults.push(result);
          totalBusinessesFound += result.businessesFound;
          totalNewBusinesses += result.newBusinesses;

          logger.info(`City scan completed: ${currentCity}`, { ...result });
        } catch (error) {
          logger.error(`City scan failed: ${currentCity}`, { error });
          // Continue with next city
        }

        // Update job progress
        await prisma.intelligenceScanJob.update({
          where: { id: jobId },
          data: {
            progress: Math.round(((i + 1) / citiesToScan.length) * 50),
            businessesFound: totalBusinessesFound,
          },
        });
      }

      // Step 3: Deep Crawl top businesses (Phase 2)
      setStatus({
        step: "crawling",
        label: "Websites & bronnen crawlen...",
        businessesFound: totalBusinessesFound,
        progress: 55,
      });

      // Only deep crawl the top N businesses by signal score (to save Firecrawl credits)
      const { runDeepCrawlForProfile, detectSignalsForCities, generateAndSaveMatchSummaries } =
        await import("@/lib/intelligence/scan-engine");
      const topBusinesses = await runDeepCrawlForProfile(prisma, profile, citiesToScan, {
        maxBusinesses: 30,
        onProgress: (completed, total, current) => {
          setStatus({
            step: "crawling",
            label: `Crawlen: ${current} (${completed}/${total})`,
            businessesFound: totalBusinessesFound,
            progress: Math.round(55 + (completed / total) * 15),
          });
        },
      });

      logger.info("Deep crawl completed", {
        profileId,
        crawledCount: topBusinesses.length,
      });

      // Step 4: AI Analysis for top matches (Phase 3)
      setStatus({
        step: "analyzing",
        label: "AI intelligence analyse...",
        businessesFound: totalBusinessesFound,
        progress: 75,
      });

      const businessesWithIntel = await prisma.monitoredBusiness.findMany({
        where: {
          city: { in: citiesToScan },
          crawledIntel: { crawlStatus: "complete" },
        },
        orderBy: { signalScore: "desc" },
        take: 20, // Generate dossiers for top 20 businesses
      });

      const { generateIntelligenceDossier } = await import("@/lib/intelligence/agent");
      let dossiersGenerated = 0;

      for (const biz of businessesWithIntel) {
        try {
          await generateIntelligenceDossier(biz.id);
          dossiersGenerated++;
        } catch (e) {
          logger.warn(`Dossier generation failed for ${biz.name}`, { error: e });
        }
      }

      logger.info("AI analysis completed", {
        profileId,
        dossiersGenerated,
        dossiersAttempted: businessesWithIntel.length,
      });

      // Step 5: Detect signals for all scanned businesses (Phase 4 — upgraded with crawled data)
      setStatus({
        step: "detecting",
        label: "Signalen detecteren...",
        businessesFound: totalBusinessesFound,
        progress: 80,
      });

      await detectSignalsForCities(prisma, citiesToScan);

      // Step 6: Match businesses against profile (Phase 5)
      setStatus({
        step: "matching",
        label: "Matches berekenen...",
        businessesFound: totalBusinessesFound,
        progress: 85,
      });

      const matchResults = await runMatching(prisma, profileId);

      // Step 7: Generate AI summaries for top matches (Phase 6)
      setStatus({
        step: "summarizing",
        label: `AI analyse voor ${Math.min(matchResults.length, 20)} matches...`,
        businessesFound: totalBusinessesFound,
        matchesFound: matchResults.length,
        progress: 92,
      });

      await generateAndSaveMatchSummaries(prisma, profileId);

      // Step 8: Complete
      await prisma.intelligenceScanJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          progress: 100,
          businessesFound: totalBusinessesFound,
          matchesFound: matchResults.length,
          completedAt: new Date(),
        },
      });

      // Update profile stats
      await prisma.intelligenceProfile.update({
        where: { id: profileId },
        data: {
          lastScanAt: new Date(),
          totalScanned: { increment: totalBusinessesFound },
          totalMatches: matchResults.length,
        },
      });

      setStatus({
        step: "completed",
        label: `Scan voltooid! ${totalBusinessesFound} zaken gevonden, ${matchResults.length} matches.`,
        businessesFound: totalBusinessesFound,
        matchesFound: matchResults.length,
        progress: 100,
      });

      logger.info("Intelligence scan completed", {
        profileId,
        totalBusinessesFound,
        totalNewBusinesses,
        matches: matchResults.length,
      });

      return {
        businessesFound: totalBusinessesFound,
        newBusinesses: totalNewBusinesses,
        matches: matchResults.length,
        cities: cityResults,
      };
    } catch (error) {
      logger.error("Intelligence scan failed", { error });

      await prisma.intelligenceScanJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Onbekende fout",
        },
      });

      setStatus({
        step: "failed",
        label: "Scan mislukt",
        progress: 0,
      });

      throw error;
    } finally {
      await prisma.$disconnect();
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(status: IntelligenceScanStatus) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata.set("status", status as any);
}

/**
 * Scan a single city for horeca businesses using Google Places API
 */
async function scanSingleCity(
  prisma: PrismaClient,
  cityName: string,
  keywords: string[],
  profile: {
    name?: string | null;
    concept?: string | null;
    conceptDescription?: string | null;
    competitorKeywords?: string[] | null;
    operatingModel?: string[] | null;
  },
): Promise<ScanCityResult> {
  // Import scanner functions dynamically (to keep Trigger.dev bundle lean)
  const { scanCity } = await import("@/lib/intelligence/scanner");

  const result = await scanCity(cityName, keywords, {
    includeGenericHoreca: false,
    profile,
    onProgress: (progress) => {
      const sourceLabel = progress.currentKeyword
        ? ` — "${progress.currentKeyword}" (${progress.keywordSource === "generic" ? "generiek" : "profiel"})`
        : "";
      setStatus({
        step: "scanning",
        label: `${cityName}: ${progress.found} zaken gevonden${sourceLabel}`,
        city: cityName,
        businessesFound: progress.found,
        progress: Math.round(10 + (progress.processed / Math.max(progress.total, 1)) * 40),
      });
    },
  });

  return {
    city: cityName,
    businessesFound: result.businessesFound,
    newBusinesses: result.newBusinesses,
    updatedBusinesses: result.updatedBusinesses,
  };
}

/**
 * Run profile matching and save results
 */
async function runMatching(
  prisma: PrismaClient,
  profileId: string,
): Promise<Array<{ businessId: string; matchScore: number }>> {
  const { matchBusinessesToProfile } = await import("@/lib/intelligence/matcher");

  const results = await matchBusinessesToProfile(profileId, {
    minScore: 30,
    limit: 100,
  });

  return results.map((r) => ({
    businessId: r.businessId,
    matchScore: r.matchScore,
  }));
}
