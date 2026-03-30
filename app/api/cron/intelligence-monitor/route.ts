import { NextResponse } from "next/server";
import { monitorBusinesses } from "@/lib/intelligence/monitor";

// Max execution time for Vercel serverless function (5 minutes)
export const maxDuration = 300;

/**
 * Cron endpoint: weekly rescan of monitored businesses.
 * Detects changes in rating, reviews, and business status.
 * Protected by CRON_SECRET bearer token.
 *
 * Schedule: weekly (configure in vercel.json)
 */
export async function GET(request: Request) {
  try {
    // 1. Auth — verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[cron/intelligence-monitor] CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Run monitor
    console.log("[cron/intelligence-monitor] Starting weekly monitor...");

    const result = await monitorBusinesses({
      maxAge: 7, // Rescan businesses not scanned in 7+ days
      limit: 100, // Max 100 businesses per run (fits within 5 min timeout)
    });

    console.log(
      `[cron/intelligence-monitor] Completed: ${result.scanned} scanned, ${result.significantChanges.length} significant changes, ${result.duration}ms`,
    );

    // 3. Log significant changes
    if (result.significantChanges.length > 0) {
      console.log(
        "[cron/intelligence-monitor] Significant changes:",
        result.significantChanges.map((c) => ({
          name: c.businessName,
          city: c.city,
          changes: c.changes,
          scoreChange: `${c.previousSignalScore} → ${c.newSignalScore}`,
        })),
      );
    }

    return NextResponse.json({
      success: true,
      scanned: result.scanned,
      significantChanges: result.significantChanges.length,
      duration: result.duration,
    });
  } catch (error) {
    console.error("[cron/intelligence-monitor] Error:", error);
    return NextResponse.json(
      { error: "Monitor failed" },
      { status: 500 },
    );
  }
}
