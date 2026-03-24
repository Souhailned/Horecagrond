"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type { PropertyStatus, PropertyType, PriceType } from "@/generated/prisma/client";
import type { ActionResult } from "@/types/actions";

export async function getMyProperty(propertyId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  return prisma.property.findFirst({
    where: { id: propertyId, createdById: session.user.id },
  });
}

export async function getMyProperties() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return [];

  return prisma.property.findMany({
    where: { createdById: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { inquiries: true },
      },
    },
  });
}

/** Lightweight property type for the dashboard panden page */
export interface DashboardProperty {
  id: string;
  title: string;
  slug: string;
  status: PropertyStatus;
  propertyType: PropertyType;
  priceType: PriceType;
  rentPrice: number | null;
  salePrice: number | null;
  city: string;
  province: string | null;
  surfaceTotal: number;
  viewCount: number;
  inquiryCount: number;
  savedCount: number;
  createdAt: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  createdById: string;
  // AI feature fields
  description: string | null;
  imageCount: number;
  healthScore: number | null;
  daysOnline: number | null;
}

/**
 * Fetch properties for the dashboard panden page.
 * - admin with scope="all": fetches all properties across agents
 * - agent/admin with scope="mine": fetches own properties only
 */
export async function getMyPropertiesForDashboard(
  scope: "all" | "mine" = "mine"
): Promise<ActionResult<DashboardProperty[]>> {
  const authCheck = await requirePermission("properties:edit-own");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId, role } = authCheck.data!;

  // Only admins can fetch all properties
  const where =
    scope === "all" && role === "admin"
      ? {}
      : { createdById: userId };

  const properties = await prisma.property.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      propertyType: true,
      priceType: true,
      rentPrice: true,
      salePrice: true,
      city: true,
      province: true,
      surfaceTotal: true,
      viewCount: true,
      inquiryCount: true,
      savedCount: true,
      createdAt: true,
      publishedAt: true,
      createdById: true,
      description: true,
      healthScore: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { thumbnailUrl: true, mediumUrl: true, originalUrl: true },
      },
      _count: {
        select: { images: true },
      },
    },
  });

  const data: DashboardProperty[] = properties.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    propertyType: p.propertyType,
    priceType: p.priceType,
    rentPrice: p.rentPrice,
    salePrice: p.salePrice,
    city: p.city,
    province: p.province,
    surfaceTotal: p.surfaceTotal,
    viewCount: p.viewCount,
    inquiryCount: p.inquiryCount,
    savedCount: p.savedCount,
    createdAt: p.createdAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    thumbnailUrl:
      p.images[0]?.thumbnailUrl ??
      p.images[0]?.mediumUrl ??
      p.images[0]?.originalUrl ??
      null,
    createdById: p.createdById,
    description: p.description,
    imageCount: p._count.images,
    healthScore: p.healthScore,
    daysOnline: p.publishedAt
      ? Math.floor(
          (Date.now() - new Date(p.publishedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null,
  }));

  return { success: true, data };
}
