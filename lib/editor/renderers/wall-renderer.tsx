'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { WallMaterial, WallNode } from '../schema';

interface WallRendererProps {
  node: WallNode;
  selected: boolean;
  onSelect: (id: string) => void;
  materialColors: Record<WallMaterial, string>;
  selectedColor: string;
}

function WallRendererInner({
  node,
  selected,
  onSelect,
  materialColors,
  selectedColor,
}: WallRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { length, midpoint, angle } = useMemo(() => {
    const dx = node.end[0] - node.start[0];
    const dy = node.end[1] - node.start[1];
    return {
      length: Math.hypot(dx, dy),
      midpoint: [
        (node.start[0] + node.end[0]) / 2,
        (node.start[1] + node.end[1]) / 2,
      ] as const,
      angle: Math.atan2(dy, dx),
    };
  }, [node.start, node.end]);

  const geometry = useMemo(
    () => new THREE.BoxGeometry(length, node.height, node.thickness),
    [length, node.height, node.thickness],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const materialColor = selected
    ? selectedColor
    : materialColors[node.material];

  const isGlass = node.material === 'glass';

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[midpoint[0], node.height / 2, midpoint[1]]}
      rotation={[0, -angle, 0]}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={materialColor}
        transparent={isGlass}
        opacity={isGlass ? 0.35 : 1}
        roughness={isGlass ? 0.1 : 0.8}
        metalness={isGlass ? 0.0 : 0.1}
      />
    </mesh>
  );
}

export const WallRenderer = memo(WallRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.onSelect === next.onSelect &&
    prev.materialColors === next.materialColors &&
    prev.selectedColor === next.selectedColor
  );
});
