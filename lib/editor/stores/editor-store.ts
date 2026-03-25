// lib/editor/stores/editor-store.ts
// Zustand store for editor UI state: active tool, selection, grid, view mode, drawing.

import { create } from "zustand";
import type { AnyNode } from "../schema";
import { generateId } from "../utils";

export type EditorTool =
  | "select"
  | "wall"
  | "zone"
  | "item"
  | "measure"
  | "pan";

export type ViewMode = "2d" | "3d";

interface EditorState {
  activeTool: EditorTool;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  gridVisible: boolean;
  /** Snap grid size in meters */
  gridSize: number;
  viewMode: ViewMode;
  /** Currently drawing a wall or zone polygon */
  isDrawing: boolean;
  /** Accumulated draw points during wall/zone creation */
  drawPoints: [number, number][];
  /** Active item type being placed from asset panel (null when not placing) */
  placingItemType: string | null;
  /** Whether the camera is currently being dragged (pan/rotate) */
  cameraDragging: boolean;
  /** Clipboard for copy/paste operations */
  clipboard: AnyNode[];

  // Actions
  setCameraDragging: (dragging: boolean) => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  setTool: (tool: EditorTool) => void;
  selectNode: (id: string, multi?: boolean) => void;
  deselectNode: (id: string) => void;
  clearSelection: () => void;
  setHovered: (id: string | null) => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  setViewMode: (mode: ViewMode) => void;
  startDrawing: () => void;
  addDrawPoint: (point: [number, number]) => void;
  finishDrawing: () => [number, number][];
  cancelDrawing: () => void;
  startPlacingItem: (itemType: string) => void;
  stopPlacingItem: () => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  activeTool: "select",
  selectedNodeIds: [],
  hoveredNodeId: null,
  gridVisible: true,
  gridSize: 0.1,
  viewMode: "2d",
  isDrawing: false,
  drawPoints: [],
  placingItemType: null,
  cameraDragging: false,
  clipboard: [],

  setCameraDragging: (dragging) => set({ cameraDragging: dragging }),

  copySelection: () => {
    const { selectedNodeIds } = get();
    // Lazy import to avoid circular dependency at module level
    const { useSceneStore } = require("./scene-store") as {
      useSceneStore: typeof import("./scene-store").useSceneStore;
    };
    const sceneNodes = useSceneStore.getState().nodes;
    const copied = selectedNodeIds
      .map((id) => sceneNodes[id])
      .filter(Boolean);
    set({ clipboard: copied });
  },

  pasteClipboard: () => {
    const { clipboard } = get();
    if (clipboard.length === 0) return;
    const { useSceneStore } = require("./scene-store") as {
      useSceneStore: typeof import("./scene-store").useSceneStore;
    };
    const sceneStore = useSceneStore.getState();
    const newIds: string[] = [];
    const offset = 0.5; // 0.5m offset so paste is visually distinct
    for (const node of clipboard) {
      const newId = generateId();
      const newNode = {
        ...node,
        id: newId,
        position: [
          node.position[0] + offset,
          node.position[1],
          node.position[2] + offset,
        ] as [number, number, number],
      };
      sceneStore.createNode(newNode as AnyNode);
      newIds.push(newId);
    }
    set({ selectedNodeIds: newIds });
  },

  setTool: (tool) => {
    // Cancel any in-progress drawing when switching tools
    set({
      activeTool: tool,
      isDrawing: false,
      drawPoints: [],
      placingItemType: null,
    });
  },

  selectNode: (id, multi) => {
    set((state) => {
      if (multi) {
        // Toggle: add if not selected, remove if already selected
        const alreadySelected = state.selectedNodeIds.includes(id);
        return {
          selectedNodeIds: alreadySelected
            ? state.selectedNodeIds.filter((nid) => nid !== id)
            : [...state.selectedNodeIds, id],
        };
      }
      return { selectedNodeIds: [id] };
    });
  },

  deselectNode: (id) => {
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.filter((nid) => nid !== id),
    }));
  },

  clearSelection: () => {
    set({ selectedNodeIds: [] });
  },

  setHovered: (id) => {
    set({ hoveredNodeId: id });
  },

  toggleGrid: () => {
    set((state) => ({ gridVisible: !state.gridVisible }));
  },

  setGridSize: (size) => {
    set({ gridSize: size });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  startDrawing: () => {
    set({ isDrawing: true, drawPoints: [] });
  },

  addDrawPoint: (point) => {
    set((state) => ({
      drawPoints: [...state.drawPoints, point],
    }));
  },

  finishDrawing: () => {
    const points = get().drawPoints;
    set({ isDrawing: false, drawPoints: [] });
    return [...points];
  },

  cancelDrawing: () => {
    set({ isDrawing: false, drawPoints: [] });
  },

  startPlacingItem: (itemType) => {
    set({
      placingItemType: itemType,
      activeTool: "item",
      isDrawing: false,
      drawPoints: [],
    });
  },

  stopPlacingItem: () => {
    set({ placingItemType: null });
  },
}));
