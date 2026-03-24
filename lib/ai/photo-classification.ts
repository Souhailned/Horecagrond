import { z } from "zod";
import { generateObject } from "ai";
import { getVisionModel } from "./vision-model";
import type { PropertyType } from "@/generated/prisma/client";

/* -------------------------------------------------------------------------- */
/*  Classification Schema                                                      */
/* -------------------------------------------------------------------------- */

export const photoClassificationSchema = z.object({
  roomType: z.enum([
    "dining_area",
    "bar_area",
    "kitchen",
    "terrace",
    "hotel_room",
    "lobby",
    "entrance",
    "exterior_front",
    "street_view",
    "floorplan",
    "detail_shot",
    "unknown",
  ]),
  isInterior: z.boolean(),
  stagingSuitability: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "How suitable is this space for virtual staging? 0=not at all, 100=perfect empty room"
    ),
  qualityScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Image quality: lighting, resolution, clarity. 0=unusable, 100=professional"
    ),
  spatialOpenness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "How open/spacious does the room appear? 0=cramped/cluttered, 100=wide open space"
    ),
  dominantFeatures: z
    .array(z.string())
    .describe(
      "Key visual features: e.g. 'wooden floor', 'bar counter', 'large windows'"
    ),
});

export type PhotoClassification = z.infer<typeof photoClassificationSchema>;

/* -------------------------------------------------------------------------- */
/*  Room-type priority matrix per PropertyType                                 */
/* -------------------------------------------------------------------------- */

type RoomType = PhotoClassification["roomType"];

const ROOM_PRIORITY: Partial<Record<PropertyType, RoomType[]>> = {
  RESTAURANT: ["dining_area", "bar_area", "lobby"],
  BRASSERIE: ["dining_area", "bar_area", "lobby"],
  PIZZERIA: ["dining_area", "kitchen"],
  WOK_RESTAURANT: ["dining_area", "kitchen"],
  SUSHI: ["dining_area", "bar_area"],
  HOTEL_RESTAURANT: ["dining_area", "lobby", "hotel_room"],
  CAFE: ["dining_area", "bar_area", "entrance"],
  EETCAFE: ["dining_area", "bar_area"],
  GRAND_CAFE: ["dining_area", "bar_area", "lobby"],
  KOFFIEBAR: ["dining_area", "bar_area"],
  TEAROOM: ["dining_area"],
  BROUWERIJ_CAFE: ["bar_area", "dining_area"],
  BAR: ["bar_area", "dining_area"],
  COCKTAILBAR: ["bar_area", "lobby"],
  WIJNBAR: ["bar_area", "dining_area"],
  NIGHTCLUB: ["bar_area", "lobby"],
  HOTEL: ["hotel_room", "lobby", "dining_area"],
  BED_AND_BREAKFAST: ["hotel_room", "lobby", "dining_area"],
  LUNCHROOM: ["dining_area", "kitchen"],
  IJSSALON: ["dining_area", "entrance"],
  PANNENKOEKHUIS: ["dining_area", "kitchen"],
};

/* -------------------------------------------------------------------------- */
/*  Scoring Algorithm                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Calculate final staging score for a classified photo.
 *
 * Formula: suitability*0.4 + quality*0.15 + openness*0.15 + roomBonus(0-30) + lightBonus(0-10)
 * Room bonus: 30 for priority[0], 20 for priority[1], 10 for priority[2]
 * Max possible: 110, clamped to 100. Non-interiors capped at 15.
 */
export function calculateStagingScore(
  classification: PhotoClassification,
  propertyType: PropertyType
): number {
  // Base score from classification values
  const baseScore =
    classification.stagingSuitability * 0.4 +
    classification.qualityScore * 0.15 +
    classification.spatialOpenness * 0.15;

  // Room-type bonus based on property type priority
  const priorities = ROOM_PRIORITY[propertyType] || ["dining_area"];
  const roomIndex = priorities.indexOf(classification.roomType);
  let roomBonus = 0;
  if (roomIndex === 0) roomBonus = 30;
  else if (roomIndex === 1) roomBonus = 20;
  else if (roomIndex === 2) roomBonus = 10;

  // Non-interior penalty
  if (!classification.isInterior) {
    return Math.min(baseScore * 0.3, 15); // Heavily penalize exteriors
  }

  // Light bonus: photos mentioning natural light or large windows
  const lightFeatures = classification.dominantFeatures.some((f) =>
    /natural light|large window|skylight|bright|well.lit/i.test(f)
  );
  const lightBonus = lightFeatures ? 10 : 0;

  return Math.round(Math.min(baseScore + roomBonus + lightBonus, 100));
}

/* -------------------------------------------------------------------------- */
/*  Classify a single photo                                                    */
/* -------------------------------------------------------------------------- */

export async function classifyPhoto(
  imageUrl: string
): Promise<PhotoClassification> {
  const { model } = await getVisionModel();

  const result = await generateObject({
    model,
    schema: photoClassificationSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this photo of a commercial hospitality property (restaurant, cafe, bar, hotel, etc.).
Classify the room type, assess if it's an interior shot, and rate its suitability for AI virtual staging (furniture/decor replacement).
Consider: Is this an empty or semi-furnished interior space? Good lighting? Clear floor/wall visibility? Wide angle?
Exteriors, floorplans, and detail shots are NOT suitable for staging.`,
          },
          {
            type: "image",
            image: imageUrl,
          },
        ],
      },
    ],
  });

  return result.object;
}
