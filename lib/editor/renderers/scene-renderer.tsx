'use client';

import { useMemo } from 'react';
import { useSceneStore } from '../stores';
import { useEditorStore } from '../stores';
import { useEditorColors } from '@/lib/editor';
import { WallRenderer } from './wall-renderer';
import { ZoneRenderer } from './zone-renderer';
import { ItemRenderer } from './item-renderer';
import { DoorRenderer } from './door-renderer';
import { WindowRenderer } from './window-renderer';
import { SlabRenderer } from './slab-renderer';
import { CeilingRenderer } from './ceiling-renderer';
import { ScanRenderer } from './scan-renderer';
import { GuideRenderer } from './guide-renderer';
import { RoofSegmentRenderer } from './roof-segment-renderer';
import { GridRenderer } from './grid-renderer';
import { SiteRenderer } from './site-renderer';
import { BuildingRenderer } from './building-renderer';
import { LevelRenderer } from './level-renderer';
import type {
  AnyNode,
  WallMaterial,
  HorecaZoneType,
} from '../schema';
import type { ItemCategory } from './item-renderer';

/** Maps each zone type to the corresponding key on EditorColors */
const ZONE_TYPE_TO_COLOR_KEY: Record<HorecaZoneType, keyof ReturnType<typeof useEditorColors>> = {
  dining_area: 'zoneDining',
  bar_area: 'zoneBar',
  kitchen: 'zoneKitchen',
  storage: 'zoneStorage',
  terrace: 'zoneTerrace',
  entrance: 'zoneEntrance',
  restroom: 'zoneRestroom',
  office: 'zoneOffice',
  prep_area: 'zonePrepArea',
  walk_in_cooler: 'zoneWalkInCooler',
  seating_outside: 'zoneSeatingOutside',
  hallway: 'zoneHallway',
};

/** Set of node types that act as hierarchy containers */
const HIERARCHY_TYPES = new Set(['site', 'building', 'level', 'roof']);

/**
 * Build a parent -> children index from the flat node dictionary.
 * Returns a Map where key = parentId, value = array of child nodes.
 * Nodes with parentId === null are collected under the key "__root__".
 */
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

/**
 * Main scene renderer that iterates over all nodes in the scene store
 * and dispatches each to the appropriate type-specific renderer.
 *
 * When hierarchy nodes (site / building / level) are present, child nodes
 * are rendered inside their parent's group so that transforms propagate.
 * Scenes without hierarchy nodes continue to work as before — all nodes
 * render flat at the root level.
 *
 * Selection and hover are handled by the event system (useGridEvents +
 * useToolEvents) — renderers only need to know their visual state.
 */
export function SceneRenderer() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const colors = useEditorColors();

  const selectionSet = useMemo(
    () => new Set(selectedNodeIds),
    [selectedNodeIds],
  );

  const materialColors = useMemo(
    () =>
      ({
        brick: colors.wallBrick,
        glass: colors.wallGlass,
        drywall: colors.wallDrywall,
        concrete: colors.wallConcrete,
      }) as Record<WallMaterial, string>,
    [colors.wallBrick, colors.wallGlass, colors.wallDrywall, colors.wallConcrete],
  );

  const categoryColors = useMemo(
    () =>
      ({
        table: colors.itemTable,
        seating: colors.itemSeating,
        kitchen: colors.itemKitchen,
        bar: colors.itemBar,
        decor: colors.itemDecor,
      }) as Partial<Record<ItemCategory, string>>,
    [colors.itemTable, colors.itemSeating, colors.itemKitchen, colors.itemBar, colors.itemDecor],
  );

  // Build a parent -> children lookup once per render
  const childIndex = useMemo(() => buildChildIndex(nodes), [nodes]);

  /**
   * Renders a single leaf node (wall, zone, item, door, window, slab).
   * Returns null for hierarchy types — those are handled by renderTree.
   */
  function renderLeafNode(node: AnyNode) {
    if (!node.visible) return null;

    const isSelected = selectionSet.has(node.id);
    const isHovered = hoveredNodeId === node.id;

    switch (node.type) {
      case 'wall':
        return (
          <WallRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            materialColors={materialColors}
            selectedColor={colors.selected}
          />
        );
      case 'zone':
        return (
          <ZoneRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            zoneColor={colors[ZONE_TYPE_TO_COLOR_KEY[node.zoneType]]}
          />
        );
      case 'item':
        return (
          <ItemRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            categoryColors={categoryColors}
            selectedColor={colors.selected}
          />
        );
      case 'door':
        return (
          <DoorRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            doorColor={colors.door}
            selectedColor={colors.selected}
          />
        );
      case 'window':
        return (
          <WindowRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            windowColor={colors.window}
            selectedColor={colors.selected}
          />
        );
      case 'slab':
        return (
          <SlabRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            slabColor={colors.slab}
            selectedColor={colors.selected}
          />
        );
      case 'ceiling':
        return (
          <CeilingRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            ceilingColor={colors.ceiling}
            selectedColor={colors.selected}
          />
        );
      case 'roof-segment':
        return (
          <RoofSegmentRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            selectedColor={colors.selected}
          />
        );
      case 'scan':
        return (
          <ScanRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            selectedColor={colors.selected}
          />
        );
      case 'guide':
        return (
          <GuideRenderer
            key={node.id}
            node={node}
            selected={isSelected}
            hovered={isHovered}
            selectedColor={colors.selected}
          />
        );
      default:
        return null;
    }
  }

  /**
   * Recursively renders a node and its children.
   * Hierarchy nodes (site/building/level) wrap their children in a group.
   * Leaf nodes render directly.
   */
  function renderTree(node: AnyNode): React.ReactNode {
    if (!node.visible && !HIERARCHY_TYPES.has(node.type)) return null;

    const children = childIndex.get(node.id);

    switch (node.type) {
      case 'site':
        return (
          <SiteRenderer key={node.id} node={node}>
            {children?.map((child) => renderTree(child))}
          </SiteRenderer>
        );
      case 'building':
        return (
          <BuildingRenderer key={node.id} node={node}>
            {children?.map((child) => renderTree(child))}
          </BuildingRenderer>
        );
      case 'level':
        return (
          <LevelRenderer key={node.id} node={node}>
            {children?.map((child) => renderTree(child))}
          </LevelRenderer>
        );
      case 'roof':
        // Roof is a hierarchy container (renders children as a group)
        return (
          <group key={node.id} visible={node.visible}>
            {children?.map((child) => renderTree(child))}
          </group>
        );
      default:
        return renderLeafNode(node);
    }
  }

  // Start rendering from root-level nodes (those with no parent)
  const rootNodes = childIndex.get('__root__') ?? [];

  return (
    <>
      <GridRenderer
        visible={gridVisible}
        cellColor={colors.gridCell}
        sectionColor={colors.gridSection}
      />
      {rootNodes.map((node) => renderTree(node))}
    </>
  );
}
