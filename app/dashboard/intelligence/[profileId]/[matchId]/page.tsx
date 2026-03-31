import { requirePagePermission } from "@/lib/session";
import { getMatchDetail } from "@/app/actions/intelligence-matches";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { MatchDetailContent } from "@/components/intelligence/match-detail-content";
import { buildPublicDossierView } from "@/lib/intelligence/dossier-view";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ profileId: string; matchId: string }>;
}) {
  await requirePagePermission("intelligence:view");
  const { profileId, matchId } = await params;

  const result = await getMatchDetail(matchId);
  if (!result.success || !result.data) {
    redirect(`/dashboard/intelligence/${profileId}`);
  }

  // Load crawled intel for deep investigation data
  const crawledIntel = await prisma.crawledBusinessIntel.findUnique({
    where: { businessId: result.data.business.id },
    include: {
      business: {
        select: {
          id: true,
          googlePlaceId: true,
          name: true,
          address: true,
          city: true,
          lat: true,
          lng: true,
          types: true,
          businessType: true,
          currentRating: true,
          totalReviews: true,
          priceLevel: true,
          website: true,
          phone: true,
          isOpen: true,
          openingHours: true,
          bereikbaarheidOV: true,
          passantenPerDag: true,
          demografieData: true,
          locationScore: true,
          signalScore: true,
          signals: true,
          chainName: true,
          chainSize: true,
          kvkNumber: true,
          postalCode: true,
          tripadvisorRating: true,
          tripadvisorReviews: true,
          tripadvisorUrl: true,
          tripadvisorRanking: true,
          aiAnalysis: true,
          firstScannedAt: true,
          lastScannedAt: true,
          scanCount: true,
          createdAt: true,
          updatedAt: true,
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
  const dossierView = crawledIntel
    ? buildPublicDossierView({
        ...crawledIntel.business,
        crawledIntel,
        sourceEvidence: crawledIntel.business.sourceEvidence,
      }, {
        matchScore: result.data.matchScore,
        matchBreakdown: result.data.matchBreakdown as Record<string, number | null | undefined> | null,
      })
    : null;

  return (
    <MatchDetailContent
      match={result.data}
      crawledIntel={crawledIntel}
      dossierView={dossierView}
      profileId={profileId}
    />
  );
}
