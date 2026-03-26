'use client';

// components/editor/floorplan-minimap.tsx
// Small 2D SVG minimap showing wall outlines, zone fills,
// and the current camera viewport rectangle.
// Positioned bottom-left, 200x150px.

import { useMemo } from 'react';
import { useSceneStore } from '@/lib/editor/stores';
import type { WallNode, ZoneNode } from '@/lib/editor/schema';
import { ZONE_COLORS } from '@/lib/editor/schema';

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const PADDING = 10;

interface MinimapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  scaleX: number;
  scaleZ: number;
  offsetX: number;
  offsetZ: number;
}

/** Compute bounds from all wall endpoints and zone polygons */
function computeBounds(
  walls: WallNode[],
  zones: ZoneNode[],
): MinimapBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const wall of walls) {
    minX = Math.min(minX, wall.start[0], wall.end[0]);
    maxX = Math.max(maxX, wall.start[0], wall.end[0]);
    minZ = Math.min(minZ, wall.start[1], wall.end[1]);
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
  }

  for (const zone of zones) {
    for (const [x, z] of zone.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  if (!isFinite(minX)) return null;

  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;
  const drawW = MINIMAP_W - PADDING * 2;
  const drawH = MINIMAP_H - PADDING * 2;
  const scale = Math.min(drawW / rangeX, drawH / rangeZ);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    scaleX: scale,
    scaleZ: scale,
    offsetX: PADDING + (drawW - rangeX * scale) / 2,
    offsetZ: PADDING + (drawH - rangeZ * scale) / 2,
  };
}

/** Convert world coordinates to minimap SVG coordinates */
function toSvg(
  x: number,
  z: number,
  bounds: MinimapBounds,
): [number, number] {
  return [
    (x - bounds.minX) * bounds.scaleX + bounds.offsetX,
    (z - bounds.minZ) * bounds.scaleZ + bounds.offsetZ,
  ];
}

export function FloorplanMinimap() {
  const nodes = useSceneStore((s) => s.nodes);

  const { walls, zones } = useMemo(() => {
    const w: WallNode[] = [];
    const z: ZoneNode[] = [];
    for (const node of Object.values(nodes)) {
      if (node.type === 'wall' && node.visible) w.push(node);
      if (node.type === 'zone' && node.visible) z.push(node);
    }
    return { walls: w, zones: z };
  }, [nodes]);

  const bounds = useMemo(() => computeBounds(walls, zones), [walls, zones]);

  // Don't render if there's nothing to show
  if (!bounds || (walls.length === 0 && zones.length === 0)) return null;

  return (
    <div className="absolute bottom-10 left-2 z-10">
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        className="rounded-md border border-border bg-background/80 backdrop-blur-sm shadow-sm"
      >
        {/* Zone fills */}
        {zones.map((zone) => {
          if (zone.polygon.length < 3) return null;
          const points = zone.polygon
            .map(([x, z]) => toSvg(x, z, bounds).join(','))
            .join(' ');
          const color = ZONE_COLORS[zone.zoneType] ?? '#808080';
          return (
            <polygon
              key={zone.id}
              points={points}
              fill={color}
              fillOpacity={0.3}
              stroke={color}
              strokeWidth={0.5}
              strokeOpacity={0.5}
            />
          );
        })}

        {/* Wall outlines */}
        {walls.map((wall) => {
          const [x1, y1] = toSvg(wall.start[0], wall.start[1], bounds);
          const [x2, y2] = toSvg(wall.end[0], wall.end[1], bounds);
          return (
            <line
              key={wall.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={2}
              className="text-foreground"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}
