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
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
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
   * Create a door on an existing wall.
   * The door becomes a child of the wall (not a direct level child).
   * Returns the door node ID, or null if wallId is invalid.
   */
  createDoor(
    wallId: string,
    position: number,
    opts?: { width?: number; height?: number; style?: string },
  ): string | null {
    const wall = this.nodes[wallId] as unknown as Record<string, unknown>;
    if (!wall || wall.type !== "wall") return null;

    const doorNodeId = `door_${uid()}`;
    const doorNode = {
      object: "node" as const,
      id: doorNodeId,
      type: "door" as const,
      parentId: wallId,
      visible: true,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      wallId,
      wallPosition: Math.max(0.05, Math.min(0.95, position)),
      width: opts?.width ?? DEFAULT_DOOR_WIDTH,
      height: opts?.height ?? DEFAULT_DOOR_HEIGHT,
      style: opts?.style ?? "single",
    };

    // Store in nodes map but NOT in nodeIds (doors are wall children, not level children)
    this.nodes[doorNodeId] = doorNode as unknown as AnyNode;

    // Add as child of the wall
    const wallChildren = (wall.children as string[]) ?? [];
    wallChildren.push(doorNodeId);
    wall.children = wallChildren;

    return doorNodeId;
  }

  /**
   * Create a window on an existing wall.
   * The window becomes a child of the wall (not a direct level child).
   * Returns the window node ID, or null if wallId is invalid.
   */
  createWindow(
    wallId: string,
    position: number,
    opts?: { width?: number; height?: number; sillHeight?: number; style?: string },
  ): string | null {
    const wall = this.nodes[wallId] as unknown as Record<string, unknown>;
    if (!wall || wall.type !== "wall") return null;

    const windowNodeId = `win_${uid()}`;
    const windowNode = {
      object: "node" as const,
      id: windowNodeId,
      type: "window" as const,
      parentId: wallId,
      visible: true,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      wallId,
      wallPosition: Math.max(0.05, Math.min(0.95, position)),
      width: opts?.width ?? DEFAULT_WINDOW_WIDTH,
      height: opts?.height ?? DEFAULT_WINDOW_HEIGHT,
      sillHeight: opts?.sillHeight ?? DEFAULT_WINDOW_SILL_HEIGHT,
      style: opts?.style ?? "fixed",
    };

    // Store in nodes map but NOT in nodeIds (windows are wall children, not level children)
    this.nodes[windowNodeId] = windowNode as unknown as AnyNode;

    // Add as child of the wall
    const wallChildren = (wall.children as string[]) ?? [];
    wallChildren.push(windowNodeId);
    wall.children = wallChildren;

    return windowNodeId;
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
    doorCount: number;
    windowCount: number;
    zoneCount: number;
    itemCount: number;
    walls: Array<{ id: string; hasChildren: boolean }>;
    zones: Array<{ id: string; type: string; name: string }>;
  } {
    let wallCount = 0;
    let doorCount = 0;
    let windowCount = 0;
    let zoneCount = 0;
    let itemCount = 0;
    const walls: Array<{ id: string; hasChildren: boolean }> = [];
    const zones: Array<{ id: string; type: string; name: string }> = [];

    // Count all nodes (including wall children like doors/windows)
    for (const [nodeId, rawNode] of Object.entries(this.nodes)) {
      const node = rawNode as unknown as Record<string, unknown>;
      if (node.type === "wall") {
        wallCount++;
        const children = (node.children as string[]) ?? [];
        walls.push({ id: nodeId, hasChildren: children.length > 0 });
      } else if (node.type === "door") {
        doorCount++;
      } else if (node.type === "window") {
        windowCount++;
      } else if (node.type === "zone") {
        zoneCount++;
        const meta = node.metadata as
          | Record<string, unknown>
          | undefined;
        zones.push({
          id: nodeId,
          type: (meta?.zoneType as string) ?? "unknown",
          name: (node.name as string) ?? "unnamed",
        });
      } else if (node.type === "item") {
        itemCount++;
      }
    }

    return { wallCount, doorCount, windowCount, zoneCount, itemCount, walls, zones };
  }

  /**
   * Convert the accumulated nodes into a valid SceneData structure
   * wrapped in the Pascal Editor's Site -> Building -> Level hierarchy.
   */
  toSceneData(): SceneData {
    return wrapNodesInDefaultHierarchy(this.nodes, this.nodeIds);
  }
}
