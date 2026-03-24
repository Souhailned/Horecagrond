"use server";

import { z } from "zod";
import { generateText } from "ai";
import { requirePermission } from "@/lib/session";
import type { ActionResult } from "@/types/actions";
import type {
  SceneData,
  ZoneNode,
  WallNode,
  ItemNode,
  HorecaZoneType,
  HorecaItemType,
  AnyNode,
} from "@/lib/editor/schema";
import {
  ZONE_COLORS,
  ITEM_DEFAULTS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "@/lib/editor/schema";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const scanFloorPlanImageSchema = z.object({
  imageUrl: z.string().min(1, "Afbeelding is verplicht"),
  surfaceTotal: z.number().min(10).max(10000).optional(),
});

// ---------------------------------------------------------------------------
// Vision model resolution (Groq llama-4-scout primary, OpenAI gpt-4o-mini fallback)
// ---------------------------------------------------------------------------

async function getVisionModel() {
  if (process.env.GROQ_API_KEY) {
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq("meta-llama/llama-4-scout-17b-16e-instruct");
  }
  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4o-mini");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Valid zone / item types (for filtering LLM output)
// ---------------------------------------------------------------------------

const VALID_ZONE_TYPES = new Set<string>([
  "dining_area",
  "bar_area",
  "kitchen",
  "storage",
  "terrace",
  "entrance",
  "restroom",
  "office",
  "prep_area",
  "walk_in_cooler",
  "seating_outside",
  "hallway",
]);

const VALID_ITEM_TYPES = new Set<string>([
  "table_round",
  "table_square",
  "table_long",
  "chair",
  "barstool",
  "bar_counter",
  "kitchen_counter",
  "oven",
  "stove",
  "fridge",
  "sink",
  "coffee_machine",
  "display_case",
  "register",
  "booth",
  "planter",
  "parasol",
]);

// ---------------------------------------------------------------------------
// LLM response types
// ---------------------------------------------------------------------------

interface LlmZone {
  type: string;
  x: number;
  y: number;
  width: number;
  length: number;
}

interface LlmItem {
  type: string;
  x: number;
  y: number;
  rotation?: number;
}

interface LlmFloorPlan {
  buildingWidth: number;
  buildingLength: number;
  zones: LlmZone[];
  items: LlmItem[];
}

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
// Parse LLM JSON response (robust)
// ---------------------------------------------------------------------------

function parseLlmResponse(text: string): LlmFloorPlan | null {
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Find the first { ... } block
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  jsonStr = jsonStr.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonStr);

    if (
      typeof parsed.buildingWidth !== "number" ||
      typeof parsed.buildingLength !== "number" ||
      !Array.isArray(parsed.zones)
    ) {
      return null;
    }

    return {
      buildingWidth: parsed.buildingWidth,
      buildingLength: parsed.buildingLength,
      zones: Array.isArray(parsed.zones) ? parsed.zones : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transform LLM output -> SceneData
// ---------------------------------------------------------------------------

function transformToSceneData(plan: LlmFloorPlan): SceneData {
  const nodes: Record<string, AnyNode> = {};
  const rootNodeIds: string[] = [];

  const id = () => crypto.randomUUID();

  // --- Perimeter walls ---
  const w = plan.buildingWidth;
  const l = plan.buildingLength;
  const t = DEFAULT_WALL_THICKNESS;
  const h = DEFAULT_WALL_HEIGHT;

  const perimeterSegments: { start: [number, number]; end: [number, number] }[] = [
    { start: [0, 0], end: [w, 0] },       // bottom
    { start: [w, 0], end: [w, l] },        // right
    { start: [w, l], end: [0, l] },        // top
    { start: [0, l], end: [0, 0] },        // left
  ];

  for (const seg of perimeterSegments) {
    const wallId = id();
    const wall: WallNode = {
      id: wallId,
      type: "wall",
      parentId: null,
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      start: seg.start,
      end: seg.end,
      thickness: t,
      height: h,
      material: "brick",
    };
    nodes[wallId] = wall;
    rootNodeIds.push(wallId);
  }

  // --- Zones ---
  for (const z of plan.zones) {
    if (!VALID_ZONE_TYPES.has(z.type)) continue;

    const zoneType = z.type as HorecaZoneType;
    const zoneId = id();
    const zw = Math.max(z.width, 1);
    const zl = Math.max(z.length, 1);
    const zx = z.x;
    const zy = z.y;

    const polygon: [number, number][] = [
      [zx, zy],
      [zx + zw, zy],
      [zx + zw, zy + zl],
      [zx, zy + zl],
    ];

    const zone: ZoneNode = {
      id: zoneId,
      type: "zone",
      parentId: null,
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      zoneType,
      polygon,
      area: zw * zl,
      color: ZONE_COLORS[zoneType],
    };
    nodes[zoneId] = zone;
    rootNodeIds.push(zoneId);
  }

  // --- Items ---
  for (const item of plan.items) {
    if (!VALID_ITEM_TYPES.has(item.type)) continue;

    const itemType = item.type as HorecaItemType;
    const defaults = ITEM_DEFAULTS[itemType];
    const itemId = id();
    const rotY = item.rotation === 90 ? Math.PI / 2 : 0;

    const itemNode: ItemNode = {
      id: itemId,
      type: "item",
      parentId: null,
      visible: true,
      position: [item.x, 0, item.y],
      rotation: [0, rotY, 0],
      itemType,
      width: defaults.width,
      depth: defaults.depth,
      height: defaults.height,
    };
    nodes[itemId] = itemNode;
    rootNodeIds.push(itemId);
  }

  return { nodes, rootNodeIds };
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

  // 2. Validate input
  const parsed = scanFloorPlanImageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Ongeldige invoer: controleer de afbeeldings-URL.",
    };
  }

  const { imageUrl, surfaceTotal } = parsed.data;

  // 3. Get vision model
  const model = await getVisionModel();
  if (!model) {
    return {
      success: false,
      error: "Geen AI model beschikbaar. Configureer GROQ_API_KEY of OPENAI_API_KEY.",
    };
  }

  // 4. Analyze floor plan image via vision model
  try {
    const prompt = buildVisionPrompt(surfaceTotal);

    const { text } = await generateText({
      model,
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

    // 5. Parse LLM response
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

    // 6. Validate that we got at least one zone
    if (llmPlan.zones.length === 0) {
      return {
        success: false,
        error:
          "Kon geen ruimtes herkennen in de plattegrond. Probeer een duidelijkere foto.",
      };
    }

    // 7. Transform to SceneData
    const sceneData = transformToSceneData(llmPlan);
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
