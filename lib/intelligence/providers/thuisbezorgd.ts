/**
 * Thuisbezorgd.nl Data Provider — Firecrawl-based
 *
 * Scrapes Thuisbezorgd.nl for delivery/menu data using Firecrawl CLI.
 *
 * Flow:
 * 1. firecrawl search "site:thuisbezorgd.nl [businessName] [city]" -> find the restaurant page
 * 2. firecrawl scrape [thuisbezorgd-url] -> get menu page content as markdown
 * 3. AI extract structured menu + rating data
 *
 * Cache: 7 days (menu/price data can change frequently).
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

export interface ThuisbezorgdMenuItem {
  /** Menu item name */
  name: string;
  /** Price in EUR */
  price: number;
  /** Description if available */
  description: string | null;
  /** Menu category (e.g. "Burgers", "Pizza", "Salads") */
  category: string | null;
}

export interface ThuisbezorgdData {
  /** Thuisbezorgd page URL */
  url: string;
  /** Restaurant rating (0-10 scale on Thuisbezorgd) */
  rating: number | null;
  /** Number of reviews */
  reviewCount: number | null;
  /** Menu items extracted from the page */
  menuItems: ThuisbezorgdMenuItem[];
  /** Average menu item price in EUR */
  avgPrice: number | null;
  /** Minimum order amount in EUR */
  minOrder: number | null;
  /** Estimated delivery time (e.g. "30-45 min") */
  deliveryTime: string | null;
  /** Cuisine types (e.g. ["Pizza", "Pasta", "Italiaans"]) */
  cuisineTypes: string[];
  /** Whether the restaurant is currently open for delivery */
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 7;
const LOG_PREFIX = "[thuisbezorgd]";

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Crawl Thuisbezorgd.nl for delivery/menu data for a business.
 *
 * @param businessName - Business name to search for (e.g. "Pizza Napoli")
 * @param city - City to narrow the search (e.g. "Amsterdam")
 * @returns Structured Thuisbezorgd data, or null if not found or on error
 *
 * @example
 * ```ts
 * const data = await crawlThuisbezorgd("Pizza Napoli", "Amsterdam");
 * if (data) {
 *   console.log(`Rating: ${data.rating}/10, ${data.menuItems.length} items, avg: EUR${data.avgPrice}`);
 * }
 * ```
 */
export async function crawlThuisbezorgd(
  businessName: string,
  city: string,
): Promise<ThuisbezorgdData | null> {
  const normalizedName = businessName.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const cacheKey = `thuisbezorgd:${normalizedName}:${normalizedCity}`;

  // 1. Check cache
  const cached = getFirecrawlCache<ThuisbezorgdData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 2. Search for the Thuisbezorgd page
    const pageUrl = findThuisbezorgdUrl(businessName, city);
    if (!pageUrl) {
      console.warn(`${LOG_PREFIX} No Thuisbezorgd URL found for "${businessName}" in ${city}`);
      return null;
    }

    // 3. Scrape the Thuisbezorgd page
    const markdown = firecrawlScrape(pageUrl);
    if (!markdown || markdown.length < 50) {
      console.warn(`${LOG_PREFIX} Failed to scrape or empty content from ${pageUrl}`);
      return null;
    }

    // 4. Extract structured data with AI
    const extracted = await extractThuisbezorgdData(markdown, businessName, pageUrl);
    if (!extracted) {
      console.warn(`${LOG_PREFIX} AI extraction failed for "${businessName}"`);
      return null;
    }

    // 5. Cache and return
    setFirecrawlCache(cacheKey, extracted, CACHE_TTL_DAYS);
    return extracted;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling Thuisbezorgd for "${businessName}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Find Thuisbezorgd URL via search
// ---------------------------------------------------------------------------

/**
 * Search firecrawl for the Thuisbezorgd restaurant page.
 * Prioritizes URLs matching thuisbezorgd.nl restaurant patterns.
 */
function findThuisbezorgdUrl(businessName: string, city: string): string | null {
  const query = `site:thuisbezorgd.nl ${businessName} ${city}`;
  const results = firecrawlSearch(query, 5);
  if (!results || results.length === 0) return null;

  // Prefer results that are on thuisbezorgd.nl with a restaurant path
  const thuisbezorgdResult = results.find(
    (r) =>
      r.url.includes("thuisbezorgd.nl") &&
      // Thuisbezorgd restaurant pages typically have /menu/ or a direct restaurant path
      !r.url.includes("/bezorggebied") &&
      !r.url.includes("/klantenservice") &&
      !r.url.includes("/help"),
  );

  if (thuisbezorgdResult) return thuisbezorgdResult.url;

  // Fallback: any thuisbezorgd.nl result
  const anyResult = results.find((r) => r.url.includes("thuisbezorgd.nl"));
  if (anyResult) return anyResult.url;

  return null;
}

// ---------------------------------------------------------------------------
// Internal: AI Extraction
// ---------------------------------------------------------------------------

/** The shape we ask the AI to produce */
interface AIThuisbezorgdExtraction {
  rating: number | null;
  reviewCount: number | null;
  menuItems: Array<{
    name: string;
    price: number;
    description: string | null;
    category: string | null;
  }>;
  minOrder: number | null;
  deliveryTime: string | null;
  cuisineTypes: string[];
  isOpen: boolean;
}

/**
 * Use AI to extract structured Thuisbezorgd data from scraped markdown.
 */
async function extractThuisbezorgdData(
  markdown: string,
  businessName: string,
  url: string,
): Promise<ThuisbezorgdData | null> {
  const prompt = `Je bent een data-extractie specialist. Extraheer restaurant- en menugegevens van deze Thuisbezorgd.nl pagina voor "${businessName}".

Geef je antwoord als een enkel JSON object met EXACT deze structuur (geen extra tekst):

{
  "rating": number (0-10 schaal) of null,
  "reviewCount": number of null,
  "menuItems": [
    {
      "name": "Gerecht naam",
      "price": 12.50,
      "description": "Beschrijving of ingredienten" of null,
      "category": "Pizza" of null
    }
  ],
  "minOrder": number in EUR of null,
  "deliveryTime": "30-45 min" of null,
  "cuisineTypes": ["Pizza", "Italiaans"],
  "isOpen": true of false
}

REGELS:
- Prijzen in EUR als decimalen (bijv. 12.50, niet "EUR 12,50").
- Thuisbezorgd gebruikt een 0-10 ratingschaal. Bewaar de score zoals hij is.
- Extraheer maximaal 30 menu items.
- Categoriseer items als dat duidelijk is uit de pagina-structuur.
- Als een veld niet te vinden is, gebruik null (voor strings/numbers) of een lege array (voor arrays).
- isOpen: bepaal op basis van tekst op de pagina ("gesloten", "momenteel niet beschikbaar" = false).
- Geef GEEN verklarende tekst, alleen het JSON object.`;

  const extracted = await extractWithAI<AIThuisbezorgdExtraction>(markdown, prompt);
  if (!extracted) return null;

  // Normalize and build the final ThuisbezorgdData
  const menuItems: ThuisbezorgdMenuItem[] = Array.isArray(extracted.menuItems)
    ? extracted.menuItems
        .filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            item.name.length > 0 &&
            typeof item.price === "number" &&
            item.price >= 0,
        )
        .map((item) => ({
          name: item.name.trim(),
          price: Math.round(item.price * 100) / 100,
          description: normalizeString(item.description),
          category: normalizeString(item.category),
        }))
    : [];

  // Calculate average price
  const avgPrice =
    menuItems.length > 0
      ? Math.round(
          (menuItems.reduce((sum, item) => sum + item.price, 0) /
            menuItems.length) *
            100,
        ) / 100
      : null;

  const cuisineTypes = Array.isArray(extracted.cuisineTypes)
    ? extracted.cuisineTypes.filter(
        (c) => typeof c === "string" && c.length > 0,
      )
    : [];

  return {
    url,
    rating: normalizeNumber(extracted.rating, 0, 10),
    reviewCount: normalizeNumber(extracted.reviewCount, 0, 1_000_000),
    menuItems,
    avgPrice,
    minOrder: normalizeNumber(extracted.minOrder, 0, 100),
    deliveryTime: normalizeString(extracted.deliveryTime),
    cuisineTypes,
    isOpen: typeof extracted.isOpen === "boolean" ? extracted.isOpen : true,
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
