// lib/editor/stores/scene-store.ts
// Zustand store for managing the flat node dictionary (scene graph).
// Wrapped with zundo temporal middleware for undo/redo support.

import { create } from "zustand";
import { temporal } from "zundo";
import isDeepEqual from "fast-deep-equal";
import type { AnyNode, SceneData } from "../schema";

interface SceneState {
  nodes: Record<string, AnyNode>;
  rootNodeIds: string[];
  dirtyNodes: Set<string>;

  // CRUD
  createNode: (node: AnyNode, parentId?: string | null) => void;
  updateNode: (id: string, updates: Partial<AnyNode>) => void;
  deleteNode: (id: string) => void;

  // Bulk
  loadScene: (data: SceneData) => void;
  exportScene: () => SceneData;
  clear: () => void;

  // Dirty tracking
  markClean: (id: string) => void;

  // Queries
  getNodesByType: <T extends AnyNode["type"]>(
    type: T,
  ) => Array<Extract<AnyNode, { type: T }>>;
  getChildren: (parentId: string) => AnyNode[];
}

/** Recursively collect all descendant node IDs for a given parent. */
function collectDescendantIds(
  nodes: Record<string, AnyNode>,
  parentId: string,
): string[] {
  const ids: string[] = [];
  for (const node of Object.values(nodes)) {
    if (node.parentId === parentId) {
      ids.push(node.id);
      ids.push(...collectDescendantIds(nodes, node.id));
    }
  }
  return ids;
}

/** Valid fields per node type — used for dev-only type safety warnings */
const BASE_FIELDS = new Set([
  "id",
  "type",
  "parentId",
  "visible",
  "position",
  "rotation",
  "metadata",
]);
const NODE_TYPE_FIELDS: Record<string, Set<string>> = {
  wall: new Set(["start", "end", "thickness", "height", "material"]),
  slab: new Set(["polygon", "thickness"]),
  zone: new Set([
    "zoneType",
    "polygon",
    "area",
    "color",
    "capacity",
  ]),
  item: new Set(["itemType", "width", "depth", "height", "model"]),
};

export const useSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
      nodes: {},
      rootNodeIds: [],
      dirtyNodes: new Set<string>(),

      createNode: (node, parentId) => {
        const nodeWithParent: AnyNode = {
          ...node,
          parentId: parentId ?? null,
        } as AnyNode;

        set((state) => {
          const nextNodes = { ...state.nodes, [node.id]: nodeWithParent };
          const nextRootIds =
            parentId == null
              ? [...state.rootNodeIds, node.id]
              : state.rootNodeIds;
          const nextDirty = new Set(state.dirtyNodes);
          nextDirty.add(node.id);

          return {
            nodes: nextNodes,
            rootNodeIds: nextRootIds,
            dirtyNodes: nextDirty,
          };
        });
      },

      updateNode: (id, updates) => {
        set((state) => {
          const existing = state.nodes[id];
          if (!existing) return state;

          if (process.env.NODE_ENV === "development") {
            const typeFields = NODE_TYPE_FIELDS[existing.type];
            if (typeFields) {
              for (const key of Object.keys(updates)) {
                if (!BASE_FIELDS.has(key) && !typeFields.has(key)) {
                  console.warn(
                    `[editor] updateNode: field "${key}" is not valid for node type "${existing.type}"`,
                  );
                }
              }
            }
          }

          const updated = { ...existing, ...updates, id, type: existing.type } as AnyNode;
          const nextDirty = new Set(state.dirtyNodes);
          nextDirty.add(id);

          return {
            nodes: { ...state.nodes, [id]: updated },
            dirtyNodes: nextDirty,
          };
        });
      },

      deleteNode: (id) => {
        set((state) => {
          const existing = state.nodes[id];
          if (!existing) return state;

          // Collect all descendants to remove
          const idsToRemove = new Set([
            id,
            ...collectDescendantIds(state.nodes, id),
          ]);

          const nextNodes: Record<string, AnyNode> = {};
          for (const [nodeId, node] of Object.entries(state.nodes)) {
            if (!idsToRemove.has(nodeId)) {
              nextNodes[nodeId] = node;
            }
          }

          const nextRootIds = state.rootNodeIds.filter(
            (rootId) => !idsToRemove.has(rootId),
          );

          const nextDirty = new Set(state.dirtyNodes);
          for (const removedId of idsToRemove) {
            nextDirty.delete(removedId);
          }

          return {
            nodes: nextNodes,
            rootNodeIds: nextRootIds,
            dirtyNodes: nextDirty,
          };
        });
      },

      loadScene: (data) => {
        set({
          nodes: { ...data.nodes },
          rootNodeIds: [...data.rootNodeIds],
          dirtyNodes: new Set<string>(),
        });
      },

      exportScene: (): SceneData => {
        const { nodes, rootNodeIds } = get();
        return { nodes: { ...nodes }, rootNodeIds: [...rootNodeIds] };
      },

      clear: () => {
        set({
          nodes: {},
          rootNodeIds: [],
          dirtyNodes: new Set<string>(),
        });
      },

      markClean: (id) => {
        set((state) => {
          const nextDirty = new Set(state.dirtyNodes);
          nextDirty.delete(id);
          return { dirtyNodes: nextDirty };
        });
      },

      getNodesByType: <T extends AnyNode["type"]>(
        type: T,
      ): Array<Extract<AnyNode, { type: T }>> => {
        const { nodes } = get();
        return Object.values(nodes).filter(
          (node): node is Extract<AnyNode, { type: T }> => node.type === type,
        );
      },

      getChildren: (parentId) => {
        const { nodes } = get();
        return Object.values(nodes).filter(
          (node) => node.parentId === parentId,
        );
      },
    }),
    {
      limit: 50,
      // Exclude dirtyNodes from undo/redo history
      partialize: (state) => {
        const { dirtyNodes: _, ...rest } = state;
        return rest;
      },
      // Only track data fields, not actions
      equality: isDeepEqual,
    },
  ),
);
