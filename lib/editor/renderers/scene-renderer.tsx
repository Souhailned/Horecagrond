'use client';

import { useCallback, useMemo } from 'react';
import { useSceneStore } from '../stores';
import { useEditorStore } from '../stores';
import { useEditorColors } from '@/lib/editor';
import { WallRenderer } from './wall-renderer';
import { ZoneRenderer } from './zone-renderer';
import { ItemRenderer } from './item-renderer';
import { ITEM_CATEGORY } from './item-renderer';
import type { ItemCategory } from './item-renderer';
import { GridRenderer } from './grid-renderer';
import type { AnyNode, WallMaterial, HorecaZoneType } from '../schema';

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

/**
 * Main scene renderer that iterates over all nodes in the scene store
 * and dispatches each to the appropriate type-specific renderer.
 */
export function SceneRenderer() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const selectNode = useEditorStore((s) => s.selectNode);
  const colors = useEditorColors();

  const handleSelect = useCallback(
    (id: string) => selectNode(id),
    [selectNode],
  );

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
      }) as Record<ItemCategory, string>,
    [colors.itemTable, colors.itemSeating, colors.itemKitchen, colors.itemBar, colors.itemDecor],
  );

  return (
    <>
      <GridRenderer
        visible={gridVisible}
        cellColor={colors.gridCell}
        sectionColor={colors.gridSection}
      />
      {Object.values(nodes).map((node: AnyNode) => {
        if (!node.visible) return null;

        const isSelected = selectionSet.has(node.id);

        switch (node.type) {
          case 'wall':
            return (
              <WallRenderer
                key={node.id}
                node={node}
                selected={isSelected}
                onSelect={handleSelect}
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
                onSelect={handleSelect}
                zoneColor={colors[ZONE_TYPE_TO_COLOR_KEY[node.zoneType]]}
              />
            );
          case 'item':
            return (
              <ItemRenderer
                key={node.id}
                node={node}
                selected={isSelected}
                onSelect={handleSelect}
                categoryColors={categoryColors}
                selectedColor={colors.selected}
              />
            );
          case 'slab':
            // Slab renderer not yet implemented; skip for now
            return null;
          default:
            return null;
        }
      })}
    </>
  );
}
