'use client';

// components/editor/scene-sidebar.tsx
// Collapsible tree view showing the scene hierarchy.
// Click a node in the tree to select it in the viewport.

import { useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Box,
  Square,
  Layers,
  Building2,
  MapPin,
  DoorOpen,
  Frame,
  Armchair,
  PenTool,
  RectangleHorizontal,
  SquareDashed,
  TriangleRight,
  Image,
  Ruler,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore, useSceneStore } from '@/lib/editor/stores';
import { NODE_TYPE_LABELS, ITEM_DEFAULTS, ZONE_LABELS } from '@/lib/editor/schema';
import type { AnyNode, NodeType, ItemNode, ZoneNode, WallNode } from '@/lib/editor/schema';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Node type icons
// ---------------------------------------------------------------------------

const NODE_TYPE_ICONS: Record<NodeType, React.ComponentType<{ className?: string }>> = {
  site: MapPin,
  building: Building2,
  level: Layers,
  wall: Square,
  door: DoorOpen,
  window: Frame,
  zone: PenTool,
  item: Armchair,
  slab: RectangleHorizontal,
  ceiling: SquareDashed,
  roof: TriangleRight,
  'roof-segment': TriangleRight,
  scan: Image,
  guide: Image,
};

// ---------------------------------------------------------------------------
// Helper: build parent->children index
// ---------------------------------------------------------------------------

function buildChildIndex(nodes: Record<string, AnyNode>): Map<string, AnyNode[]> {
  const index = new Map<string, AnyNode[]>();
  for (const node of Object.values(nodes)) {
    const parentKey = node.parentId ?? '__root__';
    const siblings = index.get(parentKey);
    if (siblings) {
      siblings.push(node);
    } else {
      index.set(parentKey, [node]);
    }
  }
  return index;
}

/** Get a display label for a node */
function getNodeLabel(node: AnyNode): string {
  if (node.name) return node.name;

  switch (node.type) {
    case 'wall': {
      const w = node as WallNode;
      const dx = w.end[0] - w.start[0];
      const dy = w.end[1] - w.start[1];
      const length = Math.hypot(dx, dy);
      return `${NODE_TYPE_LABELS.wall} (${length.toFixed(2)}m)`;
    }
    case 'zone': {
      const z = node as ZoneNode;
      const zoneLabel = ZONE_LABELS[z.zoneType] ?? z.zoneType;
      return `${zoneLabel} (${z.area.toFixed(1)}m\u00B2)`;
    }
    case 'item': {
      const i = node as ItemNode;
      return ITEM_DEFAULTS[i.itemType]?.label ?? NODE_TYPE_LABELS.item;
    }
    case 'level':
      return `${NODE_TYPE_LABELS.level} ${(node as { level: number }).level}`;
    default:
      return NODE_TYPE_LABELS[node.type] ?? node.type;
  }
}

// ---------------------------------------------------------------------------
// TreeNode component
// ---------------------------------------------------------------------------

const HIERARCHY_TYPES = new Set(['site', 'building', 'level', 'roof']);

interface TreeNodeProps {
  node: AnyNode;
  childIndex: Map<string, AnyNode[]>;
  depth: number;
}

function TreeNode({ node, childIndex, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selectNode = useEditorStore((s) => s.selectNode);

  const children = childIndex.get(node.id);
  const hasChildren = !!children && children.length > 0;
  const isSelected = selectedNodeIds.includes(node.id);
  const isContainer = HIERARCHY_TYPES.has(node.type);

  const Icon = NODE_TYPE_ICONS[node.type] ?? Box;
  const label = getNodeLabel(node);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(node.id, e.metaKey || e.ctrlKey);
    },
    [node.id, selectNode],
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((v) => !v);
    },
    [],
  );

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer hover:bg-muted/50 rounded-sm',
          isSelected && 'bg-primary/10 text-primary font-medium',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            className="flex-shrink-0 p-0.5 hover:bg-muted rounded-sm"
            onClick={handleToggle}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Node type icon */}
        <Icon className="size-3.5 flex-shrink-0 text-muted-foreground" />

        {/* Label */}
        <span className="truncate flex-1">{label}</span>

        {/* Child count badge for containers */}
        {isContainer && hasChildren && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {children.length}
          </Badge>
        )}

        {/* Visibility indicator */}
        {!node.visible && (
          <EyeOff className="size-3 text-muted-foreground/50 flex-shrink-0" />
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              childIndex={childIndex}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function SceneSidebar() {
  const nodes = useSceneStore((s) => s.nodes);
  const sceneSidebarOpen = useEditorStore((s) => s.sceneSidebarOpen);

  const childIndex = useMemo(() => buildChildIndex(nodes), [nodes]);
  const rootNodes = childIndex.get('__root__') ?? [];
  const totalCount = Object.keys(nodes).length;

  if (!sceneSidebarOpen) return null;

  return (
    <div className="flex flex-col w-56 border-r border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-foreground">
          Scene
        </span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {totalCount}
        </Badge>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {rootNodes.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Geen elementen
            </div>
          ) : (
            rootNodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                childIndex={childIndex}
                depth={0}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
