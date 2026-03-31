import type { CrawledBusinessIntel } from "@/generated/prisma/client";

export type IntelligenceSourceId =
  | "google_places"
  | "kvk"
  | "tripadvisor"
  | "thuisbezorgd"
  | "allecijfers"
  | "website"
  | "news"
  | "competitors"
  | "bag"
  | "cbs"
  | "transport"
  | "osm";

export interface SourceDefinition {
  id: IntelligenceSourceId;
  label: string;
  category: "official_api" | "crawl" | "derived";
  purpose: string;
  keyInsights: string[];
  freshnessHours: number;
  criticality: "high" | "medium" | "low";
}

export interface SourceCoverageReport {
  available: IntelligenceSourceId[];
  missingCritical: IntelligenceSourceId[];
  missingRecommended: IntelligenceSourceId[];
  confidenceLevel: "high" | "medium" | "low";
}

type MinimalCrawledIntel = Pick<
  CrawledBusinessIntel,
  | "kvkData"
  | "tripadvisorData"
  | "thuisbezorgdData"
  | "allecijfersData"
  | "websiteData"
  | "newsData"
  | "competitorsData"
>;

export const INTELLIGENCE_SOURCE_REGISTRY: Record<IntelligenceSourceId, SourceDefinition> = {
  google_places: {
    id: "google_places",
    label: "Google Places",
    category: "official_api",
    purpose: "Basissignalen en discovery",
    keyInsights: ["rating", "reviews", "openingstijden", "status", "types"],
    freshnessHours: 24,
    criticality: "high",
  },
  kvk: {
    id: "kvk",
    label: "KvK / OpenKvK",
    category: "crawl",
    purpose: "Eigendom en ketenstructuur",
    keyInsights: ["eigenaar", "ketengrootte", "rechtsvorm", "SBI"],
    freshnessHours: 168,
    criticality: "high",
  },
  tripadvisor: {
    id: "tripadvisor",
    label: "TripAdvisor",
    category: "crawl",
    purpose: "Cuisine en reputatieverdieping",
    keyInsights: ["ranking", "cuisine", "recente reviews"],
    freshnessHours: 72,
    criticality: "medium",
  },
  thuisbezorgd: {
    id: "thuisbezorgd",
    label: "Thuisbezorgd",
    category: "crawl",
    purpose: "Menu en delivery-performance",
    keyInsights: ["menu", "delivery rating", "bezorgtijd"],
    freshnessHours: 48,
    criticality: "high",
  },
  allecijfers: {
    id: "allecijfers",
    label: "AlleCijfers",
    category: "crawl",
    purpose: "Buurtcontext en koopkracht",
    keyInsights: ["woningwaarde", "voorzieningen", "inwoners"],
    freshnessHours: 168,
    criticality: "medium",
  },
  website: {
    id: "website",
    label: "Bedrijfswebsite",
    category: "crawl",
    purpose: "Concept, propositie en service model",
    keyInsights: ["concept", "delivery", "reserveringen", "menu"],
    freshnessHours: 72,
    criticality: "high",
  },
  news: {
    id: "news",
    label: "Nieuws",
    category: "crawl",
    purpose: "Verkoop- en stresssignalen",
    keyInsights: ["overname", "faillissement", "sluiting", "expansie"],
    freshnessHours: 24,
    criticality: "high",
  },
  competitors: {
    id: "competitors",
    label: "Concurrenten",
    category: "crawl",
    purpose: "Marktdruk en gat in de markt",
    keyInsights: ["concurrentiedichtheid", "dominante cuisine", "benchmark"],
    freshnessHours: 168,
    criticality: "medium",
  },
  bag: {
    id: "bag",
    label: "BAG / PDOK",
    category: "official_api",
    purpose: "Oppervlakte en pandinformatie",
    keyInsights: ["oppervlakte", "bouwjaar", "gebruiksdoel"],
    freshnessHours: 720,
    criticality: "medium",
  },
  cbs: {
    id: "cbs",
    label: "CBS",
    category: "official_api",
    purpose: "Demografie en inkomenscontext",
    keyInsights: ["leeftijd", "dichtheid", "inkomen", "inwoners"],
    freshnessHours: 720,
    criticality: "medium",
  },
  transport: {
    id: "transport",
    label: "OV / Transport",
    category: "derived",
    purpose: "Bereikbaarheid",
    keyInsights: ["OV-score", "stations", "haltes"],
    freshnessHours: 720,
    criticality: "medium",
  },
  osm: {
    id: "osm",
    label: "OSM",
    category: "official_api",
    purpose: "Voorzieningen en omgeving",
    keyInsights: ["voorzieningen", "horecadichtheid", "context"],
    freshnessHours: 720,
    criticality: "low",
  },
};

export function getAvailableSourceIds(
  intel: MinimalCrawledIntel | null | undefined,
  options?: {
    hasGooglePlaces?: boolean;
    hasBuurtData?: boolean;
    hasTransport?: boolean;
    hasBagData?: boolean;
  },
): IntelligenceSourceId[] {
  return [
    options?.hasGooglePlaces ? "google_places" : null,
    options?.hasBuurtData ? "cbs" : null,
    options?.hasTransport ? "transport" : null,
    options?.hasBagData ? "bag" : null,
    intel?.kvkData ? "kvk" : null,
    intel?.tripadvisorData ? "tripadvisor" : null,
    intel?.thuisbezorgdData ? "thuisbezorgd" : null,
    intel?.allecijfersData ? "allecijfers" : null,
    intel?.websiteData ? "website" : null,
    intel?.newsData ? "news" : null,
    intel?.competitorsData ? "competitors" : null,
  ].filter(Boolean) as IntelligenceSourceId[];
}

export function buildSourceCoverageReport(
  available: IntelligenceSourceId[],
): SourceCoverageReport {
  const availableSet = new Set(available);
  const criticalSources: IntelligenceSourceId[] = [
    "google_places",
    "website",
    "thuisbezorgd",
    "kvk",
    "news",
  ];
  const recommendedSources: IntelligenceSourceId[] = [
    "tripadvisor",
    "allecijfers",
    "competitors",
    "cbs",
    "transport",
    "bag",
  ];

  const missingCritical = criticalSources.filter((id) => !availableSet.has(id));
  const missingRecommended = recommendedSources.filter((id) => !availableSet.has(id));

  const confidenceLevel: SourceCoverageReport["confidenceLevel"] =
    missingCritical.length === 0 && missingRecommended.length <= 1
      ? "high"
      : missingCritical.length <= 2
        ? "medium"
        : "low";

  return {
    available,
    missingCritical,
    missingRecommended,
    confidenceLevel,
  };
}
