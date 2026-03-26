'use client';

// lib/editor/renderers/scan-renderer.tsx
// Renders a floor plan image as a textured plane for tracing reference.
// Uses node.url to load the image texture.

import { memo, useRef, useMemo, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import type { ScanNode } from '../schema';
import { DEFAULT_OVERLAY_OPACITY } from '../schema';
import { useRegistry } from '../registry';

interface ScanRendererProps {
  node: ScanNode;
  selected: boolean;
  hovered: boolean;
  selectedColor: string;
}

/** Inner component that loads the texture via useTexture (must be inside Suspense) */
function ScanTexturedPlane({
  node,
  selected,
  selectedColor,
}: {
  node: ScanNode;
  selected: boolean;
  selectedColor: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useRegistry(node.id, 'scan', meshRef);

  const texture = useTexture(node.url);

  // Determine plane size from texture aspect ratio + node scale
  const planeArgs = useMemo((): [number, number] => {
    const scaleX = node.scale?.[0] ?? 10;
    const scaleZ = node.scale?.[2] ?? 10;

    const img = texture.image as HTMLImageElement | undefined;
    if (img && img.width && img.height) {
      const aspect = img.width / img.height;
      return [scaleX * aspect, scaleZ];
    }
    return [scaleX, scaleZ];
  }, [texture.image, node.scale]);

  const opacity = node.opacity ?? DEFAULT_OVERLAY_OPACITY;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[node.position[0], 0.002, node.position[2]]}
      userData={{ nodeId: node.id, nodeType: 'scan' }}
    >
      <planeGeometry args={planeArgs} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        color={selected ? selectedColor : '#ffffff'}
      />
    </mesh>
  );
}

/** Fallback while texture loads */
function ScanPlaceholder({ node }: { node: ScanNode }) {
  const scaleX = node.scale?.[0] ?? 10;
  const scaleZ = node.scale?.[2] ?? 10;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[node.position[0], 0.002, node.position[2]]}
      userData={{ nodeId: node.id, nodeType: 'scan' }}
    >
      <planeGeometry args={[scaleX, scaleZ]} />
      <meshBasicMaterial
        color="#cccccc"
        transparent
        opacity={0.2}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ScanRendererInner({
  node,
  selected,
  hovered,
  selectedColor,
}: ScanRendererProps) {
  // Skip rendering if no URL
  if (!node.url) return null;

  return (
    <Suspense fallback={<ScanPlaceholder node={node} />}>
      <ScanTexturedPlane
        node={node}
        selected={selected}
        selectedColor={selectedColor}
      />
    </Suspense>
  );
}

export const ScanRenderer = memo(ScanRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.hovered === next.hovered &&
    prev.selectedColor === next.selectedColor
  );
});
