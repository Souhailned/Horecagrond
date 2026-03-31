import { requirePagePermission } from "@/lib/session";
import { getIntelligenceProfile } from "@/app/actions/intelligence";
import { getMatches } from "@/app/actions/intelligence-matches";
import { getScanJobs } from "@/app/actions/intelligence-scan";
import { redirect } from "next/navigation";
import { ProfileDetailContent } from "@/components/intelligence/profile-detail-content";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  await requirePagePermission("intelligence:view");
  const { profileId } = await params;

  const [profileResult, matchesResult, scanJobsResult] = await Promise.all([
    getIntelligenceProfile(profileId),
    getMatches(profileId, { limit: 100, sort: "score" }),
    getScanJobs(profileId),
  ]);

  if (!profileResult.success || !profileResult.data) {
    redirect("/dashboard/intelligence");
  }

  return (
    <ProfileDetailContent
      profile={profileResult.data}
      matches={matchesResult.success ? matchesResult.data!.matches : []}
      totalMatches={matchesResult.success ? matchesResult.data!.total : 0}
      scanJobs={scanJobsResult.success ? scanJobsResult.data! : []}
    />
  );
}
