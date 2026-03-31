/**
 * AlleCijfers.nl Provider — Scrapes neighborhood statistics for location intelligence
 *
 * Flow:
 * 1. firecrawl search "allecijfers.nl buurt [neighborhood] [city]" -> find buurt URL
 * 2. firecrawl search "allecijfers.nl weg [streetName] [city]" -> find street URL
 * 3. firecrawl scrape [buurt-url] -> get buurt page content (can be 2000+ lines)
 * 4. AI extract key metrics from the markdown
 *
 * Cache: 30 days (buurt data changes annually at most).
 * Fail-open: returns null on any error.
 */

import {
  firecrawlSearch,
  firecrawlScrape,
  getFirecrawlCache,
  setFirecrawlCache,
  extractWithAI,
} from "@/lib/intelligence/firecrawl-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlleCijfersData {
  /** Neighborhood name */
  buurtNaam: string;
  /** District name */
  wijkNaam: string;
  /** Municipality name */
  gemeente: string;
  /** Total inhabitants */
  inwoners: number | null;
  /** Population growth text, e.g. "+35% sinds 2013" */
  inwonerGroei: string | null;
  /** Average WOZ property value (EUR) */
  woningwaarde: number | null;
  /** Property value growth text, e.g. "+120% sinds 2014" */
  woningwaardeGroei: string | null;
  /** Number of households */
  huishoudens: number | null;
  /** Average household size */
  gemHuishoudGrootte: number | null;
  /** Number of business establishments */
  bedrijfsvestigingen: number | null;
  /** Percentage of rental homes */
  huurPercentage: number | null;
  // Street-level data
  /** Number of addresses on the street */
  straatAdressen: number | null;
  /** Number of buildings on the street */
  straatPanden: number | null;
  /** Estimated inhabitants on the street */
  straatInwoners: number | null;
  // Source URLs
  /** AlleCijfers buurt page URL */
  buurtUrl: string | null;
  /** AlleCijfers street page URL */
  straatUrl: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 30;
const LOG_PREFIX = "[allecijfers]";

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Crawl AlleCijfers.nl for neighborhood and street-level statistics.
 *
 * @param address - Street address or neighborhood name (e.g. "Kinkerstraat 71" or "De Baarsjes")
 * @param city - City name (e.g. "Amsterdam")
 * @param neighborhood - Optional explicit neighborhood name for better search results
 * @returns Structured neighborhood data, or null if not found
 *
 * @example
 * ```ts
 * const data = await crawlAlleCijfers("Kinkerstraat 71", "Amsterdam", "De Baarsjes");
 * if (data) {
 *   console.log(`Buurt: ${data.buurtNaam}, Inwoners: ${data.inwoners}, WOZ: EUR${data.woningwaarde}`);
 * }
 * ```
 */
export async function crawlAlleCijfers(
  address: string,
  city: string,
  neighborhood?: string,
): Promise<AlleCijfersData | null> {
  const normalizedAddress = address.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const cacheKey = `allecijfers:${normalizedAddress}:${normalizedCity}`;

  // 1. Check cache
  const cached = getFirecrawlCache<AlleCijfersData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 2. Search for buurt page
    const searchTerm = neighborhood || extractNeighborhoodFromAddress(address);
    const buurtUrl = findAlleCijfersUrl(searchTerm, city, "buurt");

    // 3. Search for street page
    const streetName = extractStreetName(address);
    const straatUrl = streetName
      ? findAlleCijfersUrl(streetName, city, "weg")
      : null;

    if (!buurtUrl && !straatUrl) {
      console.warn(
        `${LOG_PREFIX} No AlleCijfers URLs found for "${address}" in ${city}`,
      );
      return null;
    }

    // 4. Scrape pages in parallel-ish (sequential since execSync)
    let buurtMarkdown: string | null = null;
    let straatMarkdown: string | null = null;

    if (buurtUrl) {
      buurtMarkdown = firecrawlScrape(buurtUrl);
    }
    if (straatUrl) {
      straatMarkdown = firecrawlScrape(straatUrl);
    }

    if (!buurtMarkdown && !straatMarkdown) {
      console.warn(`${LOG_PREFIX} Failed to scrape any AlleCijfers page`);
      return null;
    }

    // 5. Combine content and extract with AI
    const sections: string[] = [];
    if (buurtMarkdown) {
      sections.push(`--- BUURT PAGINA (${buurtUrl}) ---\n\n${buurtMarkdown}`);
    }
    if (straatMarkdown) {
      sections.push(`--- STRAAT PAGINA (${straatUrl}) ---\n\n${straatMarkdown}`);
    }
    const combinedMarkdown = sections.join("\n\n");

    const data = await extractAlleCijfers(combinedMarkdown, address, city);
    if (!data) {
      console.warn(`${LOG_PREFIX} AI extraction failed for "${address}" in ${city}`);
      return null;
    }

    // Attach source URLs
    data.buurtUrl = buurtUrl;
    data.straatUrl = straatUrl;

    // 6. Cache and return
    setFirecrawlCache(cacheKey, data, CACHE_TTL_DAYS);
    return data;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling AlleCijfers for "${address}" in ${city}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Find AlleCijfers URL via search
// ---------------------------------------------------------------------------

/**
 * Search firecrawl for an AlleCijfers buurt or street page.
 *
 * @param term - Neighborhood name or street name
 * @param city - City name
 * @param type - "buurt" for neighborhood, "weg" for street
 */
function findAlleCijfersUrl(
  term: string,
  city: string,
  type: "buurt" | "weg",
): string | null {
  const query = `allecijfers.nl ${type} ${term} ${city}`;
  const results = firecrawlSearch(query, 5);
  if (!results || results.length === 0) return null;

  // Prefer URLs that match allecijfers.nl with the right pattern
  const typePatterns: Record<string, string[]> = {
    buurt: ["/buurt/", "/wijk/"],
    weg: ["/weg/", "/straat/"],
  };
  const patterns = typePatterns[type];

  // First pass: exact type match
  const exactMatch = results.find(
    (r) =>
      r.url.includes("allecijfers.nl") &&
      patterns.some((p) => r.url.includes(p)),
  );
  if (exactMatch) return exactMatch.url;

  // Second pass: any allecijfers.nl result (could be wijk when searching buurt)
  const anyAlleCijfers = results.find((r) =>
    r.url.includes("allecijfers.nl") &&
    !r.url.includes("/onderwerpen/") &&
    !r.url.includes("/gemeente-overzicht/"),
  );
  if (anyAlleCijfers) return anyAlleCijfers.url;

  return null;
}

// ---------------------------------------------------------------------------
// Internal: AI Extraction
// ---------------------------------------------------------------------------

/** AI extraction result shape */
interface AIAlleCijfersExtraction {
  buurtNaam: string;
  wijkNaam: string;
  gemeente: string;
  inwoners: number | null;
  inwonerGroei: string | null;
  woningwaarde: number | null;
  woningwaardeGroei: string | null;
  huishoudens: number | null;
  gemHuishoudGrootte: number | null;
  bedrijfsvestigingen: number | null;
  huurPercentage: number | null;
  straatAdressen: number | null;
  straatPanden: number | null;
  straatInwoners: number | null;
}

/**
 * Use AI to extract structured neighborhood data from AlleCijfers markdown.
 */
async function extractAlleCijfers(
  markdown: string,
  address: string,
  city: string,
): Promise<AlleCijfersData | null> {
  const prompt = `Je bent een data-extractie specialist voor Nederlandse buurtstatistieken. Extraheer de belangrijkste statistieken uit de volgende AlleCijfers.nl pagina('s) voor de omgeving van "${address}" in ${city}.

Geef je antwoord als een enkel JSON object met EXACT deze structuur:

{
  "buurtNaam": "naam van de buurt",
  "wijkNaam": "naam van de wijk",
  "gemeente": "naam van de gemeente",
  "inwoners": 1234,
  "inwonerGroei": "+35% sinds 2013 of null",
  "woningwaarde": 350000,
  "woningwaardeGroei": "+120% sinds 2014 of null",
  "huishoudens": 567,
  "gemHuishoudGrootte": 1.8,
  "bedrijfsvestigingen": 89,
  "huurPercentage": 65.5,
  "straatAdressen": 45,
  "straatPanden": 30,
  "straatInwoners": 120
}

REGELS:
- Extraheer ALLEEN cijfers die letterlijk op de pagina staan.
- "woningwaarde" is de gemiddelde WOZ-waarde in hele euro's (geen punten of komma's in het getal).
- "huurPercentage" is het percentage huurwoningen (0-100), NIET koopwoningen.
- "inwonerGroei" en "woningwaardeGroei" zijn tekstuele beschrijvingen van de trend.
- Straat-niveau data (straatAdressen, straatPanden, straatInwoners) komen alleen van de weg/straat pagina.
- Als een veld niet te vinden is, gebruik null.
- Getallen zijn numeriek (geen strings met punten of euro-tekens).
- Geef GEEN verklarende tekst, alleen het JSON object.`;

  const extracted = await extractWithAI<AIAlleCijfersExtraction>(markdown, prompt);
  if (!extracted) return null;

  return {
    buurtNaam: extracted.buurtNaam || "Onbekend",
    wijkNaam: extracted.wijkNaam || "Onbekend",
    gemeente: extracted.gemeente || city,
    inwoners: safeNumber(extracted.inwoners),
    inwonerGroei: normalizeString(extracted.inwonerGroei),
    woningwaarde: safeNumber(extracted.woningwaarde),
    woningwaardeGroei: normalizeString(extracted.woningwaardeGroei),
    huishoudens: safeNumber(extracted.huishoudens),
    gemHuishoudGrootte: safeFloat(extracted.gemHuishoudGrootte),
    bedrijfsvestigingen: safeNumber(extracted.bedrijfsvestigingen),
    huurPercentage: safeFloat(extracted.huurPercentage),
    straatAdressen: safeNumber(extracted.straatAdressen),
    straatPanden: safeNumber(extracted.straatPanden),
    straatInwoners: safeNumber(extracted.straatInwoners),
    buurtUrl: null, // Set by caller
    straatUrl: null, // Set by caller
  };
}

// ---------------------------------------------------------------------------
// Address Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a street name from an address string.
 * "Kinkerstraat 71a" -> "Kinkerstraat"
 * "Prinsengracht 502H" -> "Prinsengracht"
 */
function extractStreetName(address: string): string | null {
  // Match the first word(s) before a house number
  const match = address.match(/^([A-Za-zÀ-ÿ\s-]+?)[\s]+\d/);
  if (match) return match[1].trim();

  // If no house number found, the whole thing might be a street name
  const trimmed = address.trim();
  if (trimmed.length > 0 && !/\d/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Extract a potential neighborhood name from an address.
 * Falls back to the street name if no neighborhood is obvious.
 */
function extractNeighborhoodFromAddress(address: string): string {
  // For now, just return the street name or the full address as search term
  return extractStreetName(address) || address;
}

// ---------------------------------------------------------------------------
// Value Normalization Helpers
// ---------------------------------------------------------------------------

/**
 * Safe integer coercion: return null for non-numeric or negative values.
 */
function safeNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseInt(String(value), 10);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num);
}

/**
 * Safe float coercion: return null for non-numeric values.
 */
function safeFloat(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return null;
  return num;
}

/**
 * Normalize a string value: trim, convert "null"/"undefined"/empty to actual null.
 */
function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "" || str === "null" || str === "undefined") return null;
  return str;
}
