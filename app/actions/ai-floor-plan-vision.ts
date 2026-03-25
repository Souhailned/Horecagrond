"use server";

import { z } from "zod";
import { generateText } from "ai";
import { requirePermission } from "@/lib/session";
import { getVisionModel } from "@/lib/ai/model";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUserGenerate, incrementAiEditCount } from "@/app/actions/ai-quota";
import {
  transformToSceneData,
  parseLlmResponse,
  VALID_ZONE_TYPES,
  VALID_ITEM_TYPES,
} from "@/lib/editor/ai-transform";
import prisma from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";
import type { SceneData } from "@/lib/editor/schema";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const scanFloorPlanImageSchema = z.object({
  imageUrl: z.string().min(1, "Afbeelding is verplicht").max(14_000_000, "Afbeelding te groot (max 10 MB)"),
  surfaceTotal: z.number().min(10).max(10000).optional(),
});

// ---------------------------------------------------------------------------
// Vision prompt
// ---------------------------------------------------------------------------

function buildVisionPrompt(surfaceTotal?: number): string {
  const surfaceHint = surfaceTotal
    ? `The total surface area is approximately ${surfaceTotal} m². Use this to calibrate your dimension estimates.`
    : "Estimate the total surface area from the floor plan proportions.";

  return `You are an expert horeca (hospitality) floor plan analyzer. Analyze this photograph of a physical floor plan (drawn on paper) and extract the layout as structured JSON.

${surfaceHint}

Your task:
1. Identify the overall building dimensions (width and length in meters)
2. Identify all rooms/zones — look for labeled areas, room boundaries, walls, and partitions
3. Identify furniture and equipment positions if visible
4. Estimate realistic dimensions in meters based on the floor plan proportions

Output ONLY valid JSON matching this exact structure (no text before or after):

{
  "buildingWidth": <number in meters>,
  "buildingLength": <number in meters>,
  "zones": [
    {
      "type": "<zone_type>",
      "x": <x offset in meters from origin>,
      "y": <y offset in meters from origin>,
      "width": <width in meters>,
      "length": <length in meters>
    }
  ],
  "items": [
    {
      "type": "<item_type>",
      "x": <x position in meters>,
      "y": <y position in meters>,
      "rotation": <0 or 90>
    }
  ]
}

Valid zone types: dining_area, bar_area, kitchen, storage, terrace, entrance, restroom, office, prep_area, walk_in_cooler, seating_outside, hallway.
Valid item types: table_round, table_square, table_long, chair, barstool, bar_counter, kitchen_counter, oven, stove, fridge, sink, coffee_machine, display_case, register, booth, planter, parasol.

Rules:
- Map any dining room, restaurant area, or seating area to "dining_area"
- Map any bar, tap area, or drink service area to "bar_area"
- Map any cooking area, keuken to "kitchen"
- Map any storage room, magazijn, berging to "storage"
- Map any outdoor seating, terras to "terrace"
- Map any entrance, hal, lobby to "entrance"
- Map any toilet, WC, restroom to "restroom"
- Map any office, kantoor to "office"
- Zones should tile to fill the building without overlapping
- Include an entrance zone if one is visible
- Place furniture items inside their respective zone boundaries
- All coordinates in meters from origin (0,0) at the bottom-left corner
- If you cannot identify a specific area, use "hallway" as the zone type
- Even if the image is hard to read, make your best estimate — do not return empty zones`;
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

export async function scanFloorPlanImage(
  input: z.input<typeof scanFloorPlanImageSchema>
): Promise<ActionResult<SceneData>> {
  // 1. Permission check
  const authCheck = await requirePermission("properties:edit-own");
  if (!authCheck.success) {
    return { success: false, error: authCheck.error };
  }

  // 2. Rate limiting
  const rateLimit = await checkRateLimit(authCheck.data!.userId, "ai");
  if (!rateLimit.success) {
    return { success: false, error: "Te veel verzoeken. Probeer het later opnieuw." };
  }

  // 3. Quota check
  const quota = await canUserGenerate(authCheck.data!.userId);
  if (!quota.allowed) {
    return { success: false, error: "AI limiet bereikt" };
  }

  // 4. Validate input
  const parsed = scanFloorPlanImageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Ongeldige invoer: controleer de afbeeldings-URL.",
    };
  }

  const { imageUrl, surfaceTotal } = parsed.data;

  // 5. Get vision model
  const modelResult = await getVisionModel();
  if (!modelResult) {
    return {
      success: false,
      error: "Geen AI model beschikbaar. Configureer GROQ_API_KEY of OPENAI_API_KEY.",
    };
  }

  // 6. Analyze floor plan image via vision model
  try {
    const prompt = buildVisionPrompt(surfaceTotal);
    const modelName = process.env.GROQ_API_KEY
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "gpt-4o-mini";

    const { text } = await generateText({
      model: modelResult.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: imageUrl.startsWith("data:") ? imageUrl : new URL(imageUrl),
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 4000,
    });

    // 7. Parse LLM response
    const llmPlan = parseLlmResponse(text);
    if (!llmPlan) {
      console.error(
        "AI floor plan vision: kon LLM-response niet parsen",
        text.slice(0, 500)
      );
      return {
        success: false,
        error:
          "Kon de plattegrond niet herkennen. Probeer een duidelijkere foto.",
      };
    }

    // 8. Validate that we got at least one zone
    if (llmPlan.zones.length === 0) {
      return {
        success: false,
        error:
          "Kon geen ruimtes herkennen in de plattegrond. Probeer een duidelijkere foto.",
      };
    }

    // 9. Transform to SceneData
    const sceneData = transformToSceneData(llmPlan);

    // 10. Track quota (fire-and-forget)
    incrementAiEditCount(authCheck.data!.userId).catch(() => {});

    // 11. Log AI usage (fire-and-forget)
    prisma.aiUsageLog.create({
      data: {
        userId: authCheck.data!.userId,
        service: process.env.GROQ_API_KEY ? "groq" : "openai",
        model: modelName,
        feature: "floor-plan-vision",
        costCents: 0,
        status: "success",
      },
    }).catch(() => {});

    return { success: true, data: sceneData };
  } catch (error) {
    console.error("AI floor plan vision analyse mislukt:", error);
    return {
      success: false,
      error:
        "Kon de plattegrond niet herkennen. Probeer een duidelijkere foto.",
    };
  }
}
