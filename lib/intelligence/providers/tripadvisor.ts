/**
 * TripAdvisor Data Provider — Supplementary source for Overname Intelligence Scanner
 *
 * Scrapes TripAdvisor search results for restaurant data in Dutch cities.
 * Uses HTML parsing with regex (no heavy dependencies).
 *
 * IMPORTANT: This is supplementary data. If TripAdvisor scraping fails,
 * the scanner still functions via Google Places. All functions fail-open (return null).
 *
 * Rate limiting: max 1 request/sec to TripAdvisor.
 * Caching: 7-day TTL via Upstash Redis.
 */

import { getFirecrawlCache as getCachedByKey, setFirecrawlCache as setCacheByKey } from "@/lib/intelligence/firecrawl-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TripAdvisorBusiness {
  /** Restaurant name */
  name: string;
  /** Full TripAdvisor URL */
  tripadvisorUrl: string;
  /** Rating out of 5 (e.g. 4.5) */
  rating: number | null;
  /** Number of reviews */
  reviewCount: number | null;
  /** Ranking text, e.g. "#45 of 234 restaurants in Amsterdam" */
  ranking: string | null;
  /** Cuisine types, e.g. ["Italian", "Pizza", "Mediterranean"] */
  cuisineTypes: string[];
  /** Price range symbol, e.g. "EUR EUR - EUR EUR EUR" */
  priceRange: string | null;
  /** Street address */
  address: string | null;
  /** Latitude (if extractable) */
  lat: number | null;
  /** Longitude (if extractable) */
  lng: number | null;
}

export interface TripAdvisorSearchResult {
  /** Matched businesses */
  businesses: TripAdvisorBusiness[];
  /** City that was searched */
  city: string;
  /** Keyword used in search */
  keyword: string;
  /** Total number of results found */
  total: number;
}

/**
 * Result of matching a Google business to a TripAdvisor listing.
 * Contains the matched TripAdvisor data alongside a confidence score.
 */
export interface TripAdvisorMatch {
  /** The matched TripAdvisor business */
  business: TripAdvisorBusiness;
  /** Match confidence: 0-1 (1 = perfect match) */
  confidence: number;
  /** How the match was determined */
  matchMethod: "name-exact" | "name-fuzzy" | "name-and-location";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIPADVISOR_BASE = "https://www.tripadvisor.com";
const FETCH_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MS = 1_000;

/**
 * Realistic browser User-Agent to reduce blocking risk.
 * Rotated periodically — update if requests start failing.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Timestamp of last request — used for rate limiting */
let lastRequestAt = 0;

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

/**
 * Enforce max 1 request per second to TripAdvisor.
 * Delays execution if called too soon after the previous request.
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search TripAdvisor for restaurants/horeca in a given city.
 *
 * Uses the TripAdvisor search page and parses structured data from
 * JSON-LD and HTML patterns embedded in the response.
 *
 * @param city - City name (e.g. "Amsterdam", "Rotterdam")
 * @param keyword - Search keyword (e.g. "restaurant", "cafe", "pizzeria")
 * @returns Search results or null if scraping fails
 *
 * @example
 * ```ts
 * const results = await searchTripAdvisor("Amsterdam", "restaurant");
 * if (results) {
 *   console.log(`Found ${results.total} restaurants`);
 * }
 * ```
 */
export async function searchTripAdvisor(
  city: string,
  keyword: string,
): Promise<TripAdvisorSearchResult | null> {
  // Normalize inputs for cache key
  const normalizedCity = city.toLowerCase().trim();
  const normalizedKeyword = keyword.toLowerCase().trim();
  const cacheKey = `search:${normalizedCity}:${normalizedKeyword}`;

  // Check cache first
  const cached = getCachedByKey<TripAdvisorSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    await enforceRateLimit();

    // TripAdvisor search URL for restaurants in a city
    const searchQuery = encodeURIComponent(`${keyword} ${city}`);
    const url = `${TRIPADVISOR_BASE}/Search?q=${searchQuery}&searchSessionId=&sid=&blockRedirect=true&ssrc=e&isSingleSearch=true`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn(
        `[tripadvisor] Search returned ${response.status} for "${keyword} ${city}"`,
      );
      return null;
    }

    const html = await response.text();
    const businesses = parseSearchResults(html);

    const result: TripAdvisorSearchResult = {
      businesses,
      city: normalizedCity,
      keyword: normalizedKeyword,
      total: businesses.length,
    };

    // Cache successful results
    if (businesses.length > 0) {
      setCacheByKey(cacheKey, result, 7);
    }

    return result;
  } catch (error) {
    // Fail-open: log and return null
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`[tripadvisor] Search timed out for "${keyword} ${city}"`);
    } else {
      console.warn(`[tripadvisor] Search failed for "${keyword} ${city}":`, error);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML Parsing
// ---------------------------------------------------------------------------

/**
 * Parse TripAdvisor search results HTML into structured business data.
 *
 * Attempts multiple parsing strategies:
 * 1. JSON-LD structured data (most reliable when present)
 * 2. HTML pattern matching for search result cards
 *
 * @internal
 */
function parseSearchResults(html: string): TripAdvisorBusiness[] {
  const businesses: TripAdvisorBusiness[] = [];

  // Strategy 1: Try JSON-LD (schema.org structured data)
  const jsonLdResults = parseJsonLd(html);
  if (jsonLdResults.length > 0) return jsonLdResults;

  // Strategy 2: Try parsing from inline __WEB_CONTEXT__ / Apollo state
  const apolloResults = parseApolloState(html);
  if (apolloResults.length > 0) return apolloResults;

  // Strategy 3: Fallback to regex-based HTML parsing
  const htmlResults = parseHtmlPatterns(html);
  if (htmlResults.length > 0) return htmlResults;

  return businesses;
}

/**
 * Extract restaurant data from JSON-LD script tags.
 * TripAdvisor sometimes embeds schema.org Restaurant data.
 */
function parseJsonLd(html: string): TripAdvisorBusiness[] {
  const businesses: TripAdvisorBusiness[] = [];

  // Match all JSON-LD script blocks
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (
          item["@type"] === "Restaurant" ||
          item["@type"] === "FoodEstablishment" ||
          item["@type"] === "CafeOrCoffeeShop" ||
          item["@type"] === "BarOrPub"
        ) {
          businesses.push({
            name: item.name || "Unknown",
            tripadvisorUrl: item.url || "",
            rating: parseFloat(item.aggregateRating?.ratingValue) || null,
            reviewCount: parseInt(item.aggregateRating?.reviewCount, 10) || null,
            ranking: null,
            cuisineTypes: Array.isArray(item.servesCuisine)
              ? item.servesCuisine
              : item.servesCuisine
                ? [item.servesCuisine]
                : [],
            priceRange: item.priceRange || null,
            address: formatAddress(item.address) || null,
            lat: parseFloat(item.geo?.latitude) || null,
            lng: parseFloat(item.geo?.longitude) || null,
          });
        }
      }
    } catch {
      // Invalid JSON-LD block, skip
    }
  }

  return businesses;
}

/**
 * Extract restaurant data from TripAdvisor's Apollo/Redux state.
 * The search page often embeds a large JSON blob with all result data.
 */
function parseApolloState(html: string): TripAdvisorBusiness[] {
  const businesses: TripAdvisorBusiness[] = [];

  // Look for inline state data patterns
  // TripAdvisor often uses window.__WEB_CONTEXT__ or similar
  const statePatterns = [
    /window\.__WEB_CONTEXT__\s*=\s*\{json:\s*([\s\S]*?)\};\s*<\/script>/,
    /"restaurants":\s*(\[[\s\S]*?\])\s*[,}]/,
    /"searchResults":\s*(\{[\s\S]*?\})\s*[,}]/,
  ];

  for (const pattern of statePatterns) {
    const match = pattern.exec(html);
    if (!match) continue;

    try {
      const data = JSON.parse(match[1]);
      const results = extractRestaurantsFromState(data);
      if (results.length > 0) return results;
    } catch {
      // Malformed JSON, try next pattern
    }
  }

  return businesses;
}

/**
 * Recursively look for restaurant-like objects in parsed state.
 * TripAdvisor's state shape changes frequently, so we search broadly.
 */
function extractRestaurantsFromState(data: unknown): TripAdvisorBusiness[] {
  const businesses: TripAdvisorBusiness[] = [];

  if (!data || typeof data !== "object") return businesses;

  // Check if this object looks like a restaurant
  if (isRestaurantLike(data)) {
    const r = data as Record<string, unknown>;
    businesses.push({
      name: String(r.name || r.displayName || "Unknown"),
      tripadvisorUrl: r.url
        ? normalizeUrl(String(r.url))
        : r.detailUrl
          ? normalizeUrl(String(r.detailUrl))
          : "",
      rating: safeParseFloat(r.averageRating ?? r.rating ?? r.bubbleRating),
      reviewCount: safeParseInt(r.reviewCount ?? r.numReviews ?? r.userReviewCount),
      ranking: r.ranking ? String(r.ranking) : null,
      cuisineTypes: extractCuisines(r.cuisines ?? r.cuisine ?? r.tags),
      priceRange: r.priceRange ? String(r.priceRange) : r.priceLevel ? String(r.priceLevel) : null,
      address: r.address
        ? typeof r.address === "string"
          ? r.address
          : formatAddress(r.address)
        : null,
      lat: safeParseFloat(r.latitude ?? r.lat ?? (r.location as Record<string, unknown>)?.lat),
      lng: safeParseFloat(r.longitude ?? r.lng ?? (r.location as Record<string, unknown>)?.lng),
    });
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data.slice(0, 50)) {
      // Cap recursion to avoid runaway
      businesses.push(...extractRestaurantsFromState(item));
    }
  }

  return businesses.slice(0, 30); // Hard cap
}

/**
 * Heuristic: does this object look like a restaurant entry?
 */
function isRestaurantLike(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  // Must have a name and at least one rating-related field
  return (
    typeof r.name === "string" &&
    r.name.length > 0 &&
    (r.averageRating !== undefined ||
      r.rating !== undefined ||
      r.bubbleRating !== undefined ||
      r.reviewCount !== undefined ||
      r.numReviews !== undefined)
  );
}

/**
 * Fallback: extract businesses from raw HTML patterns.
 * Less reliable but works when structured data is absent.
 */
function parseHtmlPatterns(html: string): TripAdvisorBusiness[] {
  const businesses: TripAdvisorBusiness[] = [];

  // Match restaurant listing cards — TripAdvisor uses data-test attributes and specific class patterns
  // Pattern: restaurant link with name + potential rating
  const listingPattern =
    /<a[^>]*href="(\/Restaurant_Review[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = listingPattern.exec(html)) !== null) {
    const url = match[1];
    const name = decodeHtmlEntities(match[2]).trim();

    // Skip duplicates and navigation/filter links
    if (seen.has(url) || name.length < 2 || name.length > 200) continue;
    seen.add(url);

    // Try to extract rating near this listing
    const ratingContext = html.substring(
      Math.max(0, match.index - 500),
      Math.min(html.length, match.index + 1000),
    );

    const rating = extractRatingFromContext(ratingContext);
    const reviewCount = extractReviewCountFromContext(ratingContext);
    const ranking = extractRankingFromContext(ratingContext);

    businesses.push({
      name,
      tripadvisorUrl: `${TRIPADVISOR_BASE}${url}`,
      rating,
      reviewCount,
      ranking,
      cuisineTypes: extractCuisinesFromContext(ratingContext),
      priceRange: extractPriceRangeFromContext(ratingContext),
      address: null,
      lat: null,
      lng: null,
    });
  }

  return businesses;
}

// ---------------------------------------------------------------------------
// Context extraction helpers (for HTML pattern parsing)
// ---------------------------------------------------------------------------

/** Extract numerical rating (0-5) from nearby HTML context */
function extractRatingFromContext(context: string): number | null {
  // Pattern: "4.5 of 5 bubbles" or aria-label="4.5 of 5"
  const patterns = [
    /(\d(?:\.\d)?)\s*of\s*5\s*bubble/i,
    /aria-label="(\d(?:\.\d)?)\s*of\s*5"/i,
    /class="[^"]*ui_bubble_rating[^"]*bubble_(\d)(\d)?/i,
    /"ratingValue":\s*"?(\d(?:\.\d)?)"?/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(context);
    if (match) {
      // bubble_45 → 4.5
      if (pattern.source.includes("bubble_")) {
        const major = parseInt(match[1], 10);
        const minor = match[2] ? parseInt(match[2], 10) : 0;
        return major + minor / 10;
      }
      const val = parseFloat(match[1]);
      if (val >= 0 && val <= 5) return val;
    }
  }
  return null;
}

/** Extract review count from nearby HTML context */
function extractReviewCountFromContext(context: string): number | null {
  const patterns = [
    /(\d[\d,.]*)\s*review/i,
    /(\d[\d,.]*)\s*beoordelingen/i,
    /(\d[\d,.]*)\s*recensies/i,
    /"reviewCount":\s*"?(\d[\d,.]*)"?/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(context);
    if (match) {
      const val = parseInt(match[1].replace(/[,.]/g, ""), 10);
      if (val > 0 && val < 1_000_000) return val;
    }
  }
  return null;
}

/** Extract ranking text, e.g. "#12 of 456 restaurants in Amsterdam" */
function extractRankingFromContext(context: string): string | null {
  const pattern = /#\d+\s+(?:of|van)\s+\d+\s+(?:restaurants?|eetgelegenheden)[^<"]*/i;
  const match = pattern.exec(context);
  return match ? match[0].trim() : null;
}

/** Extract cuisine types from nearby HTML context */
function extractCuisinesFromContext(context: string): string[] {
  // Cuisines are typically in a comma-separated list near the listing
  const pattern =
    /(?:cuisine|keuken|gerechten)[^:]*:\s*([^<]+)/i;
  const match = pattern.exec(context);
  if (match) {
    return match[1]
      .split(/[,|]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 1 && c.length < 50);
  }
  return [];
}

/** Extract price range (EUR symbols) from nearby HTML context */
function extractPriceRangeFromContext(context: string): string | null {
  const patterns = [
    /(\$\$?\$?\$?\s*-\s*\$\$?\$?\$?)/,
    /(€€?\s*-\s*€€?€?)/,
    /"priceRange":\s*"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(context);
    if (match) return match[1].trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Merge / Match
// ---------------------------------------------------------------------------

/**
 * Match a Google Places business to the closest TripAdvisor listing.
 *
 * Matching is based on name similarity and (if available) location proximity.
 * Returns the best match above the confidence threshold, or null.
 *
 * @param googleBusiness - Business data from Google Places (needs at least name)
 * @param tripadvisorBusinesses - TripAdvisor businesses to search through
 * @param options - Optional matching thresholds
 * @returns Best match with confidence score, or null if no match found
 *
 * @example
 * ```ts
 * const match = mergeTripAdvisorData(
 *   { naam: "Ristorante Roma", afstand: 0, type: "restaurant", bron: "google" },
 *   tripadvisorResults.businesses,
 * );
 * if (match && match.confidence > 0.7) {
 *   console.log(`Matched to ${match.business.name} on TripAdvisor`);
 * }
 * ```
 */
export function mergeTripAdvisorData(
  googleBusiness: { naam: string; lat?: number; lng?: number },
  tripadvisorBusinesses: TripAdvisorBusiness[],
  options?: {
    /** Minimum similarity score (0-1) to consider a match. Default: 0.5 */
    minConfidence?: number;
    /** Maximum distance in meters between locations to boost score. Default: 200 */
    maxDistanceM?: number;
  },
): TripAdvisorMatch | null {
  const minConfidence = options?.minConfidence ?? 0.5;
  const maxDistanceM = options?.maxDistanceM ?? 200;

  let bestMatch: TripAdvisorMatch | null = null;
  let bestScore = 0;

  const normalizedGoogle = normalizeName(googleBusiness.naam);

  for (const taBusiness of tripadvisorBusinesses) {
    const normalizedTA = normalizeName(taBusiness.name);

    // Exact match after normalization
    if (normalizedGoogle === normalizedTA) {
      const confidence = 0.95;
      if (confidence > bestScore) {
        bestScore = confidence;
        bestMatch = {
          business: taBusiness,
          confidence,
          matchMethod: "name-exact",
        };
      }
      continue;
    }

    // Fuzzy name similarity
    const nameSimilarity = calculateSimilarity(normalizedGoogle, normalizedTA);

    // Location proximity boost (if coordinates available on both sides)
    let locationBoost = 0;
    let hasLocation = false;
    if (
      googleBusiness.lat != null &&
      googleBusiness.lng != null &&
      taBusiness.lat != null &&
      taBusiness.lng != null
    ) {
      hasLocation = true;
      const distance = haversineDistanceSimple(
        googleBusiness.lat,
        googleBusiness.lng,
        taBusiness.lat,
        taBusiness.lng,
      );
      if (distance <= maxDistanceM) {
        // Closer = bigger boost, max 0.2 at 0m, 0 at maxDistance
        locationBoost = 0.2 * (1 - distance / maxDistanceM);
      }
    }

    const totalScore = Math.min(1, nameSimilarity + locationBoost);

    if (totalScore > bestScore && totalScore >= minConfidence) {
      bestScore = totalScore;
      bestMatch = {
        business: taBusiness,
        confidence: totalScore,
        matchMethod: hasLocation && locationBoost > 0 ? "name-and-location" : "name-fuzzy",
      };
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// String / name matching utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a business name for comparison.
 * Strips common suffixes, articles, diacritics, and extra whitespace.
 */
function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      // Remove diacritics
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Remove common business suffixes
      .replace(
        /\b(restaurant|cafe|bar|brasserie|bistro|eetcafe|grand cafe|coffeeshop|b\.v\.|bv)\b/gi,
        "",
      )
      // Remove punctuation
      .replace(/[''"".,!?&@#()\-/\\]/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Calculate string similarity using bigram overlap (Dice coefficient).
 * Fast and effective for business name matching.
 *
 * @returns Similarity score between 0 (no match) and 1 (identical)
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let matches = 0;

  bigramsA.forEach((countA, bigram) => {
    const countB = bigramsB.get(bigram) ?? 0;
    matches += Math.min(countA, countB);
  });

  const totalA = sumValues(bigramsA);
  const totalB = sumValues(bigramsB);

  return (2 * matches) / (totalA + totalB);
}

/** Build a bigram frequency map from a string */
function getBigrams(str: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  for (let i = 0; i < str.length - 1; i++) {
    const bigram = str.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }
  return bigrams;
}

/** Sum all values in a Map<string, number> */
function sumValues(map: Map<string, number>): number {
  let total = 0;
  map.forEach((v) => { total += v; });
  return total;
}

// ---------------------------------------------------------------------------
// Geo utilities (self-contained to avoid circular imports)
// ---------------------------------------------------------------------------

/**
 * Haversine distance in meters between two WGS84 coordinates.
 * Simplified version — accurate enough for <1km matching.
 */
function haversineDistanceSimple(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Decode common HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

/** Safe parseFloat — returns null for NaN/undefined/null */
function safeParseFloat(value: unknown): number | null {
  if (value == null) return null;
  const num = parseFloat(String(value));
  return isNaN(num) ? null : num;
}

/** Safe parseInt — returns null for NaN/undefined/null */
function safeParseInt(value: unknown): number | null {
  if (value == null) return null;
  const num = parseInt(String(value).replace(/[,.]/g, ""), 10);
  return isNaN(num) ? null : num;
}

/** Normalize a relative or absolute TripAdvisor URL */
function normalizeUrl(url: string): string {
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${TRIPADVISOR_BASE}${url}`;
  return url;
}

/** Format a schema.org PostalAddress into a single string */
function formatAddress(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const a = address as Record<string, string | undefined>;
  const parts = [a.streetAddress, a.postalCode, a.addressLocality].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Extract cuisine strings from various formats */
function extractCuisines(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/[,|]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
  if (Array.isArray(value)) {
    return value
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "name" in c) return String(c.name);
        return null;
      })
      .filter((c): c is string => c !== null && c.length > 0);
  }
  return [];
}
