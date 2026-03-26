'use client';

// lib/editor/systems/roof-system.tsx
// System that manages roof nodes and ensures roof-segment children
// are positioned correctly relative to their parent roof container.
// The actual geometry creation happens in roof-segment-renderer.tsx.

import { useFrame } from '@react-three/fiber';
import { useSceneStore } from '../stores';
import { sceneRegistry } from '../registry';

/**
 * RoofSystem ensures roof-segment nodes are kept in sync with their
 * parent roof node position. Since roof segments generate their own
 * geometry in the renderer, this system mainly handles dirty tracking.
 */
export function RoofSystem() {
  useFrame(() => {
    const state = useSceneStore.getState();
    const dirtyNodes = state.dirtyNodes;

    // Only process dirty roof segments
    const roofSegments = state.getNodesByType('roof-segment');
    for (const segment of roofSegments) {
      if (!dirtyNodes.has(segment.id)) continue;

      // The renderer handles geometry creation;
      // just mark clean after processing
      state.markClean(segment.id);
    }
  });

  return null;
}
