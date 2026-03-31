"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { buildPublicDossierView } from "@/lib/intelligence/dossier-view";

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const createSharedReportSchema = z.object({
  profileId: z.string().min(1, "Profile ID is verplicht"),
  selectedMatchIds: z
    .array(z.string())
    .min(1, "Selecteer minimaal 1 match")
    .max(50, "Maximaal 50 matches per rapport"),
  customNote: z.string().max(2000, "Notitie mag maximaal 2000 tekens zijn").optional(),
});

const deleteSharedReportSchema = z.object({
  reportId: z.string().min(1, "Report ID is verplicht"),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedReportSummary {
  id: string;
  token: string;
  url: string;
  matchCount: number;
  customNote: string | null;
  expiresAt: Date;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  isExpired: boolean;
}

export interface SharedReportData {
  profileName: string;
  clientName: string | null;
  customNote: string | null;
  createdAt: Date;
  matches: SharedReportMatch[];
}

export interface SharedReportMatch {
  matchId: string;
  matchScore: number;
  aiSummary: string | null;
  business: {
    name: string;
    address: string;
    city: string;
    businessType: string | null;
    currentRating: number | null;
    totalReviews: number | null;
    signalScore: number;
    website: string | null;
    phone: string | null;
    tripadvisorRating: number | null;
    tripadvisorReviews: number | null;
    passantenPerDag: number | null;
    locationScore: number | null;
  };
  dossier: {
    aiDossier: string | null;
    sourcesCompleted: string[];
    confidenceLevel: string;
    crawledAt: Date | null;
    brokerDecision: NonNullable<ReturnType<typeof buildPublicDossierView>>["brokerDecision"];
    sourceCoverage: NonNullable<ReturnType<typeof buildPublicDossierView>>["sourceCoverage"];
    sourceEvidence: Array<{
      source: string;
      status: string;
      confidence: string;
      qualityScore: number | null;
      fetchedAt: Date | null;
      expiresAt: Date | null;
      error: string | null;
    }>;
  } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a shareable intelligence report link.
 * Generates a token-based URL with a 30-day expiry.
 */
export async function createSharedReport(
  input: z.infer<typeof createSharedReportSchema>,
): Promise<ActionResult<{ token: string; url: string }>> {
  const authCheck = await requirePermission("intelligence:share");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  // Validate input
  const parsed = createSharedReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" };
  }

  try {
    // Verify profile ownership
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: parsed.data.profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    // Verify all selected matches belong to this profile
    const matchCount = await prisma.intelligenceMatch.count({
      where: {
        id: { in: parsed.data.selectedMatchIds },
        profileId: parsed.data.profileId,
      },
    });
    if (matchCount !== parsed.data.selectedMatchIds.length) {
      return { success: false, error: "Een of meer geselecteerde matches zijn ongeldig" };
    }

    // Create shared report with 30-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const report = await prisma.sharedIntelligenceReport.create({
      data: {
        profileId: parsed.data.profileId,
        createdById: userId,
        selectedMatchIds: parsed.data.selectedMatchIds,
        customNote: parsed.data.customNote ?? null,
        expiresAt,
      },
    });

    const url = `/intelligence/rapport/${report.token}`;

    revalidatePath(`/dashboard/intelligence/${parsed.data.profileId}`);

    return { success: true, data: { token: report.token, url } };
  } catch (error) {
    console.error("[intelligence-share] Create shared report failed:", error);
    return { success: false, error: "Rapport aanmaken mislukt" };
  }
}

/**
 * Get a shared report by its public token (NO auth required).
 * Increments view count and validates expiry.
 */
export async function getSharedReportByToken(
  token: string,
): Promise<ActionResult<SharedReportData>> {
  if (!token || typeof token !== "string" || token.length < 10) {
    return { success: false, error: "Ongeldige link" };
  }

  try {
    const report = await prisma.sharedIntelligenceReport.findUnique({
      where: { token },
      include: {
        profile: {
          select: {
            name: true,
            clientName: true,
          },
        },
      },
    });

    if (!report) return { success: false, error: "Rapport niet gevonden" };

    // Check expiry
    if (report.expiresAt < new Date()) {
      return { success: false, error: "Deze link is verlopen" };
    }

    // Increment view count (fire-and-forget, don't block the response)
    prisma.sharedIntelligenceReport
      .update({
        where: { id: report.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
      .catch((err) => console.error("[intelligence-share] View count update failed:", err));

    // Fetch the selected matches with business data and intel dossiers
    const matches = await prisma.intelligenceMatch.findMany({
      where: {
        id: { in: report.selectedMatchIds },
        profileId: report.profileId,
      },
      include: {
        business: {
          include: {
            crawledIntel: {
              select: {
                aiDossier: true,
                sourcesCompleted: true,
                crawledAt: true,
                kvkData: true,
                tripadvisorData: true,
                thuisbezorgdData: true,
                allecijfersData: true,
                websiteData: true,
                newsData: true,
                competitorsData: true,
              },
            },
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
      orderBy: { matchScore: "desc" },
    });

    // Map to public-safe shape (no internal IDs, no sensitive fields)
    const reportMatches: SharedReportMatch[] = matches.map((m) => {
      const dossierView = buildPublicDossierView(m.business, {
        matchScore: m.matchScore,
        matchBreakdown: m.matchBreakdown as Record<string, number | null | undefined> | null,
      });

      return {
        matchId: m.id,
        matchScore: m.matchScore,
        aiSummary: m.aiSummary,
        business: {
          name: m.business.name,
          address: m.business.address,
          city: m.business.city,
          businessType: m.business.businessType,
          currentRating: m.business.currentRating,
          totalReviews: m.business.totalReviews,
          signalScore: m.business.signalScore,
          website: m.business.website,
          phone: m.business.phone,
          tripadvisorRating: m.business.tripadvisorRating,
          tripadvisorReviews: m.business.tripadvisorReviews,
          passantenPerDag: m.business.passantenPerDag,
          locationScore: m.business.locationScore,
        },
        dossier: dossierView
          ? {
              aiDossier: dossierView.aiDossier,
              sourcesCompleted: dossierView.sourcesCompleted,
              confidenceLevel: dossierView.confidenceLevel,
              crawledAt: dossierView.crawledAt,
              brokerDecision: dossierView.brokerDecision,
              sourceCoverage: dossierView.sourceCoverage,
              sourceEvidence: dossierView.sourceEvidence,
            }
          : null,
      };
    });

    return {
      success: true,
      data: {
        profileName: report.profile.name,
        clientName: report.profile.clientName,
        customNote: report.customNote,
        createdAt: report.createdAt,
        matches: reportMatches,
      },
    };
  } catch (error) {
    console.error("[intelligence-share] Get shared report failed:", error);
    return { success: false, error: "Rapport ophalen mislukt" };
  }
}

/**
 * List all shared reports for a specific intelligence profile.
 */
export async function listSharedReports(
  profileId: string,
): Promise<ActionResult<SharedReportSummary[]>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  if (!profileId || typeof profileId !== "string") {
    return { success: false, error: "Profiel ID is verplicht" };
  }

  try {
    // Verify profile ownership
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) return { success: false, error: "Profiel niet gevonden" };

    const reports = await prisma.sharedIntelligenceReport.findMany({
      where: { profileId },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const summaries: SharedReportSummary[] = reports.map((r) => ({
      id: r.id,
      token: r.token,
      url: `/intelligence/rapport/${r.token}`,
      matchCount: r.selectedMatchIds.length,
      customNote: r.customNote,
      expiresAt: r.expiresAt,
      viewCount: r.viewCount,
      lastViewedAt: r.lastViewedAt,
      createdAt: r.createdAt,
      isExpired: r.expiresAt < now,
    }));

    return { success: true, data: summaries };
  } catch (error) {
    console.error("[intelligence-share] List shared reports failed:", error);
    return { success: false, error: "Rapporten ophalen mislukt" };
  }
}

/**
 * Delete a shared intelligence report (revokes the share link).
 */
export async function deleteSharedReport(
  input: z.infer<typeof deleteSharedReportSchema>,
): Promise<ActionResult<void>> {
  const authCheck = await requirePermission("intelligence:share");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  const parsed = deleteSharedReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" };
  }

  try {
    // Verify ownership: report must have been created by this user
    const report = await prisma.sharedIntelligenceReport.findUnique({
      where: { id: parsed.data.reportId },
      select: { id: true, createdById: true, profileId: true },
    });

    if (!report) return { success: false, error: "Rapport niet gevonden" };
    if (report.createdById !== userId) return { success: false, error: "Geen toegang" };

    await prisma.sharedIntelligenceReport.delete({
      where: { id: report.id },
    });

    revalidatePath(`/dashboard/intelligence/${report.profileId}`);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("[intelligence-share] Delete shared report failed:", error);
    return { success: false, error: "Rapport verwijderen mislukt" };
  }
}
