/**
 * TripAdvisor Deep Crawler v2 — Firecrawl-based
 *
 * Replaces the fragile regex-based scraping with Firecrawl CLI.
 * More reliable, handles JS rendering, and extracts richer data.
 */

import {
  firecrawlSearch,
  firecrawlScrape,
  getFirecrawlCache,
  setFirecrawlCache,
  extractWithAI,
} from "../firecrawl-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TripAdvisorDeepData {
  url: string | null;
  name: string;
  rating: number | null;
  totalReviews: number | null;
  ranking: string | null; // "#45 of 234 restaurants in Den Haag"
  cuisineTypes: string[];
  priceRange: string | null; // "€€ - €€€"
  travelersChoice: boolean;
  recentReviews: Array<{
    rating: number;
    title: string;
    snippet: string;
    date: string | null;
  }>;
  nearbyRestaurants: Array<{
    name: string;
    rating: string | null;
    reviews: string | null;
    distance: string | null;
    priceLevel: string | null;
    url: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Deep crawl TripAdvisor for a business — uses Firecrawl for reliable scraping.
 */
export async function crawlTripAdvisorDeep(
  businessName: string,
  city: string,
): Promise<TripAdvisorDeepData | null> {
  const cacheKey = `tripadvisor:${businessName}:${city}`.toLowerCase().replace(/\s+/g, "-");
  const cached = getFirecrawlCache<TripAdvisorDeepData>(cacheKey);
  if (cached) return cached;

  try {
    // Step 1: Find the TripAdvisor page
    const searchResults = firecrawlSearch(
      `site:tripadvisor.com ${businessName} ${city} restaurant hotel`,
      3,
    );

    if (!searchResults?.length) return null;

    // Find the best matching URL (prioritize Restaurant_Review or Hotel_Review)
    const taUrls = searchResults
      .filter((r) =>
        r.url.includes("tripadvisor.com") &&
        (r.url.includes("Restaurant_Review") || r.url.includes("Hotel_Review")),
      )
      .map((r) => r.url);

    if (taUrls.length === 0) return null;

    // Step 2: Scrape the page
    const markdown = firecrawlScrape(taUrls[0]);
    if (!markdown || markdown.length < 100) return null;

    // Step 3: AI extract structured data
    const extracted = await extractWithAI<TripAdvisorDeepData>(
      markdown.slice(0, 5000), // Limit context
      `Extraheer TripAdvisor data voor "${businessName}" in ${city}.

Zoek naar: rating (1-5), aantal reviews, ranking positie, cuisine types, prijsrange,
of het een Travelers' Choice is, recente reviews (max 5 met rating+titel+snippet+datum),
en nabije restaurants (max 5 met naam, rating, reviews, afstand, prijs).

Retourneer JSON met deze velden:
{
  "url": "${taUrls[0]}",
  "name": "...",
  "rating": number of null,
  "totalReviews": number of null,
  "ranking": "#X of Y restaurants in Z" of null,
  "cuisineTypes": ["Italian", ...],
  "priceRange": "€€ - €€€" of null,
  "travelersChoice": true/false,
  "recentReviews": [{"rating": 5, "title": "...", "snippet": "...", "date": "maart 2026"}],
  "nearbyRestaurants": [{"name": "...", "rating": "4.5", "reviews": "557", "distance": "2 min", "priceLevel": "€€", "url": "..."}]
}`,
    );

    if (extracted) {
      setFirecrawlCache(cacheKey, extracted, 7);
      return extracted;
    }

    return null;
  } catch (error) {
    console.warn("[tripadvisor-v2] Crawl failed:", error);
    return null;
  }
}
