"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  Line,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore, useEditorStore } from "@/lib/editor/stores";
import { SceneRenderer } from "@/lib/editor/renderers";
import { useZoneSystem } from "@/lib/editor/systems";
import type { SceneData } from "@/lib/editor/schema";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_COLORS,
} from "@/lib/editor/schema";
import { useEditorColors } from "@/lib/editor/theme";
import { generateId } from "@/lib/editor/utils";
import { useGridEvents, useToolEvents } from "@/lib/editor/hooks";
import {
  editorEmitter,
  type GridEventPayload,
} from "@/lib/editor/events";
import { EditorToolbar } from "./editor-toolbar";
import { AssetPanel } from "./asset-panel";
import { PropertiesPanel } from "./properties-panel";
import { ZoneLegend } from "./zone-legend";
import { ShortcutsHelp } from "./shortcuts-help";

interface PropertyEditorProps {
  propertyId: string;
  floorPlanId?: string;
  initialScene?: SceneData;
  readOnly?: boolean;
  viewMode?: "2d" | "3d";
  onSave?: (scene: SceneData) => void;
}

/** Visual-only floor plane. No click handler -- interaction is handled by
 *  GridEventSystem via DOM-level canvas event listeners + manual raycasting. */
function FloorPlane({ floorColor }: { floorColor: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color={floorColor} transparent opacity={0.3} />
    </mesh>
  );
}

/** Invisible R3F component that initializes DOM-level canvas event listeners
 *  and the tool event dispatcher. Renders nothing -- just attaches hooks. */
function GridEventSystem() {
  useGridEvents();
  useToolEvents();
  return null;
}

/** Visual preview of points and lines while drawing walls/zones.
 *  Also shows a dashed preview line from the last placed point to the
 *  current cursor position, giving the user real-time feedback. */
function DrawingPreview() {
  const isDrawing = useEditorStore((s) => s.isDrawing);
  const drawPoints = useEditorStore((s) => s.drawPoints);
  const activeTool = useEditorStore((s) => s.activeTool);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);

  // Track cursor position via grid:pointermove while drawing
  useEffect(() => {
    const handleMove = (payload: GridEventPayload) => {
      if (useEditorStore.getState().isDrawing) {
        setCursorPos(payload.position);
      } else {
        setCursorPos(null);
      }
    };
    editorEmitter.on("grid:pointermove", handleMove);
    return () => {
      editorEmitter.off("grid:pointermove", handleMove);
    };
  }, []);

  // Reset cursor when drawing stops
  useEffect(() => {
    if (!isDrawing) setCursorPos(null);
  }, [isDrawing]);

  if (!isDrawing || drawPoints.length === 0) return null;

  // Convert 2D draw points to 3D positions (Y = slight elevation above floor)
  const points3D = drawPoints.map(
    ([x, z]) => new THREE.Vector3(x, 0.05, z),
  );

  const isWall = activeTool === "wall";
  const lineColor = isWall ? "#3b82f6" : "#22c55e"; // blue for walls, green for zones

  // Cursor preview line: from last draw point to current mouse position
  const lastPt = points3D[points3D.length - 1];
  const cursorPt =
    cursorPos
      ? new THREE.Vector3(cursorPos[0], 0.05, cursorPos[1])
      : null;

  return (
    <group>
      {/* Lines connecting placed points */}
      {points3D.length >= 2 && (
        <Line
          points={points3D}
          color={lineColor}
          lineWidth={3}
          dashed={false}
        />
      )}
      {/* Dashed preview line from last point to cursor */}
      {cursorPt && lastPt && (
        <Line
          points={[lastPt, cursorPt]}
          color={lineColor}
          lineWidth={2}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      )}
      {/* Dots at each placed point */}
      {points3D.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={lineColor} />
        </mesh>
      ))}
      {/* Small dot at cursor position */}
      {cursorPt && (
        <mesh position={cursorPt}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={lineColor} transparent opacity={0.6} />
        </mesh>
      )}
      {/* Instruction label at last placed point */}
      {points3D.length > 0 && (
        <Html
          position={[lastPt.x, 0.5, lastPt.z]}
          center
          distanceFactor={15}
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded bg-foreground/80 px-2 py-1 text-center font-sans text-xs text-background shadow-sm">
            {isWall
              ? `Klik voor eindpunt. Escape om te annuleren.`
              : drawPoints.length < 3
                ? `${drawPoints.length} punt${drawPoints.length > 1 ? "en" : ""} -- Klik voor meer punten.`
                : `${drawPoints.length} punten -- Klik op startpunt om te sluiten. Escape om te annuleren.`}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Camera + OrbitControls setup.
 *
 *  Click detection no longer relies on cameraDragging. Instead,
 *  `useGridEvents` uses pixel-distance between pointerdown and pointerup
 *  to distinguish a click (< 5px) from a drag. This works regardless of
 *  what OrbitControls does with LEFT button.
 *
 *  2D mode: LEFT is mapped to ROTATE (which does nothing because
 *  enableRotate=false), so left-clicks pass through to our canvas DOM
 *  handler. RIGHT button is PAN for camera movement.
 *
 *  3D mode: standard controls — LEFT=ROTATE, MIDDLE=DOLLY, RIGHT=PAN.
 *  Clicks that don't drag still fire grid events via pixel-distance check. */
function CameraSetup({
  viewMode: viewModeProp,
}: {
  viewMode?: "2d" | "3d";
}) {
  const storeViewMode = useEditorStore((s) => s.viewMode);
  const viewMode = viewModeProp ?? storeViewMode;

  if (viewMode === "2d") {
    return (
      <>
        <OrthographicCamera makeDefault position={[0, 20, 0]} zoom={40} />
        <OrbitControls
          enableRotate={false}
          enableZoom
          enablePan
          minZoom={5}
          maxZoom={200}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE, // Does nothing (rotate disabled) — clicks pass through
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      </>
    );
  }

  return (
    <>
      <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={50} />
      <OrbitControls
        enableRotate
        enableZoom
        enablePan
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2}
        maxDistance={50}
      />
    </>
  );
}

export function PropertyEditor({
  propertyId,
  floorPlanId,
  initialScene,
  readOnly = false,
  viewMode,
  onSave,
}: PropertyEditorProps) {
  useZoneSystem();
  const colors = useEditorColors();
  const loadScene = useSceneStore((s) => s.loadScene);
  const exportScene = useSceneStore((s) => s.exportScene);
  const deleteNode = useSceneStore((s) => s.deleteNode);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const finishDrawing = useEditorStore((s) => s.finishDrawing);
  const activeTool = useEditorStore((s) => s.activeTool);
  const isDrawing = useEditorStore((s) => s.isDrawing);
  const createNode = useSceneStore((s) => s.createNode);
  const hasLoadedRef = useRef(false);

  // Load initial scene once
  useEffect(() => {
    if (initialScene && !hasLoadedRef.current) {
      loadScene(initialScene);
      hasLoadedRef.current = true;
    }
  }, [initialScene, loadScene]);

  const completeDrawing = useCallback(() => {
    const points = finishDrawing();
    if (points.length < 2) return;

    if (activeTool === "wall") {
      // Create wall segments between consecutive points
      for (let i = 0; i < points.length - 1; i++) {
        createNode({
          id: generateId(),
          type: "wall",
          parentId: null,
          visible: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          start: points[i],
          end: points[i + 1],
          thickness: DEFAULT_WALL_THICKNESS,
          height: DEFAULT_WALL_HEIGHT,
          material: "brick",
        });
      }
    } else if (activeTool === "zone" && points.length >= 3) {
      createNode({
        id: generateId(),
        type: "zone",
        parentId: null,
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        zoneType: "dining_area",
        polygon: points,
        area: 0, // Will be calculated by ZoneSystem
        color: ZONE_COLORS.dining_area,
        capacity: 0,
      });
    }
  }, [finishDrawing, activeTool, createNode]);

  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;

      switch (e.key) {
        case "Delete":
        case "Backspace":
          for (const id of selectedNodeIds) {
            deleteNode(id);
          }
          clearSelection();
          break;
        case "Escape":
          // Emit tool:cancel so use-tool-events resets its internal refs
          // (wallStartRef, zonePointsRef) in addition to the store state.
          editorEmitter.emit("tool:cancel", undefined as unknown as void);
          clearSelection();
          break;
        case "Enter":
          if (isDrawing) {
            // Fallback: Enter also completes drawing for the legacy
            // multi-point flow (e.g. multiple wall segments at once)
            completeDrawing();
          }
          break;
        case "r":
        case "R":
          if (!e.ctrlKey && !e.metaKey) {
            // Rotate selected items 90 degrees around Y axis
            for (const id of selectedNodeIds) {
              const node = useSceneStore.getState().nodes[id];
              if (node && node.type === "item") {
                useSceneStore.getState().updateNode(id, {
                  rotation: [
                    node.rotation[0],
                    node.rotation[1] + Math.PI / 2,
                    node.rotation[2],
                  ],
                });
              }
            }
          }
          break;
        case "c":
          if (e.ctrlKey || e.metaKey) {
            useEditorStore.getState().copySelection();
            e.preventDefault();
          }
          break;
        case "v":
          if (e.ctrlKey || e.metaKey) {
            useEditorStore.getState().pasteClipboard();
            e.preventDefault();
          }
          break;
        case "g":
          if (!e.ctrlKey && !e.metaKey) {
            useEditorStore.getState().toggleGrid();
          }
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            if (e.shiftKey) {
              useSceneStore.temporal.getState().redo();
            } else {
              useSceneStore.temporal.getState().undo();
            }
            e.preventDefault();
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            useSceneStore.temporal.getState().redo();
            e.preventDefault();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    readOnly,
    selectedNodeIds,
    deleteNode,
    clearSelection,
    isDrawing,
    completeDrawing,
  ]);

  const handleSave = useCallback(() => {
    const scene = exportScene();
    onSave?.(scene);
  }, [exportScene, onSave]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {!readOnly && <EditorToolbar onSave={handleSave} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!readOnly && <AssetPanel />}
        <div className="relative min-h-0 flex-1 bg-muted/30">
          <Canvas
            shadows
            gl={{ antialias: true, alpha: true }}
            className="!absolute inset-0"
          >
            <CameraSetup viewMode={viewMode} />
            <ambientLight intensity={0.6} />
            <directionalLight
              position={[10, 15, 10]}
              intensity={0.8}
              castShadow
            />
            <SceneRenderer />
            <FloorPlane floorColor={colors.floorPlane} />
            {!readOnly && <GridEventSystem />}
            {!readOnly && <DrawingPreview />}
          </Canvas>
          {/* Zone legend — floating overlay top-left on canvas */}
          <div className="absolute top-2 left-2 z-10 max-w-[220px]">
            <ZoneLegend />
          </div>
          {/* Status bar with tool instructions */}
          {!readOnly && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 border-t border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              {activeTool === "select" &&
                (() => {
                  if (selectedNodeIds.length === 1) {
                    const node =
                      useSceneStore.getState().nodes[selectedNodeIds[0]];
                    if (node?.type === "wall") {
                      const dx = node.end[0] - node.start[0];
                      const dy = node.end[1] - node.start[1];
                      const length = Math.hypot(dx, dy);
                      return `Muur geselecteerd: ${length.toFixed(2)}m`;
                    }
                    if (node?.type === "item") {
                      return "Item geselecteerd. R om te roteren. Delete om te verwijderen.";
                    }
                  }
                  return "Klik om te selecteren. Delete om te verwijderen.";
                })()}
              {activeTool === "wall" &&
                (isDrawing
                  ? "Klik voor eindpunt van de muur. Muren worden automatisch doorgetrokken. Escape om te annuleren."
                  : "Klik op het canvas om een muur te beginnen tekenen.")}
              {activeTool === "zone" &&
                (isDrawing
                  ? `${useEditorStore.getState().drawPoints.length} punten -- Klik voor meer punten. Klik op startpunt om zone te sluiten (min. 3). Escape om te annuleren.`
                  : "Klik op het canvas om een zone te beginnen tekenen.")}
              {activeTool === "item" &&
                "Klik op een item in het zijpaneel en klik dan op het canvas om te plaatsen."}
              {activeTool === "measure" &&
                "Klik twee punten om af te meten."}
              {activeTool === "pan" &&
                "Sleep om te verplaatsen. Scroll om te zoomen."}
            </div>
          )}
        </div>
        {!readOnly && <PropertiesPanel />}
      </div>
      {!readOnly && <ShortcutsHelp />}
    </div>
  );
}
