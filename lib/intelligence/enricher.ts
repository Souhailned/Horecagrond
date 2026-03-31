/**
 * Buurt Data Enricher -- enriches MonitoredBusiness records with
 * CBS demographics, OV bereikbaarheid, and passanten estimates.
 *
 * Uses existing buurt providers (no new API integrations needed).
 * CBS and transport data are cached in Redis with long TTLs,
 * so businesses in the same buurt get instant cache hits.
 */

import prisma from "@/lib/prisma";
import type { MonitoredBusiness } from "@/generated/prisma/client";
import { fetchCBSDemographics } from "@/lib/buurt/providers/cbs";
import { fetchTransportAnalysis } from "@/lib/buurt/providers/transport";
import { estimatePassanten } from "@/lib/buurt/providers/passanten";
import { upsertSourceEvidence } from "@/lib/intelligence/source-evidence";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Skip enrichment if data was fetched within this window */
const ENRICHMENT_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Delay between sequential business enrichments (CBS/PDOK rate limits) */
const INTER_BUSINESS_DELAY_MS = 500;

/** Default radius (meters) for transport stop search */
const TRANSPORT_RADIUS = 1000;

// ---------------------------------------------------------------------------
// Single business enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single business with buurt data.
 * Skips if already enriched within the last 7 days.
 *
 * @returns true if enriched, false if skipped
 */
export async function enrichBusinessBuurtData(
  business: MonitoredBusiness,
): Promise<boolean> {
  // Skip if already enriched recently
  if (shouldSkipEnrichment(business)) {
    return false;
  }

  try {
    // Fetch all providers in parallel -- they are independent
    const [cbsResult, transportResult] = await Promise.allSettled([
      fetchCBSDemographics(business.lat, business.lng),
      fetchTransportAnalysis(business.lat, business.lng, TRANSPORT_RADIUS),
    ]);

    const demographics =
      cbsResult.status === "fulfilled" ? cbsResult.value : null;
    const transport =
      transportResult.status === "fulfilled" ? transportResult.value : null;

    // Estimate passanten using available data
    // Pass 0 for horecaCount/kantorenCount since we don't have OSM data here.
    // The estimate will still be useful from demographics + transport alone.
    const passantenEstimate = estimatePassanten({
      demographics,
      transportAnalysis: transport,
      horecaCount: 0,
      kantorenCount: 0,
      competitors: undefined,
    });

    // Build the update payload -- only set fields that have data
    const updateData: Record<string, unknown> = {};

    if (demographics) {
      updateData.demografieData = demographics as unknown as Record<
        string,
        never
      >;
    }

    if (transport) {
      updateData.bereikbaarheidOV = transport.bereikbaarheidOV;
    }

    if (passantenEstimate.dagschatting > 0) {
      updateData.passantenPerDag = passantenEstimate.dagschatting;
    }

    // Only write to DB if we have at least one field to update
    if (Object.keys(updateData).length === 0) {
      return false;
    }

    await prisma.monitoredBusiness.update({
      where: { id: business.id },
      data: updateData,
    });

    if (demographics) {
      await upsertSourceEvidence(prisma, business.id, "cbs", demographics).catch(
        () => {},
      );
    }

    if (transport) {
      await upsertSourceEvidence(
        prisma,
        business.id,
        "transport",
        transport,
      ).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error(
      `[enricher] Failed to enrich business ${business.id} (${business.name}):`,
      error,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a batch of businesses with buurt data.
 * Processes sequentially with a small delay to respect API rate limits.
 */
export async function enrichBusinessesBatch(
  businessIds: string[],
  options?: { onProgress?: (completed: number, total: number) => void },
): Promise<{ enriched: number; skipped: number; failed: number }> {
  const result = { enriched: 0, skipped: 0, failed: 0 };

  if (businessIds.length === 0) {
    return result;
  }

  // Load all businesses in one query
  const businesses = await prisma.monitoredBusiness.findMany({
    where: { id: { in: businessIds } },
  });

  // Build a lookup for ordering
  const businessMap = new Map(businesses.map((b) => [b.id, b]));

  for (let i = 0; i < businessIds.length; i++) {
    const business = businessMap.get(businessIds[i]);

    if (!business) {
      result.failed++;
      options?.onProgress?.(i + 1, businessIds.length);
      continue;
    }

    if (shouldSkipEnrichment(business)) {
      result.skipped++;
      options?.onProgress?.(i + 1, businessIds.length);
      continue;
    }

    try {
      const enriched = await enrichBusinessBuurtData(business);
      if (enriched) {
        result.enriched++;
      } else {
        result.skipped++;
      }
    } catch {
      result.failed++;
    }

    options?.onProgress?.(i + 1, businessIds.length);

    // Delay between businesses to respect CBS/PDOK rate limits
    // Skip delay after the last business
    if (i < businessIds.length - 1) {
      await delay(INTER_BUSINESS_DELAY_MS);
    }
  }

  console.log(
    `[enricher] Batch complete: ${result.enriched} enriched, ${result.skipped} skipped, ${result.failed} failed (of ${businessIds.length} total)`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a business should skip enrichment.
 * Skip if demografieData is already present AND lastScannedAt is within 7 days.
 */
function shouldSkipEnrichment(business: MonitoredBusiness): boolean {
  if (!business.demografieData) return false;
  if (!business.lastScannedAt) return false;

  const age = Date.now() - business.lastScannedAt.getTime();
  return age < ENRICHMENT_FRESHNESS_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
