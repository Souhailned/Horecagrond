/**
 * Google Places Provider (Optional)
 *
 * Only active when GOOGLE_PLACES_API_KEY is set.
 * Uses the new Places API (v1).
 *
 * Enriched with: priceLevel, businessStatus, regularOpeningHours
 */

import type { CompetitorInfo } from "../types";
import { getCached, setCache } from "../cache";
import { haversineDistance } from "./osm";

const TIMEOUT = 5000;

// ---------------------------------------------------------------------------
// Types used by the Intelligence Scanner
// ---------------------------------------------------------------------------

export interface PlaceSearchDetail {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  website: string | null;
  phone: string | null;
  businessStatus: string;
  openingHours: { weekdayDescriptions: string[] } | null;
}

export interface FetchGooglePlacesOptions {
  includeClosedBusinesses?: boolean;
}

/** Google price level enum → numeric */
const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * Fetch nearby horeca places from Google Places API
 * Returns null if API key is not configured
 */
export async function fetchGooglePlaces(
  lat: number,
  lng: number,
  radius: number,
): Promise<CompetitorInfo[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const cached = await getCached<CompetitorInfo[]>(lat, lng, "google", radius);
  if (cached) return cached;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.name",
            "places.displayName",
            "places.types",
            "places.rating",
            "places.userRatingCount",
            "places.location",
            "places.priceLevel",
            "places.businessStatus",
            "places.regularOpeningHours",
          ].join(","),
        },
        body: JSON.stringify({
          includedTypes: [
            "restaurant",
            "cafe",
            "bar",
            "meal_delivery",
            "meal_takeaway",
            "bakery",
            "ice_cream_shop",
          ],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radius,
            },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const places = data?.places || [];

    const competitors: CompetitorInfo[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const place of places as any[]) {
      // Filter out permanently closed venues
      if (place.businessStatus === "CLOSED_PERMANENTLY") continue;

      const placeLat = place.location?.latitude ?? lat;
      const placeLng = place.location?.longitude ?? lng;
      const afstand = Math.round(haversineDistance(lat, lng, placeLat, placeLng));

      const priceLevel =
        place.priceLevel != null
          ? PRICE_LEVEL_MAP[place.priceLevel] ?? undefined
          : undefined;

      const openingHours = place.regularOpeningHours?.weekdayDescriptions
        ? { weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions }
        : undefined;

      competitors.push({
        naam: place.displayName?.text || "Onbekend",
        type: place.types?.[0] || "restaurant",
        afstand,
        rating: place.rating ?? undefined,
        reviewCount: place.userRatingCount ?? undefined,
        priceLevel,
        businessStatus: place.businessStatus ?? undefined,
        openingHours,
        bron: "google" as const,
        placeId: place.name ?? undefined,
      });
    }

    const sorted = competitors.sort((a, b) => a.afstand - b.afstand);
    await setCache(lat, lng, "google", radius, sorted);
    return sorted;
  } catch (error) {
    console.error("[google-places] Error:", error);
    return null;
  }
}

/**
 * Search by keyword with detailed results (for Intelligence Scanner).
 * Uses Google Places Text Search API and returns structured PlaceSearchDetail[].
 */
export async function searchByKeywordDetailed(
  textQuery: string,
  lat: number,
  lng: number,
  radius: number,
  options?: FetchGooglePlacesOptions,
): Promise<PlaceSearchDetail[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.name",
            "places.displayName",
            "places.formattedAddress",
            "places.types",
            "places.rating",
            "places.userRatingCount",
            "places.location",
            "places.priceLevel",
            "places.businessStatus",
            "places.regularOpeningHours",
            "places.websiteUri",
            "places.internationalPhoneNumber",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery,
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius,
            },
          },
          maxResultCount: 20,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const places = data?.places || [];

    const results: PlaceSearchDetail[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const place of places as any[]) {
      if (
        !options?.includeClosedBusinesses &&
        place.businessStatus === "CLOSED_PERMANENTLY"
      ) {
        continue;
      }

      results.push({
        placeId: place.name ?? "",
        name: place.displayName?.text || "Onbekend",
        address: place.formattedAddress || "",
        lat: place.location?.latitude ?? lat,
        lng: place.location?.longitude ?? lng,
        types: place.types || [],
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel ?? null,
        website: place.websiteUri ?? null,
        phone: place.internationalPhoneNumber ?? null,
        businessStatus: place.businessStatus ?? "OPERATIONAL",
        openingHours: place.regularOpeningHours?.weekdayDescriptions
          ? { weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions }
          : null,
      });
    }

    return results;
  } catch (error) {
    console.warn("[google-places] searchByKeywordDetailed error:", error);
    return null;
  }
}

/**
 * Search by concept text (for Concept Checker — more precise than type taxonomy)
 */
export async function searchConceptCompetitors(
  concept: string,
  lat: number,
  lng: number,
  radius: number,
): Promise<CompetitorInfo[] | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.name",
            "places.displayName",
            "places.types",
            "places.rating",
            "places.userRatingCount",
            "places.location",
            "places.priceLevel",
            "places.businessStatus",
            "places.regularOpeningHours",
            "places.editorialSummary",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery: concept,
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radius,
            },
          },
          maxResultCount: 10,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const places = data?.places || [];

    const competitors: CompetitorInfo[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const place of places as any[]) {
      if (place.businessStatus === "CLOSED_PERMANENTLY") continue;

      const placeLat = place.location?.latitude ?? lat;
      const placeLng = place.location?.longitude ?? lng;
      const afstand = Math.round(haversineDistance(lat, lng, placeLat, placeLng));

      // Only include places within our radius
      if (afstand > radius * 1.5) continue;

      competitors.push({
        naam: place.displayName?.text || "Onbekend",
        type: place.types?.[0] || "restaurant",
        afstand,
        rating: place.rating ?? undefined,
        reviewCount: place.userRatingCount ?? undefined,
        priceLevel:
          place.priceLevel != null
            ? PRICE_LEVEL_MAP[place.priceLevel] ?? undefined
            : undefined,
        businessStatus: place.businessStatus ?? undefined,
        openingHours: place.regularOpeningHours?.weekdayDescriptions
          ? { weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions }
          : undefined,
        bron: "google" as const,
        placeId: place.name ?? undefined,
      });
    }

    return competitors.sort((a, b) => a.afstand - b.afstand);
  } catch (error) {
    console.error("[google-places] searchText error:", error);
    return null;
  }
}

/**
 * Fetch detailed place info (reviews + editorialSummary) for a single place
 */
export async function fetchPlaceDetails(
  placeId: string,
): Promise<{
  reviews: Array<{ text: string; rating: number }>;
  editorialSummary: string | null;
} | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "reviews,editorialSummary",
        },
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();

    const reviews = (data.reviews || [])
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        text: r.text?.text || r.originalText?.text || "",
        rating: r.rating ?? 0,
      }))
      .filter((r: { text: string }) => r.text.length > 0);

    return {
      reviews,
      editorialSummary: data.editorialSummary?.text || null,
    };
  } catch {
    return null;
  }
}
