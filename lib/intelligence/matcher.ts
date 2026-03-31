/**
 * Intelligence Match Engine -- Scores MonitoredBusinesses against an IntelligenceProfile.
 *
 * Scoring (100 points total):
 *   Location match  (30 pts): city priority, location type, passanten, bereikbaarheid
 *   Concept fit     (25 pts): same category? direct competitor? market gap?
 *   Demographics    (20 pts): age distribution + income vs target profile
 *   Overname signals(15 pts): signalScore of the business
 *   Surface         (10 pts): within min/max range of profile
 *
 * Pre-filtering:
 *   - Chain criteria (includeChains, minChainSize, maxChainSize)
 *   - Exclusion of unsuitable locations (low density, no OV + no traffic, small towns)
 *
 * Location type detection uses a multi-signal classifier (address keywords,
 * OV accessibility, foot traffic, demographics, Google Places types) instead
 * of using OV as a binary proxy.
 *
 * City priority weighting assigns higher scores to cities listed earlier in
 * the profile's targetCities array (P1/P2/P3 tiers).
 */

import prisma from "@/lib/prisma";
import type {
  IntelligenceProfile,
  MonitoredBusiness,
  CrawledBusinessIntel,
} from "@/generated/prisma/client";
import { assessBusinessAgainstProfile } from "@/lib/intelligence/profile-intent";
import { buildBrokerInsightLines, extractBrokerInsights } from "@/lib/intelligence/broker-insights";

// ---------------------------------------------------------------------------
// Types
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

interface DemographicsData {
  gemiddeldInkomen?: number | null;
  leeftijdsverdeling?: {
    jong: number;
    werkleeftijd: number;
    ouder: number;
  };
  dichtheid?: number | null;
  inwoners?: number | null;
  gemeenteNaam?: string | null;
}

interface AreaContext {
  industrial: boolean;
  residential: boolean;
  population: number | null;
}

// ---------------------------------------------------------------------------
// Location Type Detection
// ---------------------------------------------------------------------------

/**
 * Detect location types from available business data.
 *
 * Uses a combination of address keywords, OV accessibility, foot traffic,
 * demographics (population density, age distribution), and Google Places
 * types to classify what kind of area the business is located in.
 *
 * Returns an array of matching type strings that can be compared against
 * the profile's locationTypes preferences.
 */
function detectLocationTypes(business: MonitoredBusiness): string[] {
  const types: string[] = [];
  const address = (business.address ?? "").toLowerCase();
  const ov = business.bereikbaarheidOV ?? "";
  const passanten = business.passantenPerDag ?? 0;
  const demo = business.demografieData as DemographicsData | null;
  const googleTypes = business.types ?? [];

  // Stationsgebied: excellent OV + station-related address keywords
  if (
    (ov === "uitstekend" && address.includes("station")) ||
    address.includes("stationsplein") ||
    address.includes("centraal") ||
    address.includes("stationsweg")
  ) {
    types.push("stationsgebied");
  }

  // Binnenstad: high density + high foot traffic + good OV
  const dichtheid = demo?.dichtheid ?? 0;
  if (
    (dichtheid > 5000 || passanten > 3000) &&
    (ov === "uitstekend" || ov === "goed")
  ) {
    types.push("binnenstad");
  }

  // Universiteit: high percentage of young population or campus-related address
  const jong = demo?.leeftijdsverdeling?.jong ?? 0;
  if (
    jong > 35 ||
    address.includes("universiteit") ||
    address.includes("campus") ||
    address.includes("science") ||
    address.includes("hogeschool")
  ) {
    types.push("universiteit");
  }

  // Winkelstraat: very high foot traffic or shopping-related Google types
  if (
    passanten > 5000 ||
    googleTypes.some(
      (t) =>
        t.includes("shopping") ||
        t.includes("market") ||
        t.includes("shopping_mall"),
    )
  ) {
    types.push("winkelstraat");
  }

  // Kantoren: office-related address keywords or Google types
  if (
    address.includes("business") ||
    address.includes("kantoor") ||
    address.includes("office") ||
    address.includes("zuidas") ||
    address.includes("sloterdijk") ||
    googleTypes.some((t) => t.includes("office") || t.includes("corporate"))
  ) {
    types.push("kantoren");
  }

  // Wijkcentrum: moderate density and moderate foot traffic
  if (
    dichtheid > 2000 &&
    dichtheid <= 5000 &&
    passanten > 500 &&
    passanten <= 3000
  ) {
    types.push("wijkcentrum");
  }

  // Foodhall: Google type hints or address keywords
  if (
    address.includes("foodhall") ||
    address.includes("food hall") ||
    address.includes("markthal") ||
    googleTypes.some((t) => t.includes("food_court"))
  ) {
    types.push("foodhall");
  }

  return types;
}

function detectAreaContext(business: MonitoredBusiness): AreaContext {
  const address = (business.address ?? "").toLowerCase();
  const demo = business.demografieData as DemographicsData | null;
  const dichtheid = demo?.dichtheid ?? null;
  const inwoners = demo?.inwoners ?? null;
  const passanten = business.passantenPerDag ?? 0;
  const ov = business.bereikbaarheidOV ?? "";
  const detectedTypes = detectLocationTypes(business);

  const industrialKeywords = [
    "industrieterrein",
    "bedrijventerrein",
    "business park",
    "logistics",
    "industrie",
    "warehouse",
    "havengebied",
  ];

  const industrial =
    industrialKeywords.some((keyword) => address.includes(keyword)) ||
    (
      dichtheid !== null &&
      dichtheid < 1200 &&
      passanten < 500 &&
      (ov === "slecht" || ov === "matig" || ov === "")
    );

  const residential =
    detectedTypes.length === 0 &&
    passanten < 700 &&
    (ov === "slecht" || ov === "matig" || ov === "") &&
    dichtheid !== null &&
    dichtheid >= 1200 &&
    dichtheid <= 4500;

  return {
    industrial,
    residential,
    population: inwoners,
  };
}

// ---------------------------------------------------------------------------
// Exclusion Logic
// ---------------------------------------------------------------------------

/**
 * Check whether a business should be excluded from matching.
 *
 * Exclusion criteria (intended for locations that are clearly unsuitable
 * for horeca acquisition):
 * - Very low population density (<500/km2) when demographic data is
 *   available, indicating rural/industrial areas
 * - No foot traffic AND poor/no OV AND demographic data confirms the
 *   area is not urban (avoids excluding businesses that simply lack data)
 * - Small towns with fewer than 25,000 inhabitants (when data available)
 */
function isExcludedLocation(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
): boolean {
  const demo = business.demografieData as DemographicsData | null;
  const dichtheid = demo?.dichtheid ?? null;
  const inwoners = demo?.inwoners ?? null;
  const area = detectAreaContext(business);

  if (profile.excludeIndustrial && area.industrial) {
    return true;
  }

  if (profile.excludeResidential && area.residential) {
    return true;
  }

  if (
    profile.minCityPopulation != null &&
    area.population != null &&
    area.population < profile.minCityPopulation
  ) {
    return true;
  }

  // Exclude very low density areas (likely rural/industrial)
  if (dichtheid !== null && dichtheid < 500) {
    return true;
  }

  // Exclude areas with no foot traffic AND poor OV AND confirmed low density
  // Only apply when we have demographic data to confirm (avoid false exclusions)
  if (
    !business.passantenPerDag &&
    (!business.bereikbaarheidOV || business.bereikbaarheidOV === "slecht") &&
    demo !== null &&
    dichtheid !== null &&
    dichtheid < 1500
  ) {
    return true;
  }

  // Exclude small towns (< 25k inhabitants) when data is available
  // Uses gemeenteNaam-level inwoners from CBS demographics
  if (inwoners !== null && inwoners < 25000 && dichtheid !== null && dichtheid < 1500) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Crawled Intel Loader
// ---------------------------------------------------------------------------

/**
 * Laad CrawledBusinessIntel records voor een set bedrijfs-IDs.
 * Retourneert een Map van businessId -> CrawledBusinessIntel voor snelle lookup.
 */
async function loadCrawledIntel(
  businessIds: string[],
): Promise<Map<string, CrawledBusinessIntel>> {
  const intelMap = new Map<string, CrawledBusinessIntel>();

  if (businessIds.length === 0) return intelMap;

  const records = await prisma.crawledBusinessIntel.findMany({
    where: {
      businessId: { in: businessIds },
      crawlStatus: { in: ["complete", "partial"] },
    },
  });

  for (const record of records) {
    intelMap.set(record.businessId, record);
  }

  return intelMap;
}

// ---------------------------------------------------------------------------
// Main: match businesses to profile
// ---------------------------------------------------------------------------

/**
 * Find and score MonitoredBusinesses against an IntelligenceProfile.
 * Returns matches sorted by score descending.
 *
 * Loads CrawledBusinessIntel when available to enrich concept scoring
 * with Thuisbezorgd menu data.
 */
export async function matchBusinessesToProfile(
  profileId: string,
  options?: { limit?: number; minScore?: number },
): Promise<MatchResult[]> {
  const limit = options?.limit ?? 100;
  const minScore = options?.minScore ?? 30;

  // Load profile
  const profile = await prisma.intelligenceProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) throw new Error(`Profile not found: ${profileId}`);
  // Load candidate businesses in target cities
  const businesses = await prisma.monitoredBusiness.findMany({
    where: {
      city: { in: profile.targetCities },
    },
  });

  // Filter by chain criteria from profile
  let filteredBusinesses = businesses;

  if (!profile.includeChains) {
    // Exclude businesses that are part of a chain (chainSize > 1)
    filteredBusinesses = filteredBusinesses.filter(
      (b) => !b.chainSize || b.chainSize <= 1,
    );
  }
  if (profile.minChainSize != null) {
    filteredBusinesses = filteredBusinesses.filter(
      (b) => !b.chainSize || b.chainSize >= profile.minChainSize!,
    );
  }
  if (profile.maxChainSize != null) {
    filteredBusinesses = filteredBusinesses.filter(
      (b) => !b.chainSize || b.chainSize <= profile.maxChainSize!,
    );
  }

  // Exclude unsuitable locations (industrial areas, rural, small towns)
  filteredBusinesses = filteredBusinesses.filter(
    (b) => !isExcludedLocation(b, profile),
  );

  // Load crawled intel for all candidate businesses (menu data, etc.)
  const businessIds = filteredBusinesses.map((b) => b.id);
  const crawledIntelMap = await loadCrawledIntel(businessIds);

  filteredBusinesses = filteredBusinesses.filter((business) => {
    const assessment = assessBusinessAgainstProfile(
      business,
      profile,
      crawledIntelMap.get(business.id) ?? null,
    );

    return assessment.tier !== "irrelevant";
  });

  // Score each business
  const results: MatchResult[] = [];

  for (const business of filteredBusinesses) {
    const intel = crawledIntelMap.get(business.id) ?? null;
    const breakdown = scoreBusinessAgainstProfile(business, profile, intel);
    const matchScore =
      breakdown.location +
      breakdown.concept +
      breakdown.demographics +
      breakdown.signals +
      breakdown.surface;

    if (matchScore >= minScore) {
      results.push({ businessId: business.id, matchScore, breakdown });
    }
  }

  // Sort by score descending, limit results
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreBusinessAgainstProfile(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
  intel: CrawledBusinessIntel | null,
): MatchBreakdown {
  // Base concept score from keyword/cuisine matching
  let conceptScore = scoreConcept(business, profile, intel);

  // Chain fit bonus/penalty (adjusts concept score within 0-25 range)
  conceptScore = adjustConceptForChainFit(conceptScore, business, profile);

  return {
    location: scoreLocation(business, profile, intel),
    concept: conceptScore,
    demographics: scoreDemographics(business, profile),
    signals: scoreSignals(business),
    surface: scoreSurface(business, profile),
  };
}

/**
 * Adjust concept score based on chain fit.
 *
 * When the profile has chain preferences, businesses that match those
 * preferences receive a bonus (up to +3 pts), while mismatches get a
 * penalty (up to -3 pts). The result stays within the 0-25 range.
 */
function adjustConceptForChainFit(
  baseScore: number,
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
): number {
  const chainSize = business.chainSize;
  const isChain = chainSize != null && chainSize > 1;

  // If profile excludes chains and this is a chain, penalize
  if (!profile.includeChains && isChain) {
    // This should rarely happen since we pre-filter, but acts as safety net
    return Math.max(0, baseScore - 3);
  }

  // If profile wants chains and this IS a chain within the desired range, bonus
  if (profile.includeChains && isChain) {
    const withinMin =
      profile.minChainSize == null || chainSize >= profile.minChainSize;
    const withinMax =
      profile.maxChainSize == null || chainSize <= profile.maxChainSize;

    if (withinMin && withinMax) {
      return Math.min(25, baseScore + 3);
    }
    // Chain exists but outside preferred range -- slight penalty
    return Math.max(0, baseScore - 2);
  }

  // No chain data or no chain preferences -- no adjustment
  return baseScore;
}

/**
 * Location score (0 to 30):
 * - City match with priority weighting: 10 pts max
 * - Location type match: 8 pts max
 * - Passanten threshold: 7 pts max
 * - OV bereikbaarheid: 5 pts max
 *
 * City priority: cities earlier in the profile's targetCities array are
 * assumed to be higher priority (P1: first 2 cities = 10 pts, P2: next 2
 * cities = 8 pts, P3: remaining = 6 pts).
 *
 * Location type matching uses detectLocationTypes() to classify the
 * business area from address, OV, passanten, demographics, and Google
 * Places types, rather than using OV as a binary proxy.
 */
function scoreLocation(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
  intel?: CrawledBusinessIntel | null,
): number {
  let score = 0;

  // City match with priority weighting (10 pts max)
  // Cities ordered by priority in the profile wizard:
  //   P1 (index 0-1): 10 pts — top priority cities
  //   P2 (index 2-3):  8 pts — secondary cities
  //   P3 (index 4+):   6 pts — remaining cities
  const cityIndex = profile.targetCities.indexOf(business.city);
  if (cityIndex >= 0) {
    if (cityIndex < 2) score += 10;
    else if (cityIndex < 4) score += 8;
    else score += 6;
  }

  // Location type (8 pts max) — detect actual location type from data
  if (profile.locationTypes.length === 0) {
    score += 6;
  } else {
    const detectedTypes = detectLocationTypes(business);
    const matchingTypes = profile.locationTypes.filter((t) =>
      detectedTypes.includes(t),
    );

    if (matchingTypes.length > 0) {
      // Match found: full score
      score += 8;
    } else if (detectedTypes.length === 0) {
      score += 2;
    } else {
      score += 1;
    }
  }

  // Passanten threshold (7 pts max)
  if (profile.minPassanten && business.passantenPerDag) {
    if (business.passantenPerDag >= profile.minPassanten) {
      score += 7;
    } else {
      // Partial score based on how close
      const ratio = business.passantenPerDag / profile.minPassanten;
      score += Math.round(7 * Math.min(ratio, 1));
    }
  } else {
    // No data = no credit (buurt enrichment needed to score this)
    score += 0;
  }

  // OV bereikbaarheid (5 pts max)
  const ovMap: Record<string, number> = {
    uitstekend: 5,
    goed: 4,
    redelijk: 3,
    matig: 1,
    slecht: 0,
  };
  score += ovMap[business.bereikbaarheidOV ?? ""] ?? 0;

  // Competition environment bonus/penalty (within location's 30pt cap)
  if (
    intel?.competitorsData &&
    (profile.positiveEnvironment.length > 0 || profile.negativeEnvironment.length > 0)
  ) {
    const comp = intel.competitorsData as Record<string, unknown>;
    const competitors = Array.isArray(comp.competitors)
      ? (comp.competitors as Array<Record<string, unknown>>)
      : [];

    // Count positive and negative environment matches
    let posCount = 0;
    let negCount = 0;

    for (const c of competitors) {
      const cType = ((c.type as string) ?? "").toLowerCase();
      const cName = ((c.name as string) ?? "").toLowerCase();
      const cText = `${cType} ${cName}`;

      if (profile.positiveEnvironment.some((p) => cText.includes(p.toLowerCase()))) posCount++;
      if (profile.negativeEnvironment.some((n) => cText.includes(n.toLowerCase()))) negCount++;
    }

    // Bonus for positive environment (max +3)
    if (posCount >= 3) score += 3;
    else if (posCount >= 1) score += 1;

    // Penalty for negative environment (max -3)
    if (negCount >= 3) score -= 3;
    else if (negCount >= 1) score -= 1;
  }

  return Math.max(0, Math.min(score, 30));
}

/**
 * Concept fit score (0-25):
 * - Direct competitor (same concept): 25 pts
 * - Related concept (same cuisine family): 15-18 pts
 * - Menu keyword match (Thuisbezorgd data): +5 pts bonus
 * - Generic horeca (could be repurposed): 8 pts
 * - Unrelated: 3 pts
 */
function scoreConcept(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
  intel?: CrawledBusinessIntel | null,
): number {
  let baseScore = assessBusinessAgainstProfile(business, profile, intel).score;

  // Bonus: Thuisbezorgd menu keyword match (+5 punten, max 25)
  // Als de menukaart items bevat die overeenkomen met het gezochte concept,
  // is dit een sterke indicator dat het bedrijf al in dezelfde markt zit.
  if (intel?.thuisbezorgdData) {
    const keywords = profile.competitorKeywords.map((keyword) => keyword.toLowerCase());
    const concept = profile.concept.toLowerCase();
    const menuBonus = scoreMenuKeywordMatch(intel.thuisbezorgdData, keywords, concept);
    baseScore = Math.min(25, baseScore + menuBonus);
  }

  return baseScore;
}

/**
 * Scoort een bonus op basis van Thuisbezorgd menukaart keyword matches.
 * Retourneert 0-5 bonuspunten.
 */
function scoreMenuKeywordMatch(
  thuisbezorgdData: unknown,
  keywords: string[],
  concept: string,
): number {
  if (thuisbezorgdData == null || typeof thuisbezorgdData !== "object") {
    return 0;
  }

  const tb = thuisbezorgdData as Record<string, unknown>;
  const menuItems = Array.isArray(tb.menuItems) ? tb.menuItems : [];

  if (menuItems.length === 0) return 0;

  // Combineer alle zoektermen: profile keywords + concept woorden
  const searchTerms = [
    ...keywords,
    ...concept.split(/\s+/).filter((w) => w.length >= 3),
  ];

  if (searchTerms.length === 0) return 0;

  // Tel het aantal menu items dat een keyword match heeft
  let matchCount = 0;

  for (const item of menuItems) {
    if (item == null || typeof item !== "object") continue;
    const menuItem = item as Record<string, unknown>;
    const itemName = (typeof menuItem.name === "string" ? menuItem.name : "").toLowerCase();
    const itemDesc = (typeof menuItem.description === "string" ? menuItem.description : "").toLowerCase();
    const itemText = `${itemName} ${itemDesc}`;

    if (searchTerms.some((term) => itemText.includes(term))) {
      matchCount++;
    }
  }

  // Bereken bonus: minimaal 3 matches nodig voor 5 punten
  if (matchCount >= 3) return 5;
  if (matchCount >= 1) return 3;
  return 0;
}

/**
 * Demographics score (0-20):
 * - Age distribution match: 10 pts
 * - Income match: 10 pts
 */
function scoreDemographics(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
): number {
  let score = 0;
  const demo = business.demografieData as DemographicsData | null;

  if (!demo) return 0; // No data = no credit (buurt enrichment needed)

  // Age match (10 pts)
  if (profile.targetAge && demo.leeftijdsverdeling) {
    const ageMap: Record<string, keyof typeof demo.leeftijdsverdeling> = {
      jong: "jong",
      werkleeftijd: "werkleeftijd",
      any: "werkleeftijd",
    };
    const targetKey = ageMap[profile.targetAge] ?? "werkleeftijd";
    const targetPct = demo.leeftijdsverdeling[targetKey] ?? 0;

    // Higher percentage of target age = better
    if (targetPct >= 40) score += 10;
    else if (targetPct >= 30) score += 7;
    else if (targetPct >= 20) score += 4;
    else score += 2;
  } else {
    score += 3;
  }

  // Income match (10 pts)
  if (profile.minIncome && demo.gemiddeldInkomen) {
    if (demo.gemiddeldInkomen >= profile.minIncome) {
      score += 10;
    } else {
      const ratio = demo.gemiddeldInkomen / profile.minIncome;
      score += Math.round(10 * Math.min(ratio, 1));
    }
  } else if (demo.gemiddeldInkomen) {
    score += 2;
  }
  // else: no data AND no requirement = 0 pts

  return Math.min(score, 20);
}

/**
 * Signal score (0-15):
 * Higher signal score = more likely available for takeover
 */
function scoreSignals(business: MonitoredBusiness): number {
  // Map business signalScore (0-100) to match component (0-15), clamped to valid range
  return Math.max(0, Math.min(15, Math.round((business.signalScore / 100) * 15)));
}

/**
 * Surface score (0-10):
 * Business surface (estimated from BAG/buurt data) vs profile requirements.
 *
 * Looks for an "oppervlakte" key in demografieData (populated by buurt enrichment).
 * When no surface data is available, returns a neutral 5/10 instead of 0
 * to avoid unfairly penalizing businesses that simply lack data.
 */
function scoreSurface(
  business: MonitoredBusiness,
  profile: IntelligenceProfile,
): number {
  // If no surface requirements, full score
  if (!profile.minSurface && !profile.maxSurface) return 10;

  // Try to extract surface area from demografieData (BAG enrichment)
  const demo = business.demografieData as Record<string, unknown> | null;
  const estimatedSurface =
    typeof demo?.oppervlakte === "number" ? demo.oppervlakte : null;

  if (estimatedSurface != null && estimatedSurface > 0) {
    let score = 10;

    if (profile.minSurface && estimatedSurface < profile.minSurface) {
      // Penalty proportional to how far below minimum
      const deficit = 1 - estimatedSurface / profile.minSurface;
      score -= Math.min(5, Math.round(5 * deficit));
    }

    if (profile.maxSurface && estimatedSurface > profile.maxSurface) {
      // Penalty proportional to how far above maximum
      const excess = 1 - profile.maxSurface / estimatedSurface;
      score -= Math.min(5, Math.round(5 * excess));
    }

    return Math.max(0, score);
  }

  // No surface data available -- neutral score to avoid unfair penalization
  return 3;
}

// ---------------------------------------------------------------------------
// AI Summary Generation
// ---------------------------------------------------------------------------

/**
 * Generate AI summaries for top matches in batch.
 * Uses getModel() from lib/ai/model.ts with Groq as primary.
 *
 * When crawled intel is available, includes Thuisbezorgd menu data,
 * competitor analysis, news signals and buurt data in the prompt
 * for richer, more informed summaries.
 */
export async function generateMatchSummaries(
  matches: MatchResult[],
  profile: IntelligenceProfile,
  businesses: Map<string, MonitoredBusiness>,
  crawledIntel?: Map<string, CrawledBusinessIntel>,
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  // Only generate for top 20
  const topMatches = matches.slice(0, 20);
  if (topMatches.length === 0) return summaries;

  try {
    const { generateText } = await import("ai");
    const { getModel } = await import("@/lib/ai/model");
    const { model } = await getModel();

    // Batch all matches into one prompt for efficiency
    const matchDescriptions = topMatches
      .map((m) => {
        const biz = businesses.get(m.businessId);
        if (!biz) return null;

        const signals = biz.signals as Record<string, boolean> | null;
        const activeSignals = signals
          ? Object.entries(signals)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
          : [];

        let description = `[${biz.id}] ${biz.name} (${biz.city}, ${biz.businessType ?? "horeca"})
  Rating: ${biz.currentRating ?? "?"}/5 (${biz.totalReviews ?? 0} reviews)
  Match score: ${m.matchScore}/100 (locatie: ${m.breakdown.location}, concept: ${m.breakdown.concept}, demografie: ${m.breakdown.demographics}, signalen: ${m.breakdown.signals})
  Signalen: ${activeSignals.length > 0 ? activeSignals.join(", ") : "geen"}
  Open: ${biz.isOpen ? "ja" : "nee"}`;

        // Voeg crawled intel context toe indien beschikbaar
        const intel = crawledIntel?.get(m.businessId);
        const insightLines = buildBrokerInsightLines(
          { ...biz, crawledIntel: intel ?? null },
          intel,
        );
        if (insightLines.length > 0) {
          description += `\n  Inzichten: ${insightLines.join(" | ")}`;
        }
        if (intel) {
          description += formatCrawledIntelContext(intel);
        }

        return description;
      })
      .filter(Boolean)
      .join("\n\n");

    const hasCrawledData = crawledIntel && crawledIntel.size > 0;

    const { text } = await generateText({
      model,
      system: `Je bent een horeca acquisitie analist. Je analyseert horecazaken voor een klant die zoekt naar het concept "${profile.concept}" in ${profile.targetCities.join(", ")}.

Geef per zaak een korte analyse (2-3 zinnen in het Nederlands) waarom dit een interessante overname kandidaat is. Focus op:
- Waarom de locatie past bij het concept
- Welke signalen wijzen op beschikbaarheid
- Wat de kansen zijn
${hasCrawledData ? "- Gebruik de verrijkte data (menu, concurrentie, buurt, nieuws) voor concrete inzichten" : ""}

Gebruik professionele, positieve taal. Zeg NOOIT "failende zaak" -- zeg "transitie kans" of "concept verversing mogelijk".

Output format: Per zaak een regel die begint met het ID tussen brackets, gevolgd door de analyse.
Voorbeeld: [cuid123] Deze zaak op een toplocatie toont tekenen van transitie...`,
      prompt: `Analyseer deze ${topMatches.length} matches voor het zoekprofiel "${profile.name}" (concept: ${profile.concept}):\n\n${matchDescriptions}`,
    });

    // Parse the response -- extract [id] summaries
    const lines = text.split("\n").filter((l) => l.trim().startsWith("["));
    for (const line of lines) {
      const idMatch = line.match(/\[([^\]]+)\]/);
      if (idMatch) {
        const id = idMatch[1];
        const summary = line.replace(/\[[^\]]+\]\s*/, "").trim();
        if (summary) summaries.set(id, summary);
      }
    }

    for (const match of topMatches) {
      if (summaries.has(match.businessId)) continue;
      const biz = businesses.get(match.businessId);
      if (!biz) continue;
      const intel = crawledIntel?.get(match.businessId) ?? null;
      summaries.set(
        match.businessId,
        buildDeterministicMatchSummary(biz, match, intel),
      );
    }
  } catch (error) {
    console.error("[matcher] AI summary generation failed:", error);

    for (const match of topMatches) {
      const biz = businesses.get(match.businessId);
      if (!biz) continue;
      const intel = crawledIntel?.get(match.businessId) ?? null;
      const fallback = buildDeterministicMatchSummary(biz, match, intel);
      if (fallback) summaries.set(match.businessId, fallback);
    }
  }

  return summaries;
}

/**
 * Format crawled intel data as extra context for the AI prompt.
 * Produces a compact text block with available data sources.
 */
function formatCrawledIntelContext(intel: CrawledBusinessIntel): string {
  const parts: string[] = [];

  // Thuisbezorgd menu items + prijzen
  if (intel.thuisbezorgdData) {
    const tb = intel.thuisbezorgdData as Record<string, unknown>;
    const menuItems = Array.isArray(tb.menuItems) ? tb.menuItems : [];
    const topItems = menuItems
      .slice(0, 5)
      .map((item: Record<string, unknown>) => {
        const name = typeof item.name === "string" ? item.name : "?";
        const price = typeof item.price === "number" ? `\u20AC${item.price}` : "";
        return `${name} ${price}`.trim();
      })
      .join(", ");

    if (topItems) {
      parts.push(`  Thuisbezorgd: ${tb.rating ?? "?"}/10, menu: ${topItems}`);
    }
  }

  // Competitor comparison
  if (intel.competitorsData) {
    const comp = intel.competitorsData as Record<string, unknown>;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const compCount = competitors.length;
    const avgRating = comp.avgRating;
    const dominantCuisine = comp.dominantCuisine;

    if (compCount > 0) {
      parts.push(`  Concurrentie: ${compCount} nabij, gem. rating ${avgRating ?? "?"}/5, dominant: ${dominantCuisine ?? "divers"}`);
    }
  }

  // News signals
  if (intel.newsData) {
    const news = intel.newsData as Record<string, unknown>;
    const hasOvername = news.hasOvernameSignal === true;
    const hasFaillissement = news.hasFaillissementSignal === true;
    const items = Array.isArray(news.items) ? news.items : [];

    if (hasOvername || hasFaillissement || items.length > 0) {
      const newsFlags: string[] = [];
      if (hasOvername) newsFlags.push("OVERNAME SIGNAAL");
      if (hasFaillissement) newsFlags.push("FAILLISSEMENT SIGNAAL");
      if (items.length > 0) {
        const firstItem = items[0] as Record<string, unknown>;
        newsFlags.push(`recent: "${firstItem.title ?? "nieuws"}"`);
      }
      parts.push(`  Nieuws: ${newsFlags.join(", ")}`);
    }
  }

  // Buurt data (AlleCijfers)
  if (intel.allecijfersData) {
    const ac = intel.allecijfersData as Record<string, unknown>;
    const buurt = ac.buurtNaam ?? "";
    const inwoners = ac.inwoners ?? "?";
    const woningwaarde = ac.woningwaarde ? `\u20AC${ac.woningwaarde}` : "?";

    if (buurt || inwoners !== "?") {
      parts.push(`  Buurt: ${buurt} (${inwoners} inwoners, woningwaarde ${woningwaarde})`);
    }
  }

  if (parts.length === 0) return "";
  return "\n" + parts.join("\n");
}

function buildDeterministicMatchSummary(
  business: MonitoredBusiness,
  match: MatchResult,
  intel: CrawledBusinessIntel | null,
): string {
  const insights = extractBrokerInsights(
    { ...business, crawledIntel: intel },
    intel,
  );
  const angle = insights.brokerAngles[0] ?? insights.acquisitionSignals[0] ?? insights.strengths[0];
  const risk = insights.risks[0];

  if (!angle && !risk) {
    return `${business.name} scoort ${match.matchScore}/100 door sterke locatie-fit en beschikbare marktdata, maar vraagt nog aanvullende verrijking voor een scherper acquisitie-advies.`;
  }

  return [
    `${business.name} scoort ${match.matchScore}/100.`,
    angle ? angle.charAt(0).toUpperCase() + angle.slice(1) + "." : null,
    risk ? `Aandachtspunt: ${risk}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Save matches to database
// ---------------------------------------------------------------------------

/**
 * Save match results to the database, creating/updating IntelligenceMatch records.
 */
export async function saveMatches(
  profileId: string,
  results: MatchResult[],
  summaries: Map<string, string>,
): Promise<number> {
  for (const result of results) {
    try {
      await prisma.intelligenceMatch.upsert({
        where: {
          profileId_businessId: {
            profileId,
            businessId: result.businessId,
          },
        },
        update: {
          matchScore: result.matchScore,
          matchBreakdown: result.breakdown as unknown as Record<string, number>,
          aiSummary: summaries.get(result.businessId) ?? undefined,
        },
        create: {
          profileId,
          businessId: result.businessId,
          matchScore: result.matchScore,
          matchBreakdown: result.breakdown as unknown as Record<string, number>,
          aiSummary: summaries.get(result.businessId) ?? null,
          status: "new",
        },
      });
    } catch (error) {
      console.warn(`[matcher] Failed to save match for business ${result.businessId}:`, error);
    }
  }

  const activeBusinessIds = results.map((result) => result.businessId);
  await prisma.intelligenceMatch.deleteMany({
    where: {
      profileId,
      ...(activeBusinessIds.length > 0
        ? { businessId: { notIn: activeBusinessIds } }
        : {}),
      status: { in: ["new", "reviewed", "starred", "dismissed"] },
    },
  });

  const remainingMatches = await prisma.intelligenceMatch.count({
    where: { profileId },
  });

  // Update profile stats
  await prisma.intelligenceProfile.update({
    where: { id: profileId },
    data: {
      lastMatchAt: new Date(),
      totalMatches: remainingMatches,
    },
  });

  return remainingMatches;
}
