/**
 * Business Website Crawler — Firecrawl-based
 *
 * Crawls the business's own website for concept, menu, team, and contact data.
 *
 * Flow:
 * 1. firecrawl scrape [website-url] -> get homepage content
 * 2. firecrawl map [website-url] --search "menu" -> find menu page
 * 3. If menu page found: firecrawl scrape [menu-url] -> get menu content
 * 4. AI extract concept, menu, team, contact info from combined content
 *
 * Cache: 7 days.
 * Fail-open: returns null on any error.
 */

import {
  firecrawlScrape,
  firecrawlMap,
  getFirecrawlCache,
  setFirecrawlCache,
  extractWithAI,
} from "@/lib/intelligence/firecrawl-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebsiteMenuItem {
  /** Menu item name */
  name: string;
  /** Price in EUR if available */
  price: number | null;
  /** Menu category (e.g. "Voorgerechten", "Pizza") */
  category: string | null;
}

export interface WebsiteContactInfo {
  /** Phone number */
  phone: string | null;
  /** Email address */
  email: string | null;
  /** Social media links (Instagram, Facebook, etc.) */
  socialLinks: string[];
}

export interface WebsiteData {
  /** Website URL that was crawled */
  url: string;
  /** Business concept summary (e.g. "Italiaans restaurant met hotel") */
  concept: string | null;
  /** Menu items extracted from the website */
  menuItems: WebsiteMenuItem[];
  /** Average menu item price in EUR */
  avgMenuPrice: number | null;
  /** Team size estimate (e.g. "Klein team", "10+ medewerkers") */
  teamSize: string | null;
  /** Contact information */
  contactInfo: WebsiteContactInfo;
  /** Last updated indicator (from meta tags or copyright year) */
  lastUpdated: string | null;
  /** Whether online reservation is available */
  hasOnlineReservation: boolean;
  /** Whether delivery service is mentioned */
  hasDelivery: boolean;
  /** Languages detected on the website */
  languages: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 7;
const LOG_PREFIX = "[website-crawler]";

/**
 * Keywords used to find menu-related pages via firecrawl map.
 * Covers Dutch and English variations.
 */
const MENU_SEARCH_TERMS = ["menu", "menukaart", "kaart", "gerechten"];

/**
 * Keywords used to find team/about pages via firecrawl map.
 */
const ABOUT_SEARCH_TERMS = ["team", "over ons", "about"];

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Crawl a business website for concept, menu, team, and contact data.
 *
 * @param websiteUrl - The business's website URL (e.g. "https://www.ristoranteroma.nl")
 * @param businessName - Business name for context in AI extraction
 * @returns Structured website data, or null if not found or on error
 *
 * @example
 * ```ts
 * const data = await crawlBusinessWebsite("https://www.ristoranteroma.nl", "Ristorante Roma");
 * if (data) {
 *   console.log(`Concept: ${data.concept}, ${data.menuItems.length} menu items`);
 * }
 * ```
 */
export async function crawlBusinessWebsite(
  websiteUrl: string,
  businessName: string,
): Promise<WebsiteData | null> {
  const normalizedUrl = normalizeUrl(websiteUrl);
  const cacheKey = `website:${normalizedUrl}`;

  // 1. Check cache
  const cached = getFirecrawlCache<WebsiteData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 2. Scrape the homepage
    const homepageMarkdown = firecrawlScrape(normalizedUrl);
    if (!homepageMarkdown || homepageMarkdown.length < 50) {
      console.warn(`${LOG_PREFIX} Failed to scrape or empty content from ${normalizedUrl}`);
      return null;
    }

    // 3. Try to find and scrape the menu page
    const menuMarkdown = await findAndScrapeSubpage(
      normalizedUrl,
      MENU_SEARCH_TERMS,
    );

    // 4. Try to find and scrape the about/team page
    const aboutMarkdown = await findAndScrapeSubpage(
      normalizedUrl,
      ABOUT_SEARCH_TERMS,
    );

    // 5. Combine all content for AI extraction
    let combinedMarkdown = `--- HOMEPAGE ---\n\n${homepageMarkdown}`;
    if (menuMarkdown) {
      combinedMarkdown += `\n\n--- MENU PAGINA ---\n\n${menuMarkdown}`;
    }
    if (aboutMarkdown) {
      combinedMarkdown += `\n\n--- OVER ONS / TEAM PAGINA ---\n\n${aboutMarkdown}`;
    }

    // 6. Extract structured data with AI
    const extracted = await extractWebsiteData(
      combinedMarkdown,
      businessName,
      normalizedUrl,
    );

    if (!extracted) {
      console.warn(`${LOG_PREFIX} AI extraction failed for "${businessName}"`);
      return null;
    }

    // 7. Cache and return
    setFirecrawlCache(cacheKey, extracted, CACHE_TTL_DAYS);
    return extracted;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling website for "${businessName}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Discover and scrape sub-pages
// ---------------------------------------------------------------------------

/**
 * Use firecrawl map to find a sub-page matching the given search terms,
 * then scrape it.
 *
 * @param baseUrl - The website base URL
 * @param searchTerms - Keywords to search for in the sitemap
 * @returns Markdown content of the found sub-page, or null
 */
async function findAndScrapeSubpage(
  baseUrl: string,
  searchTerms: string[],
): Promise<string | null> {
  for (const term of searchTerms) {
    const discoveredUrls = firecrawlMap(baseUrl, term, 5);
    if (!discoveredUrls || discoveredUrls.length === 0) continue;

    // Find the most relevant URL — filter to same domain
    const domain = extractDomain(baseUrl);
    const relevantUrls = discoveredUrls.filter(
      (url) => extractDomain(url) === domain && url !== baseUrl,
    );

    if (relevantUrls.length === 0) continue;

    // Pick the best URL — prefer ones containing the search term in the path
    const bestUrl =
      relevantUrls.find((url) =>
        url.toLowerCase().includes(term.toLowerCase()),
      ) ?? relevantUrls[0];

    const markdown = firecrawlScrape(bestUrl);
    if (markdown && markdown.length > 100) {
      return markdown;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal: AI Extraction
// ---------------------------------------------------------------------------

/** The shape we ask the AI to produce */
interface AIWebsiteExtraction {
  concept: string | null;
  menuItems: Array<{
    name: string;
    price: number | null;
    category: string | null;
  }>;
  teamSize: string | null;
  contactInfo: {
    phone: string | null;
    email: string | null;
    socialLinks: string[];
  };
  lastUpdated: string | null;
  hasOnlineReservation: boolean;
  hasDelivery: boolean;
  languages: string[];
}

/**
 * Use AI to extract structured data from the combined website markdown.
 */
async function extractWebsiteData(
  markdown: string,
  businessName: string,
  url: string,
): Promise<WebsiteData | null> {
  const prompt = `Je bent een data-extractie specialist. Analyseer de website van "${businessName}" (${url}) en extraheer relevante bedrijfsinformatie.

Geef je antwoord als een enkel JSON object met EXACT deze structuur (geen extra tekst):

{
  "concept": "Korte beschrijving van het concept, bijv. 'Italiaans restaurant met hotel' of 'Trendy koffiebar met huisgemaakte gebakjes'" of null,
  "menuItems": [
    {
      "name": "Gerecht naam",
      "price": 12.50 of null,
      "category": "Voorgerechten" of null
    }
  ],
  "teamSize": "Klein team" of "10+ medewerkers" of null,
  "contactInfo": {
    "phone": "+31 20 123 4567" of null,
    "email": "info@example.nl" of null,
    "socialLinks": ["https://instagram.com/...", "https://facebook.com/..."]
  },
  "lastUpdated": "2025" of "2024" of null,
  "hasOnlineReservation": true of false,
  "hasDelivery": true of false,
  "languages": ["nl", "en"]
}

REGELS:
- concept: beschrijf het type horeca en wat het bijzonder maakt, in 1 zin (Nederlands).
- menuItems: extraheer maximaal 30 items. Prijzen in EUR als decimalen. Geen drankkaart items.
- teamSize: schat op basis van vermeldingen van team/medewerkers. "Klein team" (1-5), "Middelgroot team" (5-15), "Groot team" (15+).
- contactInfo.socialLinks: alleen volledige URLs naar social media profielen.
- lastUpdated: het meest recente jaar gevonden in copyright, meta tags, of content.
- hasOnlineReservation: true als er een reserveringssysteem, TheFork, of reserveerknop is.
- hasDelivery: true als bezorging, Thuisbezorgd, Uber Eats, of delivery wordt genoemd.
- languages: ISO 639-1 codes van talen die op de website voorkomen (bijv. "nl", "en", "de").
- Als een veld niet te vinden is, gebruik null (voor strings/numbers) of een lege array.
- Geef GEEN verklarende tekst, alleen het JSON object.`;

  const extracted = await extractWithAI<AIWebsiteExtraction>(markdown, prompt);
  if (!extracted) return null;

  // Normalize and build the final WebsiteData
  const menuItems: WebsiteMenuItem[] = Array.isArray(extracted.menuItems)
    ? extracted.menuItems
        .filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            item.name.length > 0,
        )
        .map((item) => ({
          name: item.name.trim(),
          price:
            typeof item.price === "number" && item.price >= 0
              ? Math.round(item.price * 100) / 100
              : null,
          category: normalizeString(item.category),
        }))
    : [];

  // Calculate average menu price (only from items with prices)
  const pricedItems = menuItems.filter(
    (item) => item.price !== null,
  ) as Array<WebsiteMenuItem & { price: number }>;

  const avgMenuPrice =
    pricedItems.length > 0
      ? Math.round(
          (pricedItems.reduce((sum, item) => sum + item.price, 0) /
            pricedItems.length) *
            100,
        ) / 100
      : null;

  const socialLinks = Array.isArray(extracted.contactInfo?.socialLinks)
    ? extracted.contactInfo.socialLinks.filter(
        (link) =>
          typeof link === "string" &&
          link.startsWith("http") &&
          link.length > 10,
      )
    : [];

  const languages = Array.isArray(extracted.languages)
    ? extracted.languages.filter(
        (lang) => typeof lang === "string" && lang.length >= 2 && lang.length <= 5,
      )
    : [];

  return {
    url,
    concept: normalizeString(extracted.concept),
    menuItems,
    avgMenuPrice,
    teamSize: normalizeString(extracted.teamSize),
    contactInfo: {
      phone: normalizeString(extracted.contactInfo?.phone),
      email: normalizeEmail(extracted.contactInfo?.email),
      socialLinks,
    },
    lastUpdated: normalizeString(extracted.lastUpdated),
    hasOnlineReservation:
      typeof extracted.hasOnlineReservation === "boolean"
        ? extracted.hasOnlineReservation
        : false,
    hasDelivery:
      typeof extracted.hasDelivery === "boolean"
        ? extracted.hasDelivery
        : false,
    languages,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a URL to ensure it has a protocol.
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extract the domain from a URL (without protocol or www).
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(
      url.startsWith("http") ? url : `https://${url}`,
    );
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

/**
 * Normalize and validate an email address.
 */
function normalizeEmail(value: unknown): string | null {
  const str = normalizeString(value);
  if (!str) return null;
  // Basic email validation — must contain @ and a dot after @
  if (str.includes("@") && str.includes(".") && str.indexOf("@") < str.lastIndexOf(".")) {
    return str.toLowerCase();
  }
  return null;
}
