import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { buildPublicDossierView } from "@/lib/intelligence/dossier-view";

// ---------------------------------------------------------------------------
// Types (public-safe response shape)
// ---------------------------------------------------------------------------

interface SharedReportResponse {
  profileName: string;
  clientName: string | null;
  customNote: string | null;
  createdAt: string;
  matchCount: number;
  matches: Array<{
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
      crawledAt: string | null;
      brokerDecision: NonNullable<ReturnType<typeof buildPublicDossierView>>["brokerDecision"];
      sourceCoverage: {
        available: string[];
        missingCritical: string[];
        missingRecommended: string[];
        confidenceLevel: string;
      };
      sourceEvidence: Array<{
        source: string;
        status: string;
        confidence: string;
        qualityScore: number | null;
        fetchedAt: string | null;
        expiresAt: string | null;
        error: string | null;
      }>;
    } | null;
  }>;
}

// ---------------------------------------------------------------------------
// GET /api/intelligence/shared/[token]
// Public endpoint — token IS the auth. Rate limited per IP.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    // Basic token validation
    if (!token || token.length < 10) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Rate limit by IP (60 req/min via "api" tier)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";

    const rl = await checkRateLimit(`shared-report:${ip}`, "api");
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    // Fetch the report
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

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Check expiry
    if (report.expiresAt < new Date()) {
      return NextResponse.json({ error: "This report has expired" }, { status: 410 });
    }

    // Increment view count (non-blocking)
    prisma.sharedIntelligenceReport
      .update({
        where: { id: report.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
      .catch((err) => console.error("[shared-report-api] View count update failed:", err));

    // Fetch selected matches with business data and crawled intelligence
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

    // Build public-safe response
    const response: SharedReportResponse = {
      profileName: report.profile.name,
      clientName: report.profile.clientName,
      customNote: report.customNote,
      createdAt: report.createdAt.toISOString(),
      matchCount: matches.length,
      matches: matches.map((m) => {
        const dossierView = buildPublicDossierView(m.business, {
          matchScore: m.matchScore,
          matchBreakdown: m.matchBreakdown as Record<string, number | null | undefined> | null,
        });

        return {
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
                crawledAt: dossierView.crawledAt?.toISOString() ?? null,
                brokerDecision: dossierView.brokerDecision,
                sourceCoverage: dossierView.sourceCoverage,
                sourceEvidence: dossierView.sourceEvidence.map((item) => ({
                  source: item.source,
                  status: item.status,
                  confidence: item.confidence,
                  qualityScore: item.qualityScore,
                  fetchedAt: item.fetchedAt?.toISOString() ?? null,
                  expiresAt: item.expiresAt?.toISOString() ?? null,
                  error: item.error,
                })),
              }
            : null,
        };
      }),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        // Prevent caching of shared reports (view count accuracy)
        "Cache-Control": "no-store, no-cache, must-revalidate",
        ...getRateLimitHeaders(rl),
      },
    });
  } catch (error) {
    console.error("[shared-report-api] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
