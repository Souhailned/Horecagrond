import type {
  CrawledBusinessIntel,
  MonitoredBusiness,
  PrismaClient,
} from "@/generated/prisma/client";
import { inferBusinessTypeFromBusiness } from "@/lib/intelligence/profile-intent";
import { buildSourceCoverageReport, getAvailableSourceIds } from "@/lib/intelligence/source-registry";
import { upsertSourceEvidence } from "@/lib/intelligence/source-evidence";

type BusinessWithIntel = MonitoredBusiness & {
  crawledIntel?: CrawledBusinessIntel | null;
};

export interface BackfillResult {
  scanned: number;
  updatedBusinessTypes: number;
  evidenceUpserts: number;
  skipped: number;
  failed: number;
}

function hasTransportEvidence(business: BusinessWithIntel): boolean {
  return !!business.bereikbaarheidOV;
}

function hasBagEvidence(business: BusinessWithIntel): boolean {
  const data =
    business.demografieData && typeof business.demografieData === "object"
      ? (business.demografieData as Record<string, unknown>)
      : null;
  return typeof data?.oppervlakte === "number";
}

export function collectBackfillEvidenceEntries(
  business: BusinessWithIntel,
): Array<{ source: Parameters<typeof upsertSourceEvidence>[2]; payload: unknown; options?: { url?: string | null } }> {
  const entries: Array<{ source: Parameters<typeof upsertSourceEvidence>[2]; payload: unknown; options?: { url?: string | null } }> = [
    {
      source: "google_places",
      payload: {
        rating: business.currentRating,
        totalReviews: business.totalReviews,
        isOpen: business.isOpen,
        website: business.website,
        phone: business.phone,
        types: business.types,
      },
      options: { url: business.website },
    },
  ];

  if (business.demografieData) {
    entries.push({
      source: "cbs",
      payload: business.demografieData,
    });
  }

  if (business.bereikbaarheidOV) {
    entries.push({
      source: "transport",
      payload: { bereikbaarheidOV: business.bereikbaarheidOV },
    });
  }

  if (!business.crawledIntel) {
    return entries;
  }

  const intel = business.crawledIntel;
  if (intel.kvkData) entries.push({ source: "kvk", payload: intel.kvkData });
  if (intel.tripadvisorData) {
    entries.push({
      source: "tripadvisor",
      payload: intel.tripadvisorData,
      options: { url: intel.tripadvisorUrl },
    });
  }
  if (intel.thuisbezorgdData) {
    entries.push({
      source: "thuisbezorgd",
      payload: intel.thuisbezorgdData,
      options: { url: intel.thuisbezorgdUrl },
    });
  }
  if (intel.allecijfersData) {
    entries.push({
      source: "allecijfers",
      payload: intel.allecijfersData,
      options: { url: intel.allecijfersUrl },
    });
  }
  if (intel.websiteData) {
    entries.push({
      source: "website",
      payload: intel.websiteData,
      options: { url: intel.websiteUrl ?? business.website },
    });
  }
  if (intel.newsData) entries.push({ source: "news", payload: intel.newsData });
  if (intel.competitorsData) entries.push({ source: "competitors", payload: intel.competitorsData });

  return entries;
}

export async function backfillBusinessEvidence(
  prisma: PrismaClient,
  business: BusinessWithIntel,
): Promise<{ businessTypeUpdated: boolean; evidenceUpserts: number }> {
  let evidenceUpserts = 0;

  for (const entry of collectBackfillEvidenceEntries(business)) {
    await upsertSourceEvidence(
      prisma,
      business.id,
      entry.source,
      entry.payload,
      entry.options,
    );
    evidenceUpserts++;
  }

  const inferredBusinessType = inferBusinessTypeFromBusiness(
    business,
    business.crawledIntel ?? null,
  );

  let businessTypeUpdated = false;
  if (inferredBusinessType && business.businessType !== inferredBusinessType) {
    await prisma.monitoredBusiness.update({
      where: { id: business.id },
      data: { businessType: inferredBusinessType },
    });
    businessTypeUpdated = true;
  }

  if (business.crawledIntel) {
    const coverage = buildSourceCoverageReport(
      getAvailableSourceIds(business.crawledIntel, {
        hasGooglePlaces: true,
        hasBuurtData: business.demografieData != null,
        hasTransport: hasTransportEvidence(business),
        hasBagData: hasBagEvidence(business),
      }),
    );

    await prisma.crawledBusinessIntel.update({
      where: { id: business.crawledIntel.id },
      data: {
        confidenceLevel: coverage.confidenceLevel,
      },
    });
  }

  return {
    businessTypeUpdated,
    evidenceUpserts,
  };
}

export async function backfillIntelligenceEvidence(
  prisma: PrismaClient,
  options?: {
    city?: string;
    limit?: number;
    businessIds?: string[];
    onProgress?: (completed: number, total: number, current?: string) => void;
  },
): Promise<BackfillResult> {
  const where: Record<string, unknown> = {};
  if (options?.city) where.city = options.city;
  if (options?.businessIds && options.businessIds.length > 0) {
    where.id = { in: options.businessIds };
  }

  const businesses = await prisma.monitoredBusiness.findMany({
    where,
    include: { crawledIntel: true },
    orderBy: { updatedAt: "desc" },
    take: options?.limit,
  });

  const result: BackfillResult = {
    scanned: businesses.length,
    updatedBusinessTypes: 0,
    evidenceUpserts: 0,
    skipped: 0,
    failed: 0,
  };

  for (let index = 0; index < businesses.length; index++) {
    const business = businesses[index];
    try {
      const backfill = await backfillBusinessEvidence(prisma, business);
      if (backfill.businessTypeUpdated) result.updatedBusinessTypes++;
      result.evidenceUpserts += backfill.evidenceUpserts;
    } catch (error) {
      console.error("[intelligence-backfill] Failed:", business.name, error);
      result.failed++;
    }

    options?.onProgress?.(index + 1, businesses.length, business.name);
  }

  return result;
}
