"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export async function duplicateProperty(propertyId: string) {
  const authCheck = await requirePermission("properties:duplicate");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId, role } = authCheck.data!;

  const original = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
  });

  if (!original) return { error: "Pand niet gevonden" };

  const newSlug = `${original.slug}-kopie-${Date.now().toString(36)}`;

  const duplicate = await prisma.property.create({
    data: {
      title: `${original.title} (kopie)`,
      slug: newSlug,
      description: original.description,
      shortDescription: original.shortDescription,
      address: original.address,
      postalCode: original.postalCode,
      city: original.city,
      province: original.province,
      neighborhood: original.neighborhood,
      latitude: original.latitude,
      longitude: original.longitude,
      propertyType: original.propertyType,
      priceType: original.priceType,
      rentPrice: original.rentPrice,
      salePrice: original.salePrice,
      surfaceTotal: original.surfaceTotal,
      buildYear: original.buildYear,
      seatingCapacityInside: original.seatingCapacityInside,
      seatingCapacityOutside: original.seatingCapacityOutside,
      standingCapacity: original.standingCapacity,
      totalCapacity: original.totalCapacity,
      status: "DRAFT",
      viewCount: 0,
      inquiryCount: 0,
      createdById: userId,
      agencyId: original.agencyId,
    },
  });

  return { success: true, propertyId: duplicate.id, slug: duplicate.slug };
}
