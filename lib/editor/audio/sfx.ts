// lib/editor/audio/sfx.ts
// Simple sound effects system using the Web Audio API.
// Infrastructure only — actual audio files can be added later.
// Listens to editorEmitter SFX events to trigger sounds.

import type { SfxType } from '../events';

// ---------------------------------------------------------------------------
// Audio file mapping
// ---------------------------------------------------------------------------

const sfxMap: Record<SfxType, string> = {
  'grid-snap': '/audio/snap.mp3',
  'item-place': '/audio/place.mp3',
  'item-delete': '/audio/delete.mp3',
  'item-rotate': '/audio/rotate.mp3',
  'item-pick': '/audio/pick.mp3',
  'structure-build': '/audio/build.mp3',
  'structure-delete': '/audio/demolish.mp3',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;
let sfxEnabled = true;
let sfxVolume = 0.5;

const bufferCache = new Map<string, AudioBuffer>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Enable or disable sound effects globally */
export function setSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
}

/** Check if SFX are currently enabled */
export function isSfxEnabled(): boolean {
  return sfxEnabled;
}

/** Set the global SFX volume (0-1) */
export function setSfxVolume(volume: number): void {
  sfxVolume = Math.max(0, Math.min(1, volume));
}

/** Get the current SFX volume */
export function getSfxVolume(): number {
  return sfxVolume;
}

/**
 * Play a sound effect by type.
 * Gracefully no-ops if:
 * - SFX are disabled
 * - Audio file doesn't exist
 * - AudioContext is not available (SSR)
 */
export async function playSfx(type: SfxType): Promise<void> {
  if (!sfxEnabled) return;
  if (typeof window === 'undefined') return;

  const path = sfxMap[type];
  if (!path) return;

  try {
    // Lazily initialize AudioContext on first use
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Check buffer cache
    let buffer = bufferCache.get(path);
    if (!buffer) {
      const response = await fetch(path);
      if (!response.ok) return; // Audio file not found — silent no-op
      const arrayBuffer = await response.arrayBuffer();
      buffer = await audioContext.decodeAudioData(arrayBuffer);
      bufferCache.set(path, buffer);
    }

    // Play the buffer
    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = sfxVolume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
  } catch {
    // Silently ignore audio errors — SFX are non-critical
  }
}

// ---------------------------------------------------------------------------
// Emitter integration
// ---------------------------------------------------------------------------

/**
 * Connect SFX system to the editor event emitter.
 * Call this once when the editor mounts.
 * Returns a cleanup function to disconnect.
 */
export function connectSfxToEmitter(): () => void {
  // Lazy import to avoid circular dependency
  const { editorEmitter } = require('../events') as {
    editorEmitter: typeof import('../events').editorEmitter;
  };

  type SfxEventKey = `sfx:${SfxType}`;
  const cleanups: Array<() => void> = [];

  for (const sfxType of Object.keys(sfxMap) as SfxType[]) {
    const event: SfxEventKey = `sfx:${sfxType}`;
    const handler = () => {
      void playSfx(sfxType);
    };
    editorEmitter.on(event, handler);
    cleanups.push(() => editorEmitter.off(event, handler));
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
