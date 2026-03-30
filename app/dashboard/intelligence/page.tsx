import { requirePagePermission } from "@/lib/session";
import { getIntelligenceProfiles } from "@/app/actions/intelligence";
import { getIntelligenceStats } from "@/app/actions/intelligence-matches";
import { IntelligenceContent } from "@/components/intelligence/intelligence-content";

export default async function IntelligencePage() {
  await requirePagePermission("intelligence:view");

  const [profilesResult, statsResult] = await Promise.all([
    getIntelligenceProfiles(),
    getIntelligenceStats(),
  ]);

  return (
    <IntelligenceContent
      profiles={profilesResult.success ? profilesResult.data! : []}
      stats={
        statsResult.success
          ? statsResult.data!
          : {
              totalScanned: 0,
              totalMatches: 0,
              signalsThisWeek: 0,
              activeProfiles: 0,
            }
      }
    />
  );
}
