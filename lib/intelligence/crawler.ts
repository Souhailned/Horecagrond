/**
 * Intelligence Crawler Orchestrator
 *
 * Coordinates deep crawling of 6+ data sources per business using Firecrawl.
 * Each source runs independently and fails gracefully.
 *
 * Sources:
 * 1. Business website → menu, concept, team
 * 2. OpenKvK → eigenaar, KvK, vestigingen
 * 3. TripAdvisor → ranking, reviews, cuisine
 * 4. Thuisbezorgd → delivery rating, menu, prijzen
 * 5. AlleCijfers → buurt veiligheid, voorzieningen
 * 6. Horeca News → overnames, faillissementen
 * 7. Competitors → nearby businesses comparison
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { MonitoredBusiness } from "@/generated/prisma/client";
import { inferBusinessTypeFromBusiness } from "@/lib/intelligence/profile-intent";
import { buildSourceCoverageReport, getAvailableSourceIds } from "@/lib/intelligence/source-registry";
import { upsertSourceEvidence } from "@/lib/intelligence/source-evidence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlProgress {
  businessId: string;
  businessName: string;
  phase: "starting" | "crawling" | "analyzing" | "complete" | "failed";
  sourcesCompleted: string[];
  sourcesTotal: number;
  progress: number; // 0-100
  currentSource?: string;
}

export interface CrawlResult {
  businessId: string;
  sourcesCompleted: string[];
  sourcesFailed: string[];
  hasKvK: boolean;
  hasTripAdvisor: boolean;
  hasThuisbezorgd: boolean;
  hasAlleCijfers: boolean;
  hasWebsite: boolean;
  hasNews: boolean;
  hasCompetitors: boolean;
  duration: number;
}

type CrawlSource = "kvk" | "tripadvisor" | "thuisbezorgd" | "allecijfers" | "website" | "news" | "competitors";

const ALL_SOURCES: CrawlSource[] = [
  "kvk",
  "tripadvisor",
  "thuisbezorgd",
  "allecijfers",
  "website",
  "news",
  "competitors",
];

// ---------------------------------------------------------------------------
// Main: Crawl all sources for a business
// ---------------------------------------------------------------------------

/**
 * Deep crawl a single business across all intelligence sources.
 * Each source runs independently — failures don't block other sources.
 */
export async function crawlBusiness(
  business: MonitoredBusiness,
  options?: {
    sources?: CrawlSource[];
    onProgress?: (progress: CrawlProgress) => void;
  },
): Promise<CrawlResult> {
  const startTime = Date.now();
  const sources = options?.sources ?? ALL_SOURCES;
  const completed: string[] = [];
  const failed: string[] = [];

  // Create or get CrawledBusinessIntel record
  let intel = await prisma.crawledBusinessIntel.findUnique({
    where: { businessId: business.id },
  });

  if (!intel) {
    intel = await prisma.crawledBusinessIntel.create({
      data: {
        businessId: business.id,
        crawlStatus: "crawling",
        crawlProgress: 0,
      },
    });
  } else {
    await prisma.crawledBusinessIntel.update({
      where: { id: intel.id },
      data: { crawlStatus: "crawling", crawlProgress: 0, crawlError: null },
    });
  }

  const reportProgress = (source?: string) => {
    const progress = Math.round((completed.length / sources.length) * 100);
    options?.onProgress?.({
      businessId: business.id,
      businessName: business.name,
      phase: "crawling",
      sourcesCompleted: completed,
      sourcesTotal: sources.length,
      progress,
      currentSource: source,
    });
  };

  // Run each source — sequentially to respect rate limits
  // (Firecrawl concurrency limit is 2, we don't want to exceed it)
  for (const source of sources) {
    reportProgress(source);

    try {
      await crawlSource(source, business, intel.id);
      completed.push(source);
    } catch (error) {
      console.warn(`[crawler] Source ${source} failed for ${business.name}:`, error);
      failed.push(source);
      await upsertSourceEvidence(prisma, business.id, source, null, {
        error: error instanceof Error ? error.message : "Onbekende fout",
      }).catch(() => {});
    }

    // Update progress in DB
    await prisma.crawledBusinessIntel.update({
      where: { id: intel.id },
      data: {
        sourcesCompleted: completed,
        crawlProgress: Math.round((completed.length / sources.length) * 100),
      },
    });
  }

  // Mark complete
  const finalStatus = failed.length === sources.length ? "failed" :
    failed.length > 0 ? "partial" : "complete";
  const latestIntel = await prisma.crawledBusinessIntel.findUnique({
    where: { id: intel.id },
  });
  const coverage = buildSourceCoverageReport(
    getAvailableSourceIds(latestIntel, {
      hasGooglePlaces: true,
      hasBuurtData: business.demografieData != null,
      hasTransport: business.bereikbaarheidOV != null,
      hasBagData: false,
    }),
  );

  await prisma.crawledBusinessIntel.update({
    where: { id: intel.id },
    data: {
      crawlStatus: finalStatus,
      crawlProgress: 100,
      crawledAt: new Date(),
      crawlError: failed.length > 0 ? `Failed sources: ${failed.join(", ")}` : null,
      confidenceLevel: coverage.confidenceLevel,
    },
  });

  // Update MonitoredBusiness fields from crawled data
  await enrichMonitoredBusiness(business.id, intel.id);

  return {
    businessId: business.id,
    sourcesCompleted: completed,
    sourcesFailed: failed,
    hasKvK: completed.includes("kvk"),
    hasTripAdvisor: completed.includes("tripadvisor"),
    hasThuisbezorgd: completed.includes("thuisbezorgd"),
    hasAlleCijfers: completed.includes("allecijfers"),
    hasWebsite: completed.includes("website"),
    hasNews: completed.includes("news"),
    hasCompetitors: completed.includes("competitors"),
    duration: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Source dispatcher
// ---------------------------------------------------------------------------

async function crawlSource(
  source: CrawlSource,
  business: MonitoredBusiness,
  intelId: string,
): Promise<void> {
  switch (source) {
    case "kvk": {
      const { crawlKvKData } = await import("./providers/kvk");
      const data = await crawlKvKData(business.name, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            kvkNumber: data.kvkNumber,
            kvkData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "kvk", data).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "kvk", null).catch(() => {});
      }
      break;
    }

    case "tripadvisor": {
      const { crawlTripAdvisorDeep } = await import("./providers/tripadvisor-v2");
      const data = await crawlTripAdvisorDeep(business.name, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            tripadvisorUrl: data.url ?? null,
            tripadvisorData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "tripadvisor", data, {
          url: data.url ?? null,
        }).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "tripadvisor", null).catch(
          () => {},
        );
      }
      break;
    }

    case "thuisbezorgd": {
      const { crawlThuisbezorgd } = await import("./providers/thuisbezorgd");
      const data = await crawlThuisbezorgd(business.name, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            thuisbezorgdUrl: data.url ?? null,
            thuisbezorgdData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "thuisbezorgd", data, {
          url: data.url ?? null,
        }).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "thuisbezorgd", null).catch(
          () => {},
        );
      }
      break;
    }

    case "allecijfers": {
      const { crawlAlleCijfers } = await import("./providers/allecijfers");
      const data = await crawlAlleCijfers(business.address, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            allecijfersUrl: data.buurtUrl ?? null,
            allecijfersData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "allecijfers", data, {
          url: data.buurtUrl ?? null,
        }).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "allecijfers", null).catch(
          () => {},
        );
      }
      break;
    }

    case "website": {
      if (!business.website) break;
      const { crawlBusinessWebsite } = await import("./providers/website-crawler");
      const data = await crawlBusinessWebsite(business.website, business.name);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            websiteUrl: business.website,
            websiteData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "website", data, {
          url: business.website,
        }).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "website", null, {
          url: business.website,
        }).catch(() => {});
      }
      break;
    }

    case "news": {
      const { crawlHorecaNews } = await import("./providers/news");
      const data = await crawlHorecaNews(business.name, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            newsData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "news", data).catch(() => {});
      } else {
        await upsertSourceEvidence(prisma, business.id, "news", null).catch(() => {});
      }
      break;
    }

    case "competitors": {
      const { crawlCompetitors } = await import("./providers/competitors");
      const data = await crawlCompetitors(business.name, business.address, business.city);
      if (data) {
        await prisma.crawledBusinessIntel.update({
          where: { id: intelId },
          data: {
            competitorsData: data as unknown as Prisma.InputJsonValue,
          },
        });
        await upsertSourceEvidence(prisma, business.id, "competitors", data).catch(
          () => {},
        );
      } else {
        await upsertSourceEvidence(prisma, business.id, "competitors", null).catch(
          () => {},
        );
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Enrich MonitoredBusiness with crawled data
// ---------------------------------------------------------------------------

/**
 * After crawling, update MonitoredBusiness fields from CrawledBusinessIntel.
 * This makes the data available for signal detection and matching.
 */
async function enrichMonitoredBusiness(
  businessId: string,
  intelId: string,
): Promise<void> {
  const intel = await prisma.crawledBusinessIntel.findUnique({
    where: { id: intelId },
    include: {
      business: true,
    },
  });
  if (!intel) return;

  const updates: Record<string, unknown> = {};

  // KvK data → MonitoredBusiness fields
  const kvk = intel.kvkData as Record<string, unknown> | null;
  if (kvk) {
    if (kvk.kvkNumber) updates.kvkNumber = kvk.kvkNumber as string;
    if (kvk.eigenaar) updates.ownerName = kvk.eigenaar as string;
    if (kvk.isKeten) updates.chainName = (kvk.handelsnamen as string[])?.[0] ?? null;
    if (typeof kvk.ketenGrootte === "number") updates.chainSize = kvk.ketenGrootte;
  }

  // TripAdvisor data → MonitoredBusiness fields
  const ta = intel.tripadvisorData as Record<string, unknown> | null;
  if (ta) {
    if (typeof ta.rating === "number") updates.tripadvisorRating = ta.rating;
    if (typeof ta.totalReviews === "number") updates.tripadvisorReviews = ta.totalReviews;
    if (ta.ranking) updates.tripadvisorRanking = ta.ranking as string;
    if (intel.tripadvisorUrl) updates.tripadvisorUrl = intel.tripadvisorUrl;
  }

  // Thuisbezorgd data → TripAdvisor fields (supplementary)
  const tb = intel.thuisbezorgdData as Record<string, unknown> | null;
  if (tb && typeof tb.rating === "number" && !updates.tripadvisorRating) {
    // Don't overwrite TA rating with TB rating, but store in demographics
  }

  // AlleCijfers → demographics + location data
  const ac = intel.allecijfersData as Record<string, unknown> | null;
  if (ac) {
    updates.demografieData = ac;
    if (typeof ac.inwoners === "number" && ac.inwoners > 0) {
      // Estimate passanten from inwoners + bedrijfsvestigingen
      const bedrijven = (ac.bedrijfsvestigingen as number) ?? 0;
      if (!updates.passantenPerDag) {
        updates.passantenPerDag = Math.round(((ac.inwoners as number) * 0.3) + (bedrijven * 5));
      }
    }
  }

  const inferredBusinessType = inferBusinessTypeFromBusiness(
    {
      name: intel.business.name,
      address: intel.business.address,
      types: intel.business.types,
      website: intel.business.website,
      businessType: intel.business.businessType,
    },
    intel,
  );
  if (inferredBusinessType) {
    updates.businessType = inferredBusinessType;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.monitoredBusiness.update({
      where: { id: businessId },
      data: updates,
    });
  }
}

// ---------------------------------------------------------------------------
// Batch crawl for scan pipeline
// ---------------------------------------------------------------------------

/**
 * Crawl multiple businesses with rate limiting.
 * For use in the Trigger.dev scan pipeline.
 */
export async function crawlBusinessBatch(
  businesses: MonitoredBusiness[],
  options?: {
    sources?: CrawlSource[];
    onProgress?: (completed: number, total: number, current: string) => void;
    maxConcurrent?: number;
  },
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  const maxConcurrent = options?.maxConcurrent ?? 1; // Sequential by default for rate limiting

  for (let i = 0; i < businesses.length; i += maxConcurrent) {
    const batch = businesses.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((biz) =>
        crawlBusiness(biz, { sources: options?.sources }),
      ),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    options?.onProgress?.(
      Math.min(i + maxConcurrent, businesses.length),
      businesses.length,
      batch[0]?.name ?? "",
    );

    // Rate limit: wait 2 seconds between batches
    if (i + maxConcurrent < businesses.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}
