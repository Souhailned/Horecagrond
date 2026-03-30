"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import type { IntelligenceScanJob } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Start a new intelligence scan for a profile.
 * Creates a scan job record and triggers the Trigger.dev background task.
 */
export async function startScan(
  profileId: string,
  city?: string,
): Promise<ActionResult<{ jobId: string }>> {
  const authCheck = await requirePermission("intelligence:scan");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  // Rate limit: max 3 scans per hour
  const rl = await checkRateLimit(`intelligence:scan:${userId}`, "ai");
  if (!rl.success) {
    return { success: false, error: "Scan limiet bereikt. Probeer later opnieuw." };
  }

  try {
    // Verify ownership
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    // Check for running scans
    const runningScan = await prisma.intelligenceScanJob.findFirst({
      where: {
        profileId,
        status: { in: ["pending", "running"] },
      },
    });
    if (runningScan) {
      return { success: false, error: "Er loopt al een scan voor dit profiel" };
    }

    // Create scan job
    const scanJob = await prisma.intelligenceScanJob.create({
      data: {
        profileId,
        city: city ?? null,
        status: "pending",
      },
    });

    // Determine scan strategy: AI agent (if model available) or direct sequential
    const scanFn = async () => {
      try {
        // Quick check if AI model is available (Groq or OpenAI key present)
        const hasAiModel = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
        if (hasAiModel) {
          // Use AI agent with AbortController for proper cancellation
          const timeoutMs = 4 * 60_000; // 4 min timeout — scanCity takes ~2.5min for large cities
          const abortController = new AbortController();
          const timer = setTimeout(() => abortController.abort(), timeoutMs);
          try {
            console.log("[intelligence-scan] Starting agent scan (90s timeout)...");
            await runAgentScan(profileId, scanJob.id, city ?? undefined, abortController.signal);
            clearTimeout(timer);
            return;
          } catch (agentErr) {
            clearTimeout(timer);
            const isTimeout = abortController.signal.aborted;
            console.warn(`[intelligence-scan] Agent ${isTimeout ? "timed out (90s)" : "failed"}, falling back to direct scan:`, agentErr);
            // Reset progress for direct scan fallback
            await prisma.intelligenceScanJob.update({
              where: { id: scanJob.id },
              data: { progress: 5 },
            }).catch(() => {});
            return runScanDirectly(profileId, scanJob.id, city ?? undefined);
          }
        } else {
          console.log("[intelligence-scan] No AI model available, running direct scan");
          return runScanDirectly(profileId, scanJob.id, city ?? undefined);
        }
      } catch (err) {
        console.warn("[intelligence-scan] Scan failed, no more fallbacks:", err);
        throw err;
      }
    };

    // Run non-blocking
    scanFn().catch((err) => {
      console.error("[intelligence-scan] Scan failed:", err);
      prisma.intelligenceScanJob.update({
        where: { id: scanJob.id },
        data: { status: "failed", error: err?.message ?? "Scan mislukt" },
      }).catch(() => {});
    });

    return { success: true, data: { jobId: scanJob.id } };
  } catch (error) {
    console.error("[intelligence-scan] Start scan failed:", error);
    return { success: false, error: "Scan starten mislukt" };
  }
}

/**
 * Get scan jobs for a profile
 */
export async function getScanJobs(
  profileId: string,
): Promise<ActionResult<IntelligenceScanJob[]>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    const jobs = await prisma.intelligenceScanJob.findMany({
      where: { profileId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { success: true, data: jobs };
  } catch (error) {
    console.error("[intelligence-scan] Get jobs failed:", error);
    return { success: false, error: "Scan history ophalen mislukt" };
  }
}

/**
 * Cancel a running scan
 */
export async function cancelScan(
  jobId: string,
): Promise<ActionResult<void>> {
  const authCheck = await requirePermission("intelligence:scan");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const job = await prisma.intelligenceScanJob.findUnique({
      where: { id: jobId },
      include: { profile: { select: { userId: true } } },
    });

    if (!job || job.profile.userId !== userId) {
      return { success: false, error: "Scan niet gevonden" };
    }

    if (job.status !== "pending" && job.status !== "running") {
      return { success: false, error: "Scan is al afgerond" };
    }

    // Cancel the Trigger.dev run if we have the ID
    if (job.triggerRunId) {
      try {
        const { runs } = await import("@trigger.dev/sdk/v3");
        await runs.cancel(job.triggerRunId);
      } catch {
        // Best effort — the job might have already completed
      }
    }

    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { status: "failed", error: "Geannuleerd door gebruiker" },
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("[intelligence-scan] Cancel failed:", error);
    return { success: false, error: "Annuleren mislukt" };
  }
}

// ---------------------------------------------------------------------------
// Deep Investigate — crawl + AI for a single business
// ---------------------------------------------------------------------------

/**
 * Deep investigate a single business — crawl all sources + generate AI dossier.
 * Called when makelaar clicks "Diep Onderzoek" on a match.
 */
export async function deepInvestigate(
  businessId: string,
): Promise<ActionResult<{ intelId: string }>> {
  const authCheck = await requirePermission("intelligence:scan");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  // Rate limit: max 5 deep investigations per hour
  const rl = await checkRateLimit(`intelligence:deep:${userId}`, "ai");
  if (!rl.success) {
    return { success: false, error: "Onderzoek limiet bereikt. Probeer later opnieuw." };
  }

  try {
    // Load business
    const business = await prisma.monitoredBusiness.findUnique({
      where: { id: businessId },
    });
    if (!business) return { success: false, error: "Zaak niet gevonden" };

    // Run deep crawl
    const { crawlBusiness } = await import("@/lib/intelligence/crawler");
    const crawlResult = await crawlBusiness(business);

    // Generate AI dossier
    const { generateIntelligenceDossier } = await import("@/lib/intelligence/agent");
    await generateIntelligenceDossier(businessId);

    // Get the intel record
    const intel = await prisma.crawledBusinessIntel.findUnique({
      where: { businessId },
    });

    // Revalidate intelligence pages so the UI reflects the new dossier
    revalidatePath("/dashboard/intelligence");

    return {
      success: true,
      data: { intelId: intel?.id ?? crawlResult.businessId },
    };
  } catch (error) {
    console.error("[intelligence-scan] Deep investigate failed:", error);
    return { success: false, error: "Diep onderzoek mislukt. Probeer later opnieuw." };
  }
}

// ---------------------------------------------------------------------------
// Direct scan execution (fallback when Trigger.dev is unavailable)
// ---------------------------------------------------------------------------

/**
 * AI Agent-powered scan using AI SDK 6 generateText + tools.
 * The agent autonomously calls scanCity, detectSignals, matchProfile tools.
 */
async function runAgentScan(
  profileId: string,
  jobId: string,
  city?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  try {
    const { generateText, tool, stepCountIs } = await import("ai");
    const { getModel } = await import("@/lib/ai/model");
    const { model } = await getModel();
    const { z } = await import("zod");

    const profile = await prisma.intelligenceProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new Error("Profiel niet gevonden");

    const citiesToScan = city ? [city] : profile.targetCities;
    let totalBusinessesFound = 0;
    let totalMatches = 0;
    let currentProgress = 0;

    // Helper: only update progress if it's higher than current (never go backwards)
    const updateProgress = async (newProgress: number, extraData?: Record<string, unknown>) => {
      if (newProgress <= currentProgress) return;
      currentProgress = newProgress;
      await prisma.intelligenceScanJob.update({
        where: { id: jobId },
        data: { progress: newProgress, ...extraData },
      }).catch(() => {});
    };

    // Build keyword set from profile: concept + competitorKeywords as primary
    const { planProfileScan } = await import("@/lib/intelligence/pipeline");
    const {
      runDeepCrawlForProfile,
      detectSignalsForCities,
      generateAndSaveMatchSummaries,
    } = await import("@/lib/intelligence/scan-engine");
    const keywordSet = planProfileScan(profile);
    // Limit to top 5 primary keywords — Google deduplicates well and more keywords
    // mostly find the same places (15 keywords → 22min, 5 keywords → ~4min)
    const scanKeywords = keywordSet.primary.slice(0, 5);
    console.log(`[agent-scan] Using ${scanKeywords.length} keywords: ${scanKeywords.join(", ")}`);

    // Mark running
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), progress: 5 },
    });

    // Tool: Scan a city
    const searchCity = tool({
      description: "Scan een stad voor horecazaken via Google Places.",
      inputSchema: z.object({
        city: z.string(),
        keywords: z.array(z.string()),
      }),
      execute: async ({ city: c, keywords }) => {
        await updateProgress(20);
        try {
          const { scanCity: sc } = await import("@/lib/intelligence/scanner");
          const result = await sc(c, keywords, {
            includeGenericHoreca: false,
            profile,
          });
          totalBusinessesFound += result.businessesFound;
          await updateProgress(40, { businessesFound: totalBusinessesFound });
          return `${c}: ${result.businessesFound} zaken gevonden (${result.newBusinesses} nieuw).`;
        } catch (e) {
          return `Scan ${c} mislukt: ${e instanceof Error ? e.message : "fout"}. Ga door.`;
        }
      },
    });

    // Tool: Detect signals
    const detectSignalsTool = tool({
      description: "Detecteer overname-signalen voor gescande zaken.",
      inputSchema: z.object({ cities: z.array(z.string()) }),
      execute: async ({ cities }) => {
        await updateProgress(60);
        try {
          const before = await prisma.monitoredBusiness.count({
            where: { city: { in: cities }, signalScore: { gt: 20 } },
          });
          await detectSignalsForCities(prisma, cities);
          const businesses = await prisma.monitoredBusiness.count({
            where: { city: { in: cities } },
          });
          const count = await prisma.monitoredBusiness.count({
            where: { city: { in: cities }, signalScore: { gt: 20 } },
          });
          return `${count} van ${businesses} zaken hebben overname-signalen (${count - before >= 0 ? "+" : ""}${count - before} vs vorige stand).`;
        } catch (e) {
          return `Signaal detectie mislukt: ${e instanceof Error ? e.message : "fout"}.`;
        }
      },
    });

    // Tool: Enrich buurt data
    const enrichBuurtDataTool = tool({
      description: "Verrijk gescande zaken met buurtdata (demografie, passanten, OV bereikbaarheid). Doe dit NA scanning en VOOR signaaldetectie/matching.",
      inputSchema: z.object({ cities: z.array(z.string()) }),
      execute: async ({ cities }) => {
        await updateProgress(45);
        try {
          const { enrichBusinessesBatch } = await import("@/lib/intelligence/enricher");
          const businesses = await prisma.monitoredBusiness.findMany({
            where: { city: { in: cities } },
            select: { id: true },
          });
          const ids = businesses.map((b) => b.id);
          const result = await enrichBusinessesBatch(ids);
          return `Buurtdata verrijkt: ${result.enriched} verrijkt, ${result.skipped} overgeslagen, ${result.failed} mislukt (${ids.length} totaal).`;
        } catch (e) {
          return `Buurt verrijking mislukt: ${e instanceof Error ? e.message : "fout"}. Ga door met matching.`;
        }
      },
    });

    // Tool: Deep crawl top businesses (Firecrawl: KvK, TripAdvisor, Thuisbezorgd, etc.)
    const deepCrawlTool = tool({
      description: "Deep crawl de top 20 zaken via Firecrawl (websites, KvK, TripAdvisor, Thuisbezorgd, AlleCijfers, nieuws, concurrenten). Doe dit NA buurt verrijking en VOOR matching.",
      inputSchema: z.object({ cities: z.array(z.string()), maxBusinesses: z.number().default(20) }),
      execute: async ({ cities, maxBusinesses }) => {
        await updateProgress(55);
        try {
          const topBusinesses = await runDeepCrawlForProfile(prisma, profile, cities, {
            maxBusinesses,
            onProgress: (completed, total) => {
              prisma.intelligenceScanJob.update({
                where: { id: jobId },
                data: { progress: Math.max(currentProgress, Math.round(55 + (completed / total) * 15)) },
              }).catch(() => {});
            },
          });

          if (topBusinesses.length === 0) return "Geen relevante zaken om te crawlen.";
          const results = await prisma.crawledBusinessIntel.findMany({
            where: { businessId: { in: topBusinesses.map((business) => business.id) } },
          });
          const succeeded = results.filter((record) => record.crawlStatus === "complete").length;
          const partial = results.filter((record) => record.crawlStatus === "partial").length;
          const sources = new Set(results.flatMap((record) => record.sourcesCompleted));
          return `${results.length} zaken deep gecrawld: ${succeeded} volledig, ${partial} gedeeltelijk. Bronnen: ${[...sources].join(", ")}.`;
        } catch (e) {
          return `Deep crawl mislukt: ${e instanceof Error ? e.message : "fout"}. Ga door met matching.`;
        }
      },
    });

    // Tool: Match profile
    const matchProfileTool = tool({
      description: "Match gescande zaken tegen het zoekprofiel.",
      inputSchema: z.object({ profileId: z.string() }),
      execute: async ({ profileId: pId }) => {
        await updateProgress(80);
        try {
          const { matchBusinessesToProfile } = await import("@/lib/intelligence/matcher");
          const results = await matchBusinessesToProfile(pId, { minScore: 30, limit: 100 });
          totalMatches = await generateAndSaveMatchSummaries(prisma, pId);
          await updateProgress(95, { matchesFound: totalMatches });
          return `${totalMatches} matches gevonden. Top score: ${results[0]?.matchScore ?? 0}/100.`;
        } catch (e) {
          return `Matching mislukt: ${e instanceof Error ? e.message : "fout"}.`;
        }
      },
    });

    // Run agent with abort signal for proper timeout cancellation
    console.log("[agent-scan] Starting generateText with tools...");
    await generateText({
      model,
      abortSignal,
      system: `Je bent een horeca intelligence scanner. Voer deze stappen uit IN VOLGORDE:
1. Scan elke stad: ${citiesToScan.join(", ")} met keywords: ${scanKeywords.join(", ")}
2. Verrijk buurtdata (demografie, passanten, OV bereikbaarheid)
3. Deep crawl de top 20 zaken (websites, KvK, TripAdvisor, Thuisbezorgd, nieuws, concurrenten)
4. Detecteer overname-signalen
5. Match tegen profiel ${profileId}
Begin direct met stap 1. Gebruik exact deze keywords: ${scanKeywords.join(", ")}. Voer ALLE stappen uit.`,
      prompt: `Start complete intelligence scan voor "${profile.name}".`,
      tools: { searchCity, enrichBuurtData: enrichBuurtDataTool, deepCrawl: deepCrawlTool, detectSignals: detectSignalsTool, matchProfile: matchProfileTool },
      stopWhen: stepCountIs(15),
    });
    console.log("[agent-scan] generateText completed successfully");

    if (totalBusinessesFound > 0 && totalMatches === 0) {
      await updateProgress(97, { matchesFound: 0 });
      try {
        const recoveredMatches = await generateAndSaveMatchSummaries(prisma, profileId);
        if (recoveredMatches > 0) {
          totalMatches = recoveredMatches;
          await updateProgress(98, { matchesFound: totalMatches });
        }
      } catch (recoveryError) {
        console.warn("[agent-scan] Match reconciliation failed:", recoveryError);
      }
    }

    // Complete
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { status: "completed", progress: 100, businessesFound: totalBusinessesFound, matchesFound: totalMatches, completedAt: new Date() },
    });
    await prisma.intelligenceProfile.update({
      where: { id: profileId },
      data: { lastScanAt: new Date(), totalScanned: { increment: totalBusinessesFound }, totalMatches },
    });
    // Revalidate so the UI shows fresh data
    revalidatePath("/dashboard/intelligence");
    console.log(`[agent-scan] Completed: ${totalBusinessesFound} businesses, ${totalMatches} matches`);
  } catch (error) {
    console.error("[agent-scan] Failed:", error);
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { status: "failed", error: error instanceof Error ? error.message : "Agent mislukt" },
    }).catch(() => {});
  }
}

/**
 * Run a scan directly without AI agent (simple sequential fallback).
 */
async function runScanDirectly(
  profileId: string,
  jobId: string,
  city?: string,
): Promise<void> {
  try {
    const profile = await prisma.intelligenceProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new Error("Profile not found");

    const citiesToScan = city ? [city] : profile.targetCities;

    // Build keyword set from profile: concept + competitorKeywords as primary
    const { scanCity } = await import("@/lib/intelligence/scanner");
    const { planProfileScan } = await import("@/lib/intelligence/pipeline");
    const {
      runDeepCrawlForProfile,
      detectSignalsForCities,
      generateAndSaveMatchSummaries,
    } = await import("@/lib/intelligence/scan-engine");
    const keywordSet = planProfileScan(profile);
    // Limit to top 5 keywords — reduces scan time from ~22min to ~4min
    const keywords = keywordSet.primary.slice(0, 5);
    console.log(`[direct-scan] Using ${keywords.length} keywords: ${keywords.join(", ")}`);

    let totalBusinessesFound = 0;

    // Phase 1: Scan cities
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { progress: 10 },
    });

    for (const currentCity of citiesToScan) {
      try {
        const result = await scanCity(currentCity, keywords, {
          includeGenericHoreca: false,
          profile,
        });
        totalBusinessesFound += result.businessesFound;
      } catch (err) {
        console.warn(`[direct-scan] City scan failed: ${currentCity}`, err);
      }

      await prisma.intelligenceScanJob.update({
        where: { id: jobId },
        data: {
          progress: Math.round(10 + (citiesToScan.indexOf(currentCity) + 1) / citiesToScan.length * 40),
          businessesFound: totalBusinessesFound,
        },
      });
    }

    // Phase 1.5: Buurt enrichment (demographics, transport, passanten)
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { progress: 50 },
    });

    try {
      const { enrichBusinessesBatch } = await import("@/lib/intelligence/enricher");
      const scannedBusinesses = await prisma.monitoredBusiness.findMany({
        where: { city: { in: citiesToScan } },
        select: { id: true },
      });
      const enrichIds = scannedBusinesses.map((b) => b.id);
      const enrichResult = await enrichBusinessesBatch(enrichIds);
      console.log(
        `[direct-scan] Buurt enrichment: ${enrichResult.enriched} enriched, ${enrichResult.skipped} skipped, ${enrichResult.failed} failed`,
      );
    } catch (err) {
      // Non-critical: continue with scan even if enrichment fails
      console.warn("[direct-scan] Buurt enrichment failed, continuing:", err);
    }

    // Phase 1.75: Deep crawl top 20 businesses (Firecrawl: KvK, TripAdvisor, Thuisbezorgd, etc.)
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { progress: 55 },
    });

    try {
      const topBusinesses = await runDeepCrawlForProfile(prisma, profile, citiesToScan, {
        maxBusinesses: 20,
      });
      if (topBusinesses.length > 0) {
        console.log(`[direct-scan] Deep crawl: ${topBusinesses.length} relevante zaken gecrawld`);
      }
    } catch (err) {
      console.warn("[direct-scan] Deep crawl failed, continuing:", err);
    }

    // Phase 2: Detect signals
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { progress: 65 },
    });

    await detectSignalsForCities(prisma, citiesToScan);

    // Phase 3: Match
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: { progress: 80 },
    });

    let saved = await generateAndSaveMatchSummaries(prisma, profileId);
    if (totalBusinessesFound > 0 && saved === 0) {
      try {
        saved = await generateAndSaveMatchSummaries(prisma, profileId);
      } catch (recoveryError) {
        console.warn("[direct-scan] Match reconciliation failed:", recoveryError);
      }
    }

    // Complete
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        businessesFound: totalBusinessesFound,
        matchesFound: saved,
        completedAt: new Date(),
      },
    });

    await prisma.intelligenceProfile.update({
      where: { id: profileId },
      data: {
        lastScanAt: new Date(),
        totalScanned: { increment: totalBusinessesFound },
        totalMatches: saved,
      },
    });

    console.log(`[direct-scan] Completed: ${totalBusinessesFound} businesses, ${saved} matches`);
  } catch (error) {
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Scan mislukt",
      },
    }).catch(() => {});
    throw error;
  }
}
