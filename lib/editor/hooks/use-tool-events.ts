"use client";

// lib/editor/hooks/use-tool-events.ts
// Subscribes to grid events from the mitt emitter and executes tool actions
// based on the active tool in the editor store.
//
// Tool state machines:
//   WALL  — two-click: click1 = start, click2 = end, then chains (end → new start)
//   ZONE  — polygon: click to add points, click near first point to close
//   ITEM  — single click to place the selected item type
//   SELECT — click empty space to deselect; drag to move selected nodes

import { useEffect, useRef } from "react";
import { editorEmitter, type GridEventPayload } from "../events";
import { useEditorStore, useSceneStore } from "../stores";
import { snapPointToGrid, generateId, polygonArea } from "../utils";
import {
  ITEM_DEFAULTS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_COLORS,
  type HorecaItemType,
  type HorecaZoneType,
} from "../schema";

/** Distance in meters — clicking within this radius of the first zone
 *  point closes the polygon. */
const CLOSE_POLYGON_THRESHOLD = 0.3;

/** Minimum wall segment length in meters */
const MIN_WALL_LENGTH = 0.1;

export function useToolEvents() {
  // Refs for tool state — persist across renders without causing re-renders
  const wallStartRef = useRef<[number, number] | null>(null);
  const zonePointsRef = useRef<[number, number][]>([]);

  // Drag-to-move state for the select tool
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<[number, number] | null>(null);

  // ── Reset tool refs when activeTool changes ───────────────────────────
  useEffect(() => {
    let prevTool = useEditorStore.getState().activeTool;

    const unsub = useEditorStore.subscribe((state) => {
      if (state.activeTool !== prevTool) {
        prevTool = state.activeTool;
        wallStartRef.current = null;
        zonePointsRef.current = [];
        // cancelDrawing in the store is already called by setTool
      }
    });

    return unsub;
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────
  useEffect(() => {
    // ══════════════════════════════════════════════════════════════════════
    // GRID CLICK — main tool dispatch
    // ══════════════════════════════════════════════════════════════════════
    const handleGridClick = (payload: GridEventPayload) => {
      const store = useEditorStore.getState();
      const sceneStore = useSceneStore.getState();
      const { activeTool, placingItemType, gridSize } = store;

      const point: [number, number] = snapPointToGrid(
        payload.position,
        gridSize,
      );

      // ── ITEM PLACEMENT (single click) ─────────────────────────────────
      if (placingItemType) {
        const defaults = ITEM_DEFAULTS[placingItemType as HorecaItemType];
        if (defaults) {
          sceneStore.createNode({
            id: generateId(),
            type: "item",
            parentId: null,
            visible: true,
            position: [point[0], 0, point[1]],
            rotation: [0, 0, 0],
            itemType: placingItemType as HorecaItemType,
            width: defaults.width,
            depth: defaults.depth,
            height: defaults.height,
          });
          store.stopPlacingItem();
        }
        return;
      }

      // ── WALL TOOL (two-click state machine with chaining) ─────────────
      if (activeTool === "wall") {
        if (!wallStartRef.current) {
          // First click: record start, show preview
          wallStartRef.current = point;
          store.startDrawing();
          store.addDrawPoint(point);
        } else {
          // Second click: create the wall segment
          const start = wallStartRef.current;
          const end = point;
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          const length = Math.sqrt(dx * dx + dy * dy);

          if (length >= MIN_WALL_LENGTH) {
            sceneStore.createNode({
              id: generateId(),
              type: "wall",
              parentId: null,
              visible: true,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              start,
              end,
              thickness: DEFAULT_WALL_THICKNESS,
              height: DEFAULT_WALL_HEIGHT,
              material: "brick",
            });

            // Chain: use the end as the new start for continuous wall drawing
            wallStartRef.current = end;
            store.cancelDrawing();
            store.startDrawing();
            store.addDrawPoint(end);
          }
        }
        return;
      }

      // ── ZONE TOOL (polygon with close-on-first-point) ─────────────────
      if (activeTool === "zone") {
        const points = zonePointsRef.current;

        // Check if clicking near the first point to close the polygon
        if (points.length >= 3) {
          const first = points[0];
          const dx = point[0] - first[0];
          const dy = point[1] - first[1];
          if (Math.sqrt(dx * dx + dy * dy) < CLOSE_POLYGON_THRESHOLD) {
            // Close the polygon — create the zone
            const area = polygonArea(points);
            sceneStore.createNode({
              id: generateId(),
              type: "zone",
              parentId: null,
              visible: true,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              zoneType: "dining_area" as HorecaZoneType,
              polygon: [...points],
              area,
              color: ZONE_COLORS.dining_area,
              capacity: 0,
            });

            // Reset
            zonePointsRef.current = [];
            store.cancelDrawing();
            return;
          }
        }

        // Add point to polygon
        points.push(point);
        if (points.length === 1) {
          store.startDrawing();
        }
        store.addDrawPoint(point);
        return;
      }

      // ── SELECT TOOL (click empty space = deselect) ────────────────────
      if (activeTool === "select") {
        store.clearSelection();
      }
    };

    // ══════════════════════════════════════════════════════════════════════
    // DRAG-TO-MOVE for select tool
    // ══════════════════════════════════════════════════════════════════════
    const handlePointerDown = (payload: GridEventPayload) => {
      const { activeTool, selectedNodeIds } = useEditorStore.getState();
      if (activeTool !== "select" || selectedNodeIds.length === 0) return;

      isDraggingRef.current = true;
      dragStartPosRef.current = snapPointToGrid(
        payload.position,
        useEditorStore.getState().gridSize,
      );
    };

    const handlePointerMove = (payload: GridEventPayload) => {
      if (!isDraggingRef.current || !dragStartPosRef.current) return;

      const { selectedNodeIds, gridSize } = useEditorStore.getState();
      const sceneStore = useSceneStore.getState();
      const snapped = snapPointToGrid(payload.position, gridSize);
      const dx = snapped[0] - dragStartPosRef.current[0];
      const dz = snapped[1] - dragStartPosRef.current[1];

      if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;

      for (const id of selectedNodeIds) {
        const node = sceneStore.nodes[id];
        if (!node) continue;
        if (node.type === "item") {
          sceneStore.updateNode(id, {
            position: [
              node.position[0] + dx,
              node.position[1],
              node.position[2] + dz,
            ],
          });
        } else if (node.type === "wall") {
          sceneStore.updateNode(id, {
            start: [node.start[0] + dx, node.start[1] + dz],
            end: [node.end[0] + dx, node.end[1] + dz],
          });
        }
      }
      dragStartPosRef.current = snapped;
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      dragStartPosRef.current = null;
    };

    // ══════════════════════════════════════════════════════════════════════
    // CANCEL / RESET
    // ══════════════════════════════════════════════════════════════════════
    const handleToolCancel = () => {
      wallStartRef.current = null;
      zonePointsRef.current = [];
      useEditorStore.getState().cancelDrawing();
    };

    editorEmitter.on("grid:click", handleGridClick);
    editorEmitter.on("grid:pointerdown", handlePointerDown);
    editorEmitter.on("grid:pointermove", handlePointerMove);
    editorEmitter.on("grid:pointerup", handlePointerUp);
    editorEmitter.on("tool:cancel", handleToolCancel);

    return () => {
      editorEmitter.off("grid:click", handleGridClick);
      editorEmitter.off("grid:pointerdown", handlePointerDown);
      editorEmitter.off("grid:pointermove", handlePointerMove);
      editorEmitter.off("grid:pointerup", handlePointerUp);
      editorEmitter.off("tool:cancel", handleToolCancel);
    };
  }, []);
}
