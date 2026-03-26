'use client';

// lib/editor/renderers/roof-segment-renderer.tsx
// Renders individual roof segments (flat, gable, hip).
// Uses ExtrudeGeometry/BufferGeometry to create the roof shape.

import { memo, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { RoofSegmentNode } from '../schema';
import { useRegistry } from '../registry';

interface RoofSegmentRendererProps {
  node: RoofSegmentNode;
  selected: boolean;
  hovered: boolean;
  selectedColor: string;
}

/** Color palette for roof materials */
const ROOF_COLOR = '#8B4513'; // Saddle brown
const ROOF_COLOR_SELECTED = '#3b82f6';

/**
 * Creates geometry for a flat roof (simple slab at height).
 */
function createFlatRoofGeometry(
  width: number,
  depth: number,
  thickness: number,
): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, thickness, depth);
}

/**
 * Creates geometry for a gable roof (two angled planes meeting at ridge).
 */
function createGableRoofGeometry(
  width: number,
  depth: number,
  ridgeHeight: number,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;

  // Gable roof: two triangular faces on the sides, two rectangular slopes
  const vertices = new Float32Array([
    // Left slope
    -hw, 0, -hd,
    0, ridgeHeight, -hd,
    -hw, 0, hd,
    0, ridgeHeight, -hd,
    0, ridgeHeight, hd,
    -hw, 0, hd,

    // Right slope
    hw, 0, -hd,
    hw, 0, hd,
    0, ridgeHeight, -hd,
    0, ridgeHeight, -hd,
    hw, 0, hd,
    0, ridgeHeight, hd,

    // Front triangle
    -hw, 0, -hd,
    hw, 0, -hd,
    0, ridgeHeight, -hd,

    // Back triangle
    -hw, 0, hd,
    0, ridgeHeight, hd,
    hw, 0, hd,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Creates geometry for a hip roof (four angled planes).
 */
function createHipRoofGeometry(
  width: number,
  depth: number,
  ridgeHeight: number,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  // Ridge line is shorter than the full length
  const ridgeHalfLen = Math.max(0, hd - hw * 0.6);

  const vertices = new Float32Array([
    // Front hip (triangle)
    -hw, 0, -hd,
    hw, 0, -hd,
    0, ridgeHeight, -ridgeHalfLen,

    // Back hip (triangle)
    -hw, 0, hd,
    0, ridgeHeight, ridgeHalfLen,
    hw, 0, hd,

    // Left slope (quad as 2 triangles)
    -hw, 0, -hd,
    0, ridgeHeight, -ridgeHalfLen,
    -hw, 0, hd,
    0, ridgeHeight, -ridgeHalfLen,
    0, ridgeHeight, ridgeHalfLen,
    -hw, 0, hd,

    // Right slope (quad as 2 triangles)
    hw, 0, -hd,
    hw, 0, hd,
    0, ridgeHeight, -ridgeHalfLen,
    0, ridgeHeight, -ridgeHalfLen,
    hw, 0, hd,
    0, ridgeHeight, ridgeHalfLen,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function RoofSegmentRendererInner({
  node,
  selected,
  hovered,
  selectedColor,
}: RoofSegmentRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  useRegistry(node.id, 'roof-segment', meshRef);

  const coverThickness = node.coverThickness ?? 0.05;

  const geometry = useMemo(() => {
    switch (node.roofType) {
      case 'flat':
        return createFlatRoofGeometry(node.width, node.depth, coverThickness);
      case 'gable':
        return createGableRoofGeometry(node.width, node.depth, node.ridgeHeight);
      case 'hip':
        return createHipRoofGeometry(node.width, node.depth, node.ridgeHeight);
      default:
        // Fallback to flat for unsupported types
        return createFlatRoofGeometry(node.width, node.depth, coverThickness);
    }
  }, [node.roofType, node.width, node.depth, node.ridgeHeight, coverThickness]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const color = selected ? selectedColor : ROOF_COLOR;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[node.position[0], node.position[1], node.position[2]]}
      rotation={[node.rotation[0], node.rotation[1], node.rotation[2]]}
      userData={{ nodeId: node.id, nodeType: 'roof-segment' }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export const RoofSegmentRenderer = memo(RoofSegmentRendererInner, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.selected === next.selected &&
    prev.hovered === next.hovered &&
    prev.selectedColor === next.selectedColor
  );
});
