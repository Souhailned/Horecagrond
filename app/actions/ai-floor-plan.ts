"use server";

import { z } from "zod";
import { generateText } from "ai";
import { requirePermission } from "@/lib/session";
import { getModel } from "@/lib/ai/model";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUserGenerate, incrementAiEditCount } from "@/app/actions/ai-quota";
import {
  transformToSceneData,
  parseLlmResponse,
  VALID_ZONE_TYPES,
  VALID_ITEM_TYPES,
  type LlmZone,
  type LlmItem,
} from "@/lib/editor/ai-transform";
import prisma from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";
import type { SceneData } from "@/lib/editor/schema";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const generateFloorPlanSchema = z.object({
  surfaceTotal: z.number().min(10).max(10000),
  propertyType: z.string(),
  floors: z.number().int().min(1).max(5).default(1),
  seatingCapacityInside: z.number().optional(),
  hasTerrace: z.boolean().default(false),
  hasKitchen: z.boolean().default(true),
  hasStorage: z.boolean().default(true),
});

type GenerateFloorPlanInput = z.infer<typeof generateFloorPlanSchema>;

// ---------------------------------------------------------------------------
// Property type labels for the prompt
// ---------------------------------------------------------------------------

const typeLabels: Record<string, string> = {
  RESTAURANT: "restaurant",
  CAFE: "café",
  BAR: "bar",
  HOTEL: "hotel",
  EETCAFE: "eetcafé",
  LUNCHROOM: "lunchroom",
  KOFFIEBAR: "koffiebar",
  PIZZERIA: "pizzeria",
  BAKERY: "bakkerij",
  DARK_KITCHEN: "dark kitchen",
  SNACKBAR: "snackbar",
  GRAND_CAFE: "grand café",
  COCKTAILBAR: "cocktailbar",
  NIGHTCLUB: "nachtclub",
};

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

function buildPrompt(input: GenerateFloorPlanInput): string {
  const type = typeLabels[input.propertyType] || input.propertyType.toLowerCase();
  const widthEstimate = Math.round(Math.sqrt(input.surfaceTotal) * 1.2);
  const lengthEstimate = Math.round(input.surfaceTotal / widthEstimate);
  const validZoneTypes = Array.from(VALID_ZONE_TYPES).join(", ");
  const validItemTypes = Array.from(VALID_ITEM_TYPES).join(", ");

  return `You are a horeca floor plan generator. Generate a realistic JSON floor plan layout for a ${type}.

Property details:
- Total surface: ${input.surfaceTotal} m²
- Estimated building dimensions: approx ${widthEstimate}m wide x ${lengthEstimate}m deep
- Floors: ${input.floors}
- Seating capacity inside: ${input.seatingCapacityInside ?? "not specified"}
- Has terrace: ${input.hasTerrace}
- Has kitchen: ${input.hasKitchen}
- Has storage: ${input.hasStorage}

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
      "rotation": <rotation in degrees, 0 or 90>
    }
  ]
}

Valid zone types: ${validZoneTypes}.
Valid item types: ${validItemTypes}.

Rules:
- Zones should tile to fill the building without overlapping
- Include an entrance zone near y=0
- Kitchen goes in the back if present
- Add appropriate furniture items inside each zone
- Place tables and chairs in dining areas, bar stools and bar counter in bar areas, kitchen equipment in kitchens
- For a restaurant with ${input.seatingCapacityInside ?? 40} seats, include roughly ${Math.ceil((input.seatingCapacityInside ?? 40) / 4)} tables and ${input.seatingCapacityInside ?? 40} chairs in dining areas
- Keep item positions within their respective zone boundaries
- All coordinates in meters from origin (0,0)`;
}

// ---------------------------------------------------------------------------
// Fallback generator (when no LLM is available)
// ---------------------------------------------------------------------------

function generateFallbackPlan(input: GenerateFloorPlanInput): SceneData {
  const w = Math.round(Math.sqrt(input.surfaceTotal) * 1.2);
  const l = Math.round(input.surfaceTotal / w);

  const zones: LlmZone[] = [];
  let yOffset = 0;

  // Entrance
  zones.push({ type: "entrance", x: 0, y: yOffset, width: w, length: 2 });
  yOffset += 2;

  // Restroom
  zones.push({ type: "restroom", x: 0, y: yOffset, width: 3, length: 3 });

  // Dining area
  const diningWidth = w - (input.hasKitchen ? 0 : 0);
  const kitchenLength = input.hasKitchen ? Math.max(4, Math.round(l * 0.25)) : 0;
  const storageLength = input.hasStorage ? Math.max(2, Math.round(l * 0.1)) : 0;
  const diningLength = l - yOffset - kitchenLength - storageLength;

  zones.push({
    type: "dining_area",
    x: 3,
    y: yOffset,
    width: diningWidth - 3,
    length: diningLength,
  });
  yOffset += Math.max(diningLength, 3);

  if (input.hasKitchen) {
    zones.push({ type: "kitchen", x: 0, y: yOffset, width: w, length: kitchenLength });
    yOffset += kitchenLength;
  }

  if (input.hasStorage) {
    zones.push({ type: "storage", x: 0, y: yOffset, width: w, length: storageLength });
    yOffset += storageLength;
  }

  if (input.hasTerrace) {
    zones.push({ type: "terrace", x: 0, y: -4, width: w, length: 4 });
  }

  // Simple items: a few tables in dining area
  const items: LlmItem[] = [];
  const dining = zones.find((z) => z.type === "dining_area");
  if (dining) {
    const tables = Math.min(6, Math.floor((dining.width * dining.length) / 6));
    for (let i = 0; i < tables; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const tx = dining.x + 1.5 + col * 2.5;
      const ty = dining.y + 1.5 + row * 2.5;
      items.push({ type: "table_square", x: tx, y: ty, rotation: 0 });
      // Four chairs around each table
      items.push({ type: "chair", x: tx - 0.6, y: ty, rotation: 0 });
      items.push({ type: "chair", x: tx + 0.6, y: ty, rotation: 0 });
      items.push({ type: "chair", x: tx, y: ty - 0.6, rotation: 90 });
      items.push({ type: "chair", x: tx, y: ty + 0.6, rotation: 90 });
    }
  }

  if (input.hasKitchen) {
    const kitchen = zones.find((z) => z.type === "kitchen");
    if (kitchen) {
      items.push({ type: "kitchen_counter", x: kitchen.x + 1, y: kitchen.y + 1, rotation: 0 });
      items.push({ type: "stove", x: kitchen.x + 3, y: kitchen.y + 1, rotation: 0 });
      items.push({ type: "sink", x: kitchen.x + 4.5, y: kitchen.y + 1, rotation: 0 });
      items.push({ type: "fridge", x: kitchen.x + 6, y: kitchen.y + 1, rotation: 0 });
    }
  }

  return transformToSceneData({
    buildingWidth: w,
    buildingLength: l,
    zones,
    items,
  });
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

export async function generateAiFloorPlan(
  input: z.input<typeof generateFloorPlanSchema>
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
  const parsed = generateFloorPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Ongeldige invoer: controleer de opgegeven waarden.",
    };
  }

  const validInput = parsed.data;

  // 5. Get LLM model (never returns null — falls back to Ollama)
  const modelResult = await getModel();
  const model = modelResult.model;

  // 6. Generate floor plan via LLM
  try {
    const prompt = buildPrompt(validInput);
    const modelName = process.env.GROQ_API_KEY
      ? "llama-3.3-70b-versatile"
      : process.env.OPENAI_API_KEY
        ? "gpt-4o-mini"
        : "llama3.2:3b";

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 4000,
    });

    // 7. Parse LLM response
    const llmPlan = parseLlmResponse(text);
    if (!llmPlan) {
      console.error("AI floor plan: kon LLM-response niet parsen", text.slice(0, 500));
      // Fallback to deterministic plan
      const fallback = generateFallbackPlan(validInput);
      return { success: true, data: fallback };
    }

    // 8. Transform to SceneData
    const sceneData = transformToSceneData(llmPlan);

    // 9. Track quota (fire-and-forget)
    incrementAiEditCount(authCheck.data!.userId).catch(() => {});

    // 10. Log AI usage (fire-and-forget)
    prisma.aiUsageLog.create({
      data: {
        userId: authCheck.data!.userId,
        service: process.env.GROQ_API_KEY ? "groq" : process.env.OPENAI_API_KEY ? "openai" : "ollama",
        model: modelName,
        feature: "floor-plan-generate",
        costCents: 0,
        status: "success",
      },
    }).catch(() => {});

    return { success: true, data: sceneData };
  } catch (error) {
    console.error("AI floor plan generatie mislukt:", error);
    // Fallback to deterministic plan on any error
    const fallback = generateFallbackPlan(validInput);
    return { success: true, data: fallback };
  }
}
