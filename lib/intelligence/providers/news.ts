/**
 * Horeca News Provider — Searches for business news and signals using Firecrawl
 *
 * Flow:
 * 1. firecrawl search "[businessName] [city] horeca overname restaurant" -> find news articles
 * 2. firecrawl search "[businessName] [city] te koop faillissement" -> find sale/bankruptcy signals
 * 3. AI classifies each result's signal type from title + snippet
 *
 * No individual article scraping needed — search snippets contain enough signal data.
 *
 * Cache: 7 days (news is time-sensitive).
 * Fail-open: returns null on any error.
 */

import {
  firecrawlSearch,
  getFirecrawlCache,
  setFirecrawlCache,
  extractWithAI,
  type FirecrawlSearchResult,
} from "@/lib/intelligence/firecrawl-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | "overname"
  | "faillissement"
  | "expansie"
  | "sluiting"
  | "algemeen";

export interface NewsItem {
  /** Article title */
  title: string;
  /** Article URL */
  url: string;
  /** Article snippet / description */
  snippet: string;
  /** Source domain (e.g. "missethoreca.nl", "facebook.com") */
  source: string;
  /** Classified signal type */
  signalType: SignalType;
  /** Relevance score 0-100 */
  relevanceScore: number;
}

export interface NewsData {
  /** All discovered news items, sorted by relevance */
  items: NewsItem[];
  /** Whether an overname (acquisition/transfer) signal was found */
  hasOvernameSignal: boolean;
  /** Whether a faillissement (bankruptcy) signal was found */
  hasFaillissementSignal: boolean;
  /** When the search was performed */
  searchedAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_DAYS = 7;
const LOG_PREFIX = "[news]";

/**
 * Keywords that strongly indicate specific signal types.
 * Used as a fast pre-classification before AI refinement.
 */
const SIGNAL_KEYWORDS: Record<SignalType, string[]> = {
  overname: [
    "overname", "overgenomen", "te koop", "aangeboden", "horecamakelaar",
    "bedrijf te koop", "over te nemen", "zoekt koper", "horeca marktplaats",
    "horecatransfer", "business for sale",
  ],
  faillissement: [
    "faillissement", "failliet", "surseance", "curator", "schulden",
    "bankroet", "insolvent", "bewindvoering",
  ],
  expansie: [
    "nieuw filiaal", "opent", "uitbreiding", "tweede vestiging", "groeit",
    "nieuwe locatie", "geopend", "opening", "franchise",
  ],
  sluiting: [
    "sluit", "gesloten", "dicht", "stopt", "laatste dag", "einde",
    "opgeheven", "definitief dicht",
  ],
  algemeen: [], // No specific keywords — catch-all
};

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Search for horeca-related news and signals about a business.
 *
 * Performs two searches:
 * 1. General horeca news (overname, restaurant mentions)
 * 2. Financial distress signals (te koop, faillissement)
 *
 * @param businessName - Business name to search for (e.g. "Poke Perfect")
 * @param city - City to narrow results (e.g. "Amsterdam")
 * @returns Classified news items with signal flags, or null on error
 *
 * @example
 * ```ts
 * const news = await crawlHorecaNews("Poke Perfect", "Amsterdam");
 * if (news) {
 *   console.log(`Found ${news.items.length} articles`);
 *   if (news.hasOvernameSignal) console.log("Overname signal detected!");
 * }
 * ```
 */
export async function crawlHorecaNews(
  businessName: string,
  city: string,
): Promise<NewsData | null> {
  const normalizedName = businessName.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const cacheKey = `news:${normalizedName}:${normalizedCity}`;

  // 1. Check cache
  const cached = getFirecrawlCache<NewsData>(cacheKey);
  if (cached) {
    // Restore Date object (JSON serialization converts to string)
    cached.searchedAt = new Date(cached.searchedAt);
    return cached;
  }

  try {
    // 2. Run both searches
    const generalResults = firecrawlSearch(
      `${businessName} ${city} horeca overname restaurant`,
      10,
    );
    const signalResults = firecrawlSearch(
      `${businessName} ${city} te koop faillissement sluiting`,
      10,
    );

    // Combine and deduplicate results
    const allResults = deduplicateResults([
      ...(generalResults || []),
      ...(signalResults || []),
    ]);

    if (allResults.length === 0) {
      console.warn(
        `${LOG_PREFIX} No search results for "${businessName}" in ${city}`,
      );
      // Return empty result rather than null — "no news" is still valid data
      const emptyResult: NewsData = {
        items: [],
        hasOvernameSignal: false,
        hasFaillissementSignal: false,
        searchedAt: new Date(),
      };
      setFirecrawlCache(cacheKey, emptyResult, CACHE_TTL_DAYS);
      return emptyResult;
    }

    // 3. Classify results
    const classifiedItems = await classifyNewsItems(
      allResults,
      businessName,
      city,
    );

    // 4. Build final result
    const result: NewsData = {
      items: classifiedItems.sort((a, b) => b.relevanceScore - a.relevanceScore),
      hasOvernameSignal: classifiedItems.some((i) => i.signalType === "overname"),
      hasFaillissementSignal: classifiedItems.some(
        (i) => i.signalType === "faillissement",
      ),
      searchedAt: new Date(),
    };

    // 5. Cache and return
    setFirecrawlCache(cacheKey, result, CACHE_TTL_DAYS);
    return result;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Error crawling news for "${businessName}" in ${city}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Classification
// ---------------------------------------------------------------------------

/**
 * Classify news items using a hybrid approach:
 * 1. Fast keyword pre-classification
 * 2. AI refinement for items that can't be classified by keywords alone
 */
async function classifyNewsItems(
  results: FirecrawlSearchResult[],
  businessName: string,
  city: string,
): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const needsAIClassification: Array<{
    index: number;
    item: NewsItem;
  }> = [];

  for (const result of results) {
    const source = extractDomain(result.url);
    const combinedText =
      `${result.title} ${result.description}`.toLowerCase();

    // Compute base relevance — how likely this is about the actual business
    const relevanceScore = computeRelevance(
      combinedText,
      businessName,
      city,
    );

    // Skip results with very low relevance (likely unrelated)
    if (relevanceScore < 10) continue;

    // Try keyword-based classification first
    const keywordSignal = classifyByKeywords(combinedText);

    const item: NewsItem = {
      title: result.title,
      url: result.url,
      snippet: result.description,
      source,
      signalType: keywordSignal || "algemeen",
      relevanceScore,
    };

    items.push(item);

    // If no keyword match and relevance is decent, queue for AI
    if (!keywordSignal && relevanceScore >= 30) {
      needsAIClassification.push({ index: items.length - 1, item });
    }
  }

  // AI classification for ambiguous items (batch them)
  if (needsAIClassification.length > 0) {
    const aiClassifications = await classifyWithAI(
      needsAIClassification.map((n) => n.item),
      businessName,
      city,
    );

    if (aiClassifications) {
      for (let i = 0; i < needsAIClassification.length; i++) {
        const classification = aiClassifications[i];
        if (classification) {
          const idx = needsAIClassification[i].index;
          items[idx].signalType = classification.signalType;
          items[idx].relevanceScore = Math.max(
            items[idx].relevanceScore,
            classification.relevanceScore,
          );
        }
      }
    }
  }

  return items;
}

/**
 * Classify a news item by scanning for signal keywords.
 * Returns the most specific signal type found, or null if ambiguous.
 */
function classifyByKeywords(text: string): SignalType | null {
  // Check in order of specificity (faillissement > overname > sluiting > expansie)
  const orderedTypes: SignalType[] = [
    "faillissement",
    "overname",
    "sluiting",
    "expansie",
  ];

  for (const signalType of orderedTypes) {
    const keywords = SIGNAL_KEYWORDS[signalType];
    const hasMatch = keywords.some((kw) => text.includes(kw));
    if (hasMatch) return signalType;
  }

  return null;
}

/**
 * Use AI to classify a batch of news items that couldn't be classified by keywords.
 */
async function classifyWithAI(
  items: NewsItem[],
  businessName: string,
  city: string,
): Promise<Array<{ signalType: SignalType; relevanceScore: number }> | null> {
  if (items.length === 0) return [];

  const itemDescriptions = items
    .map(
      (item, i) =>
        `${i}. [${item.source}] "${item.title}" — ${item.snippet}`,
    )
    .join("\n");

  const prompt = `Je bent een horeca-marktanalist. Classificeer elk nieuwsartikel over het bedrijf "${businessName}" in ${city}.

Geef per artikel het signaaltype en een relevantiescore (0-100).

Signaaltypen:
- "overname": het bedrijf wordt verkocht, overgenomen, of staat op een horeca marktplaats
- "faillissement": faillissement, surseance, schulden, curator
- "expansie": nieuwe vestiging, opening, groei, franchise
- "sluiting": definitief dicht, stopt ermee, opgeheven
- "algemeen": geen duidelijk signaal, of gewoon een recensie/vermelding

Relevantiescore:
- 80-100: gaat duidelijk over dit specifieke bedrijf en bevat een sterk signaal
- 50-79: waarschijnlijk over dit bedrijf, signaal aanwezig
- 20-49: mogelijk gerelateerd, zwak of indirect signaal
- 0-19: niet relevant

Geef je antwoord als JSON array met exact ${items.length} items:
[{"signalType": "overname", "relevanceScore": 85}, {"signalType": "algemeen", "relevanceScore": 40}]

Alleen de JSON array, geen andere tekst.`;

  const result = await extractWithAI<
    Array<{ signalType: string; relevanceScore: number }>
  >(itemDescriptions, prompt);

  if (!result || !Array.isArray(result)) return null;

  const validSignalTypes = new Set<string>([
    "overname",
    "faillissement",
    "expansie",
    "sluiting",
    "algemeen",
  ]);

  return result.map((r) => ({
    signalType: validSignalTypes.has(r.signalType)
      ? (r.signalType as SignalType)
      : "algemeen",
    relevanceScore: Math.max(0, Math.min(100, Math.round(r.relevanceScore || 0))),
  }));
}

// ---------------------------------------------------------------------------
// Relevance Scoring
// ---------------------------------------------------------------------------

/**
 * Compute a base relevance score for a search result.
 * Higher score = more likely this result is about the actual business.
 */
function computeRelevance(
  text: string,
  businessName: string,
  city: string,
): number {
  let score = 0;
  const normalizedText = text.toLowerCase();
  const normalizedBusiness = businessName.toLowerCase();
  const normalizedCity = city.toLowerCase();

  // Exact business name match (strongest signal)
  if (normalizedText.includes(normalizedBusiness)) {
    score += 50;
  } else {
    // Partial name match (first word of business name)
    const firstWord = normalizedBusiness.split(/\s+/)[0];
    if (firstWord.length >= 3 && normalizedText.includes(firstWord)) {
      score += 20;
    }
  }

  // City name match
  if (normalizedText.includes(normalizedCity)) {
    score += 15;
  }

  // Horeca-related terms
  const horecaTerms = [
    "horeca", "restaurant", "cafe", "bar", "eetgelegenheid",
    "keuken", "chef", "bediening",
  ];
  const horecaMatches = horecaTerms.filter((t) =>
    normalizedText.includes(t),
  ).length;
  score += Math.min(horecaMatches * 5, 15);

  // Signal terms (any type) give a small boost
  const allSignalKeywords = Object.values(SIGNAL_KEYWORDS).flat();
  const signalMatches = allSignalKeywords.filter((kw) =>
    normalizedText.includes(kw),
  ).length;
  score += Math.min(signalMatches * 5, 20);

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract domain from a URL. "https://www.missethoreca.nl/article/123" -> "missethoreca.nl"
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Strip "www." prefix
    return hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Deduplicate search results by URL.
 * Keeps the first occurrence of each URL.
 */
function deduplicateResults(
  results: FirecrawlSearchResult[],
): FirecrawlSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    // Normalize URL for dedup (strip trailing slash, query params)
    const normalizedUrl = r.url.split("?")[0].replace(/\/$/, "");
    if (seen.has(normalizedUrl)) return false;
    seen.add(normalizedUrl);
    return true;
  });
}
