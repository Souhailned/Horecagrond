/**
 * Scene graph utilities for wrapping flat node lists into the Pascal Editor's
 * required hierarchy: Site → Building → Level → [walls, zones, items, ...]
 */

import type { AnyNode, SceneData } from "@/lib/editor/schema";
import { siteId, buildingId, levelId } from "@/lib/editor/schema";

/**
 * Takes a flat Record of nodes (walls, zones, items) and wraps them in the
 * default Site → Building → Level hierarchy that the Pascal Editor expects.
 *
 * All supplied nodes become children of Level 0 (Begane grond).
 * The function sets `parentId` on each node and returns a valid SceneData.
 *
 * IMPORTANT: The SiteRenderer requires `polygon.points` to render at all —
 * without it, the entire subtree (building, levels, walls) is hidden.
 * We compute the site polygon from the wall bounding box.
 */
export function wrapNodesInDefaultHierarchy(
  flatNodes: Record<string, AnyNode>,
  flatRootNodeIds: string[]
): SceneData {
  const sid = siteId();
  const bid = buildingId();
  const lid = levelId();

  // Assign parentId = level for all flat nodes
  const childIds: string[] = [];
  for (const nodeId of flatRootNodeIds) {
    const node = flatNodes[nodeId];
    if (node) {
      node.parentId = lid;
      childIds.push(nodeId);
    }
  }

  // Compute site polygon from wall extents (bounding box)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of Object.values(flatNodes)) {
    const n = node as any;
    if (n.type === "wall" && n.start && n.end) {
      minX = Math.min(minX, n.start[0], n.end[0]);
      minY = Math.min(minY, n.start[1], n.end[1]);
      maxX = Math.max(maxX, n.start[0], n.end[0]);
      maxY = Math.max(maxY, n.start[1], n.end[1]);
    }
    if (n.type === "zone" && n.polygon) {
      for (const pt of n.polygon) {
        minX = Math.min(minX, pt[0]);
        minY = Math.min(minY, pt[1]);
        maxX = Math.max(maxX, pt[0]);
        maxY = Math.max(maxY, pt[1]);
      }
    }
  }

  // Default to 30x30 if no walls/zones found
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 30; maxY = 30; }

  // Add small margin around the site polygon
  const margin = 1;
  const sitePolygon: [number, number][] = [
    [minX - margin, minY - margin],
    [maxX + margin, minY - margin],
    [maxX + margin, maxY + margin],
    [minX - margin, maxY + margin],
  ];

  // Level → children = all flat nodes
  const level = {
    object: "node" as const,
    id: lid,
    type: "level" as const,
    parentId: bid,
    visible: true,
    children: childIds,
    level: 0,
    height: 3.0,
  };

  // Building → children = [level]
  const building = {
    object: "node" as const,
    id: bid,
    type: "building" as const,
    parentId: sid,
    visible: true,
    children: [lid],
  };

  // Site → children = [building] + polygon for SiteRenderer
  const site = {
    object: "node" as const,
    id: sid,
    type: "site" as const,
    parentId: null,
    visible: true,
    children: [bid],
    polygon: {
      type: "polygon" as const,
      points: sitePolygon,
    },
  };

  const nodes: Record<string, AnyNode> = {
    ...flatNodes,
    [sid]: site as unknown as AnyNode,
    [bid]: building as unknown as AnyNode,
    [lid]: level as unknown as AnyNode,
  };

  return {
    nodes,
    rootNodeIds: [sid],
  };
}
