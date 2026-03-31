/**
 * Overname Intelligence Scanner — Shared Types
 */

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export interface ScanProgress {
  city: string;
  phase: "searching" | "classifying" | "analyzing" | "saving";
  found: number;
  processed: number;
  total: number;
}

export interface ScanResult {
  city: string;
  businessesFound: number;
  newBusinesses: number;
  updatedBusinesses: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Signal Detector
// ---------------------------------------------------------------------------

export interface SignalAnalysis {
  signalScore: number; // 0-100
  signals: {
    ratingDrop: boolean;
    ratingDropAmount?: number;
    reviewDecline: boolean;
    negativeSentiment: boolean;
    recentlyClosed: boolean;
    temporarilyClosed: boolean;
    ownerMultipleLocations: boolean;
    lowRating: boolean;
    fewReviews: boolean;
    stalePresence: boolean;
    reducedHours: boolean;
    priceMismatch: boolean;
  };
  topSignal: string; // Dutch text
  signalDetails: string[]; // All signal descriptions (Dutch)
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export interface MatchBreakdown {
  location: number; // 0-30
  concept: number; // 0-25
  demographics: number; // 0-20
  signals: number; // 0-15
  surface: number; // 0-10
}

export interface MatchResult {
  businessId: string;
  matchScore: number;
  breakdown: MatchBreakdown;
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export interface MonitorProgress {
  scanned: number;
  total: number;
  status: "running" | "completed" | "failed";
}

export interface SignificantChange {
  businessId: string;
  businessName: string;
  city: string;
  changes: string[];
  newSignalScore: number;
  previousSignalScore: number;
}

export interface MonitorResult {
  scanned: number;
  significantChanges: SignificantChange[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Intelligence Profile (for forms/wizard)
// ---------------------------------------------------------------------------

export interface CreateProfileInput {
  name: string;
  concept: string;
  conceptDescription?: string;
  targetCities: string[];
  minSurface?: number;
  maxSurface?: number;
  locationTypes?: string[];
  targetAge?: "jong" | "werkleeftijd" | "any";
  minIncome?: number;
  minPassanten?: number;
  competitorKeywords: string[];
  includeChains?: boolean;
  minChainSize?: number;
  maxChainSize?: number;
  visibilityPrefs?: string[];
  operatingModel?: string[];
  excludeIndustrial?: boolean;
  excludeResidential?: boolean;
  minCityPopulation?: number;
  positiveEnvironment?: string[];
  negativeEnvironment?: string[];
}

export type UpdateProfileInput = Partial<CreateProfileInput>;

// ---------------------------------------------------------------------------
// Match status
// ---------------------------------------------------------------------------

export type MatchStatus =
  | "new"
  | "reviewed"
  | "starred"
  | "contacted"
  | "dismissed";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  new: "Nieuw",
  reviewed: "Bekeken",
  starred: "Interessant",
  contacted: "Gecontacteerd",
  dismissed: "Afgewezen",
};

// ---------------------------------------------------------------------------
// City data
// ---------------------------------------------------------------------------

export const DUTCH_CITIES = [
  "Amsterdam",
  "Utrecht",
  "Rotterdam",
  "Den Haag",
  "Eindhoven",
  "Groningen",
  "Leiden",
  "Haarlem",
  "Breda",
  "Tilburg",
  "Arnhem",
  "Nijmegen",
  "Alkmaar",
  "Amersfoort",
] as const;

export type DutchCity = (typeof DUTCH_CITIES)[number];

export const LOCATION_TYPES = [
  { value: "binnenstad", label: "Binnenstad / A-locatie" },
  { value: "stationsgebied", label: "Stationsgebied" },
  { value: "universiteit", label: "Nabij universiteit" },
  { value: "winkelstraat", label: "Hoofdwinkelstraat" },
  { value: "wijkcentrum", label: "Wijkcentrum" },
  { value: "foodhall", label: "Foodhall / Foodcourt" },
  { value: "kantoren", label: "Kantorengebied" },
] as const;

export const VISIBILITY_OPTIONS = [
  { value: "grote_pui", label: "Grote pui / veel glas" },
  { value: "hoeklocatie", label: "Hoeklocatie" },
  { value: "terras", label: "Terras mogelijk" },
  { value: "reclame", label: "Goede reclamemogelijkheden" },
] as const;

export const OPERATING_MODEL_OPTIONS = [
  { value: "eat_in", label: "Eat-in (zitplaatsen)" },
  { value: "afhaal", label: "Afhaal" },
  { value: "bezorging", label: "Bezorging" },
] as const;

export const ENVIRONMENT_SUGGESTIONS = {
  positive: ["restaurant", "koffie", "lunch", "horeca cluster", "winkel"],
  negative: ["directe concurrent", "soortgelijk concept", "fastfood keten"],
} as const;

export const CONCEPT_TYPES = [
  { value: "poke_bowl", label: "Poke Bowl" },
  { value: "sushi", label: "Sushi" },
  { value: "ramen", label: "Ramen" },
  { value: "koffiebar", label: "Koffiebar" },
  { value: "lunchroom", label: "Lunchroom" },
  { value: "restaurant", label: "Restaurant" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "bakery", label: "Bakkerij" },
  { value: "pizzeria", label: "Pizzeria" },
  { value: "burger", label: "Burgerbar" },
  { value: "ice_cream", label: "IJssalon" },
  { value: "bar", label: "Bar / Cafe" },
  { value: "other", label: "Anders" },
] as const;
