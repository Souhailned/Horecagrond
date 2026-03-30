"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type { ActionResult } from "@/types/actions";
import type {
  IntelligenceMatch,
  MonitoredBusiness,
  CrawledBusinessIntel,
} from "@/generated/prisma/client";
import { extractBrokerInsights } from "@/lib/intelligence/broker-insights";
import { buildPublicDossierView } from "@/lib/intelligence/dossier-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchWithBusiness = IntelligenceMatch & {
  business: MonitoredBusiness & {
    crawledIntel?: Pick<
      CrawledBusinessIntel,
      | "crawlStatus"
      | "thuisbezorgdData"
      | "kvkData"
      | "newsData"
      | "competitorsData"
      | "tripadvisorData"
    > | null;
  };
};

interface GetMatchesOptions {
  sort?: "score" | "date" | "signals";
  status?: string;
  city?: string;
  minScore?: number;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Get matches for an intelligence profile with filtering and sorting
 */
export async function getMatches(
  profileId: string,
  options?: GetMatchesOptions,
): Promise<ActionResult<{ matches: MatchWithBusiness[]; total: number }>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  try {
    // Verify ownership
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    // Build where clause
    const where: Record<string, unknown> = { profileId };
    if (options?.status) where.status = options.status;
    if (options?.minScore) where.matchScore = { gte: options.minScore };

    // City filter requires join
    const businessWhere: Record<string, unknown> = {};
    if (options?.city) businessWhere.city = options.city;

    // Sort order
    const orderBy: Record<string, string> = {};
    switch (options?.sort) {
      case "date":
        orderBy.createdAt = "desc";
        break;
      case "signals":
        // Sort by business signal score — handled after fetch
        orderBy.matchScore = "desc";
        break;
      default:
        orderBy.matchScore = "desc";
    }

    const [matches, total] = await Promise.all([
      prisma.intelligenceMatch.findMany({
        where: {
          ...where,
          business: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        },
        include: {
          business: {
            include: {
              crawledIntel: {
                select: {
                  crawlStatus: true,
                  thuisbezorgdData: true,
                  kvkData: true,
                  newsData: true,
                  competitorsData: true,
                  tripadvisorData: true,
                },
              },
            },
          },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.intelligenceMatch.count({
        where: {
          ...where,
          business: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        },
      }),
    ]);

    // Secondary sort by signal score if requested
    if (options?.sort === "signals") {
      matches.sort((a, b) => b.business.signalScore - a.business.signalScore);
    }

    return { success: true, data: { matches, total } };
  } catch (error) {
    console.error("[intelligence-matches] Get matches failed:", error);
    return { success: false, error: "Matches ophalen mislukt" };
  }
}

/**
 * Update match status and optional notes
 */
export async function updateMatchStatus(
  matchId: string,
  status: string,
  notes?: string,
): Promise<ActionResult<void>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  const validStatuses = ["new", "reviewed", "starred", "contacted", "dismissed"];
  if (!validStatuses.includes(status)) {
    return { success: false, error: "Ongeldige status" };
  }

  try {
    // Verify ownership via profile
    const match = await prisma.intelligenceMatch.findUnique({
      where: { id: matchId },
      include: { profile: { select: { userId: true } } },
    });

    if (!match || match.profile.userId !== userId) {
      return { success: false, error: "Match niet gevonden" };
    }

    await prisma.intelligenceMatch.update({
      where: { id: matchId },
      data: {
        status,
        ...(notes !== undefined && { notes }),
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("[intelligence-matches] Update status failed:", error);
    return { success: false, error: "Status bijwerken mislukt" };
  }
}

/**
 * Get a single match with full business details
 */
export async function getMatchDetail(
  matchId: string,
): Promise<ActionResult<MatchWithBusiness & { snapshots: unknown[] }>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const match = await prisma.intelligenceMatch.findUnique({
      where: { id: matchId },
      include: {
        profile: { select: { userId: true } },
        business: {
          include: {
            snapshots: {
              orderBy: { scannedAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (!match || match.profile.userId !== userId) {
      return { success: false, error: "Match niet gevonden" };
    }

    const business = match.business;
    const matchData = {
      id: match.id,
      profileId: match.profileId,
      businessId: match.businessId,
      matchScore: match.matchScore,
      matchBreakdown: match.matchBreakdown,
      status: match.status,
      notes: match.notes,
      aiSummary: match.aiSummary,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
    };
    const { snapshots, ...businessData } = business;

    return {
      success: true,
      data: {
        ...matchData,
        business: businessData as MonitoredBusiness,
        snapshots,
      },
    };
  } catch (error) {
    console.error("[intelligence-matches] Get detail failed:", error);
    return { success: false, error: "Match ophalen mislukt" };
  }
}

/**
 * Export matches as CSV string
 */
export async function exportMatchesCSV(
  profileId: string,
): Promise<ActionResult<string>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    const matches = await prisma.intelligenceMatch.findMany({
      where: { profileId },
      include: { business: true },
      orderBy: { matchScore: "desc" },
    });

    // Build CSV
    const headers = [
      "Naam",
      "Stad",
      "Adres",
      "Type",
      "Rating",
      "Reviews",
      "Match Score",
      "Signaal Score",
      "Status",
      "AI Analyse",
    ];

    const rows = matches.map((m) => [
      escapeCSV(m.business.name),
      escapeCSV(m.business.city),
      escapeCSV(m.business.address),
      escapeCSV(m.business.businessType ?? ""),
      m.business.currentRating?.toString() ?? "",
      m.business.totalReviews?.toString() ?? "",
      m.matchScore.toString(),
      m.business.signalScore.toString(),
      m.status,
      escapeCSV(m.aiSummary ?? ""),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return { success: true, data: csv };
  } catch (error) {
    console.error("[intelligence-matches] Export failed:", error);
    return { success: false, error: "Export mislukt" };
  }
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Get intelligence stats for the overview page
 */
export async function getIntelligenceStats(): Promise<
  ActionResult<{
    totalScanned: number;
    totalMatches: number;
    signalsThisWeek: number;
    activeProfiles: number;
  }>
> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [profiles, totalMatches, recentMatches] = await Promise.all([
      prisma.intelligenceProfile.findMany({
        where: { userId },
        select: { id: true, totalScanned: true, active: true },
      }),
      prisma.intelligenceMatch.count({
        where: { profile: { userId } },
      }),
      prisma.intelligenceMatch.count({
        where: {
          profile: { userId },
          createdAt: { gte: weekAgo },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalScanned: profiles.reduce((sum, p) => sum + p.totalScanned, 0),
        totalMatches,
        signalsThisWeek: recentMatches,
        activeProfiles: profiles.filter((p) => p.active).length,
      },
    };
  } catch (error) {
    console.error("[intelligence-matches] Stats failed:", error);
    return { success: false, error: "Statistieken ophalen mislukt" };
  }
}

/**
 * Get the full intelligence dossier for a business (for export/share)
 */
export async function getIntelligenceDossier(
  businessId: string,
): Promise<ActionResult<{
  business: { name: string; address: string; city: string; rating: number | null; reviews: number | null };
  dossier: string | null;
  sourcesCompleted: string[];
  crawledAt: Date | null;
  confidenceLevel: string;
  brokerInsights: ReturnType<typeof extractBrokerInsights>;
  brokerDecision: ReturnType<typeof extractBrokerInsights>["brokerDecision"];
  sourceCoverage: ReturnType<typeof extractBrokerInsights>["sourceCoverage"];
  sourceEvidence: Array<{
    source: string;
    status: string;
    confidence: string;
    qualityScore: number | null;
    fetchedAt: Date | null;
    expiresAt: Date | null;
    error: string | null;
  }>;
}>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const intel = await prisma.crawledBusinessIntel.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            name: true,
            address: true,
            city: true,
            currentRating: true,
            totalReviews: true,
            businessType: true,
            priceLevel: true,
            isOpen: true,
            passantenPerDag: true,
            bereikbaarheidOV: true,
            signalScore: true,
            signals: true,
            chainSize: true,
            demografieData: true,
            sourceEvidence: {
              select: {
                source: true,
                status: true,
                confidence: true,
                qualityScore: true,
                fetchedAt: true,
                expiresAt: true,
                error: true,
              },
              orderBy: { source: "asc" },
            },
          },
        },
      },
    });

    if (!intel) return { success: false, error: "Geen intelligence data beschikbaar" };

    const dossierView = buildPublicDossierView({
      ...intel.business,
      crawledIntel: intel,
      sourceEvidence: intel.business.sourceEvidence,
    });
    if (!dossierView) {
      return { success: false, error: "Geen dossier beschikbaar" };
    }

    return {
      success: true,
      data: {
        business: {
          name: intel.business.name,
          address: intel.business.address,
          city: intel.business.city,
          rating: intel.business.currentRating,
          reviews: intel.business.totalReviews,
        },
        dossier: dossierView.aiDossier,
        sourcesCompleted: dossierView.sourcesCompleted,
        crawledAt: dossierView.crawledAt,
        confidenceLevel: dossierView.confidenceLevel,
        brokerInsights: dossierView.brokerInsights,
        brokerDecision: dossierView.brokerDecision,
        sourceCoverage: dossierView.sourceCoverage,
        sourceEvidence: dossierView.sourceEvidence,
      },
    };
  } catch (error) {
    console.error("[intelligence-matches] Dossier fetch failed:", error);
    return { success: false, error: "Dossier ophalen mislukt" };
  }
}
