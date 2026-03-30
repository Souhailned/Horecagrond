/**
 * Business Monitor — Rescans existing MonitoredBusinesses.
 * Designed for weekly cron job execution.
 *
 * 1. Query businesses where lastScannedAt > N days ago
 * 2. Fetch fresh Google Places data
 * 3. Compare with previous snapshot
 * 4. Update signalScore
 * 5. Return list of significant changes
 */

import prisma from "@/lib/prisma";

function normalizePriceLevel(value: string | null): number | null {
  if (!value) return null;
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[value] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorProgress {
  scanned: number;
  total: number;
  status: "running" | "completed" | "failed";
}

export interface SignificantChange {
  businessId: string;
  businessName: string;
  city: string;
  changes: string[]; // ["Rating gedaald van 4.2 naar 3.8", "3 negatieve reviews"]
  newSignalScore: number;
  previousSignalScore: number;
}

export interface MonitorResult {
  scanned: number;
  significantChanges: SignificantChange[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Main: monitor businesses
// ---------------------------------------------------------------------------

/**
 * Rescan stale businesses and detect changes.
 * Returns significant changes that warrant notifications.
 */
export async function monitorBusinesses(options?: {
  maxAge?: number; // days since last scan (default: 7)
  limit?: number; // max businesses per run (default: 100)
  onProgress?: (progress: MonitorProgress) => void;
}): Promise<MonitorResult> {
  const maxAge = options?.maxAge ?? 7;
  const limit = options?.limit ?? 100;
  const startTime = Date.now();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);

  // Find stale businesses
  const staleBusinesses = await prisma.monitoredBusiness.findMany({
    where: {
      lastScannedAt: { lt: cutoffDate },
    },
    orderBy: { lastScannedAt: "asc" },
    take: limit,
    include: {
      snapshots: {
        orderBy: { scannedAt: "desc" },
        take: 2, // Current + previous for comparison
      },
    },
  });

  const significantChanges: SignificantChange[] = [];
  let scanned = 0;

  for (const business of staleBusinesses) {
    try {
      const changes = await rescanBusiness(business);

      if (changes.length > 0) {
        // Recalculate signal score
        const { detectSignals } = await import("./signal-detector");

        const updatedBusiness = await prisma.monitoredBusiness.findUnique({
          where: { id: business.id },
          include: {
            snapshots: {
              orderBy: { scannedAt: "desc" },
              take: 5,
            },
          },
        });

        if (updatedBusiness) {
          const analysis = detectSignals(
            {
              currentRating: updatedBusiness.currentRating,
              totalReviews: updatedBusiness.totalReviews,
              priceLevel: normalizePriceLevel(updatedBusiness.priceLevel),
              isOpen: updatedBusiness.isOpen,
              openingHours: updatedBusiness.openingHours,
              chainSize: updatedBusiness.chainSize,
              tripadvisorRating: updatedBusiness.tripadvisorRating,
              tripadvisorReviews: updatedBusiness.tripadvisorReviews,
              lastScannedAt: updatedBusiness.lastScannedAt ?? new Date(),
            },
            updatedBusiness.snapshots.map((s) => ({
              rating: s.rating,
              reviewCount: s.reviewCount,
              recentReviews: s.recentReviews,
              isOpen: s.isOpen ?? updatedBusiness.isOpen,
              tripadvisorRating: null,
              tripadvisorReviews: null,
              scannedAt: s.scannedAt,
            })),
          );

          // Update signal score
          await prisma.monitoredBusiness.update({
            where: { id: business.id },
            data: {
              signalScore: analysis.signalScore,
              signals: analysis.signals as unknown as Record<string, boolean>,
            },
          });

          // Track significant changes (score changed by 10+ points)
          const scoreDelta = analysis.signalScore - business.signalScore;
          if (Math.abs(scoreDelta) >= 10 || changes.length >= 2) {
            significantChanges.push({
              businessId: business.id,
              businessName: business.name,
              city: business.city,
              changes,
              newSignalScore: analysis.signalScore,
              previousSignalScore: business.signalScore,
            });
          }
        }
      }

      scanned++;
      options?.onProgress?.({
        scanned,
        total: staleBusinesses.length,
        status: "running",
      });

      // Rate limit: 500ms between scans
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      console.warn(`[monitor] Failed to rescan business ${business.id}:`, error);
    }
  }

  return {
    scanned,
    significantChanges,
    duration: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Rescan a single business
// ---------------------------------------------------------------------------

async function rescanBusiness(
  business: {
    id: string;
    googlePlaceId: string;
    currentRating: number | null;
    totalReviews: number | null;
    isOpen: boolean;
  },
): Promise<string[]> {
  const changes: string[] = [];

  try {
    // Fetch fresh data from Google Places (full details including rating/status)
    const freshData = await fetchBusinessDetails(business.googlePlaceId);
    if (!freshData) return changes;

    // Compare with current data
    if (freshData.rating != null && business.currentRating != null) {
      const ratingDelta = freshData.rating - business.currentRating;
      if (Math.abs(ratingDelta) >= 0.2) {
        changes.push(
          ratingDelta < 0
            ? `Rating gedaald van ${business.currentRating} naar ${freshData.rating}`
            : `Rating gestegen van ${business.currentRating} naar ${freshData.rating}`,
        );
      }
    }

    if (freshData.reviewCount != null && business.totalReviews != null) {
      const reviewDelta = freshData.reviewCount - business.totalReviews;
      if (reviewDelta > 5) {
        changes.push(`${reviewDelta} nieuwe reviews`);
      }
    }

    const isNowOpen = freshData.businessStatus !== "CLOSED_PERMANENTLY" &&
      freshData.businessStatus !== "CLOSED_TEMPORARILY";
    if (business.isOpen && !isNowOpen) {
      changes.push("Zaak is gesloten");
    } else if (!business.isOpen && isNowOpen) {
      changes.push("Zaak is heropend");
    }

    // Create new snapshot
    await prisma.businessSnapshot.create({
      data: {
        businessId: business.id,
        rating: freshData.rating,
        reviewCount: freshData.reviewCount,
        isOpen: isNowOpen,
        recentReviews: freshData.reviews ?? undefined,
      },
    });

    // Update business record
    await prisma.monitoredBusiness.update({
      where: { id: business.id },
      data: {
        currentRating: freshData.rating ?? undefined,
        totalReviews: freshData.reviewCount ?? undefined,
        isOpen: isNowOpen,
        lastScannedAt: new Date(),
        scanCount: { increment: 1 },
      },
    });
  } catch (error) {
    console.warn(`[monitor] Error fetching details for ${business.googlePlaceId}:`, error);
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Google Places full details fetch (rating, reviewCount, businessStatus)
// ---------------------------------------------------------------------------

interface BusinessDetails {
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  reviews: Array<{ text: string; rating: number }> | null;
}

async function fetchBusinessDetails(placeId: string): Promise<BusinessDetails | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "rating,userRatingCount,businessStatus,reviews",
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    const reviews = (data.reviews || [])
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        text: r.text?.text || r.originalText?.text || "",
        rating: r.rating ?? 0,
      }))
      .filter((r: { text: string }) => r.text.length > 0);

    return {
      rating: data.rating ?? null,
      reviewCount: data.userRatingCount ?? null,
      businessStatus: data.businessStatus ?? null,
      reviews: reviews.length > 0 ? reviews : null,
    };
  } catch {
    return null;
  }
}
