'use client';

// lib/editor/systems/wall-cutaway.tsx
// R3F system that adjusts wall material opacity based on wallMode.
// - 'up': all walls fully visible (default)
// - 'down': all walls near-transparent (opacity 0.1)
// - 'cutaway': exterior-facing walls hidden, interior walls visible

import { useFrame } from '@react-three/fiber';
import { useEditorStore } from '../stores';
import { useSceneStore } from '../stores';
import { sceneRegistry } from '../registry';
import type * as THREE from 'three';

/**
 * Iterates over all wall meshes and adjusts their material opacity
 * based on the current wallMode.
 */
export function WallCutawaySystem() {
  const wallMode = useEditorStore((s) => s.wallMode);

  useFrame(() => {
    if (wallMode === 'up') {
      // All walls visible -- ensure opacity is restored
      const wallNodes = useSceneStore.getState().getNodesByType('wall');
      for (const wall of wallNodes) {
        const entry = sceneRegistry.get(wall.id);
        if (!entry) continue;
        const mesh = entry as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (!material) continue;

        const isGlass = wall.material === 'glass';
        material.opacity = isGlass ? 0.35 : 1;
        material.transparent = isGlass;
        material.needsUpdate = true;
      }
      return;
    }

    const wallNodes = useSceneStore.getState().getNodesByType('wall');

    for (const wall of wallNodes) {
      const entry = sceneRegistry.get(wall.id);
      if (!entry) continue;
      const mesh = entry as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material) continue;

      if (wallMode === 'down') {
        material.opacity = 0.1;
        material.transparent = true;
        material.needsUpdate = true;
      } else if (wallMode === 'cutaway') {
        // Cutaway: hide exterior-facing walls
        const isExterior =
          wall.frontSide === 'exterior' || wall.backSide === 'exterior';
        if (isExterior) {
          material.opacity = 0.1;
          material.transparent = true;
        } else {
          const isGlass = wall.material === 'glass';
          material.opacity = isGlass ? 0.35 : 1;
          material.transparent = isGlass;
        }
        material.needsUpdate = true;
      }
    }
  });

  return null;
}
