import type { BrokerDecision } from "@/lib/intelligence/broker-insights";

// ---------------------------------------------------------------------------
// Shared Intelligence Report — Public data shape
// Matches the API response from GET /api/intelligence/shared/[token]
// ---------------------------------------------------------------------------

export interface SharedReportBusiness {
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
}

export interface SharedReportDossier {
  aiDossier: string | null;
  sourcesCompleted: string[];
  confidenceLevel: string;
  crawledAt: string | null;
  brokerDecision: BrokerDecision;
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
}

export interface SharedReportMatch {
  matchScore: number;
  aiSummary: string | null;
  business: SharedReportBusiness;
  dossier: SharedReportDossier | null;
}

export interface SharedReportData {
  profileName: string;
  clientName: string | null;
  customNote: string | null;
  createdAt: string;
  matchCount: number;
  matches: SharedReportMatch[];
}

/** API error responses */
export interface SharedReportError {
  error: string;
}
