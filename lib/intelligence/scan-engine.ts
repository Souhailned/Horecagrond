import type {
  CrawledBusinessIntel,
  IntelligenceProfile,
  MonitoredBusiness,
  PrismaClient,
} from "@/generated/prisma/client";
import { rankDeepCrawlCandidates } from "@/lib/intelligence/pipeline";

type BusinessWithIntel = MonitoredBusiness & {
  crawledIntel?: CrawledBusinessIntel | null;
};

function normalizePriceLevel(value: string | null): number | null {
  if (!value) return null;
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[value] ?? null;
}

export async function selectDeepCrawlBusinesses(
  prisma: PrismaClient,
  profile: Pick<
    IntelligenceProfile,
    "name" | "concept" | "conceptDescription" | "competitorKeywords" | "operatingModel"
  >,
  cities: string[],
  limit: number,
): Promise<BusinessWithIntel[]> {
  const candidates = await prisma.monitoredBusiness.findMany({
    where: { city: { in: cities } },
    include: { crawledIntel: true },
  });

  return rankDeepCrawlCandidates(profile, candidates)
    .slice(0, limit)
    .map(({ business }) => business);
}

export async function runDeepCrawlForProfile(
  prisma: PrismaClient,
  profile: Pick<
    IntelligenceProfile,
    "name" | "concept" | "conceptDescription" | "competitorKeywords" | "operatingModel"
  >,
  cities: string[],
  options?: {
    maxBusinesses?: number;
    onProgress?: (completed: number, total: number, current: string) => void;
  },
): Promise<BusinessWithIntel[]> {
  const maxBusinesses = options?.maxBusinesses ?? 20;
  const businesses = await selectDeepCrawlBusinesses(prisma, profile, cities, maxBusinesses);

  if (businesses.length === 0) {
    return [];
  }

  const { crawlBusinessBatch } = await import("@/lib/intelligence/crawler");
  await crawlBusinessBatch(businesses, {
    maxConcurrent: 1,
    onProgress: options?.onProgress,
  });

  return businesses;
}

export async function detectSignalsForCities(
  prisma: PrismaClient,
  cities: string[],
): Promise<void> {
  const { detectSignals } = await import("@/lib/intelligence/signal-detector");

  const businesses = await prisma.monitoredBusiness.findMany({
    where: { city: { in: cities } },
    include: {
      snapshots: {
        orderBy: { scannedAt: "desc" },
        take: 5,
      },
      crawledIntel: true,
    },
  });

  for (const business of businesses) {
    const intel = business.crawledIntel;
    const newsData = intel?.newsData as Record<string, unknown> | null;
    const thuisbezorgdData = intel?.thuisbezorgdData as Record<string, unknown> | null;
    const kvkData = intel?.kvkData as Record<string, unknown> | null;

    const analysis = detectSignals(
      {
        currentRating: business.currentRating,
        totalReviews: business.totalReviews,
        priceLevel: normalizePriceLevel(business.priceLevel),
        isOpen: business.isOpen,
        openingHours: business.openingHours,
        chainSize: business.chainSize,
        tripadvisorRating: business.tripadvisorRating,
        tripadvisorReviews: business.tripadvisorReviews,
        lastScannedAt: business.lastScannedAt ?? new Date(),
        newsHasOvernameSignal: newsData?.hasOvernameSignal === true,
        thuisbezorgdRating:
          typeof thuisbezorgdData?.rating === "number"
            ? thuisbezorgdData.rating
            : undefined,
        kvkIsKeten: kvkData?.isKeten === true,
        kvkKetenGrootte:
          typeof kvkData?.ketenGrootte === "number"
            ? kvkData.ketenGrootte
            : undefined,
      },
      business.snapshots.map((snapshot) => ({
        rating: snapshot.rating,
        reviewCount: snapshot.reviewCount,
        recentReviews: snapshot.recentReviews,
        isOpen: snapshot.isOpen ?? business.isOpen,
        tripadvisorRating: null,
        tripadvisorReviews: null,
        scannedAt: snapshot.scannedAt,
      })),
    );

    await prisma.monitoredBusiness.update({
      where: { id: business.id },
      data: {
        signalScore: analysis.signalScore,
        signals: analysis.signals as unknown as Record<string, boolean>,
        aiAnalysis: analysis.topSignal,
      },
    });
  }
}

export async function generateAndSaveMatchSummaries(
  prisma: PrismaClient,
  profileId: string,
): Promise<number> {
  const { matchBusinessesToProfile, generateMatchSummaries, saveMatches } =
    await import("@/lib/intelligence/matcher");

  const fullResults = await matchBusinessesToProfile(profileId, {
    minScore: 30,
    limit: 100,
  });

  const businessIds = fullResults.map((result) => result.businessId);
  const businesses = await prisma.monitoredBusiness.findMany({
    where: { id: { in: businessIds } },
  });
  const businessMap = new Map(businesses.map((business) => [business.id, business]));

  const crawledIntelRecords = await prisma.crawledBusinessIntel.findMany({
    where: {
      businessId: { in: businessIds },
      crawlStatus: { in: ["complete", "partial"] },
    },
  });
  const crawledIntelMap = new Map(
    crawledIntelRecords.map((record) => [record.businessId, record]),
  );

  const profile = await prisma.intelligenceProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) return 0;

  const summaries = await generateMatchSummaries(
    fullResults,
    profile,
    businessMap,
    crawledIntelMap,
  );

  return saveMatches(profileId, fullResults, summaries);
}
