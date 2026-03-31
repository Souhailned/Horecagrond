/**
 * SceneBuilder - Mutable scene builder for the AI ToolLoopAgent.
 *
 * Accumulates walls, zones, and items incrementally as the LLM calls tools.
 * When done, `toSceneData()` wraps everything into the Pascal Editor's
 * Site -> Building -> Level hierarchy.
 */

import type { AnyNode, SceneData, HorecaZoneType } from "@/lib/editor/schema";
import {
  ZONE_COLORS,
  ZONE_LABELS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "@/lib/editor/schema";
import { wrapNodesInDefaultHierarchy } from "@/lib/editor/scene-graph";
import { getCatalogAsset } from "@/lib/editor/catalog-lookup";

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
// SceneBuilder
// ---------------------------------------------------------------------------

export class SceneBuilder {
  private nodes: Record<string, AnyNode> = {};
  private nodeIds: string[] = [];

  constructor() {
    // Reset counter per builder instance for cleaner IDs
    _counter = 0;
  }

  /**
   * Create a wall segment between two 2D points.
   * Returns the wall node ID.
   */
  createWall(
    start: [number, number],
    end: [number, number],
    opts?: { thickness?: number; height?: number },
  ): string {
    const wallId = `wall_${uid()}`;
    const wall = {
      object: "node" as const,
      id: wallId,
      type: "wall" as const,
      parentId: null,
      visible: true,
      children: [] as string[],
      start,
      end,
      thickness: opts?.thickness ?? DEFAULT_WALL_THICKNESS,
      height: opts?.height ?? DEFAULT_WALL_HEIGHT,
      frontSide: "unknown" as const,
      backSide: "unknown" as const,
    };
    this.nodes[wallId] = wall as unknown as AnyNode;
    this.nodeIds.push(wallId);
    return wallId;
  }

  /**
   * Create a zone (room/area) at the given position with given dimensions.
   * Returns the zone node ID.
   */
  createZone(
    type: string,
    x: number,
    y: number,
    width: number,
    length: number,
    name?: string,
  ): string {
    const zoneType = type as HorecaZoneType;
    const zoneId = `zone_${uid()}`;
    const zw = Math.max(width, 1);
    const zl = Math.max(length, 1);

    const polygon: [number, number][] = [
      [x, y],
      [x + zw, y],
      [x + zw, y + zl],
      [x, y + zl],
    ];

    const zoneLabel =
      name ?? ZONE_LABELS[zoneType] ?? type.replace(/_/g, " ");
    const color = ZONE_COLORS[zoneType] ?? "#808080";

    const zone = {
      object: "node" as const,
      id: zoneId,
      type: "zone" as const,
      parentId: null,
      visible: true,
      name: zoneLabel,
      polygon,
      color,
      metadata: { zoneType: type, area: zw * zl },
    };
    this.nodes[zoneId] = zone as unknown as AnyNode;
    this.nodeIds.push(zoneId);
    return zoneId;
  }

  /**
   * Place a furniture item from the catalog at a specific position.
   * Returns the item node ID, or null if the catalogId is not found.
   */
  placeItem(
    catalogId: string,
    x: number,
    z: number,
    rotation?: number,
  ): string | null {
    const asset = getCatalogAsset(catalogId);
    if (!asset) return null;

    const itemId = `item_${uid()}`;
    const rotY = rotation ?? 0;

    const itemNode = {
      object: "node" as const,
      id: itemId,
      type: "item" as const,
      parentId: null,
      visible: true,
      position: [x, 0, z] as [number, number, number],
      rotation: [0, rotY, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      children: [] as string[],
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

    this.nodes[itemId] = itemNode as unknown as AnyNode;
    this.nodeIds.push(itemId);
    return itemId;
  }

  /**
   * Get a summary of the current scene state. Useful for the agent to
   * check its progress and verify coverage.
   */
  getSceneSummary(): {
    wallCount: number;
    zoneCount: number;
    itemCount: number;
    zones: Array<{ id: string; type: string; name: string }>;
  } {
    let wallCount = 0;
    let zoneCount = 0;
    let itemCount = 0;
    const zones: Array<{ id: string; type: string; name: string }> = [];

    for (const nodeId of this.nodeIds) {
      const node = this.nodes[nodeId] as unknown as Record<string, unknown>;
      if (node.type === "wall") wallCount++;
      else if (node.type === "zone") {
        zoneCount++;
        const meta = node.metadata as
          | Record<string, unknown>
          | undefined;
        zones.push({
          id: nodeId,
          type: (meta?.zoneType as string) ?? "unknown",
          name: (node.name as string) ?? "unnamed",
        });
      } else if (node.type === "item") itemCount++;
    }

    return { wallCount, zoneCount, itemCount, zones };
  }

  /**
   * Convert the accumulated nodes into a valid SceneData structure
   * wrapped in the Pascal Editor's Site -> Building -> Level hierarchy.
   */
  toSceneData(): SceneData {
    return wrapNodesInDefaultHierarchy(this.nodes, this.nodeIds);
  }
}
