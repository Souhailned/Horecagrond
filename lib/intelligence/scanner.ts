/**
 * Overname Intelligence Scanner Engine
 *
 * Scans Dutch cities for horeca businesses using Google Places API,
 * deduplicates by googlePlaceId, and upserts into MonitoredBusiness table.
 *
 * Uses a grid-based approach: divides a city's area into overlapping circles,
 * queries each point with multiple horeca keywords, and aggregates results.
 */

import prisma from "@/lib/prisma";
import {
  searchByKeywordDetailed,
  type PlaceSearchDetail,
  type FetchGooglePlacesOptions,
} from "@/lib/buurt/providers/google-places";
import {
  assessPlaceAgainstProfile,
  buildKeywordSetFromProfile,
  inferBusinessTypeFromPlace,
} from "@/lib/intelligence/profile-intent";
import { upsertSourceEvidence } from "@/lib/intelligence/source-evidence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanProgress {
  city: string;
  phase: "searching" | "classifying" | "analyzing" | "saving";
  found: number;
  processed: number;
  total: number;
  /** Which keyword source is currently being searched */
  keywordSource?: "profile" | "generic";
  /** The keyword currently being searched */
  currentKeyword?: string;
}

export interface ScanResult {
  city: string;
  businessesFound: number;
  newBusinesses: number;
  updatedBusinesses: number;
  duration: number;
}

export interface ScanOptions {
  /** Include permanently closed businesses in results */
  includeClosedBusinesses?: boolean;
  /** Override grid step size in meters (default: 800) */
  gridStepM?: number;
  /** Progress callback invoked after each phase change */
  onProgress?: (progress: ScanProgress) => void;
  /** Abort signal for cancellation support */
  signal?: AbortSignal;
  /**
   * When true, appends GENERIC_HORECA_KEYWORDS to the provided keywords
   * to find businesses that could be conversion candidates.
   * Only takes effect when custom keywords are provided (non-default).
   * Default: false
   */
  includeGenericHoreca?: boolean;
  /** Optional profile context for smarter keyword planning and candidate filtering */
  profile?: {
    name?: string | null;
    concept?: string | null;
    conceptDescription?: string | null;
    competitorKeywords?: string[] | null;
    operatingModel?: string[] | null;
  };
}

interface GridPoint {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// City Centers — predefined coordinates and scan radius per city
// ---------------------------------------------------------------------------

const CITY_CENTERS: Record<string, { lat: number; lng: number; radius: number }> = {
  Amsterdam: { lat: 52.3676, lng: 4.9041, radius: 5000 },
  Utrecht: { lat: 52.0907, lng: 5.1214, radius: 3000 },
  Leiden: { lat: 52.1601, lng: 4.497, radius: 2000 },
  Haarlem: { lat: 52.3874, lng: 4.6462, radius: 2000 },
  Rotterdam: { lat: 51.9244, lng: 4.4777, radius: 4000 },
  "Den Haag": { lat: 52.0705, lng: 4.3007, radius: 3500 },
  Eindhoven: { lat: 51.4416, lng: 5.4697, radius: 2500 },
  Groningen: { lat: 53.2194, lng: 6.5665, radius: 2000 },
  Breda: { lat: 51.5719, lng: 4.7683, radius: 2000 },
  Tilburg: { lat: 51.5555, lng: 5.0913, radius: 2000 },
  Arnhem: { lat: 51.9851, lng: 5.8987, radius: 2000 },
  Nijmegen: { lat: 51.8426, lng: 5.8527, radius: 2000 },
  Alkmaar: { lat: 52.6324, lng: 4.7534, radius: 1500 },
  Amersfoort: { lat: 52.1561, lng: 5.3878, radius: 2000 },
};

/** Default horeca keywords used when no profile keywords are provided */
const DEFAULT_KEYWORDS = [
  "restaurant",
  "cafe",
  "bar",
  "lunchroom",
  "bakkerij",
  "ijssalon",
  "snackbar",
  "pizzeria",
  "eetcafe",
];

/**
 * Smaller set of generic horeca terms appended when includeGenericHoreca is true.
 * These help find businesses that could be converted to the broker's concept.
 */
export const GENERIC_HORECA_KEYWORDS = [
  "restaurant",
  "cafe",
  "lunchroom",
  "eetcafe",
];

/** Delay between Google API calls in ms to respect rate limits */
const API_RATE_LIMIT_MS = 250;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert meters to approximate degrees of latitude.
 * 1 degree latitude ~ 111,320 meters.
 */
function metersToDegreesLat(meters: number): number {
  return meters / 111320;
}

/**
 * Convert meters to approximate degrees of longitude at a given latitude.
 * Accounts for longitude convergence toward the poles.
 */
function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (111320 * Math.cos((lat * Math.PI) / 180));
}

// ---------------------------------------------------------------------------
// Grid Generation
// ---------------------------------------------------------------------------

/**
 * Generate a grid of search points covering a circular area.
 * Points are spaced by `stepM` meters, and only points within the
 * city radius are included. This creates overlapping coverage since
 * Google Places returns results within ~800m of each point.
 *
 * @param center - Center coordinates { lat, lng }
 * @param radiusM - City radius in meters
 * @param stepM - Distance between grid points in meters (default 800)
 * @returns Array of grid points within the specified radius
 */
export function generateSearchGrid(
  center: { lat: number; lng: number },
  radiusM: number,
  stepM: number = 800,
): GridPoint[] {
  const points: GridPoint[] = [];
  const latStep = metersToDegreesLat(stepM);
  const lngStep = metersToDegreesLng(stepM, center.lat);

  // Calculate how many steps we need in each direction
  const stepsLat = Math.ceil(radiusM / stepM);
  const stepsLng = Math.ceil(radiusM / stepM);

  for (let i = -stepsLat; i <= stepsLat; i++) {
    for (let j = -stepsLng; j <= stepsLng; j++) {
      const lat = center.lat + i * latStep;
      const lng = center.lng + j * lngStep;

      // Only include points within the city radius (circular, not square)
      const dLat = (lat - center.lat) * 111320;
      const dLng = (lng - center.lng) * 111320 * Math.cos((center.lat * Math.PI) / 180);
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);

      if (distance <= radiusM) {
        points.push({ lat, lng });
      }
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Keyword Helpers
// ---------------------------------------------------------------------------

export interface KeywordSet {
  /** Profile-specific keywords (concept + competitorKeywords) — searched first */
  primary: string[];
  /** Generic horeca keywords not already in primary — searched second */
  secondary: string[];
  /** Combined list: [...primary, ...secondary] */
  all: string[];
}

/**
 * Build a combined keyword set from profile data.
 *
 * Primary keywords come from the profile's competitorKeywords and concept name.
 * Secondary keywords are generic horeca terms (filtered to avoid duplicates).
 *
 * @param competitorKeywords - The profile's competitor keywords
 * @param concept - The profile's concept name (e.g. "Poke Bowl")
 * @param includeGeneric - Whether to add generic horeca keywords as secondary terms (default: true)
 * @returns KeywordSet with primary, secondary, and combined arrays
 */
export function buildKeywordSet(
  competitorKeywords: string[],
  concept?: string | null,
  includeGeneric: boolean = true,
): KeywordSet {
  const keywordSet = buildKeywordSetFromProfile(
    {
      concept,
      competitorKeywords,
    },
    includeGeneric,
  );

  return keywordSet;
}

// ---------------------------------------------------------------------------
// Scanner Engine
// ---------------------------------------------------------------------------

/**
 * Scan a city for horeca businesses using Google Places API.
 *
 * The scan works in phases:
 * 1. **Searching**: Generates a grid and queries each point with each keyword.
 *    Results are deduplicated by googlePlaceId.
 * 2. **Saving**: Upserts all discovered businesses into MonitoredBusiness table.
 *
 * Rate limiting: 500ms delay between API calls to stay within Google's limits.
 *
 * @param city - City name (must be a key in CITY_CENTERS)
 * @param keywords - Horeca keywords to search for (defaults to DEFAULT_KEYWORDS)
 * @param options - Scan configuration options
 * @returns ScanResult with counts of found, new, and updated businesses
 * @throws Error if the city is not found in CITY_CENTERS
 */
export async function scanCity(
  city: string,
  keywords: string[] = DEFAULT_KEYWORDS,
  options?: ScanOptions,
): Promise<ScanResult> {
  const startTime = Date.now();

  const cityConfig = CITY_CENTERS[city];
  if (!cityConfig) {
    throw new Error(
      `City "${city}" not found. Available cities: ${Object.keys(CITY_CENTERS).join(", ")}`,
    );
  }

  // When includeGenericHoreca is set and custom keywords were provided,
  // append generic horeca terms that are not already in the keyword list.
  // This keeps backward compatibility: callers that only pass keywords
  // without the option get the exact same behavior as before.
  const isUsingCustomKeywords = keywords !== DEFAULT_KEYWORDS;
  let effectiveKeywords = keywords;
  let primaryKeywordCount = keywords.length;

  if (options?.includeGenericHoreca && isUsingCustomKeywords) {
    const lowerSet = new Set(keywords.map((k) => k.toLowerCase()));
    const extraGeneric = GENERIC_HORECA_KEYWORDS.filter(
      (k) => !lowerSet.has(k.toLowerCase()),
    );
    primaryKeywordCount = keywords.length;
    effectiveKeywords = [...keywords, ...extraGeneric];
  }

  // Auto-scale grid step for large cities: 1200m for radius > 3000m, else 800m
  const defaultStep = cityConfig.radius > 3000 ? 1200 : 800;
  const stepM = options?.gridStepM ?? defaultStep;
  const gridPoints = generateSearchGrid(cityConfig, cityConfig.radius, stepM);

  const placesOptions: FetchGooglePlacesOptions = {
    includeClosedBusinesses: options?.includeClosedBusinesses ?? true,
  };

  // Phase 1: Searching — deduplicate by googlePlaceId
  const discoveredMap = new Map<string, PlaceSearchDetail>();
  const totalQueries = gridPoints.length * effectiveKeywords.length;
  let queriesCompleted = 0;

  options?.onProgress?.({
    city,
    phase: "searching",
    found: 0,
    processed: 0,
    total: totalQueries,
  });

  for (const point of gridPoints) {
    // Check for cancellation
    if (options?.signal?.aborted) {
      console.warn(`[scanner] Scan of ${city} was aborted`);
      break;
    }

    for (let kwIdx = 0; kwIdx < effectiveKeywords.length; kwIdx++) {
      const keyword = effectiveKeywords[kwIdx];

      // Check for cancellation before each API call
      if (options?.signal?.aborted) break;

      try {
        const results = await searchByKeywordDetailed(
          `${keyword} ${city}`,
          point.lat,
          point.lng,
          stepM,
          placesOptions,
        );

        if (results) {
          for (const place of results) {
            if (options?.profile) {
              const assessment = assessPlaceAgainstProfile(place, options.profile);
              if (assessment.tier === "irrelevant") {
                continue;
              }
            }

            // Deduplicate: only keep first occurrence (or update if already seen)
            if (!discoveredMap.has(place.placeId)) {
              discoveredMap.set(place.placeId, place);
            }
          }
        }
      } catch (error) {
        console.warn(
          `[scanner] Failed to search "${keyword}" at (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}):`,
          error,
        );
      }

      queriesCompleted++;

      // Report progress periodically (every 10 queries)
      if (queriesCompleted % 10 === 0) {
        const keywordSource: "profile" | "generic" =
          kwIdx < primaryKeywordCount ? "profile" : "generic";
        options?.onProgress?.({
          city,
          phase: "searching",
          found: discoveredMap.size,
          processed: queriesCompleted,
          total: totalQueries,
          keywordSource,
          currentKeyword: keyword,
        });
      }

      // Rate limiting: wait between API calls
      await sleep(API_RATE_LIMIT_MS);
    }
  }

  const discovered = Array.from(discoveredMap.values());

  console.log(
    `[scanner] ${city}: Found ${discovered.length} unique businesses from ${queriesCompleted} queries ` +
      `(${primaryKeywordCount} primary + ${effectiveKeywords.length - primaryKeywordCount} generic keywords)`,
  );

  // Phase 2: Saving — upsert into MonitoredBusiness
  options?.onProgress?.({
    city,
    phase: "saving",
    found: discovered.length,
    processed: 0,
    total: discovered.length,
  });

  let newBusinesses = 0;
  let updatedBusinesses = 0;

  for (let i = 0; i < discovered.length; i++) {
    const place = discovered[i];

    try {
      const result = await upsertBusiness(place, city);
      if (result === "created") {
        newBusinesses++;
      } else {
        updatedBusinesses++;
      }
    } catch (error) {
      console.error(
        `[scanner] Failed to upsert business "${place.name}" (${place.placeId}):`,
        error,
      );
    }

    // Report saving progress every 25 items
    if ((i + 1) % 25 === 0 || i === discovered.length - 1) {
      options?.onProgress?.({
        city,
        phase: "saving",
        found: discovered.length,
        processed: i + 1,
        total: discovered.length,
      });
    }
  }

  const duration = Date.now() - startTime;

  console.log(
    `[scanner] ${city}: Completed in ${(duration / 1000).toFixed(1)}s — ` +
      `${discovered.length} found, ${newBusinesses} new, ${updatedBusinesses} updated`,
  );

  return {
    city,
    businessesFound: discovered.length,
    newBusinesses,
    updatedBusinesses,
    duration,
  };
}

// ---------------------------------------------------------------------------
// Database Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert a discovered business into the MonitoredBusiness table.
 * Uses googlePlaceId as the unique key. Updates existing records with
 * fresh data while preserving fields that are not returned by the search.
 *
 * @returns "created" if a new record was inserted, "updated" if existing was refreshed
 */
async function upsertBusiness(
  place: PlaceSearchDetail,
  city: string,
): Promise<"created" | "updated"> {
  const existing = await prisma.monitoredBusiness.findUnique({
    where: { googlePlaceId: place.placeId },
    select: { id: true },
  });

  const isOpen = place.businessStatus !== "CLOSED_PERMANENTLY" &&
    place.businessStatus !== "CLOSED_TEMPORARILY";

  if (existing) {
    await prisma.monitoredBusiness.update({
      where: { googlePlaceId: place.placeId },
      data: {
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        types: place.types,
        businessType: inferBusinessTypeFromPlace(place),
        currentRating: place.rating,
        totalReviews: place.reviewCount,
        priceLevel: place.priceLevel,
        website: place.website,
        phone: place.phone,
        isOpen,
        openingHours: place.openingHours ?? undefined,
        lastScannedAt: new Date(),
        scanCount: { increment: 1 },
      },
    });
    await upsertSourceEvidence(
      prisma,
      existing.id,
      "google_places",
      {
        rating: place.rating,
        reviewCount: place.reviewCount,
        isOpen,
        website: place.website,
        phone: place.phone,
        types: place.types,
      },
      {
        url: place.website,
      },
    ).catch(() => {});
    return "updated";
  }

  const created = await prisma.monitoredBusiness.create({
    data: {
      googlePlaceId: place.placeId,
      name: place.name,
      address: place.address,
      city,
      lat: place.lat,
      lng: place.lng,
      types: place.types,
      businessType: inferBusinessTypeFromPlace(place),
      currentRating: place.rating,
      totalReviews: place.reviewCount,
      priceLevel: place.priceLevel,
      website: place.website,
      phone: place.phone,
      isOpen,
      openingHours: place.openingHours ?? undefined,
      firstScannedAt: new Date(),
      lastScannedAt: new Date(),
      scanCount: 1,
    },
  });
  await upsertSourceEvidence(
    prisma,
    created.id,
    "google_places",
    {
      rating: place.rating,
      reviewCount: place.reviewCount,
      isOpen,
      website: place.website,
      phone: place.phone,
      types: place.types,
    },
    {
      url: place.website,
    },
  ).catch(() => {});
  return "created";
}

// ---------------------------------------------------------------------------
// Exported Helpers
// ---------------------------------------------------------------------------

/**
 * Get all available city names that can be scanned.
 */
export function getAvailableCities(): string[] {
  return Object.keys(CITY_CENTERS);
}

/**
 * Get the city configuration (center + radius) for a given city.
 * Returns null if the city is not configured.
 */
export function getCityConfig(city: string): { lat: number; lng: number; radius: number } | null {
  return CITY_CENTERS[city] ?? null;
}

/**
 * Estimate the number of API calls required to scan a city.
 * Useful for cost estimation and progress bar initialization.
 *
 * @param city - City name
 * @param keywords - Keywords to search (defaults to DEFAULT_KEYWORDS)
 * @param gridStepM - Grid step size in meters (default 800)
 * @returns Estimated number of API calls, or null if city not found
 */
export function estimateScanCalls(
  city: string,
  keywords: string[] = DEFAULT_KEYWORDS,
  gridStepM: number = 800,
): number | null {
  const config = CITY_CENTERS[city];
  if (!config) return null;

  const gridPoints = generateSearchGrid(config, config.radius, gridStepM);
  return gridPoints.length * keywords.length;
}
