"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type { PropertyType } from "@/generated/prisma/client";

type PropertyStatus = "DRAFT" | "ACTIVE" | "UNDER_OFFER" | "RENTED" | "SOLD" | "ARCHIVED";

/** Returns the best default demo style for a given property type */
function getDefaultStyle(propertyType: PropertyType): string {
  const typeMap: Partial<Record<PropertyType, string>> = {
    RESTAURANT: "restaurant_modern",
    BRASSERIE: "restaurant_modern",
    PIZZERIA: "restaurant_modern",
    WOK_RESTAURANT: "restaurant_modern",
    SUSHI: "restaurant_modern",
    HOTEL_RESTAURANT: "restaurant_modern",
    CAFE: "cafe_gezellig",
    EETCAFE: "cafe_gezellig",
    GRAND_CAFE: "cafe_gezellig",
    KOFFIEBAR: "cafe_gezellig",
    TEAROOM: "cafe_gezellig",
    BROUWERIJ_CAFE: "cafe_gezellig",
    BAR: "bar_lounge",
    COCKTAILBAR: "bar_lounge",
    WIJNBAR: "bar_lounge",
    NIGHTCLUB: "bar_lounge",
    HOTEL: "hotel_boutique",
    BED_AND_BREAKFAST: "hotel_boutique",
    LUNCHROOM: "lunchroom_hip",
    IJSSALON: "lunchroom_hip",
    PANNENKOEKHUIS: "lunchroom_hip",
  };
  return typeMap[propertyType] || "restaurant_modern";
}

export async function updatePropertyStatus(propertyId: string, status: PropertyStatus) {
  const authCheck = await requirePermission("properties:edit-own");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId, role } = authCheck.data!;

  // Verify ownership (admin can update any property)
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
    include: {
      images: { where: { isPrimary: true }, take: 1 },
    },
  });

  if (!property) {
    return { error: "Pand niet gevonden of geen toegang" };
  }

  const isFirstPublish = status === "ACTIVE" && !property.publishedAt;
  const updateData: Record<string, unknown> = { status };

  // Set publishedAt when activating
  if (isFirstPublish) {
    updateData.publishedAt = new Date();
  }

  await prisma.property.update({
    where: { id: propertyId },
    data: updateData,
  });

  // On first publish: trigger match alerts + smart photo selection + teaser generation
  if (isFirstPublish) {
    const { matchAndNotifySearchAlerts } = await import("@/lib/search-alerts/matcher");
    void matchAndNotifySearchAlerts(propertyId).catch(console.error);

    // Smart pipeline: classify photos -> select best -> generate 1 teaser
    void (async () => {
      try {
        const { classifyPropertyPhotos } = await import("@/app/actions/ai-photo-classify");
        const classifyResult = await classifyPropertyPhotos(propertyId);

        let sourceImageUrl: string;
        if (classifyResult.success && classifyResult.data) {
          sourceImageUrl = classifyResult.data.bestImageUrl;
        } else {
          // Fallback to primary image
          const primaryImage = property.images[0];
          if (!primaryImage?.originalUrl) return;
          sourceImageUrl = primaryImage.originalUrl;
        }

        // Generate only 1 teaser concept (not all 6)
        const { generateTeaserConcept } = await import("@/app/actions/demo-concepts");
        const defaultStyle = getDefaultStyle(property.propertyType);
        await generateTeaserConcept(propertyId, sourceImageUrl, defaultStyle);
      } catch (error) {
        console.error("[updatePropertyStatus] Smart pipeline failed:", error);

        // Ultimate fallback: try old approach with primary image
        const primaryImage = property.images[0];
        if (primaryImage?.originalUrl) {
          const { generateTeaserConcept } = await import("@/app/actions/demo-concepts");
          const defaultStyle = getDefaultStyle(property.propertyType);
          void generateTeaserConcept(propertyId, primaryImage.originalUrl, defaultStyle).catch(console.error);
        }
      }
    })().catch(console.error);
  }

  return { success: true, status };
}
