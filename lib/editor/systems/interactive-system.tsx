'use client';

// lib/editor/systems/interactive-system.tsx
// System that processes items with interactive controls (e.g., lights).
// When a light item has a toggle control set to "on", adds a PointLight
// at the item position. When toggled "off", removes it.

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneStore } from '../stores';

/** Set of item types that should emit light when toggled on */
const LIGHT_ITEM_TYPES = new Set([
  'ceiling_light',
  'wall_light',
]);

/**
 * InteractiveSystem manages dynamic effects for items with controls.
 * Currently supports:
 * - Light toggle: items matching LIGHT_ITEM_TYPES get a PointLight
 *   when they have a "power" control with value === true.
 */
export function InteractiveSystem() {
  const { scene } = useThree();
  const lightsRef = useRef<Map<string, THREE.PointLight>>(new Map());

  // Cleanup all lights on unmount
  useEffect(() => {
    return () => {
      for (const light of lightsRef.current.values()) {
        light.parent?.remove(light);
        light.dispose();
      }
      lightsRef.current.clear();
    };
  }, []);

  useFrame(() => {
    const items = useSceneStore.getState().getNodesByType('item');
    const activeIds = new Set<string>();

    for (const item of items) {
      if (!LIGHT_ITEM_TYPES.has(item.itemType)) continue;
      if (!item.controls || item.controls.length === 0) continue;

      // Find the "power" toggle control
      const powerControl = item.controls.find(
        (c) => c.property === 'power' && c.type === 'toggle',
      );

      if (!powerControl || powerControl.value !== true) continue;

      activeIds.add(item.id);

      // Find the intensity slider control (default 0.8)
      const intensityControl = item.controls.find(
        (c) => c.property === 'intensity' && c.type === 'slider',
      );
      const intensity =
        typeof intensityControl?.value === 'number'
          ? intensityControl.value
          : 0.8;

      const existing = lightsRef.current.get(item.id);
      if (existing) {
        // Update position and intensity
        existing.position.set(
          item.position[0],
          item.position[1] + item.height,
          item.position[2],
        );
        existing.intensity = intensity * 2;
      } else {
        // Create new point light
        const light = new THREE.PointLight('#fff5e0', intensity * 2, 8, 2);
        light.position.set(
          item.position[0],
          item.position[1] + item.height,
          item.position[2],
        );
        light.castShadow = false;
        scene.add(light);
        lightsRef.current.set(item.id, light);
      }
    }

    // Remove lights for items that no longer qualify
    for (const [id, light] of lightsRef.current.entries()) {
      if (!activeIds.has(id)) {
        light.parent?.remove(light);
        light.dispose();
        lightsRef.current.delete(id);
      }
    }
  });

  return null;
}
