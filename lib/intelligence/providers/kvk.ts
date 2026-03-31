/**
 * KvK Data Provider — Scrapes OpenKvK.nl for company registration data
 *
 * Flow:
 * 1. firecrawl search "openkvk.nl [businessName] [city]" -> find the OpenKvK URL
 * 2. firecrawl scrape [openkvk-url] -> get the page content as markdown
 * 3. AI extract structured KvK data from the markdown
 *
 * Cache: 30 days (company registration data changes rarely).
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

export interface KvKVestiging {
  naam: string;
  adres: string;
  stad: string;
}

export interface KvKData {
  /** KvK number (8 digits) */
  kvkNumber: string | null;
  /** Owner / bestuurder name */
  eigenaar: string | null;
  /** Legal form: "BV", "VOF", "Eenmanszaak", etc. */
  rechtsvorm: string | null;
  /** All registered locations */
  vestigingen: KvKVestiging[];
  /** SBI activity codes */
  sbiCodes: string[];
  /** Registration date (ISO or Dutch format) */
  inschrijfDatum: string | null;
  /** All trade names (handelsnamen) */
  handelsnamen: string[];
  /** Whether this is a chain (more than 1 vestiging) */
  isKeten: boolean;
  /** Chain size (number of vestigingen) */
  ketenGrootte: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 30;
const LOG_PREFIX = "[kvk]";

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Crawl OpenKvK.nl for company registration data.
 *
 * @param businessName - Business name to search for (e.g. "Poke Perfect")
 * @param city - City to narrow the search (e.g. "Amsterdam")
 * @returns Structured KvK data, or null if not found or on error
 *
 * @example
 * ```ts
 * const data = await crawlKvKData("Poke Perfect", "Amsterdam");
 * if (data) {
 *   console.log(`KvK: ${data.kvkNumber}, Keten: ${data.isKeten} (${data.ketenGrootte} vestigingen)`);
 * }
 * ```
 */
export async function crawlKvKData(
  businessName: string,
  city: string,
): Promise<KvKData | null> {
  const normalizedName = businessName.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const cacheKey = `kvk:${normalizedName}:${normalizedCity}`;

  // 1. Check cache
  const cached = getFirecrawlCache<KvKData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 2. Search for the OpenKvK page
    const openkvkUrl = await findOpenKvKUrl(businessName, city);
    if (!openkvkUrl) {
      console.warn(`${LOG_PREFIX} No OpenKvK URL found for "${businessName}" in ${city}`);
      return null;
    }

    // 3. Scrape the OpenKvK page
    const markdown = firecrawlScrape(openkvkUrl);
    if (!markdown) {
      console.warn(`${LOG_PREFIX} Failed to scrape ${openkvkUrl}`);
      return null;
    }

    // 4. Also try to scrape the vestigingen (locations) page
    let locationsMarkdown: string | null = null;
    const locationsUrl = openkvkUrl.endsWith("/")
      ? `${openkvkUrl}locations`
      : `${openkvkUrl}/locations`;
    locationsMarkdown = firecrawlScrape(locationsUrl);

    // 5. Combine content and extract with AI
    const combinedMarkdown = locationsMarkdown
      ? `${markdown}\n\n--- VESTIGINGEN PAGINA ---\n\n${locationsMarkdown}`
      : markdown;

    const kvkData = await extractKvKData(combinedMarkdown, businessName);
    if (!kvkData) {
      console.warn(`${LOG_PREFIX} AI extraction failed for "${businessName}"`);
      return null;
    }

    // 6. Cache and return
    setFirecrawlCache(cacheKey, kvkData, CACHE_TTL_DAYS);
    return kvkData;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling KvK data for "${businessName}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Find OpenKvK URL via search
// ---------------------------------------------------------------------------

/**
 * Search firecrawl for the OpenKvK company page.
 * Prioritizes URLs matching the openkvk.nl/company/ pattern.
 */
function findOpenKvKUrl(businessName: string, city: string): string | null {
  const query = `openkvk.nl ${businessName} ${city}`;
  const results = firecrawlSearch(query, 5);
  if (!results || results.length === 0) return null;

  // Prefer results that are on openkvk.nl and contain /company/
  const openkvkResult = results.find(
    (r) =>
      r.url.includes("openkvk.nl") &&
      r.url.includes("/company/"),
  );

  if (openkvkResult) return openkvkResult.url;

  // Fallback: any openkvk.nl result
  const anyOpenkvk = results.find((r) => r.url.includes("openkvk.nl"));
  if (anyOpenkvk) return anyOpenkvk.url;

  return null;
}

// ---------------------------------------------------------------------------
// Internal: AI Extraction
// ---------------------------------------------------------------------------

/** AI extraction result shape (matches what we ask the LLM to produce) */
interface AIKvKExtraction {
  kvkNumber: string | null;
  eigenaar: string | null;
  rechtsvorm: string | null;
  vestigingen: Array<{ naam: string; adres: string; stad: string }>;
  sbiCodes: string[];
  inschrijfDatum: string | null;
  handelsnamen: string[];
}

/**
 * Use AI to extract structured KvK data from the scraped markdown.
 */
async function extractKvKData(
  markdown: string,
  businessName: string,
): Promise<KvKData | null> {
  const prompt = `Je bent een data-extractie specialist. Extraheer bedrijfsgegevens uit de volgende OpenKvK.nl pagina voor het bedrijf "${businessName}".

Geef je antwoord als een enkel JSON object met EXACT deze structuur (geen extra tekst):

{
  "kvkNumber": "string of null — het 8-cijferige KvK-nummer",
  "eigenaar": "string of null — naam van de eigenaar/bestuurder indien vermeld",
  "rechtsvorm": "string of null — rechtsvorm zoals 'Besloten Vennootschap', 'Eenmanszaak', 'VOF'",
  "vestigingen": [{"naam": "vestigingsnaam", "adres": "straat + huisnr", "stad": "plaatsnaam"}],
  "sbiCodes": ["56101", "56102"],
  "inschrijfDatum": "string of null — datum van inschrijving indien vermeld",
  "handelsnamen": ["Handelsnaam 1", "Handelsnaam 2"]
}

REGELS:
- Extraheer ALLEEN informatie die letterlijk op de pagina staat.
- Als vestigingen op een aparte pagina staan, extraheer ze allemaal.
- SBI-codes zijn numerieke codes (bijv. "56101"). Extraheer het nummer, niet de beschrijving.
- Als een veld niet te vinden is, gebruik null (voor strings) of een lege array (voor arrays).
- Geef GEEN verklarende tekst, alleen het JSON object.`;

  const extracted = await extractWithAI<AIKvKExtraction>(markdown, prompt);
  if (!extracted) return null;

  // Normalize and build the final KvKData
  const vestigingen = Array.isArray(extracted.vestigingen)
    ? extracted.vestigingen.filter(
        (v) => v && typeof v.naam === "string" && v.naam.length > 0,
      )
    : [];

  const sbiCodes = Array.isArray(extracted.sbiCodes)
    ? extracted.sbiCodes.filter(
        (c) => typeof c === "string" && c.length > 0,
      )
    : [];

  const handelsnamen = Array.isArray(extracted.handelsnamen)
    ? extracted.handelsnamen.filter(
        (h) => typeof h === "string" && h.length > 0,
      )
    : [];

  return {
    kvkNumber: normalizeString(extracted.kvkNumber),
    eigenaar: normalizeString(extracted.eigenaar),
    rechtsvorm: normalizeString(extracted.rechtsvorm),
    vestigingen,
    sbiCodes,
    inschrijfDatum: normalizeString(extracted.inschrijfDatum),
    handelsnamen,
    isKeten: vestigingen.length > 1,
    ketenGrootte: vestigingen.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a string value: trim, convert "null"/"undefined"/empty to actual null.
 */
function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "" || str === "null" || str === "undefined") return null;
  return str;
}
