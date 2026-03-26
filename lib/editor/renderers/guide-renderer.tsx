'use client';

// lib/editor/renderers/guide-renderer.tsx
// Renders a guide/reference image as a textured plane with a dashed border.
// Similar to scan-renderer but with a visual outline to distinguish it.

import { memo, useRef, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { useTexture, Line } from '@react-three/drei';
import type { GuideNode } from '../schema';
import { DEFAULT_OVERLAY_OPACITY } from '../schema';
import { useRegistry } from '../registry';

interface GuideRendererProps {
  node: GuideNode;
  selected: boolean;
  hovered: boolean;
  selectedColor: string;
}

/** Inner component that loads the texture via useTexture (must be inside Suspense) */
function GuideTexturedPlane({
  node,
  selected,
  selectedColor,
}: {
  node: GuideNode;
  selected: boolean;
  selectedColor: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useRegistry(node.id, 'guide', meshRef);

  const texture = useTexture(node.url);

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

  // Border outline points (in XZ plane, will be rotated)
  const halfW = planeArgs[0] / 2;
  const halfH = planeArgs[1] / 2;
  const borderPoints = useMemo(
    () => [
      new THREE.Vector3(-halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, -halfH),
    ],
    [halfW, halfH],
  );

  return (
    <group position={[node.position[0], 0.003, node.position[2]]}>
      {/* Textured plane */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ nodeId: node.id, nodeType: 'guide' }}
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
      {/* Dashed border outline */}
      <Line
        points={borderPoints}
        color={selected ? selectedColor : '#ff9800'}
        lineWidth={2}
        dashed
        dashSize={0.2}
        gapSize={0.1}
      />
    </group>
  );
}

/** Fallback while texture loads */
function GuidePlaceholder({ node }: { node: GuideNode }) {
  const scaleX = node.scale?.[0] ?? 10;
  const scaleZ = node.scale?.[2] ?? 10;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[node.position[0], 0.003, node.position[2]]}
      userData={{ nodeId: node.id, nodeType: 'guide' }}
    >
      <planeGeometry args={[scaleX, scaleZ]} />
      <meshBasicMaterial
        color="#ff9800"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function GuideRendererInner({
  node,
  selected,
  hovered,
  selectedColor,
}: GuideRendererProps) {
  if (!node.url) return null;

  return (
    <Suspense fallback={<GuidePlaceholder node={node} />}>
      <GuideTexturedPlane
        node={node}
        selected={selected}
        selectedColor={selectedColor}
      />
    </Suspense>
  );
}

export const GuideRenderer = memo(GuideRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.hovered === next.hovered &&
    prev.selectedColor === next.selectedColor
  );
});
