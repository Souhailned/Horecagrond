'use client';

import { memo, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { HorecaItemType, ItemNode } from '../schema';

export type ItemCategory = 'table' | 'seating' | 'kitchen' | 'bar' | 'decor';

/** Map item types to visual categories */
export const ITEM_CATEGORY: Record<HorecaItemType, ItemCategory> = {
  table_round: 'table',
  table_square: 'table',
  table_long: 'table',
  chair: 'seating',
  barstool: 'seating',
  bar_counter: 'bar',
  kitchen_counter: 'kitchen',
  oven: 'kitchen',
  stove: 'kitchen',
  fridge: 'kitchen',
  sink: 'kitchen',
  coffee_machine: 'kitchen',
  display_case: 'kitchen',
  register: 'kitchen',
  booth: 'seating',
  planter: 'decor',
  parasol: 'decor',
};

interface ItemRendererProps {
  node: ItemNode;
  selected: boolean;
  onSelect: (id: string) => void;
  categoryColors: Record<ItemCategory, string>;
  selectedColor: string;
}

function ItemRendererInner({
  node,
  selected,
  onSelect,
  categoryColors,
  selectedColor,
}: ItemRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(
    () => new THREE.BoxGeometry(node.width, node.height, node.depth),
    [node.width, node.height, node.depth],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const category = ITEM_CATEGORY[node.itemType];
  const color = categoryColors[category];

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[
        node.position[0],
        node.position[1] + node.height / 2,
        node.position[2],
      ]}
      rotation={[node.rotation[0], node.rotation[1], node.rotation[2]]}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        metalness={category === 'kitchen' ? 0.4 : 0.1}
      />
      {selected && (
        <Edges
          threshold={15}
          color={selectedColor}
          lineWidth={2}
        />
      )}
    </mesh>
  );
}

export const ItemRenderer = memo(ItemRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.onSelect === next.onSelect &&
    prev.categoryColors === next.categoryColors &&
    prev.selectedColor === next.selectedColor
  );
});
