"use client";

// lib/editor/hooks/use-grid-events.ts
// Attaches DOM event listeners to the Three.js canvas element and performs
// manual raycasting against a horizontal ground plane (Y=0).
// Emits grid events via the mitt emitter, bypassing OrbitControls interception.
//
// Click detection uses a pixel-distance threshold between pointerdown and
// pointerup — if the pointer moved less than CLICK_THRESHOLD pixels, it is
// treated as a click. This reliably distinguishes clicks from OrbitControls
// pan/rotate gestures regardless of the mouseButtons configuration.

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { editorEmitter, type GridEventPayload } from "../events";

/** Maximum pixel distance between pointerdown and pointerup to count as a click */
const CLICK_THRESHOLD = 5;

export function useGridEvents() {
  const { gl, camera } = useThree();
  const canvas = gl.domElement;

  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const planeRef = useRef(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), // Y=0 ground plane
  );

  useEffect(() => {
    /** Raycast from screen coordinates to the Y=0 ground plane */
    const getGridPosition = (
      clientX: number,
      clientY: number,
    ): GridEventPayload | null => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const target = new THREE.Vector3();
      const hit = raycasterRef.current.ray.intersectPlane(
        planeRef.current,
        target,
      );

      if (!hit) return null;

      return {
        position: [target.x, target.z],
        worldPosition: [target.x, target.y, target.z],
      };
    };

    // ── Pixel-distance click detection ──────────────────────────────────
    // Record where the pointer went down. On pointerup, compare pixel
    // distance. If < CLICK_THRESHOLD, emit grid:click. This works
    // regardless of whether OrbitControls consumed the drag.
    let pointerDownPos: { x: number; y: number } | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Left button only
      pointerDownPos = { x: e.clientX, y: e.clientY };

      const payload = getGridPosition(e.clientX, e.clientY);
      if (payload) {
        editorEmitter.emit("grid:pointerdown", payload);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const payload = getGridPosition(e.clientX, e.clientY);
      if (payload) {
        editorEmitter.emit("grid:pointerup", payload);
      }

      // Check pixel distance to decide if this was a click or a drag
      if (pointerDownPos) {
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        pointerDownPos = null;

        if (distance < CLICK_THRESHOLD) {
          // Pointer barely moved — treat as a click
          if (payload) {
            editorEmitter.emit("grid:click", payload);
          }
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const payload = getGridPosition(e.clientX, e.clientY);
      if (payload) {
        editorEmitter.emit("grid:pointermove", payload);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
    };
  }, [canvas, camera]);
}
