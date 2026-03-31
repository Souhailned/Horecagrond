import type {
  CrawledBusinessIntel,
  IntelligenceProfile,
  MonitoredBusiness,
} from "@/generated/prisma/client";
import { assessBusinessAgainstProfile, buildKeywordSetFromProfile } from "@/lib/intelligence/profile-intent";
import { buildSourceCoverageReport, getAvailableSourceIds } from "@/lib/intelligence/source-registry";

type BusinessWithIntel = MonitoredBusiness & {
  crawledIntel?: CrawledBusinessIntel | null;
};

export interface DeepCrawlCandidate {
  business: BusinessWithIntel;
  relevanceScore: number;
  tier: string;
  signalScore: number;
  missingCriticalSources: number;
  missingRecommendedSources: number;
}

export function planProfileScan(profile: Pick<
  IntelligenceProfile,
  "name" | "concept" | "conceptDescription" | "competitorKeywords" | "operatingModel"
>) {
  return buildKeywordSetFromProfile(profile, true);
}

export function rankDeepCrawlCandidates(
  profile: Pick<
    IntelligenceProfile,
    "name" | "concept" | "conceptDescription" | "competitorKeywords" | "operatingModel"
  >,
  businesses: BusinessWithIntel[],
): DeepCrawlCandidate[] {
  return businesses
    .map((business) => {
      const assessment = assessBusinessAgainstProfile(
        business,
        profile,
        business.crawledIntel ?? null,
      );
      const coverage = buildSourceCoverageReport(
        getAvailableSourceIds(business.crawledIntel ?? null, {
          hasGooglePlaces: true,
          hasBuurtData: business.demografieData != null,
          hasTransport: business.bereikbaarheidOV != null,
          hasBagData: false,
        }),
      );

      return {
        business,
        relevanceScore: assessment.score,
        tier: assessment.tier,
        signalScore: business.signalScore ?? 0,
        missingCriticalSources: coverage.missingCritical.length,
        missingRecommendedSources: coverage.missingRecommended.length,
      };
    })
    .filter((candidate) => candidate.tier !== "irrelevant")
    .sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      if (b.missingCriticalSources !== a.missingCriticalSources) {
        return b.missingCriticalSources - a.missingCriticalSources;
      }
      if (b.signalScore !== a.signalScore) {
        return b.signalScore - a.signalScore;
      }
      return b.missingRecommendedSources - a.missingRecommendedSources;
    });
}
