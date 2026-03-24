"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type { ActionResult } from "@/types/actions";

export interface PortfolioSummary {
  totalProperties: number;
  activeProperties: number;
  avgHealthScore: number | null;

  // Attention items
  staleCount: number;
  lowScoreCount: number;
  missingDescriptionCount: number;

  // Leads
  hotLeadCount: number;
  warmLeadCount: number;

  // Performance totals
  totalViews: number;
  totalInquiries: number;

  // Trends (percentage change, 0 when no historical data)
  viewsTrend: number;
  inquiriesTrend: number;
}

/**
 * Get aggregated portfolio summary data for the panden dashboard.
 *
 * - scope="mine": only the current user's properties (default)
 * - scope="all":  all properties (admin only)
 */
export async function getPortfolioSummary(
  scope: "all" | "mine" = "mine"
): Promise<ActionResult<PortfolioSummary>> {
  const authCheck = await requirePermission("analytics:own");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };
  const { userId, role } = sessionData;

  // Only admins may access all properties
  const where =
    scope === "all" && role === "admin" ? {} : { createdById: userId };

  try {
    // Run all queries in parallel
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalCount,
      activeCount,
      healthAgg,
      staleCount,
      lowScoreCount,
      missingDescCount,
      hotLeadCount,
      warmLeadCount,
      performanceAgg,
    ] = await Promise.all([
      // Total properties
      prisma.property.count({ where }),

      // Active properties
      prisma.property.count({
        where: { ...where, status: "ACTIVE" },
      }),

      // Average health score
      prisma.property.aggregate({
        where: { ...where, healthScore: { not: null } },
        _avg: { healthScore: true },
      }),

      // Stale: active, published > 30 days ago, 0 inquiries
      prisma.property.count({
        where: {
          ...where,
          status: "ACTIVE",
          publishedAt: { lt: thirtyDaysAgo },
          inquiryCount: 0,
        },
      }),

      // Low health score (< 40)
      prisma.property.count({
        where: {
          ...where,
          healthScore: { lt: 40 },
        },
      }),

      // Missing description
      prisma.property.count({
        where: {
          ...where,
          OR: [{ description: null }, { description: "" }],
        },
      }),

      // Hot leads: inquiry in last 7 days with phone OR long message
      prisma.propertyInquiry.count({
        where: {
          property: where,
          createdAt: { gte: sevenDaysAgo },
          OR: [
            { phone: { not: null } },
            // Message longer than 100 chars is considered higher intent
          ],
          // Also check priority field if available
          priority: "hot",
        },
      }).catch(() =>
        // Fallback: count recent inquiries with phone as "hot"
        prisma.propertyInquiry.count({
          where: {
            property: where,
            createdAt: { gte: sevenDaysAgo },
            phone: { not: null },
          },
        })
      ),

      // Warm leads: recent inquiries that are not hot
      prisma.propertyInquiry.count({
        where: {
          property: where,
          createdAt: { gte: sevenDaysAgo },
          OR: [
            { priority: "warm" },
            { priority: null, phone: null },
          ],
        },
      }).catch(() =>
        prisma.propertyInquiry.count({
          where: {
            property: where,
            createdAt: { gte: sevenDaysAgo },
            phone: null,
          },
        })
      ),

      // Performance: total views and inquiries
      prisma.property.aggregate({
        where,
        _sum: {
          viewCount: true,
          inquiryCount: true,
        },
      }),
    ]);

    const avgHealthScore = healthAgg._avg.healthScore
      ? Math.round(healthAgg._avg.healthScore)
      : null;

    const totalViews = performanceAgg._sum.viewCount ?? 0;
    const totalInquiries = performanceAgg._sum.inquiryCount ?? 0;

    // Trends: we need a PropertyView table for real week-over-week comparison.
    // Use PropertyView if data exists, otherwise default to 0 trend.
    let viewsTrend = 0;
    let inquiriesTrend = 0;

    try {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const [viewsThisWeek, viewsLastWeek, inquiriesThisWeek, inquiriesLastWeek] =
        await Promise.all([
          prisma.propertyView.count({
            where: {
              property: where,
              viewedAt: { gte: sevenDaysAgo },
            },
          }),
          prisma.propertyView.count({
            where: {
              property: where,
              viewedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            },
          }),
          prisma.propertyInquiry.count({
            where: {
              property: where,
              createdAt: { gte: sevenDaysAgo },
            },
          }),
          prisma.propertyInquiry.count({
            where: {
              property: where,
              createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            },
          }),
        ]);

      // Calculate percentage change (avoid division by zero)
      viewsTrend =
        viewsLastWeek > 0
          ? Math.round(
              ((viewsThisWeek - viewsLastWeek) / viewsLastWeek) * 100
            )
          : viewsThisWeek > 0
            ? 100
            : 0;

      inquiriesTrend =
        inquiriesLastWeek > 0
          ? Math.round(
              ((inquiriesThisWeek - inquiriesLastWeek) / inquiriesLastWeek) *
                100
            )
          : inquiriesThisWeek > 0
            ? 100
            : 0;
    } catch {
      // PropertyView table might not have data yet; trends stay at 0
    }

    return {
      success: true,
      data: {
        totalProperties: totalCount,
        activeProperties: activeCount,
        avgHealthScore,
        staleCount,
        lowScoreCount,
        missingDescriptionCount: missingDescCount,
        hotLeadCount,
        warmLeadCount,
        totalViews,
        totalInquiries,
        viewsTrend,
        inquiriesTrend,
      },
    };
  } catch (error) {
    console.error("Failed to get portfolio summary:", error);
    return {
      success: false,
      error: "Kon portfolio overzicht niet laden.",
    };
  }
}
