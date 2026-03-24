"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/session";
import {
  calculateHealthScore,
  type HealthScoreInput,
  type HealthScoreResult,
} from "@/lib/property-health";
import type { ActionResult } from "@/types/actions";

/**
 * Batch-calculate health scores for all accessible properties.
 *
 * - Fetches properties from DB with description, image count, view/inquiry counts, pricing, publishedAt, city
 * - Groups by city to calculate per-city averages for view/inquiry benchmarks
 * - Runs calculateHealthScore() for each property
 * - Batch-updates healthScore + healthScoreDetails in DB via $transaction
 * - Returns Record<propertyId, HealthScoreResult>
 */
export async function calculatePropertyHealthScores(
  scope: "all" | "mine" = "mine"
): Promise<ActionResult<Record<string, HealthScoreResult>>> {
  try {
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) return { success: false, error: authCheck.error };

    const sessionData = authCheck.data;
    if (!sessionData) return { success: false, error: "Sessie ongeldig" };
    const { userId, role } = sessionData;

    // Only admins can calculate across all properties
    const where =
      scope === "all" && role === "admin" ? {} : { createdById: userId };

    const properties = await prisma.property.findMany({
      where,
      select: {
        id: true,
        description: true,
        rentPrice: true,
        salePrice: true,
        viewCount: true,
        inquiryCount: true,
        publishedAt: true,
        city: true,
        _count: {
          select: { images: true },
        },
      },
    });

    if (properties.length === 0) {
      return { success: true, data: {} };
    }

    // ─── Calculate per-city averages ──────────────────────────────
    const cityStats: Record<
      string,
      { totalViews: number; totalInquiries: number; count: number }
    > = {};

    for (const p of properties) {
      const city = p.city.toLowerCase();
      if (!cityStats[city]) {
        cityStats[city] = { totalViews: 0, totalInquiries: 0, count: 0 };
      }
      cityStats[city].totalViews += p.viewCount;
      cityStats[city].totalInquiries += p.inquiryCount;
      cityStats[city].count += 1;
    }

    const cityAverages: Record<
      string,
      { avgViews: number; avgInquiries: number }
    > = {};

    for (const [city, stats] of Object.entries(cityStats)) {
      cityAverages[city] = {
        avgViews: stats.count > 1 ? stats.totalViews / stats.count : 0,
        avgInquiries:
          stats.count > 1 ? stats.totalInquiries / stats.count : 0,
      };
    }

    // ─── Calculate health scores ──────────────────────────────────
    const results: Record<string, HealthScoreResult> = {};
    const updates: Array<{
      id: string;
      score: number;
      details: HealthScoreResult;
    }> = [];

    for (const p of properties) {
      const city = p.city.toLowerCase();
      const avg = cityAverages[city];
      const hasDescription = !!p.description && p.description.trim().length > 0;
      const descriptionLength = p.description?.trim().length ?? 0;
      const hasPrice = p.rentPrice !== null || p.salePrice !== null;
      const daysOnline = p.publishedAt
        ? Math.floor(
            (Date.now() - new Date(p.publishedAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      const input: HealthScoreInput = {
        hasDescription,
        descriptionLength,
        imageCount: p._count.images,
        hasPrice,
        viewCount: p.viewCount,
        inquiryCount: p.inquiryCount,
        daysOnline,
        avgViewsInCity: avg?.avgViews ?? undefined,
        avgInquiriesInCity: avg?.avgInquiries ?? undefined,
      };

      const result = calculateHealthScore(input);
      results[p.id] = result;
      updates.push({ id: p.id, score: result.score, details: result });
    }

    // ─── Batch update in DB (chunked to avoid transaction timeout) ──
    const now = new Date();
    const BATCH_SIZE = 50;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((u) =>
          prisma.property.update({
            where: { id: u.id },
            data: {
              healthScore: u.score,
              healthScoreDetails: JSON.parse(JSON.stringify(u.details)) as Prisma.InputJsonValue,
              healthScoreUpdatedAt: now,
            },
          })
        )
      );
    }

    return { success: true, data: results };
  } catch (error) {
    console.error("[ai-health-score] Error calculating health scores:", error);
    return {
      success: false,
      error: "Er is een fout opgetreden bij het berekenen van de health scores.",
    };
  }
}
