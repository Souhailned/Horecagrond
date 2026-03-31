"use server";

import { z } from "zod";
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { requirePermission } from "@/lib/session";
import { getModel } from "@/lib/ai/model";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUserGenerate, incrementAiEditCount } from "@/app/actions/ai-quota";
import {
  transformToSceneData,
  VALID_ZONE_TYPES,
  type LlmZone,
} from "@/lib/editor/ai-transform";
import { getCatalogAsset } from "@/lib/editor/catalog-lookup";
import { SceneBuilder } from "@/lib/editor/scene-builder";
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
    terrace: "Outdoor seating area (placed at negative z, in front of building)",
    entrance: "Entrance/reception area near z=0",
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
// Agent prompt
// ---------------------------------------------------------------------------

function buildPrompt(input: GenerateFloorPlanInput): string {
  const type = typeLabels[input.propertyType] || input.propertyType.toLowerCase();
  const widthEstimate = Math.round(Math.sqrt(input.surfaceTotal) * 1.2);
  const lengthEstimate = Math.round(input.surfaceTotal / widthEstimate);
  const seating = input.seatingCapacityInside;
  const seatingText = seating ? `${seating} seats` : "not specified";
  const tablesNeeded = seating ? Math.ceil(seating / 4) : null;

  return `Create a floor plan for a **${type}** with:
- Total surface: ${input.surfaceTotal} m2
- Estimated building: ~${widthEstimate}m wide (X) x ${lengthEstimate}m deep (Z)
- Seating: ${seatingText}${tablesNeeded ? ` (= ${tablesNeeded} dining tables + ${seating} chairs)` : ""}
- User description: "${input.description}"

Follow these steps exactly:

STEP 1: Create walls (perimeter + interior walls)
- Call create_walls ONCE with ALL wall segments.
- Perimeter: 4 outer walls forming the building rectangle from (0,0) to (${widthEstimate}, ${lengthEstimate}).
- Interior: add wall segments that divide zones (between kitchen and dining, between restroom and dining, etc.)

STEP 2: Create zones
- Call create_zone for EACH zone.
- Zones must tile within the building bounds without overlapping.
- REQUIRED zones: entrance, dining_area, kitchen, restroom.
- Optional: bar_area, terrace, storage, office, hallway based on user description.
- Zone proportions: dining 40-60%, kitchen 15-25%, restroom 5-10%, entrance 3-8%.
- Entrance near z=0 (front). Kitchen toward back (higher z). Terrace at negative z values.

STEP 3: Place furniture in each zone
- Use place_table_with_chairs for dining tables with chairs.
- Use place_furniture_row for items in a line (bar stools, kitchen equipment along wall).
- Use place_furniture for individual items.
- Quantity rules:
  * 1 dining-table seats 4 people. For ${seating ?? 40} seats: ${tablesNeeded ?? 10} tables + ${seating ?? 40} chairs.
  * Kitchen: at least 2 kitchen-counter, 1 stove, 1 fridge, 1 kitchen-cabinet.
  * Restroom: 2-4 toilet, 1 bathroom-sink.
  * Entrance: 1 coat-rack, 1-2 indoor-plant.
  * Add decorative items (indoor-plant, floor-lamp) for atmosphere.
- Spacing: keep 1m+ between furniture groups. Tables need ~3m between centers.

STEP 4: Verify
- Call get_scene_summary to check your work.
- Ensure wall count > 4, all required zones exist, item count is realistic.`;
}

// ---------------------------------------------------------------------------
// Agent instructions (system prompt)
// ---------------------------------------------------------------------------

function buildInstructions(): string {
  return `You are an expert horeca (hospitality) floor plan architect. You build realistic floor plans step by step using the tools provided.

## Coordinate System
- X axis: width (left to right)
- Z axis: depth (front to back)
- Origin (0,0) is the front-left corner of the building
- All positions are in METERS

## Available Zone Types
${buildZoneTypesPrompt()}

## Available Furniture Catalog (use these exact IDs)
${buildCatalogPrompt()}

## Seating Capacity Rules
- 1 dining-table seats 4 people. For N seats: ceil(N/4) dining-tables + N chairs.
- 1 stool per 1m of bar counter. A 4m bar: 2 kitchen-counters + 4 stools.
- Lounge seating: 1 coffee-table + 2 lounge-chairs or 1 sofa per group.

## Placement Guidelines
- Always place dining tables using place_table_with_chairs (it handles chair arrangement).
- Place kitchen equipment along walls using place_furniture_row.
- Place individual items (plants, lamps, coat racks) using place_furniture.
- Keep furniture INSIDE zone boundaries with at least 0.5m margin from walls.
- Tables should be spaced ~3m apart (center to center).

## Important
- Call create_walls ONCE with ALL walls in the first step.
- Call create_zone once per zone in the second step.
- Place furniture zone by zone in the third step.
- Always call get_scene_summary at the end to verify.
- Do NOT explain your reasoning. Just call the tools.`;
}

// ---------------------------------------------------------------------------
// Fallback generator (when agent fails or model lacks tool support)
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
  input: z.input<typeof generateFloorPlanSchema>,
): Promise<ActionResult<SceneData>> {
  // 1. Permission check
  const authCheck = await requirePermission("properties:edit-own");
  if (!authCheck.success) {
    return { success: false, error: authCheck.error };
  }

  // 2. Rate limiting
  const rateLimit = await checkRateLimit(authCheck.data!.userId, "ai");
  if (!rateLimit.success) {
    return {
      success: false,
      error: "Te veel verzoeken. Probeer het later opnieuw.",
    };
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

  // 5. Get LLM model
  const modelResult = await getModel();

  // If the model does not support tools, fall back to deterministic plan
  if (!modelResult.supportsTools) {
    console.warn("AI floor plan: model does not support tools, using fallback");
    const fallback = generateFallbackPlan(validInput);
    return { success: true, data: fallback };
  }

  // 6. Generate floor plan via ToolLoopAgent
  try {
    const builder = new SceneBuilder();

    const agent = new ToolLoopAgent({
      model: modelResult.model,
      instructions: buildInstructions(),
      maxOutputTokens: 8192,
      temperature: 0.3,

      tools: {
        create_walls: tool({
          description:
            "Create wall segments for the floor plan. Call ONCE with ALL walls (perimeter + interior).",
          inputSchema: z.object({
            walls: z.array(
              z.object({
                startX: z.number().describe("Start X coordinate in meters"),
                startZ: z.number().describe("Start Z coordinate in meters"),
                endX: z.number().describe("End X coordinate in meters"),
                endZ: z.number().describe("End Z coordinate in meters"),
              }),
            ),
          }),
          execute: async ({ walls }) => {
            const ids: string[] = [];
            for (const w of walls) {
              const id = builder.createWall(
                [w.startX, w.startZ],
                [w.endX, w.endZ],
              );
              ids.push(id);
            }
            return { created: ids.length, wallIds: ids };
          },
        }),

        create_zone: tool({
          description:
            "Create a zone (room/area) in the floor plan. Call once per zone.",
          inputSchema: z.object({
            type: z
              .string()
              .describe(
                "Zone type: dining_area, bar_area, kitchen, storage, terrace, entrance, restroom, office, prep_area, walk_in_cooler, seating_outside, hallway",
              ),
            x: z.number().describe("X position in meters from origin"),
            z: z.number().describe("Z position in meters from origin"),
            width: z.number().describe("Width in meters (X direction)"),
            length: z.number().describe("Length in meters (Z direction)"),
            name: z.string().optional().describe("Display name for the zone"),
          }),
          execute: async ({
            type,
            x,
            z: zPos,
            width,
            length,
            name,
          }) => {
            const id = builder.createZone(type, x, zPos, width, length, name);
            return { id, type, area: width * length };
          },
        }),

        place_furniture: tool({
          description:
            "Place a single furniture item from the catalog at a specific position.",
          inputSchema: z.object({
            catalogId: z.string().describe("Item ID from the catalog"),
            x: z.number().describe("X position in meters"),
            z: z.number().describe("Z position in meters"),
            rotation: z
              .number()
              .optional()
              .describe("Y-axis rotation in degrees (0, 90, 180, 270)"),
          }),
          execute: async ({ catalogId, x, z: zPos, rotation }) => {
            const id = builder.placeItem(
              catalogId,
              x,
              zPos,
              rotation ? (rotation * Math.PI) / 180 : 0,
            );
            return id
              ? { id, catalogId }
              : { error: `Unknown catalog item: ${catalogId}` };
          },
        }),

        place_furniture_row: tool({
          description:
            "Place multiple items in a row/line. Use for tables with chairs, bar stools along counter, kitchen equipment along wall.",
          inputSchema: z.object({
            catalogId: z.string().describe("Item ID from the catalog"),
            count: z.number().describe("How many items to place"),
            startX: z.number().describe("Starting X position in meters"),
            startZ: z.number().describe("Starting Z position in meters"),
            spacingX: z
              .number()
              .default(0)
              .describe("Spacing between items in X direction (meters)"),
            spacingZ: z
              .number()
              .default(0)
              .describe("Spacing between items in Z direction (meters)"),
            rotation: z
              .number()
              .optional()
              .describe("Rotation in degrees"),
          }),
          execute: async ({
            catalogId,
            count,
            startX,
            startZ,
            spacingX,
            spacingZ,
            rotation,
          }) => {
            const ids: string[] = [];
            const safeCount = Math.min(count, 50); // safety cap
            for (let i = 0; i < safeCount; i++) {
              const id = builder.placeItem(
                catalogId,
                startX + i * spacingX,
                startZ + i * spacingZ,
                rotation ? (rotation * Math.PI) / 180 : 0,
              );
              if (id) ids.push(id);
            }
            return { placed: ids.length };
          },
        }),

        place_table_with_chairs: tool({
          description:
            "Place a dining table with chairs arranged around it. Best for dining areas.",
          inputSchema: z.object({
            x: z.number().describe("Table center X position in meters"),
            z: z.number().describe("Table center Z position in meters"),
            chairs: z
              .number()
              .min(2)
              .max(8)
              .default(4)
              .describe("Number of chairs (2-8)"),
            tableType: z
              .enum(["dining-table", "coffee-table"])
              .default("dining-table")
              .describe("Type of table"),
          }),
          execute: async ({ x, z: zPos, chairs, tableType }) => {
            // Place the table
            const tableId = builder.placeItem(tableType, x, zPos);
            if (!tableId) return { error: "Table not found in catalog" };

            // Calculate chair offsets based on table dimensions
            const asset = getCatalogAsset(tableType);
            const tw = asset ? asset.dimensions[0] / 2 + 0.4 : 1.5;
            const td = asset ? asset.dimensions[2] / 2 + 0.4 : 0.8;

            // 8 possible chair positions: 4 cardinal + 4 diagonal
            const chairPositions: [number, number, number][] = [
              [x - tw, zPos, 90], // left
              [x + tw, zPos, -90], // right
              [x, zPos - td, 0], // front
              [x, zPos + td, 180], // back
              [x - tw, zPos - td, 45], // front-left
              [x + tw, zPos - td, -45], // front-right
              [x - tw, zPos + td, 135], // back-left
              [x + tw, zPos + td, -135], // back-right
            ];

            let placed = 0;
            for (
              let i = 0;
              i < Math.min(chairs, chairPositions.length);
              i++
            ) {
              const [cx, cz, rot] = chairPositions[i];
              const id = builder.placeItem(
                "dining-chair",
                cx,
                cz,
                (rot * Math.PI) / 180,
              );
              if (id) placed++;
            }

            return { tableId, chairsPlaced: placed };
          },
        }),

        get_scene_summary: tool({
          description:
            "Get a summary of the current scene being built. Use to verify progress.",
          inputSchema: z.object({}),
          execute: async () => builder.getSceneSummary(),
        }),
      },

      stopWhen: stepCountIs(30),
    });

    const result = await agent.generate({
      prompt: buildPrompt(validInput),
      timeout: { totalMs: 120_000 },
    });

    // Verify the agent produced a non-empty scene
    const summary = builder.getSceneSummary();
    if (summary.wallCount === 0 && summary.zoneCount === 0) {
      console.warn(
        "AI floor plan agent produced empty scene, using fallback. Steps:",
        result.steps.length,
      );
      const fallback = generateFallbackPlan(validInput);
      return { success: true, data: fallback };
    }

    const sceneData = builder.toSceneData();

    // 7. Track quota (fire-and-forget)
    incrementAiEditCount(authCheck.data!.userId).catch(() => {});

    // 8. Log AI usage (fire-and-forget)
    const modelName = process.env.GROQ_API_KEY
      ? "llama-3.3-70b-versatile"
      : process.env.OPENAI_API_KEY
        ? "gpt-4o-mini"
        : "ollama";

    prisma.aiUsageLog
      .create({
        data: {
          userId: authCheck.data!.userId,
          service: process.env.GROQ_API_KEY
            ? "groq"
            : process.env.OPENAI_API_KEY
              ? "openai"
              : "ollama",
          model: modelName,
          feature: "floor-plan-generate-agent",
          costCents: 0,
          status: "success",
        },
      })
      .catch(() => {});

    return { success: true, data: sceneData };
  } catch (error) {
    console.error("AI floor plan agent failed:", error);
    // Fallback to deterministic plan on any error
    const fallback = generateFallbackPlan(validInput);
    return { success: true, data: fallback };
  }
}
