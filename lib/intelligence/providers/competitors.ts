/**
 * Competitors Data Provider — Firecrawl-based
 *
 * Finds and analyzes nearby competitor restaurants using TripAdvisor.
 *
 * Flow:
 * 1. firecrawl search "site:tripadvisor.com restaurants near [address] [city]"
 *    -> find competitor listing pages
 * 2. For top 5 competitors: firecrawl scrape [tripadvisor-url] -> get details
 * 3. AI extract comparison data for each competitor
 *
 * Cache: 7 days.
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

export interface CompetitorDetail {
  /** Competitor restaurant name */
  name: string;
  /** TripAdvisor page URL */
  tripadvisorUrl: string | null;
  /** Distance from the target business (e.g. "2 min", "500m") */
  distance: string | null;
  /** Rating out of 5 */
  rating: number | null;
  /** Number of reviews */
  reviewCount: number | null;
  /** Price level symbol (e.g. "EUR EUR", "EUR EUR EUR") */
  priceLevel: string | null;
  /** Cuisine type (e.g. "Italiaans", "Pizza") */
  cuisineType: string | null;
  /** Ranking text (e.g. "#45 of 234 restaurants") */
  ranking: string | null;
}

export interface CompetitorsData {
  /** Array of competitor details */
  competitors: CompetitorDetail[];
  /** Average rating across all competitors */
  avgRating: number | null;
  /** Average review count across all competitors */
  avgReviewCount: number | null;
  /** Competitor density assessment: "hoog", "gemiddeld", "laag" */
  competitorDensity: string;
  /** Most common cuisine type among competitors */
  dominantCuisine: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 7;
const LOG_PREFIX = "[competitors]";
const MAX_COMPETITORS = 5;

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Find and analyze nearby competitor restaurants using TripAdvisor data.
 *
 * @param businessName - Target business name (used to exclude self from results)
 * @param address - Street address to search near (e.g. "Kalverstraat 152")
 * @param city - City name (e.g. "Amsterdam")
 * @returns Competitor analysis data, or null if not found or on error
 *
 * @example
 * ```ts
 * const data = await crawlCompetitors("Ristorante Roma", "Kalverstraat 152", "Amsterdam");
 * if (data) {
 *   console.log(`${data.competitors.length} competitors, density: ${data.competitorDensity}`);
 * }
 * ```
 */
export async function crawlCompetitors(
  businessName: string,
  address: string,
  city: string,
): Promise<CompetitorsData | null> {
  const normalizedName = businessName.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const cacheKey = `competitors:${normalizedName}:${normalizedCity}`;

  // 1. Check cache
  const cached = getFirecrawlCache<CompetitorsData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 2. Search for nearby restaurants on TripAdvisor
    const competitorUrls = findCompetitorUrls(businessName, address, city);
    if (competitorUrls.length === 0) {
      console.warn(`${LOG_PREFIX} No competitor URLs found near "${businessName}" in ${city}`);
      return null;
    }

    // 3. Scrape each competitor page and extract data
    const competitors: CompetitorDetail[] = [];

    for (const url of competitorUrls.slice(0, MAX_COMPETITORS)) {
      const competitor = await scrapeCompetitor(url, city);
      if (competitor) {
        // Skip self — don't include the target business as its own competitor
        const selfMatch =
          competitor.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(competitor.name.toLowerCase());

        if (!selfMatch) {
          competitors.push(competitor);
        }
      }
    }

    if (competitors.length === 0) {
      console.warn(`${LOG_PREFIX} No competitor data extracted for "${businessName}"`);
      return null;
    }

    // 4. Calculate aggregate metrics
    const result = buildCompetitorsData(competitors);

    // 5. Cache and return
    setFirecrawlCache(cacheKey, result, CACHE_TTL_DAYS);
    return result;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling competitors for "${businessName}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Find competitor URLs via search
// ---------------------------------------------------------------------------

/**
 * Search for nearby restaurant TripAdvisor pages.
 * Uses multiple search strategies to find relevant competitor listings.
 */
function findCompetitorUrls(
  businessName: string,
  address: string,
  city: string,
): string[] {
  const urls = new Set<string>();

  // Strategy 1: Search for restaurants near the address
  const addressQuery = `site:tripadvisor.com restaurants near ${address} ${city}`;
  const addressResults = firecrawlSearch(addressQuery, 10);
  if (addressResults) {
    for (const r of addressResults) {
      if (isTripAdvisorRestaurant(r.url)) {
        urls.add(r.url);
      }
    }
  }

  // Strategy 2: Search for restaurants in the same city
  if (urls.size < MAX_COMPETITORS) {
    const cityQuery = `site:tripadvisor.com restaurants ${city} Netherlands`;
    const cityResults = firecrawlSearch(cityQuery, 10);
    if (cityResults) {
      for (const r of cityResults) {
        if (isTripAdvisorRestaurant(r.url)) {
          urls.add(r.url);
        }
      }
    }
  }

  // Strategy 3: Try the business name to find its page (which lists nearby restaurants)
  if (urls.size < MAX_COMPETITORS) {
    const bizQuery = `site:tripadvisor.com ${businessName} ${city}`;
    const bizResults = firecrawlSearch(bizQuery, 3);
    if (bizResults) {
      for (const r of bizResults) {
        if (isTripAdvisorRestaurant(r.url)) {
          urls.add(r.url);
        }
      }
    }
  }

  return Array.from(urls).slice(0, MAX_COMPETITORS + 2); // Extra for self-filtering
}

/**
 * Check if a URL is a TripAdvisor restaurant review page.
 */
function isTripAdvisorRestaurant(url: string): boolean {
  return (
    url.includes("tripadvisor.com") &&
    (url.includes("Restaurant_Review") || url.includes("Hotel_Review"))
  );
}

// ---------------------------------------------------------------------------
// Internal: Scrape & extract individual competitor
// ---------------------------------------------------------------------------

/** The shape we ask the AI to produce for a single competitor */
interface AICompetitorExtraction {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  cuisineType: string | null;
  ranking: string | null;
  distance: string | null;
}

/**
 * Scrape a single TripAdvisor page and extract competitor data.
 */
async function scrapeCompetitor(
  url: string,
  city: string,
): Promise<CompetitorDetail | null> {
  try {
    const markdown = firecrawlScrape(url);
    if (!markdown || markdown.length < 50) return null;

    const prompt = `Je bent een data-extractie specialist. Extraheer restaurant informatie van deze TripAdvisor pagina.

Geef je antwoord als een enkel JSON object met EXACT deze structuur (geen extra tekst):

{
  "name": "Restaurantnaam",
  "rating": 4.5 (1-5 schaal) of null,
  "reviewCount": 557 of null,
  "priceLevel": "EUR EUR - EUR EUR EUR" of null,
  "cuisineType": "Italiaans" of null,
  "ranking": "#45 of 234 restaurants in ${city}" of null,
  "distance": null
}

REGELS:
- Rating is op een schaal van 1-5 (TripAdvisor bubbels).
- priceLevel: gebruik het EUR-symbool formaat als beschikbaar, of "EUR", "EUR EUR", "EUR EUR EUR".
- cuisineType: de primaire keukensoort.
- ranking: het volledige ranking-tekst als vermeld (bijv. "#45 of 234 restaurants in ${city}").
- distance: dit is niet op de pagina, zet op null.
- Geef GEEN verklarende tekst, alleen het JSON object.`;

    const extracted = await extractWithAI<AICompetitorExtraction>(
      // Limit to first portion of the page — the key data is at the top
      markdown.slice(0, 8000),
      prompt,
    );

    if (!extracted || !extracted.name) return null;

    return {
      name: extracted.name.trim(),
      tripadvisorUrl: url,
      distance: normalizeString(extracted.distance),
      rating: normalizeNumber(extracted.rating, 0, 5),
      reviewCount: normalizeNumber(extracted.reviewCount, 0, 1_000_000),
      priceLevel: normalizeString(extracted.priceLevel),
      cuisineType: normalizeString(extracted.cuisineType),
      ranking: normalizeString(extracted.ranking),
    };
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Failed to scrape competitor at ${url}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Aggregate competitor data
// ---------------------------------------------------------------------------

/**
 * Calculate aggregate metrics from individual competitor details.
 */
function buildCompetitorsData(competitors: CompetitorDetail[]): CompetitorsData {
  // Average rating
  const ratedCompetitors = competitors.filter(
    (c) => c.rating !== null,
  ) as Array<CompetitorDetail & { rating: number }>;

  const avgRating =
    ratedCompetitors.length > 0
      ? Math.round(
          (ratedCompetitors.reduce((sum, c) => sum + c.rating, 0) /
            ratedCompetitors.length) *
            10,
        ) / 10
      : null;

  // Average review count
  const reviewedCompetitors = competitors.filter(
    (c) => c.reviewCount !== null,
  ) as Array<CompetitorDetail & { reviewCount: number }>;

  const avgReviewCount =
    reviewedCompetitors.length > 0
      ? Math.round(
          reviewedCompetitors.reduce((sum, c) => sum + c.reviewCount, 0) /
            reviewedCompetitors.length,
        )
      : null;

  // Competitor density
  let competitorDensity: string;
  if (competitors.length >= 5) {
    competitorDensity = "hoog";
  } else if (competitors.length >= 3) {
    competitorDensity = "gemiddeld";
  } else {
    competitorDensity = "laag";
  }

  // Dominant cuisine
  const cuisineCounts = new Map<string, number>();
  for (const c of competitors) {
    if (c.cuisineType) {
      const normalized = c.cuisineType.toLowerCase().trim();
      cuisineCounts.set(normalized, (cuisineCounts.get(normalized) ?? 0) + 1);
    }
  }

  let dominantCuisineRaw: string | null = null;
  let maxCount = 0;
  for (const [cuisine, count] of cuisineCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantCuisineRaw = cuisine;
    }
  }

  // Capitalize first letter of dominant cuisine
  const dominantCuisine: string | null = dominantCuisineRaw
    ? dominantCuisineRaw.charAt(0).toUpperCase() + dominantCuisineRaw.slice(1)
    : null;

  return {
    competitors,
    avgRating,
    avgReviewCount,
    competitorDensity,
    dominantCuisine,
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

/**
 * Normalize a number value: ensure it falls within a valid range.
 * Returns null for NaN or out-of-range values.
 */
function normalizeNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return null;
  if (num < min || num > max) return null;
  return Math.round(num * 100) / 100;
}
