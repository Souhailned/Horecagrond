'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { ZoneNode } from '../schema';
import { ZONE_LABELS } from '../schema';
import { polygonCentroid } from '../utils/geometry';

interface ZoneRendererProps {
  node: ZoneNode;
  selected: boolean;
  onSelect: (id: string) => void;
  zoneColor: string;
}

/** Thin extrude depth for the zone floor slab */
const ZONE_EXTRUDE_HEIGHT = 0.02;

function ZoneRendererInner({
  node,
  selected,
  onSelect,
  zoneColor,
}: ZoneRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const [first, ...rest] = node.polygon;
    if (!first) return new THREE.Shape();
    s.moveTo(first[0], first[1]);
    for (const point of rest) {
      s.lineTo(point[0], point[1]);
    }
    s.closePath();
    return s;
  }, [node.polygon]);

  const geometry = useMemo(() => {
    const settings: THREE.ExtrudeGeometryOptions = {
      depth: ZONE_EXTRUDE_HEIGHT,
      bevelEnabled: false,
    };
    return new THREE.ExtrudeGeometry(shape, settings);
  }, [shape]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const centroid = useMemo(
    () => polygonCentroid(node.polygon),
    [node.polygon],
  );

  const label = ZONE_LABELS[node.zoneType];
  const areaText = `${Math.round(node.area)}m\u00B2`;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <group>
      {/* Zone floor shape - ExtrudeGeometry creates shape in XY plane,
          rotate to lie flat on XZ plane */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color={zoneColor}
          transparent
          opacity={selected ? 0.6 : 0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Floating label above the centroid */}
      <Html
        position={[centroid[0], 0.3, centroid[1]]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="whitespace-nowrap rounded bg-foreground/75 px-2 py-1 text-center font-sans text-xs leading-tight text-background">
          <div className="font-semibold">{label}</div>
          <div className="opacity-80">{areaText}</div>
        </div>
      </Html>
    </group>
  );
}

export const ZoneRenderer = memo(ZoneRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.onSelect === next.onSelect &&
    prev.zoneColor === next.zoneColor
  );
});
