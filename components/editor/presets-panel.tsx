'use client';

// components/editor/presets-panel.tsx
// Popover for managing saved view presets.
// Save current camera position + view mode, restore later.

import { useState, useCallback } from 'react';
import {
  Camera,
  Plus,
  Trash2,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePresetStore, createPresetFromCamera } from '@/lib/editor/presets';
import type { ViewPreset } from '@/lib/editor/presets';
import { useEditorStore } from '@/lib/editor/stores';
import { editorEmitter } from '@/lib/editor/events';

export function PresetsPanel() {
  const presets = usePresetStore((s) => s.presets);
  const addPreset = usePresetStore((s) => s.addPreset);
  const removePreset = usePresetStore((s) => s.removePreset);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const viewMode = useEditorStore((s) => s.viewMode);

  const [newName, setNewName] = useState('');

  const handleSavePreset = useCallback(() => {
    const name = newName.trim() || `Weergave ${presets.length + 1}`;

    // We store the camera position/target from the emitter event system.
    // For now, use reasonable defaults that get overridden when the
    // camera event handler populates the actual values.
    const preset = createPresetFromCamera(
      name,
      [0, 20, 0],
      [0, 0, 0],
      viewMode,
      40,
    );

    // Try to get actual camera position from the three.js canvas
    try {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        // The camera state is stored in the R3F store
        const r3fStore = (canvas as HTMLCanvasElement & { __r3f?: { store?: { getState: () => { camera: { position: { x: number; y: number; z: number }; zoom?: number } } } } }).__r3f;
        if (r3fStore?.store) {
          const camera = r3fStore.store.getState().camera;
          preset.cameraPosition = [
            camera.position.x,
            camera.position.y,
            camera.position.z,
          ];
          if ('zoom' in camera && typeof camera.zoom === 'number') {
            preset.zoom = camera.zoom;
          }
        }
      }
    } catch {
      // Fall through with defaults
    }

    addPreset(preset);
    setNewName('');
  }, [newName, presets.length, viewMode, addPreset]);

  const handleRestorePreset = useCallback(
    (preset: ViewPreset) => {
      setViewMode(preset.viewMode);
      // Emit camera event to move to preset position
      editorEmitter.emit('camera-controls:view', {
        nodeId: preset.id,
      });
    },
    [setViewMode],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Camera className="size-3.5" />
          Weergaven
          {presets.length > 0 && (
            <span className="text-muted-foreground">
              ({presets.length})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium px-1">Opgeslagen weergaven</p>

          {/* Preset list */}
          {presets.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">
              Geen opgeslagen weergaven.
            </p>
          ) : (
            <div className="space-y-0.5">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-muted/50 text-xs cursor-pointer"
                  onClick={() => handleRestorePreset(preset)}
                >
                  <Eye className="size-3 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {preset.viewMode}
                  </span>
                  <button
                    className="p-0.5 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePreset(preset.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save new preset */}
          <div className="border-t border-border pt-2 space-y-1.5">
            <Input
              placeholder="Naam weergave..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
              }}
            />
            <Button
              variant="default"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleSavePreset}
            >
              <Plus className="size-3 mr-1" />
              Huidige weergave opslaan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
