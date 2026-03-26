// lib/editor/presets/index.ts
// Saved view presets — camera position + view mode combos.
// Stored in Zustand for session persistence.

import { create } from 'zustand';
import type { ViewMode } from '../stores/editor-store';
import type { Vec3 } from '../schema/nodes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewPreset {
  id: string;
  name: string;
  /** Camera position [x, y, z] */
  cameraPosition: Vec3;
  /** OrbitControls target [x, y, z] */
  cameraTarget: Vec3;
  /** View mode when this preset was saved */
  viewMode: ViewMode;
  /** Camera zoom (for orthographic) */
  zoom?: number;
  /** Timestamp when preset was created */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface PresetState {
  presets: ViewPreset[];
  addPreset: (preset: ViewPreset) => void;
  removePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  clearPresets: () => void;
}

export const usePresetStore = create<PresetState>()((set) => ({
  presets: [],

  addPreset: (preset) => {
    set((state) => ({
      presets: [...state.presets, preset],
    }));
  },

  removePreset: (id) => {
    set((state) => ({
      presets: state.presets.filter((p) => p.id !== id),
    }));
  },

  renamePreset: (id, name) => {
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === id ? { ...p, name } : p,
      ),
    }));
  },

  clearPresets: () => {
    set({ presets: [] });
  },
}));

// ---------------------------------------------------------------------------
// Helper to create a preset from current camera state
// ---------------------------------------------------------------------------

export function createPresetFromCamera(
  name: string,
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  viewMode: ViewMode,
  zoom?: number,
): ViewPreset {
  return {
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    cameraPosition,
    cameraTarget,
    viewMode,
    zoom,
    createdAt: Date.now(),
  };
}
