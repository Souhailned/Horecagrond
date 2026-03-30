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
  type LlmZone,
} from "@/lib/editor/ai-transform";
import { getCatalogAsset } from "@/lib/editor/catalog-lookup";
import prisma from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";
import type { SceneData } from "@/lib/editor/schema";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const generateFloorPlanSchema = z.object({
  description: z.string().min(1).max(2000),
  surfaceTotal: z.number().min(10).max(10000),
  propertyType: z.string(),
  seatingCapacityInside: z.number().optional(),
});

type GenerateFloorPlanInput = z.infer<typeof generateFloorPlanSchema>;

// ---------------------------------------------------------------------------
// Property type labels for the prompt
// ---------------------------------------------------------------------------

const typeLabels: Record<string, string> = {
  RESTAURANT: "restaurant",
  CAFE: "cafe",
  BAR: "bar",
  HOTEL: "hotel",
  EETCAFE: "eetcafe",
  LUNCHROOM: "lunchroom",
  KOFFIEBAR: "koffiebar",
  PIZZERIA: "pizzeria",
  BAKERY: "bakkerij",
  DARK_KITCHEN: "dark kitchen",
  SNACKBAR: "snackbar",
  GRAND_CAFE: "grand cafe",
  COCKTAILBAR: "cocktailbar",
  NIGHTCLUB: "nachtclub",
};

// ---------------------------------------------------------------------------
// Catalog prompt builder
// ---------------------------------------------------------------------------

/**
 * All catalog item IDs available for floor plan generation.
 * These map directly to 3D GLB models in the Pascal editor.
 */
const CATALOG_ITEMS_FOR_PROMPT = [
  // Dining
  { id: "dining-table", desc: "Dining table (2.5m x 1.0m), seats 4-6 people" },
  { id: "dining-chair", desc: "Chair (0.5m x 0.5m), place around dining-tables" },
  { id: "coffee-table", desc: "Coffee table (2.0m x 1.5m), for lounge areas" },
  { id: "sofa", desc: "Sofa (2.5m x 1.5m), for lounge/waiting areas" },
  { id: "lounge-chair", desc: "Lounge chair (1.0m x 1.5m), for lounge areas" },
  { id: "stool", desc: "Bar stool (1.0m x 1.0m), place at counters/bars" },
  // Kitchen
  { id: "kitchen-counter", desc: "Kitchen counter (2.0m x 1.0m), place along walls" },
  { id: "kitchen-cabinet", desc: "Kitchen cabinet (2.0m x 1.0m), wall storage" },
  { id: "kitchen", desc: "Full kitchen unit (2.5m x 1.0m)" },
  { id: "stove", desc: "Stove/cooker (1.0m x 1.0m)" },
  { id: "fridge", desc: "Refrigerator (1.0m x 1.0m)" },
  { id: "microwave", desc: "Microwave (1.0m x 0.5m)" },
  { id: "coffee-machine", desc: "Coffee machine (0.5m x 0.5m)" },
  // Bathroom
  { id: "toilet", desc: "Toilet (1.0m x 1.0m)" },
  { id: "bathroom-sink", desc: "Bathroom sink (2.0m x 1.5m)" },
  // Decor & fixtures
  { id: "coat-rack", desc: "Coat rack (0.5m x 0.5m), for entrance/hallway" },
  { id: "trash-bin", desc: "Trash bin (0.5m x 0.5m)" },
  { id: "indoor-plant", desc: "Indoor plant (1.0m x 1.0m), decorative" },
  { id: "floor-lamp", desc: "Floor lamp (1.0m x 1.0m)" },
  { id: "bookshelf", desc: "Bookshelf (1.0m x 0.5m), for storage/decor" },
  { id: "wine-bottle", desc: "Wine bottle display (0.5m x 0.5m), for bar decor" },
  // Outdoor
  { id: "patio-umbrella", desc: "Patio umbrella (0.5m x 0.5m), for terraces" },
  // Office
  { id: "office-table", desc: "Office table (2.0m x 1.0m)" },
  { id: "office-chair", desc: "Office chair (1.0m x 1.0m)" },
] as const;

function buildCatalogPrompt(): string {
  const lines = CATALOG_ITEMS_FOR_PROMPT.map((item) => {
    // Verify item exists in catalog at build time
    const asset = getCatalogAsset(item.id);
    if (!asset) return `- ${item.id}: ${item.desc}`;
    const [w, , d] = asset.dimensions;
    return `- ${item.id}: ${item.desc} [${w}m x ${d}m footprint]`;
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Zone types prompt builder
// ---------------------------------------------------------------------------

function buildZoneTypesPrompt(): string {
  const validZoneTypes = Array.from(VALID_ZONE_TYPES);
  const descriptions: Record<string, string> = {
    dining_area: "Main eating area with tables and chairs",
    bar_area: "Bar counter area with stools, drinks equipment",
    kitchen: "Professional kitchen with cooking equipment",
    storage: "Storage room for supplies",
    terrace: "Outdoor seating area (placed at negative y, in front of building)",
    entrance: "Entrance/reception area near y=0",
    restroom: "Toilet facilities",
    office: "Back office / management area",
    prep_area: "Food preparation area separate from main kitchen",
    walk_in_cooler: "Cold storage room",
    seating_outside: "Outdoor seating (garden/patio)",
    hallway: "Connecting corridor between zones",
  };
  return validZoneTypes
    .map((t) => `- ${t}: ${descriptions[t] ?? t.replace(/_/g, " ")}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

function buildPrompt(input: GenerateFloorPlanInput): string {
  const type = typeLabels[input.propertyType] || input.propertyType.toLowerCase();
  const widthEstimate = Math.round(Math.sqrt(input.surfaceTotal) * 1.2);
  const lengthEstimate = Math.round(input.surfaceTotal / widthEstimate);
  const seating = input.seatingCapacityInside;
  const seatingText = seating ? `${seating} zitplaatsen` : "not specified";
  const tablesNeeded = seating ? Math.ceil(seating / 4) : null;

  return `You are an expert horeca floor plan architect. You generate detailed, realistic floor plans for hospitality venues.

The user wants to create a floor plan for a **${type}**.

## User Description
"${input.description}"

## Property Constraints
- Total surface: ${input.surfaceTotal} m2
- Estimated building dimensions: approx ${widthEstimate}m wide x ${lengthEstimate}m deep
- Seating capacity inside: ${seatingText}${tablesNeeded ? ` (= ${tablesNeeded} dining tables + ${seating} chairs)` : ""}

## Available Zone Types
${buildZoneTypesPrompt()}

## Available Furniture (use these exact catalogId values)
${buildCatalogPrompt()}

## Seating Capacity Rules
- 1 dining-table seats 4 people. For N seats: use ceil(N/4) dining-tables + N dining-chairs.
- 1 stool per 1m of bar counter (kitchen-counter). For a 4m bar: 2 kitchen-counters + 4 stools.
- Lounge seating: 1 coffee-table + 2 lounge-chairs or 1 sofa per lounge group.

## Zone Layout Rules
- Zones MUST tile to fill the building without overlapping.
- Entrance zone near y=0 (front of building).
- Kitchen goes toward the back.
- Terrace zones go at negative y values (in front of the building).
- Zone sizes should be proportional:
  - Dining: 40-60% of total area
  - Kitchen: 15-25%
  - Restroom: 5-10%
  - Entrance: 3-8%
  - Bar/storage/office: remainder as needed

## Furniture Placement Rules
- Every zone MUST have a "furniture" array listing what goes inside.
- Use realistic quantities. A 80m2 restaurant should have 15-25 dining tables, not 5.
- Include decorative items (indoor-plant, floor-lamp) for atmosphere.
- Kitchen zones need: kitchen-counter, stove, fridge at minimum.
- Restroom zones need: toilet (2-4 depending on size), bathroom-sink.
- Entrance needs: coat-rack, indoor-plant.

## MINIMUM required zones
Every plan MUST include: entrance, dining_area, kitchen, restroom.
Optionally add: bar_area, terrace, storage, office, hallway — based on the user's description.

## Output Format
Output ONLY valid JSON. No text before or after. No markdown fences.

{
  "buildingWidth": <number in meters>,
  "buildingLength": <number in meters>,
  "zones": [
    {
      "type": "<zone_type>",
      "x": <x offset from origin>,
      "y": <y offset from origin>,
      "width": <width in meters>,
      "length": <length in meters>,
      "furniture": [
        { "catalogId": "<item-id>", "count": <number> }
      ]
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Fallback generator (when no LLM is available)
// ---------------------------------------------------------------------------

function generateFallbackPlan(input: GenerateFloorPlanInput): SceneData {
  const w = Math.round(Math.sqrt(input.surfaceTotal) * 1.2);
  const l = Math.round(input.surfaceTotal / w);
  const seats = input.seatingCapacityInside ?? 40;
  const tables = Math.ceil(seats / 4);

  const zones: LlmZone[] = [];
  let yOffset = 0;

  // Entrance
  zones.push({
    type: "entrance",
    x: 0,
    y: yOffset,
    width: w,
    length: 2,
    furniture: [
      { catalogId: "coat-rack", count: 1 },
      { catalogId: "indoor-plant", count: 2 },
    ],
  });
  yOffset += 2;

  // Restroom
  const restroomWidth = Math.min(4, Math.round(w * 0.25));
  zones.push({
    type: "restroom",
    x: 0,
    y: yOffset,
    width: restroomWidth,
    length: 3,
    furniture: [
      { catalogId: "toilet", count: 2 },
      { catalogId: "bathroom-sink", count: 1 },
      { catalogId: "trash-bin", count: 1 },
    ],
  });

  // Dining area
  const kitchenLength = Math.max(4, Math.round(l * 0.2));
  const diningLength = l - yOffset - kitchenLength;
  const diningWidth = w - restroomWidth;

  zones.push({
    type: "dining_area",
    x: restroomWidth,
    y: yOffset,
    width: diningWidth,
    length: diningLength,
    furniture: [
      { catalogId: "dining-table", count: tables },
      { catalogId: "dining-chair", count: seats },
      { catalogId: "indoor-plant", count: 2 },
      { catalogId: "floor-lamp", count: 2 },
    ],
  });
  yOffset += Math.max(diningLength, 3);

  // Kitchen
  zones.push({
    type: "kitchen",
    x: 0,
    y: yOffset,
    width: w,
    length: kitchenLength,
    furniture: [
      { catalogId: "kitchen-counter", count: 3 },
      { catalogId: "stove", count: 2 },
      { catalogId: "fridge", count: 2 },
      { catalogId: "kitchen-cabinet", count: 2 },
      { catalogId: "trash-bin", count: 1 },
    ],
  });

  return transformToSceneData({
    buildingWidth: w,
    buildingLength: l,
    zones,
    items: [],
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

  // 5. Get LLM model (never returns null -- falls back to Ollama)
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
      temperature: 0.4,
      maxOutputTokens: 8000,
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
