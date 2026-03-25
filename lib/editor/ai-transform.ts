/**
 * Shared types, constants, and transformation logic for AI floor plan generation.
 *
 * Used by both `ai-floor-plan.ts` (text-based generation) and
 * `ai-floor-plan-vision.ts` (image-based vision analysis).
 */

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
// Valid zone / item types (for filtering LLM output)
// ---------------------------------------------------------------------------

export const VALID_ZONE_TYPES = new Set<string>([
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

export const VALID_ITEM_TYPES = new Set<string>([
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
// LLM response types (what we expect back from the model)
// ---------------------------------------------------------------------------

export interface LlmZone {
  type: string;
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface LlmItem {
  type: string;
  x: number;
  y: number;
  rotation?: number;
}

export interface LlmFloorPlan {
  buildingWidth: number;
  buildingLength: number;
  zones: LlmZone[];
  items: LlmItem[];
}

// ---------------------------------------------------------------------------
// Parse LLM JSON response (robust)
// ---------------------------------------------------------------------------

export function parseLlmResponse(text: string): LlmFloorPlan | null {
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

    // Basic validation
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

export function transformToSceneData(plan: LlmFloorPlan): SceneData {
  const nodes: Record<string, AnyNode> = {};
  const rootNodeIds: string[] = [];

  const id = () => crypto.randomUUID();

  // --- Perimeter walls ---
  const w = plan.buildingWidth;
  const l = plan.buildingLength;
  const t = DEFAULT_WALL_THICKNESS;
  const h = DEFAULT_WALL_HEIGHT;

  const perimeterSegments: {
    start: [number, number];
    end: [number, number];
  }[] = [
    { start: [0, 0], end: [w, 0] }, // bottom
    { start: [w, 0], end: [w, l] }, // right
    { start: [w, l], end: [0, l] }, // top
    { start: [0, l], end: [0, 0] }, // left
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
