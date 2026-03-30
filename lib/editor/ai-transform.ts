/**
 * Shared types, constants, and transformation logic for AI floor plan generation.
 *
 * Used by both `ai-floor-plan.ts` (text-based generation) and
 * `ai-floor-plan-vision.ts` (image-based vision analysis).
 *
 * This module converts LLM-generated zone layouts into full SceneData
 * including walls (from zone boundaries), zones, and furniture items
 * using real Pascal editor catalog assets (GLB models).
 */

import type {
  SceneData,
  HorecaZoneType,
  AnyNode,
} from "@/lib/editor/schema";
import {
  ZONE_COLORS,
  ITEM_DEFAULTS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_LABELS,
} from "@/lib/editor/schema";
import { wrapNodesInDefaultHierarchy } from "@/lib/editor/scene-graph";
import {
  getCatalogAsset,
  HORECA_ZONE_FURNISHING,
  type CatalogAsset,
  type FurnishingItem,
} from "@/lib/editor/catalog-lookup";

// ---------------------------------------------------------------------------
// Valid zone / item types (for filtering LLM output)
// ---------------------------------------------------------------------------

export const VALID_ZONE_TYPES = new Set<string>(Object.keys(ZONE_LABELS));

/**
 * Valid item types from the Horecagrond schema.
 * Kept for backward compatibility with LLM prompts -- the AI still lists
 * these in its output, but actual 3D items are now auto-generated from the
 * Pascal catalog based on zone type (see `furnishZone`).
 */
export const VALID_ITEM_TYPES = new Set<string>(Object.keys(ITEM_DEFAULTS));

// ---------------------------------------------------------------------------
// LLM response types (what we expect back from the model)
// ---------------------------------------------------------------------------

export interface LlmZoneFurniture {
  catalogId: string;
  count: number;
}

export interface LlmZone {
  type: string;
  x: number;
  y: number;
  width: number;
  length: number;
  /** LLM-specified furniture for this zone (overrides default furnishing plan) */
  furniture?: LlmZoneFurniture[];
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

    // Preserve per-zone furniture specs from the LLM
    const zones: LlmZone[] = Array.isArray(parsed.zones)
      ? parsed.zones.map((z: Record<string, unknown>) => ({
          type: z.type as string,
          x: z.x as number,
          y: z.y as number,
          width: z.width as number,
          length: z.length as number,
          ...(Array.isArray(z.furniture) && z.furniture.length > 0
            ? {
                furniture: (z.furniture as Array<Record<string, unknown>>)
                  .filter(
                    (f) =>
                      typeof f.catalogId === "string" &&
                      typeof f.count === "number" &&
                      f.count > 0,
                  )
                  .map((f) => ({
                    catalogId: f.catalogId as string,
                    count: f.count as number,
                  })),
              }
            : {}),
        }))
      : [];

    return {
      buildingWidth: parsed.buildingWidth,
      buildingLength: parsed.buildingLength,
      zones,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _counter = 0;

function uid(): string {
  _counter++;
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${random}${_counter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Wall segment generation from zone boundaries
// ---------------------------------------------------------------------------

type Seg = { start: [number, number]; end: [number, number] };

/** Round to 2 decimals to avoid floating-point dedup issues. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Canonical key for a wall segment -- always sorted so (A->B) and (B->A) match. */
function segKey(s: Seg): string {
  const a = `${r2(s.start[0])},${r2(s.start[1])}`;
  const b = `${r2(s.end[0])},${r2(s.end[1])}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Generate wall segments from zone boundaries.
 *
 * For each zone we emit its 4 edges. Edges shared by two adjacent zones
 * are deduplicated -- the shared edge becomes one interior wall.
 * Edges on the building perimeter become exterior walls.
 *
 * This produces a realistic floor plan with rooms separated by walls.
 */
function generateWallSegments(
  zones: LlmZone[],
  buildingWidth: number,
  buildingLength: number,
): Seg[] {
  const validZones = zones.filter((z) => VALID_ZONE_TYPES.has(z.type));

  // If no valid zones, just return perimeter
  if (validZones.length === 0) {
    return [
      { start: [0, 0], end: [buildingWidth, 0] },
      { start: [buildingWidth, 0], end: [buildingWidth, buildingLength] },
      { start: [buildingWidth, buildingLength], end: [0, buildingLength] },
      { start: [0, buildingLength], end: [0, 0] },
    ];
  }

  // Collect all zone edges, deduplicate shared edges
  const edgeCounts = new Map<string, Seg>();

  for (const z of validZones) {
    const x1 = r2(z.x);
    const y1 = r2(z.y);
    const x2 = r2(z.x + Math.max(z.width, 1));
    const y2 = r2(z.y + Math.max(z.length, 1));

    const edges: Seg[] = [
      { start: [x1, y1], end: [x2, y1] }, // bottom
      { start: [x2, y1], end: [x2, y2] }, // right
      { start: [x2, y2], end: [x1, y2] }, // top
      { start: [x1, y2], end: [x1, y1] }, // left
    ];

    for (const edge of edges) {
      const key = segKey(edge);
      if (!edgeCounts.has(key)) {
        edgeCounts.set(key, edge);
      }
    }
  }

  // Also ensure we have the building perimeter
  const perimeterEdges: Seg[] = [
    { start: [0, 0], end: [buildingWidth, 0] },
    { start: [buildingWidth, 0], end: [buildingWidth, buildingLength] },
    { start: [buildingWidth, buildingLength], end: [0, buildingLength] },
    { start: [0, buildingLength], end: [0, 0] },
  ];

  for (const edge of perimeterEdges) {
    const key = segKey(edge);
    if (!edgeCounts.has(key)) {
      edgeCounts.set(key, edge);
    }
  }

  return Array.from(edgeCounts.values());
}

// ---------------------------------------------------------------------------
// Furniture placement engine
// ---------------------------------------------------------------------------

/** Usable rectangle within a zone (inset from walls) */
interface UsableRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** A placed item ready to become a node */
interface PlacedItem {
  asset: CatalogAsset;
  x: number;
  z: number;
  rotY: number;
}

/** Wall margin: distance from zone edge to usable area (meters) */
const WALL_MARGIN = 0.6;

/** Minimum usable dimension in any direction (meters) */
const MIN_USABLE = 1.0;

/**
 * Compute the usable rectangle within a zone, inset from walls.
 */
function getUsableRect(zone: LlmZone): UsableRect | null {
  const w = Math.max(zone.width, 1) - WALL_MARGIN * 2;
  const d = Math.max(zone.length, 1) - WALL_MARGIN * 2;
  if (w < MIN_USABLE || d < MIN_USABLE) return null;
  return {
    x: zone.x + WALL_MARGIN,
    z: zone.y + WALL_MARGIN,
    w,
    d,
  };
}

/**
 * Check if a point (center of item) with given dimensions fits inside
 * the usable rectangle without overlapping the boundary.
 */
function fitsInRect(
  rect: UsableRect,
  cx: number,
  cz: number,
  itemW: number,
  itemD: number,
): boolean {
  const halfW = itemW / 2;
  const halfD = itemD / 2;
  return (
    cx - halfW >= rect.x - 0.01 &&
    cx + halfW <= rect.x + rect.w + 0.01 &&
    cz - halfD >= rect.z - 0.01 &&
    cz + halfD <= rect.z + rect.d + 0.01
  );
}

/**
 * Determine how many host items to place based on density and usable area.
 */
function computeHostCount(
  item: FurnishingItem,
  usableArea: number,
): number {
  if (item.count != null) return item.count;
  if (item.density != null) return Math.max(1, Math.floor(usableArea * item.density));
  return 1;
}

/**
 * Place items in a grid layout within the usable rect.
 * Returns an array of [cx, cz] center positions.
 */
function gridPositions(
  rect: UsableRect,
  count: number,
  itemW: number,
  itemD: number,
): Array<[number, number]> {
  if (count <= 0) return [];

  // Calculate grid dimensions
  const spacingX = Math.max(itemW + 1.0, 3.0); // min 3m between centers
  const spacingZ = Math.max(itemD + 1.0, 3.0);

  const cols = Math.max(1, Math.floor(rect.w / spacingX));
  const rows = Math.max(1, Math.floor(rect.d / spacingZ));

  // Limit to requested count
  const maxItems = Math.min(count, cols * rows);
  const positions: Array<[number, number]> = [];

  // Center the grid within the usable area
  const usedW = Math.min(cols, maxItems) * spacingX;
  const usedD = Math.ceil(maxItems / cols) * spacingZ;
  const offsetX = rect.x + (rect.w - usedW) / 2 + spacingX / 2;
  const offsetZ = rect.z + (rect.d - usedD) / 2 + spacingZ / 2;

  for (let i = 0; i < maxItems; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = offsetX + col * spacingX;
    const cz = offsetZ + row * spacingZ;
    if (fitsInRect(rect, cx, cz, itemW, itemD)) {
      positions.push([cx, cz]);
    }
  }

  return positions;
}

/**
 * Place items along a wall (one of the 4 zone edges).
 * Chooses the longest wall of the zone.
 */
function wallPositions(
  rect: UsableRect,
  zone: LlmZone,
  count: number,
  asset: CatalogAsset,
): Array<{ cx: number; cz: number; rotY: number }> {
  const positions: Array<{ cx: number; cz: number; rotY: number }> = [];
  const [itemW, , itemD] = asset.dimensions;

  // Determine longest axis for wall placement
  const zoneW = Math.max(zone.width, 1);
  const zoneL = Math.max(zone.length, 1);
  const isWide = zoneW >= zoneL;

  if (isWide) {
    // Place along the bottom wall (z = zone.y + margin), facing +z
    const wallZ = rect.z;
    const spacing = Math.max(itemW + 0.3, 2.0);
    const startX = rect.x + itemW / 2;
    for (let i = 0; i < count; i++) {
      const cx = startX + i * spacing;
      if (cx + itemW / 2 > rect.x + rect.w + 0.01) break;
      positions.push({ cx, cz: wallZ + itemD / 2, rotY: 0 });
    }
  } else {
    // Place along the left wall (x = zone.x + margin), facing +x
    const wallX = rect.x;
    const spacing = Math.max(itemD + 0.3, 2.0);
    const startZ = rect.z + itemD / 2;
    for (let i = 0; i < count; i++) {
      const cz = startZ + i * spacing;
      if (cz + itemD / 2 > rect.z + rect.d + 0.01) break;
      positions.push({ cx: wallX + itemW / 2, cz, rotY: Math.PI / 2 });
    }
  }

  return positions;
}

/**
 * Place a single item in a corner of the usable rect.
 */
function cornerPosition(
  rect: UsableRect,
  cornerIndex: number,
  itemW: number,
  itemD: number,
): [number, number] {
  const hw = itemW / 2;
  const hd = itemD / 2;
  switch (cornerIndex % 4) {
    case 0: return [rect.x + hw, rect.z + hd]; // bottom-left
    case 1: return [rect.x + rect.w - hw, rect.z + hd]; // bottom-right
    case 2: return [rect.x + rect.w - hw, rect.z + rect.d - hd]; // top-right
    case 3: return [rect.x + hw, rect.z + rect.d - hd]; // top-left
    default: return [rect.x + hw, rect.z + hd];
  }
}

/**
 * Build a Pascal-compatible ItemNode object from a placed item.
 * The node uses the `asset` sub-object format that the Pascal 3D renderer expects.
 */
function buildItemNode(placed: PlacedItem): Record<string, unknown> {
  const { asset, x, z, rotY } = placed;

  return {
    object: "node",
    id: `item_${uid()}`,
    type: "item",
    parentId: null,
    visible: true,
    position: [x, 0, z] as [number, number, number],
    rotation: [0, rotY, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    children: [],
    asset: {
      id: asset.id,
      category: asset.category,
      name: asset.name,
      thumbnail: asset.thumbnail,
      src: asset.src,
      dimensions: asset.dimensions,
      offset: asset.offset,
      rotation: asset.rotation,
      scale: asset.scale,
      ...(asset.surface ? { surface: asset.surface } : {}),
      ...(asset.tags ? { tags: asset.tags } : {}),
    },
  };
}

/**
 * Place furniture for a single zone.
 *
 * If the zone has LLM-specified `furniture` specs, those are used to determine
 * WHAT items and HOW MANY. The placement algorithms (grid, wall, corner) are
 * chosen automatically based on the item's category.
 *
 * Falls back to the static `HORECA_ZONE_FURNISHING` defaults when no
 * LLM furniture spec is present.
 */
function furnishZone(zone: LlmZone): PlacedItem[] {
  const rect = getUsableRect(zone);
  if (!rect) return [];

  // If the LLM provided per-zone furniture, use that
  if (zone.furniture && zone.furniture.length > 0) {
    return furnishZoneFromLlmSpec(zone, rect);
  }

  // Otherwise fall back to static furnishing plan
  return furnishZoneFromDefaults(zone, rect);
}

/**
 * Furnish a zone using the LLM-provided furniture spec.
 * Automatically determines placement strategy based on item category and
 * uses grouping heuristics (chairs group with tables, stools with counters).
 */
function furnishZoneFromLlmSpec(zone: LlmZone, rect: UsableRect): PlacedItem[] {
  const placed: PlacedItem[] = [];
  const hostPositions = new Map<string, Array<[number, number]>>();
  let cornerCounter = 0;

  // Identify "host" items (tables, counters) vs "grouped" items (chairs, stools)
  const HOST_IDS = new Set([
    "dining-table", "coffee-table", "office-table",
    "kitchen-counter", "kitchen-cabinet", "kitchen",
  ]);
  const GROUP_MAP: Record<string, string> = {
    "dining-chair": "dining-table",
    "stool": "kitchen-counter",
    "lounge-chair": "coffee-table",
    "office-chair": "office-table",
  };
  // Items placed along walls
  const WALL_IDS = new Set([
    "kitchen-counter", "kitchen-cabinet", "kitchen", "stove", "fridge",
    "toilet", "bathroom-sink", "bookshelf",
  ]);
  // Items placed in corners
  const CORNER_IDS = new Set([
    "indoor-plant", "floor-lamp", "coat-rack", "trash-bin",
    "coffee-machine", "wine-bottle", "patio-umbrella",
  ]);

  const furnitureSpecs = zone.furniture!;

  // First pass: hosts and standalone items
  for (const spec of furnitureSpecs) {
    const asset = getCatalogAsset(spec.catalogId);
    if (!asset) continue;

    // Skip grouped items for second pass
    if (GROUP_MAP[spec.catalogId]) continue;

    const [itemW, , itemD] = asset.dimensions;
    const count = Math.min(spec.count, 50); // safety cap

    if (WALL_IDS.has(spec.catalogId)) {
      const wallPos = wallPositions(rect, zone, count, asset);
      const posArr: Array<[number, number]> = [];
      for (const wp of wallPos) {
        placed.push({ asset, x: wp.cx, z: wp.cz, rotY: wp.rotY });
        posArr.push([wp.cx, wp.cz]);
      }
      hostPositions.set(spec.catalogId, posArr);
    } else if (CORNER_IDS.has(spec.catalogId)) {
      for (let i = 0; i < count; i++) {
        const [cx, cz] = cornerPosition(rect, cornerCounter, itemW, itemD);
        cornerCounter++;
        if (fitsInRect(rect, cx, cz, itemW, itemD)) {
          placed.push({ asset, x: cx, z: cz, rotY: 0 });
        }
      }
    } else {
      // Default: grid placement (tables, etc.)
      const positions = gridPositions(rect, count, itemW, itemD);
      hostPositions.set(spec.catalogId, positions);
      for (const [cx, cz] of positions) {
        placed.push({ asset, x: cx, z: cz, rotY: 0 });
      }
    }
  }

  // Second pass: grouped items (chairs around tables, stools around counters)
  for (const spec of furnitureSpecs) {
    const groupHostId = GROUP_MAP[spec.catalogId];
    if (!groupHostId) continue;

    const asset = getCatalogAsset(spec.catalogId);
    if (!asset) continue;

    const hostPos = hostPositions.get(groupHostId);
    if (!hostPos || hostPos.length === 0) continue;

    const hostAsset = getCatalogAsset(groupHostId);
    if (!hostAsset) continue;

    const [hostW, , hostD] = hostAsset.dimensions;
    const [chairW, , chairD] = asset.dimensions;
    const perHost = hostPos.length > 0 ? Math.ceil(spec.count / hostPos.length) : spec.count;
    const baseOffset = 0.3;

    for (const [hx, hz] of hostPos) {
      const chairPos = computeChairPositions(
        hx, hz,
        hostW, hostD,
        chairW, chairD,
        perHost,
        baseOffset,
      );
      for (const cp of chairPos) {
        if (fitsInRect(rect, cp.x, cp.z, chairW, chairD)) {
          placed.push({ asset, x: cp.x, z: cp.z, rotY: cp.rotY });
        }
      }
    }
  }

  return placed;
}

/**
 * Furnish a zone using the static HORECA_ZONE_FURNISHING defaults.
 */
function furnishZoneFromDefaults(zone: LlmZone, rect: UsableRect): PlacedItem[] {
  const zoneType = zone.type as HorecaZoneType;
  const plan = HORECA_ZONE_FURNISHING[zoneType];
  if (!plan) return [];

  const usableArea = rect.w * rect.d;
  const placed: PlacedItem[] = [];

  // First pass: place "host" items (items without groupWith)
  const hostPositions = new Map<string, Array<[number, number]>>();
  let cornerCounter = 0;

  for (const fi of plan) {
    if (fi.groupWith) continue; // grouped items placed in second pass

    const asset = getCatalogAsset(fi.catalogId);
    if (!asset) continue;

    const [itemW, , itemD] = asset.dimensions;

    switch (fi.placement) {
      case "grid": {
        const count = computeHostCount(fi, usableArea);
        const positions = gridPositions(rect, count, itemW, itemD);
        hostPositions.set(fi.catalogId, positions);
        for (const [cx, cz] of positions) {
          placed.push({ asset, x: cx, z: cz, rotY: 0 });
        }
        break;
      }

      case "wall": {
        const count = computeHostCount(fi, usableArea);
        const wallPos = wallPositions(rect, zone, count, asset);
        const posArr: Array<[number, number]> = [];
        for (const wp of wallPos) {
          placed.push({ asset, x: wp.cx, z: wp.cz, rotY: wp.rotY });
          posArr.push([wp.cx, wp.cz]);
        }
        hostPositions.set(fi.catalogId, posArr);
        break;
      }

      case "corner": {
        const count = fi.count ?? 1;
        for (let i = 0; i < count; i++) {
          const [cx, cz] = cornerPosition(rect, cornerCounter, itemW, itemD);
          cornerCounter++;
          if (fitsInRect(rect, cx, cz, itemW, itemD)) {
            placed.push({ asset, x: cx, z: cz, rotY: 0 });
          }
        }
        break;
      }

      case "center": {
        const cx = rect.x + rect.w / 2;
        const cz = rect.z + rect.d / 2;
        placed.push({ asset, x: cx, z: cz, rotY: 0 });
        hostPositions.set(fi.catalogId, [[cx, cz]]);
        break;
      }

      case "scatter": {
        const count = computeHostCount(fi, usableArea);
        // Simple scatter: evenly spaced along zone diagonal
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count;
          const cx = rect.x + t * rect.w;
          const cz = rect.z + t * rect.d;
          if (fitsInRect(rect, cx, cz, itemW, itemD)) {
            placed.push({ asset, x: cx, z: cz, rotY: 0 });
          }
        }
        break;
      }
    }
  }

  // Second pass: place grouped items around their hosts
  for (const fi of plan) {
    if (!fi.groupWith) continue;

    const asset = getCatalogAsset(fi.catalogId);
    if (!asset) continue;

    const hostPos = hostPositions.get(fi.groupWith);
    if (!hostPos || hostPos.length === 0) continue;

    const hostAsset = getCatalogAsset(fi.groupWith);
    if (!hostAsset) continue;

    const [hostW, , hostD] = hostAsset.dimensions;
    const [chairW, , chairD] = asset.dimensions;
    const perHost = fi.perHost ?? 1;
    const baseOffset = fi.hostOffset ?? 0.3;

    for (const [hx, hz] of hostPos) {
      // Place seats/accessories around the host item
      const chairPositions = computeChairPositions(
        hx, hz,
        hostW, hostD,
        chairW, chairD,
        perHost,
        baseOffset,
      );

      for (const cp of chairPositions) {
        if (fitsInRect(rect, cp.x, cp.z, chairW, chairD)) {
          placed.push({ asset, x: cp.x, z: cp.z, rotY: cp.rotY });
        }
      }
    }
  }

  return placed;
}

/**
 * Compute chair/stool positions around a host item (table/counter).
 * Places items on the 4 cardinal sides of the host, distributing evenly.
 */
function computeChairPositions(
  hostX: number,
  hostZ: number,
  hostW: number,
  hostD: number,
  chairW: number,
  chairD: number,
  count: number,
  offset: number,
): Array<{ x: number; z: number; rotY: number }> {
  if (count <= 0) return [];

  // If offset is 0, place at same position (e.g. umbrella on table)
  if (offset === 0) {
    return [{ x: hostX, z: hostZ, rotY: 0 }];
  }

  const positions: Array<{ x: number; z: number; rotY: number }> = [];

  // 4 cardinal positions: front (+z), back (-z), left (-x), right (+x)
  const cardinalOffsets = [
    { x: 0, z: hostD / 2 + chairD / 2 + offset, rotY: Math.PI }, // front, facing host
    { x: 0, z: -(hostD / 2 + chairD / 2 + offset), rotY: 0 }, // back, facing host
    { x: -(hostW / 2 + chairW / 2 + offset), z: 0, rotY: Math.PI / 2 }, // left
    { x: hostW / 2 + chairW / 2 + offset, z: 0, rotY: -Math.PI / 2 }, // right
  ];

  for (let i = 0; i < Math.min(count, 4); i++) {
    const co = cardinalOffsets[i];
    positions.push({
      x: hostX + co.x,
      z: hostZ + co.z,
      rotY: co.rotY,
    });
  }

  // If more than 4, add extras between the cardinal positions
  if (count > 4) {
    const diagonalOffsets = [
      { x: -(hostW / 2 + chairW / 2 + offset) * 0.7, z: (hostD / 2 + chairD / 2 + offset) * 0.7, rotY: Math.PI * 0.75 },
      { x: (hostW / 2 + chairW / 2 + offset) * 0.7, z: (hostD / 2 + chairD / 2 + offset) * 0.7, rotY: -Math.PI * 0.75 },
      { x: -(hostW / 2 + chairW / 2 + offset) * 0.7, z: -(hostD / 2 + chairD / 2 + offset) * 0.7, rotY: Math.PI * 0.25 },
      { x: (hostW / 2 + chairW / 2 + offset) * 0.7, z: -(hostD / 2 + chairD / 2 + offset) * 0.7, rotY: -Math.PI * 0.25 },
    ];
    for (let i = 0; i < Math.min(count - 4, 4); i++) {
      const do_ = diagonalOffsets[i];
      positions.push({
        x: hostX + do_.x,
        z: hostZ + do_.z,
        rotY: do_.rotY,
      });
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Transform LLM output -> SceneData
// ---------------------------------------------------------------------------

export function transformToSceneData(plan: LlmFloorPlan): SceneData {
  const nodes: Record<string, AnyNode> = {};
  const rootNodeIds: string[] = [];

  // Reset counter for deterministic-ish IDs within a single call
  _counter = 0;

  const t = DEFAULT_WALL_THICKNESS;
  const h = DEFAULT_WALL_HEIGHT;

  // --- Generate walls from zone boundaries (perimeter + interior) ---
  const wallSegments = generateWallSegments(
    plan.zones,
    plan.buildingWidth,
    plan.buildingLength,
  );

  for (const seg of wallSegments) {
    const wallId = `wall_${uid()}`;
    const wall = {
      object: "node" as const,
      id: wallId,
      type: "wall" as const,
      parentId: null,
      visible: true,
      children: [] as string[],
      start: seg.start as [number, number],
      end: seg.end as [number, number],
      thickness: t,
      height: h,
      frontSide: "unknown" as const,
      backSide: "unknown" as const,
    };
    nodes[wallId] = wall as unknown as AnyNode;
    rootNodeIds.push(wallId);
  }

  // --- Zones ---
  for (const z of plan.zones) {
    if (!VALID_ZONE_TYPES.has(z.type)) continue;

    const zoneType = z.type as HorecaZoneType;
    const zoneId = `zone_${uid()}`;
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

    const zoneLabel = ZONE_LABELS[zoneType] ?? zoneType.replace(/_/g, " ");
    const zone = {
      object: "node" as const,
      id: zoneId,
      type: "zone" as const,
      parentId: null,
      visible: true,
      name: zoneLabel,
      polygon,
      color: ZONE_COLORS[zoneType],
      metadata: { zoneType, area: zw * zl },
    };
    nodes[zoneId] = zone as unknown as AnyNode;
    rootNodeIds.push(zoneId);
  }

  // --- Furniture items (from catalog) ---
  for (const z of plan.zones) {
    if (!VALID_ZONE_TYPES.has(z.type)) continue;

    const placedItems = furnishZone(z);
    for (const placed of placedItems) {
      const itemNode = buildItemNode(placed);
      const id = itemNode.id as string;
      nodes[id] = itemNode as unknown as AnyNode;
      rootNodeIds.push(id);
    }
  }

  return wrapNodesInDefaultHierarchy(nodes, rootNodeIds);
}
