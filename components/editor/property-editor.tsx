"use client";

import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
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
import {
  useZoneSystem,
  WallSystem,
  LevelSystem,
  DoorSystem,
  WindowSystem,
  ItemSystem,
  SlabSystem,
  CeilingSystem,
} from "@/lib/editor/systems";
import { PolygonEditor } from "@/lib/editor/tools";
import type { SceneData, ZoneNode } from "@/lib/editor/schema";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_COLORS,
} from "@/lib/editor/schema";
import { useEditorColors } from "@/lib/editor/theme";
import { generateId, computeSceneBounds } from "@/lib/editor/utils";
import { useGridEvents, useToolEvents } from "@/lib/editor/hooks";
import {
  editorEmitter,
  type GridEventPayload,
} from "@/lib/editor/events";
import { EditorOutlines } from "@/lib/editor/effects";
import { WallLabels } from "@/lib/editor/renderers";
import { WallCutawaySystem } from "@/lib/editor/systems/wall-cutaway";
import { RoofSystem } from "@/lib/editor/systems/roof-system";
import { InteractiveSystem } from "@/lib/editor/systems/interactive-system";
import { EditorToolbar } from "./editor-toolbar";
import { AssetPanel } from "./asset-panel";
import { PropertiesPanel } from "./properties-panel";
import { ZoneLegend } from "./zone-legend";
import { ShortcutsHelp } from "./shortcuts-help";
import { CommandPalette } from "./command-palette";
import { NodeContextMenu } from "./node-context-menu";
import { EditorEmptyState } from "./editor-empty-state";
import { TemplateDialog } from "./template-dialog";
import { AiGenerateDialog } from "./ai-generate-dialog";
import { SceneSidebar } from "./scene-sidebar";
import { FloorplanMinimap } from "./floorplan-minimap";

/* ------------------------------------------------------------------ */
/* Error Boundary                                                      */
/* ------------------------------------------------------------------ */

class EditorErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center bg-muted/30 p-8">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-destructive">
                Er is een fout opgetreden in de editor
              </p>
              <p className="text-xs text-muted-foreground">
                {this.state.error?.message}
              </p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="text-xs text-primary underline"
              >
                Probeer opnieuw
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

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

/** Visual preview of points and lines while drawing walls/zones/measuring.
 *  Shows distance labels, close-polygon indicators, and real-time feedback. */
function DrawingPreview() {
  const isDrawing = useEditorStore((s) => s.isDrawing);
  const drawPoints = useEditorStore((s) => s.drawPoints);
  const activeTool = useEditorStore((s) => s.activeTool);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);

  // Track cursor position via grid:pointermove while drawing
  useEffect(() => {
    const handleMove = (payload: GridEventPayload) => {
      const tool = useEditorStore.getState().activeTool;
      if (
        useEditorStore.getState().isDrawing ||
        tool === "wall" ||
        tool === "zone" ||
        tool === "slab" ||
        tool === "ceiling" ||
        tool === "measure"
      ) {
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

  useEffect(() => {
    if (!isDrawing) setCursorPos(null);
  }, [isDrawing]);

  if (!isDrawing || drawPoints.length === 0) return null;

  const points3D = drawPoints.map(
    ([x, z]) => new THREE.Vector3(x, 0.05, z),
  );

  const isWall = activeTool === "wall";
  const isMeasure = activeTool === "measure";
  const isZone = activeTool === "zone";
  const isSlab = activeTool === "slab";
  const isCeiling = activeTool === "ceiling";
  const isPolygonTool = isZone || isSlab || isCeiling;
  const lineColor = isWall
    ? "#3b82f6"
    : isMeasure
      ? "#f59e0b"
      : isSlab
        ? "#a855f7"
        : isCeiling
          ? "#06b6d4"
          : "#22c55e";

  const lastPt = points3D[points3D.length - 1];
  const firstPt = points3D[0];
  const cursorPt = cursorPos
    ? new THREE.Vector3(cursorPos[0], 0.05, cursorPos[1])
    : null;

  // Calculate distance from last point to cursor
  const cursorDistance =
    cursorPos && drawPoints.length > 0
      ? Math.hypot(
          cursorPos[0] - drawPoints[drawPoints.length - 1][0],
          cursorPos[1] - drawPoints[drawPoints.length - 1][1],
        )
      : 0;

  // Check if cursor is near the first point (for close indicator) -- works for zone/slab/ceiling
  const isNearFirstPoint =
    isPolygonTool &&
    cursorPos &&
    drawPoints.length >= 3 &&
    Math.hypot(
      cursorPos[0] - drawPoints[0][0],
      cursorPos[1] - drawPoints[0][1],
    ) < 0.3;

  // Midpoint for distance label
  const labelPos =
    cursorPt && lastPt
      ? new THREE.Vector3(
          (lastPt.x + cursorPt.x) / 2,
          0.15,
          (lastPt.z + cursorPt.z) / 2,
        )
      : null;

  // For completed measurements (2 points, no cursor)
  const completedDistance =
    drawPoints.length === 2
      ? Math.hypot(
          drawPoints[1][0] - drawPoints[0][0],
          drawPoints[1][1] - drawPoints[0][1],
        )
      : 0;

  const completedMidpoint =
    drawPoints.length === 2
      ? new THREE.Vector3(
          (drawPoints[0][0] + drawPoints[1][0]) / 2,
          0.15,
          (drawPoints[0][1] + drawPoints[1][1]) / 2,
        )
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

      {/* Polygon closing line from cursor to first point (zone/slab/ceiling) */}
      {isPolygonTool && cursorPt && drawPoints.length >= 2 && (
        <Line
          points={[cursorPt, firstPt]}
          color={isNearFirstPoint ? "#4ade80" : "#22c55e"}
          lineWidth={1}
          dashed
          dashSize={0.1}
          gapSize={0.15}
          transparent
          opacity={0.4}
        />
      )}

      {/* Dots at each placed point */}
      {points3D.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={lineColor} />
        </mesh>
      ))}

      {/* Zone close indicator: larger green ring on first point */}
      {isNearFirstPoint && (
        <mesh position={[drawPoints[0][0], 0.06, drawPoints[0][1]]}>
          <ringGeometry args={[0.15, 0.22, 24]} />
          <meshBasicMaterial
            color="#4ade80"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Small dot at cursor position */}
      {cursorPt && (
        <mesh position={cursorPt}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={lineColor} transparent opacity={0.6} />
        </mesh>
      )}

      {/* Distance label while drawing */}
      {labelPos && cursorDistance > 0.05 && (
        <Html position={labelPos} center style={{ pointerEvents: "none" }}>
          <div className="rounded bg-background/90 px-1.5 py-0.5 text-xs font-mono text-foreground shadow-sm border border-border whitespace-nowrap">
            {cursorDistance.toFixed(2)}m
          </div>
        </Html>
      )}

      {/* Completed measurement label */}
      {isMeasure && completedMidpoint && completedDistance > 0 && !cursorPt && (
        <Html
          position={completedMidpoint}
          center
          style={{ pointerEvents: "none" }}
        >
          <div className="rounded bg-amber-500/90 px-2 py-1 text-xs font-mono font-bold text-white shadow-sm whitespace-nowrap">
            {completedDistance.toFixed(2)}m
          </div>
        </Html>
      )}
    </group>
  );
}

/** Inner R3F component that auto-centers the camera on scene content.
 *  Runs once after mount and whenever the node count changes (e.g. template
 *  load). Without this, the 2D orthographic camera defaults to [0,20,0]
 *  looking at origin while scene content may be offset (e.g. 0-10 on X,
 *  0-8 on Z), leaving the canvas looking empty. */
function CameraAutoFit({ viewMode }: { viewMode: "2d" | "3d" }) {
  const { camera, controls } = useThree();
  const nodes = useSceneStore((s) => s.nodes);
  const fittedRef = useRef(false);

  const nodeCount = Object.keys(nodes).length;

  useEffect(() => {
    // Reset fitted flag when scene is cleared so next load re-fits
    if (nodeCount === 0) {
      fittedRef.current = false;
      return;
    }
    // Only auto-fit once per scene load to avoid fighting user panning
    if (fittedRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds = computeSceneBounds(nodes as any);
    if (!bounds) return;

    fittedRef.current = true;

    const padding = 2; // meters of margin around content
    const cx = bounds.centerX;
    const cz = bounds.centerZ;

    if (viewMode === "2d") {
      camera.position.set(cx, 20, cz);

      if (camera instanceof THREE.OrthographicCamera) {
        const viewWidth = (camera.right - camera.left) / camera.zoom;
        const viewHeight = (camera.top - camera.bottom) / camera.zoom;
        const sceneWidth = bounds.width + padding * 2;
        const sceneDepth = bounds.depth + padding * 2;

        if (viewWidth > 0 && viewHeight > 0) {
          const zoomX = viewWidth / sceneWidth;
          const zoomY = viewHeight / sceneDepth;
          camera.zoom = Math.min(zoomX, zoomY) * camera.zoom;
          camera.zoom = Math.max(5, Math.min(200, camera.zoom));
        }
        camera.updateProjectionMatrix();
      }
    } else {
      const maxSpan = Math.max(bounds.width, bounds.depth) + padding * 2;
      const dist = maxSpan * 1.2;
      camera.position.set(cx + dist * 0.7, dist * 0.6, cz + dist * 0.7);
    }

    // Point OrbitControls at scene center
    if (controls && "target" in controls) {
      const orbitTarget = (controls as unknown as { target: THREE.Vector3 })
        .target;
      orbitTarget.set(cx, 0, cz);
      (controls as unknown as { update: () => void }).update();
    }
  }, [nodeCount, nodes, camera, controls, viewMode]);

  return null;
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
        <CameraAutoFit viewMode="2d" />
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
      <CameraAutoFit viewMode="3d" />
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
  const nodes = useSceneStore((s) => s.nodes);
  const setTool = useEditorStore((s) => s.setTool);
  const storeViewMode = useEditorStore((s) => s.viewMode);
  const gridSize = useEditorStore((s) => s.gridSize);
  const phase = useEditorStore((s) => s.phase);
  const hasLoadedRef = useRef(false);

  // Derive the selected zone for polygon editing
  const effectiveViewMode = viewMode ?? storeViewMode;
  const selectedZone: ZoneNode | null =
    selectedNodeIds.length === 1
      ? (() => {
          const node = nodes[selectedNodeIds[0]];
          return node?.type === "zone" ? (node as ZoneNode) : null;
        })()
      : null;

  // Empty state dialog control
  const [templateOpen, setTemplateOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);

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

  const handleSave = useCallback(() => {
    const scene = exportScene();
    onSave?.(scene);
  }, [exportScene, onSave]);

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

      const store = useEditorStore.getState();
      const currentPhase = store.phase;

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
          editorEmitter.emit("tool:cancel");
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

        // ── Phase shortcuts ──────────────────────────────────────────────
        case "1":
          if (!e.ctrlKey && !e.metaKey) {
            store.setPhase("structure");
          }
          break;
        case "s":
          if (e.ctrlKey || e.metaKey) {
            // Cmd+S: save
            e.preventDefault();
            handleSave();
          } else {
            store.setPhase("structure");
          }
          break;
        case "2":
          if (!e.ctrlKey && !e.metaKey) {
            store.setPhase("furnish");
          }
          break;
        case "f":
          if (!e.ctrlKey && !e.metaKey) {
            store.setPhase("furnish");
          }
          break;

        // ── Tool shortcuts ───────────────────────────────────────────────
        case "w":
          if (!e.ctrlKey && !e.metaKey && currentPhase === "structure") {
            store.setTool("wall");
          }
          break;
        case "q":
          if (!e.ctrlKey && !e.metaKey && currentPhase === "structure") {
            store.setTool("zone");
          }
          break;
        case "d":
          if (!e.ctrlKey && !e.metaKey && currentPhase === "structure") {
            store.setTool("door");
          }
          break;
        case "m":
          if (!e.ctrlKey && !e.metaKey) {
            store.setTool("measure");
          }
          break;

        // ── Select all ───────────────────────────────────────────────────
        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const allNodeIds = Object.keys(useSceneStore.getState().nodes);
            // Select all visible nodes
            for (const id of allNodeIds) {
              store.selectNode(id, true);
            }
          }
          break;

        // ── Level navigation ─────────────────────────────────────────────
        case "ArrowUp":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            store.setActiveLevel(store.activeLevelIndex + 1);
          }
          break;
        case "ArrowDown":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            store.setActiveLevel(Math.max(0, store.activeLevelIndex - 1));
          }
          break;

        // ── Command palette ──────────────────────────────────────────────
        case "k":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            editorEmitter.emit("tool:activate", { tool: "command-palette" });
          }
          break;

        // ── Undo / Redo ──────────────────────────────────────────────────
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
    handleSave,
  ]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {!readOnly && <EditorToolbar onSave={handleSave} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!readOnly && <AssetPanel />}
        {!readOnly && <SceneSidebar />}
        <NodeContextMenu>
        <div className="relative min-h-0 flex-1 bg-muted/30 z-0">
          <EditorErrorBoundary>
            <Canvas
              shadows
              gl={{ antialias: true, alpha: true }}
              className="!absolute inset-0 z-0"
            >
              <CameraSetup viewMode={viewMode} />
              <ambientLight intensity={0.6} />
              <directionalLight
                position={[10, 15, 10]}
                intensity={0.8}
                castShadow
              />
              <SceneRenderer />
              <WallSystem />
              <LevelSystem />
              <WallCutawaySystem />
              <RoofSystem />
              <InteractiveSystem />
              <EditorOutlines />
              <WallLabels />
              <FloorPlane floorColor={colors.floorPlane} />
              {!readOnly && <GridEventSystem />}
              {!readOnly && <DrawingPreview />}
              {/* Zone polygon vertex editor — only in 2D select mode */}
              {!readOnly &&
                selectedZone &&
                effectiveViewMode === "2d" &&
                activeTool === "select" && (
                  <PolygonEditor
                    zoneId={selectedZone.id}
                    polygon={selectedZone.polygon}
                    color={selectedZone.color}
                    gridSize={gridSize}
                  />
                )}
            </Canvas>
          </EditorErrorBoundary>
          {/* Zone legend — floating overlay top-left on canvas */}
          <div className="absolute top-2 left-2 z-10 max-w-[220px]">
            <ZoneLegend />
          </div>
          {/* 2D minimap — floating overlay bottom-left on canvas */}
          <FloorplanMinimap />
          {/* Empty state overlay — shown when no nodes exist */}
          {!readOnly && (
            <>
              <EditorEmptyState
                onOpenTemplate={() => setTemplateOpen(true)}
                onOpenAiGenerate={() => setAiGenerateOpen(true)}
                onStartDrawing={() => setTool("wall")}
              />
              {/* Headless controlled dialogs for empty state triggers */}
              <TemplateDialog
                open={templateOpen}
                onOpenChange={setTemplateOpen}
              />
              <AiGenerateDialog
                open={aiGenerateOpen}
                onOpenChange={setAiGenerateOpen}
              />
            </>
          )}
          {/* Status bar with tool instructions */}
          {!readOnly && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 border-t border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-medium text-foreground">
                {phase === "structure" ? "Structuur" : "Inrichting"}
              </span>
              <span className="text-border">|</span>
              {activeTool === "select" &&
                (() => {
                  if (selectedNodeIds.length === 1) {
                    const node =
                      useSceneStore.getState().nodes[selectedNodeIds[0]];
                    if (node?.type === "wall") {
                      const dx = node.end[0] - node.start[0];
                      const dy = node.end[1] - node.start[1];
                      const length = Math.hypot(dx, dy);
                      return `Muur geselecteerd: ${length.toFixed(2)}m — Sleep om te verplaatsen. Delete om te verwijderen.`;
                    }
                    if (node?.type === "zone") {
                      return effectiveViewMode === "2d"
                        ? `Zone geselecteerd: ${node.area.toFixed(1)}m² — Sleep hoekpunten om vorm aan te passen. Dubbelklik om punt te verwijderen. Klik groen punt om nieuw punt toe te voegen.`
                        : `Zone geselecteerd: ${node.area.toFixed(1)}m² — Delete om te verwijderen.`;
                    }
                    if (node?.type === "item") {
                      return "Item geselecteerd. R = roteren, Delete = verwijderen, Cmd+C/V = kopiëren.";
                    }
                  }
                  if (selectedNodeIds.length > 1) {
                    return `${selectedNodeIds.length} elementen geselecteerd. Delete om te verwijderen.`;
                  }
                  return "Klik om te selecteren. Cmd+klik voor meervoudige selectie.";
                })()}
              {activeTool === "wall" &&
                (isDrawing
                  ? "Klik voor eindpunt. Muren worden doorgetrokken. Shift = vrije hoek. Escape = annuleren."
                  : "Klik om een muur te beginnen. Automatisch 45° snapping en verbinding met bestaande muren.")}
              {activeTool === "zone" &&
                (isDrawing
                  ? `${useEditorStore.getState().drawPoints.length} punten — Klik voor meer punten. Klik op startpunt om te sluiten. Escape = annuleren.`
                  : "Klik op het canvas om een zone te tekenen (min. 3 punten).")}
              {activeTool === "item" &&
                (useEditorStore.getState().placingItemType
                  ? "Klik op het canvas om te plaatsen. Klik meerdere keren voor meerdere items. Escape = stoppen."
                  : "Selecteer een item in het zijpaneel en klik dan op het canvas.")}
              {activeTool === "measure" &&
                (isDrawing
                  ? "Klik voor het eindpunt van de meting."
                  : "Klik twee punten om de afstand te meten.")}
              {activeTool === "slab" &&
                (isDrawing
                  ? `${useEditorStore.getState().drawPoints.length} punten — Klik voor meer punten. Klik op startpunt om te sluiten. Escape = annuleren.`
                  : "Klik op het canvas om een vloerplaat te tekenen (min. 3 punten).")}
              {activeTool === "ceiling" &&
                (isDrawing
                  ? `${useEditorStore.getState().drawPoints.length} punten — Klik voor meer punten. Klik op startpunt om te sluiten. Escape = annuleren.`
                  : "Klik op het canvas om een plafond te tekenen (min. 3 punten).")}
              {activeTool === "pan" &&
                "Rechtermuisknop = camera verplaatsen. Scrollwiel = zoomen."}
            </div>
          )}
        </div>
        </NodeContextMenu>
        {!readOnly && <PropertiesPanel />}
      </div>
      {!readOnly && <ShortcutsHelp />}
      {!readOnly && <CommandPalette onSave={handleSave} />}
    </div>
  );
}
