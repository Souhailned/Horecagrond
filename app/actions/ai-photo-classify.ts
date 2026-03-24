"use server";

import prisma from "@/lib/prisma";
import {
  classifyPhoto,
  calculateStagingScore,
} from "@/lib/ai/photo-classification";
import type { PhotoClassification } from "@/lib/ai/photo-classification";
import type { Prisma } from "@/generated/prisma/client";

type ClassifyResult = {
  bestImageId: string;
  bestImageUrl: string;
  totalClassified: number;
};

/**
 * Classify all photos for a property using Groq vision.
 * Selects the best interior photo for AI virtual staging.
 *
 * Strategy:
 * - Batch 3-4 photos concurrently to respect rate limits
 * - Score each based on staging suitability, quality, and property type
 * - Update property.bestStagingImageId with the winner
 *
 * Fallback chain:
 * 1. Highest scoring photo (score > 20)
 * 2. Primary photo (isPrimary = true)
 * 3. First photo in order
 */
export async function classifyPropertyPhotos(
  propertyId: string
): Promise<{ success: boolean; data?: ClassifyResult; error?: string }> {
  try {
    // 1. Fetch property with images
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { order: "asc" } },
      },
    });

    if (!property) {
      return { success: false, error: "Property not found" };
    }

    if (property.images.length === 0) {
      return { success: false, error: "No images to classify" };
    }

    const propertyType = property.propertyType;

    // 2. Classify photos in batches of 3
    const BATCH_SIZE = 3;
    const results: Array<{
      imageId: string;
      imageUrl: string;
      score: number;
      classification: PhotoClassification;
    }> = [];

    for (let i = 0; i < property.images.length; i += BATCH_SIZE) {
      const batch = property.images.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (img) => {
          const classification = await classifyPhoto(img.originalUrl);
          const score = calculateStagingScore(classification, propertyType);

          // Update the image record with classification data
          await prisma.propertyImage.update({
            where: { id: img.id },
            data: {
              aiClassification: JSON.parse(JSON.stringify(classification)) as Prisma.InputJsonValue,
              aiRoomType: classification.roomType,
              aiStagingScore: score,
              aiClassifiedAt: new Date(),
            },
          });

          return {
            imageId: img.id,
            imageUrl: img.originalUrl,
            score,
            classification,
          };
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        }
      }
    }

    // 3. Log AI usage
    await prisma.aiUsageLog.create({
      data: {
        service: "groq",
        model: "llama-4-scout-17b-16e-instruct",
        feature: "photo-classification",
        costCents: 0, // ~$0.001 per batch, negligible
        status: "success",
        metadata: {
          propertyId,
          totalImages: property.images.length,
          classifiedCount: results.length,
        },
      },
    });

    // 4. Select best photo using fallback chain
    let bestImage: { imageId: string; imageUrl: string } | null = null;

    // Strategy 1: Highest scoring photo with score > 20
    const sorted = results.sort((a, b) => b.score - a.score);
    if (sorted.length > 0 && sorted[0].score > 20) {
      bestImage = {
        imageId: sorted[0].imageId,
        imageUrl: sorted[0].imageUrl,
      };
    }

    // Strategy 2: Fallback to primary image
    if (!bestImage) {
      const primaryImg = property.images.find((img) => img.isPrimary);
      if (primaryImg) {
        bestImage = {
          imageId: primaryImg.id,
          imageUrl: primaryImg.originalUrl,
        };
      }
    }

    // Strategy 3: Fallback to first image
    if (!bestImage && property.images.length > 0) {
      bestImage = {
        imageId: property.images[0].id,
        imageUrl: property.images[0].originalUrl,
      };
    }

    if (!bestImage) {
      return { success: false, error: "No suitable image found" };
    }

    // 5. Update property with best staging image
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        bestStagingImageId: bestImage.imageId,
        aiPhotoClassifiedAt: new Date(),
      },
    });

    return {
      success: true,
      data: {
        bestImageId: bestImage.imageId,
        bestImageUrl: bestImage.imageUrl,
        totalClassified: results.length,
      },
    };
  } catch (error) {
    console.error("[classifyPropertyPhotos] Error:", error);

    // Log failed attempt
    await prisma.aiUsageLog
      .create({
        data: {
          service: "groq",
          model: "llama-4-scout-17b-16e-instruct",
          feature: "photo-classification",
          costCents: 0,
          status: "failed",
          metadata: {
            propertyId,
            error:
              error instanceof Error ? error.message : "Unknown error",
          },
        },
      })
      .catch(() => {}); // Don't let logging break error handling

    // Fallback: try to use primary image or first image
    try {
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { images: { where: { isPrimary: true }, take: 1 } },
      });

      const fallbackImage = property?.images[0];
      if (fallbackImage) {
        // Also persist the fallback selection in the DB
        await prisma.property.update({
          where: { id: propertyId },
          data: { bestStagingImageId: fallbackImage.id },
        }).catch(() => {}); // Don't let this break the fallback

        return {
          success: true,
          data: {
            bestImageId: fallbackImage.id,
            bestImageUrl: fallbackImage.originalUrl,
            totalClassified: 0,
          },
        };
      }
    } catch {
      // Ignore fallback errors
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Classification failed",
    };
  }
}
