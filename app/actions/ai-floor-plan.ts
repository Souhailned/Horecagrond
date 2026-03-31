"use server";

import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
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

STEP 1: Create walls (perimeter + interior)
- Call create_walls ONCE with ALL wall segments.
- Perimeter: 4 outer walls forming the building rectangle from (0,0) to (${widthEstimate}, ${lengthEstimate}).
- Interior: walls ONLY where physical separation is needed.
  - Restroom MUST be enclosed (walls on all sides).
  - Storage/office MUST be enclosed.
  - Kitchen: add wall ONLY if it is NOT described as "open kitchen". Open kitchens have NO wall toward dining.
  - Bar area: typically NO wall toward dining (open flow).
- SAVE the returned wallIds — you need them for doors and windows.

STEP 2: Create zones
- Call create_zone for EACH zone.
- Zones must tile within the building bounds without overlapping.
- REQUIRED zones: entrance, dining_area, kitchen, restroom.
- Optional: bar_area, terrace, storage, office, hallway based on user description.
- Zone proportions: dining 40-60%, kitchen 15-25%, restroom 5-10%, entrance 3-8%.
- Entrance near z=0 (front). Kitchen toward back (higher z). Terrace at negative z values.

STEP 3: Place doors and windows
- DOORS: Every interior wall separating two zones needs a door.
  - Entrance wall: create_door with position 0.5, style "double".
  - Restroom walls: create_door with position 0.5, style "single".
  - Kitchen wall (if present): create_door with position 0.5, width 1.2.
  - Storage/office walls: create_door with position 0.5, style "single".
- WINDOWS: Exterior (perimeter) walls need windows.
  - Front wall: 1-2 windows flanking the entrance door (positions ~0.2 and ~0.8).
  - Side walls (dining area): large windows (width 1.5-2.0), evenly spaced.
  - Back wall (kitchen): 1 smaller window (width 0.8).
  - Do NOT put windows on interior walls.

STEP 4: Place furniture in each zone
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

STEP 5: Verify
- Call get_scene_summary to check your work.
- Ensure: walls > 4, doors > 0 (entrance + interior), windows > 0 (exterior walls), all required zones exist, item count is realistic.`;
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

## Wall Placement Rules
- YOU decide where walls go. Think like an architect.
- Perimeter walls: 4 outer walls forming the building rectangle.
- Interior walls: ONLY where physical separation is needed.
- Do NOT place walls between:
  - Open kitchen and dining area (open concept)
  - Bar area and dining area (they flow into each other)
  - Hallway and connected spaces (open passage)
- DO place walls between:
  - Kitchen and dining (unless described as "open kitchen")
  - Restrooms and any other zone (always enclosed)
  - Storage and public areas (always enclosed)
  - Office and public areas (privacy)
- The create_walls tool returns wall IDs — save these for placing doors and windows.

## Door Placement Rules
- Every interior wall that separates two zones MUST have a door.
- The entrance wall MUST have a door (position 0.5, style "double" for main entrance).
- Restroom zones need doors on their connecting walls.
- Kitchen-to-dining door if there is a wall between them.
- Position is 0-1 along the wall (0.5 = center). Use 0.3-0.7 range for natural placement.
- Standard door width: 0.9m (single), 1.5m (double for entrance/kitchen).

## Window Placement Rules
- Exterior (perimeter) walls should have windows for natural light.
- Dining area walls: large windows (width 1.5-2.0m).
- Kitchen exterior wall: smaller window (width 0.8-1.0m).
- Restroom exterior wall: small high window (width 0.6m) or none.
- Entrance front wall: windows flanking the door.
- Back wall (kitchen side): fewer/smaller windows.
- Do NOT place windows on interior walls.
- Position is 0-1 along the wall. Space windows evenly (e.g., 0.25 and 0.75 for two windows).

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
- Call create_walls ONCE with ALL walls in step 1. Save the returned wall IDs.
- Call create_zone once per zone in step 2.
- Place doors and windows on walls in step 3. Use the wall IDs from step 1.
- Place furniture zone by zone in step 4.
- Always call get_scene_summary at the end to verify.
- Verify: doors > 0, windows > 0, all required zones exist.
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

  // 6. Generate floor plan via sequential phased generateText calls.
  //    Each phase gets ONLY the relevant tools, so the LLM cannot skip steps.
  try {
    const builder = new SceneBuilder();
    const model = modelResult.model;
    const systemPrompt = buildInstructions();

    // ── Tool definitions (shared across phases) ─────────────────────────
    const wallTool = tool({
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
    });

    const zoneTool = tool({
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
      execute: async ({ type, x, z: zPos, width, length, name }) => {
        const id = builder.createZone(type, x, zPos, width, length, name);
        return { id, type, area: width * length };
      },
    });

    const doorTool = tool({
      description:
        "Place a door on a wall. Required at zone transitions and entrance.",
      inputSchema: z.object({
        wallId: z.string().describe("ID of the wall to place the door on"),
        position: z
          .number()
          .min(0)
          .max(1)
          .describe("Position along wall 0-1 (0.5 = center)"),
        width: z
          .number()
          .optional()
          .describe("Door width in meters (default 0.9)"),
        style: z
          .enum(["single", "double", "sliding", "opening"])
          .optional()
          .describe("Door style (default single)"),
      }),
      execute: async ({ wallId, position, width, style }) => {
        const id = builder.createDoor(wallId, position, { width, style });
        return id
          ? { id, wallId, position }
          : { error: `Invalid wall ID: ${wallId}` };
      },
    });

    const windowTool = tool({
      description:
        "Place a window on a wall. Use on exterior (perimeter) walls.",
      inputSchema: z.object({
        wallId: z.string().describe("ID of the wall to place the window on"),
        position: z
          .number()
          .min(0)
          .max(1)
          .describe("Position along wall 0-1 (0.5 = center)"),
        width: z
          .number()
          .optional()
          .describe("Window width in meters (default 1.2)"),
        height: z
          .number()
          .optional()
          .describe("Window height in meters (default 1.2)"),
      }),
      execute: async ({ wallId, position, width, height }) => {
        const id = builder.createWindow(wallId, position, { width, height });
        return id
          ? { id, wallId, position }
          : { error: `Invalid wall ID: ${wallId}` };
      },
    });

    const furnitureTool = tool({
      description: "Place a single furniture item at a specific position.",
      inputSchema: z.object({
        catalogId: z.string().describe("Item ID from the catalog"),
        x: z.number().describe("X position in meters"),
        z: z.number().describe("Z position in meters"),
        rotation: z
          .number()
          .optional()
          .describe("Y-axis rotation in degrees"),
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
    });

    const furnitureRowTool = tool({
      description: "Place multiple items in a row/line.",
      inputSchema: z.object({
        catalogId: z.string().describe("Item ID from the catalog"),
        count: z.number().describe("How many items to place"),
        startX: z.number().describe("Starting X position"),
        startZ: z.number().describe("Starting Z position"),
        spacingX: z.number().default(0).describe("X spacing between items"),
        spacingZ: z.number().default(0).describe("Z spacing between items"),
        rotation: z.number().optional().describe("Rotation in degrees"),
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
        const safeCount = Math.min(count, 50);
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
    });

    const tableWithChairsTool = tool({
      description: "Place a dining table with chairs arranged around it.",
      inputSchema: z.object({
        x: z.number().describe("Table center X position"),
        z: z.number().describe("Table center Z position"),
        chairs: z.number().min(2).max(8).default(4).describe("Number of chairs"),
        tableType: z
          .enum(["dining-table", "coffee-table"])
          .default("dining-table"),
      }),
      execute: async ({ x, z: zPos, chairs, tableType }) => {
        const tableId = builder.placeItem(tableType, x, zPos);
        if (!tableId) return { error: "Table not found in catalog" };
        const asset = getCatalogAsset(tableType);
        const tw = asset ? asset.dimensions[0] / 2 + 0.4 : 1.5;
        const td = asset ? asset.dimensions[2] / 2 + 0.4 : 0.8;
        const chairPos: [number, number, number][] = [
          [x - tw, zPos, 90],
          [x + tw, zPos, -90],
          [x, zPos - td, 0],
          [x, zPos + td, 180],
          [x - tw, zPos - td, 45],
          [x + tw, zPos - td, -45],
          [x - tw, zPos + td, 135],
          [x + tw, zPos + td, -135],
        ];
        let placed = 0;
        for (let i = 0; i < Math.min(chairs, chairPos.length); i++) {
          const [cx, cz, rot] = chairPos[i];
          if (builder.placeItem("dining-chair", cx, cz, (rot * Math.PI) / 180))
            placed++;
        }
        return { tableId, chairsPlaced: placed };
      },
    });

    const basePrompt = buildPrompt(validInput);

    // ── Phase 1: WALLS ──────────────────────────────────────────────────
    await generateText({
      model,
      system: systemPrompt,
      prompt: `${basePrompt}\n\nYou are in PHASE 1: WALLS ONLY.\nCreate ALL walls now (perimeter + interior). Call create_walls ONCE.\nDo NOT explain — just call the tool.`,
      tools: { create_walls: wallTool },
      maxOutputTokens: 4096,
      temperature: 0.3,
      stopWhen: stepCountIs(3),
    });

    // ── Phase 2: ZONES ──────────────────────────────────────────────────
    const afterWalls = builder.getSceneSummary();
    await generateText({
      model,
      system: systemPrompt,
      prompt: `${basePrompt}\n\nYou are in PHASE 2: ZONES ONLY.\nWalls created: ${afterWalls.wallCount}.\nNow create ALL zones. Call create_zone for each zone.\nRequired: entrance, dining_area, kitchen, restroom.\nOptional: bar_area, terrace, storage, office based on description.\nDo NOT explain — just call the tools.`,
      tools: { create_zone: zoneTool },
      maxOutputTokens: 4096,
      temperature: 0.3,
      stopWhen: stepCountIs(10),
    });

    // ── Phase 3: DOORS & WINDOWS ────────────────────────────────────────
    const afterZones = builder.getSceneSummary();
    const wallList = afterZones.walls
      .map((w) => w.id)
      .join(", ");
    await generateText({
      model,
      system: systemPrompt,
      prompt: `${basePrompt}\n\nYou are in PHASE 3: DOORS AND WINDOWS ONLY.
Current scene: ${afterZones.wallCount} walls, ${afterZones.zoneCount} zones.
Available wall IDs: [${wallList}]

ADD DOORS:
- Entrance wall needs a double door (position 0.5, style "double")
- Every interior wall between zones needs a single door (position 0.5)
- At minimum create 3-5 doors

ADD WINDOWS:
- Front perimeter wall: 1-2 large windows (width 1.5)
- Side perimeter walls: 2-3 windows each (width 1.2)
- Back wall: 1 small window (width 0.8)
- Do NOT put windows on interior walls
- At minimum create 4-6 windows

Do NOT explain — just call create_door and create_window for each.`,
      tools: { create_door: doorTool, create_window: windowTool },
      maxOutputTokens: 4096,
      temperature: 0.3,
      stopWhen: stepCountIs(15),
    });

    // ── Phase 4: FURNITURE ──────────────────────────────────────────────
    const afterOpenings = builder.getSceneSummary();
    const zoneList = afterOpenings.zones
      .map((z) => `${z.type} (${z.name})`)
      .join(", ");
    await generateText({
      model,
      system: systemPrompt,
      prompt: `${basePrompt}\n\nYou are in PHASE 4: FURNITURE ONLY.
Current scene: ${afterOpenings.wallCount} walls, ${afterOpenings.doorCount} doors, ${afterOpenings.windowCount} windows, ${afterOpenings.zoneCount} zones.
Zones: ${zoneList}

Place furniture in each zone:
- Dining: use place_table_with_chairs for each table group
- Kitchen: use place_furniture_row for counters, stoves along walls
- Restroom: place_furniture for toilets, sinks
- Entrance: place_furniture for coat-rack, plants
- Add decorative items (indoor-plant, floor-lamp)

Do NOT explain — just call the tools.`,
      tools: {
        place_furniture: furnitureTool,
        place_furniture_row: furnitureRowTool,
        place_table_with_chairs: tableWithChairsTool,
      },
      maxOutputTokens: 4096,
      temperature: 0.3,
      stopWhen: stepCountIs(25),
    });

    // Verify the scene is non-empty
    const summary = builder.getSceneSummary();
    if (summary.wallCount === 0 && summary.zoneCount === 0) {
      console.warn("AI floor plan: empty scene after all phases, using fallback");
      const fallback = generateFallbackPlan(validInput);
      return { success: true, data: fallback };
    }

    console.log(
      `AI floor plan complete: ${summary.wallCount} walls, ${summary.doorCount} doors, ${summary.windowCount} windows, ${summary.zoneCount} zones, ${summary.itemCount} items`,
    );

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
