# Pascal Editor vs Horecagrond Editor: Deep Feature Comparison

## Executive Summary

The Pascal Editor is a production-grade architectural floor plan editor with 14 node types, 7 geometry systems, per-node event handling, CSG wall cutouts, WebGPU rendering with post-processing, multi-level buildings, and a sophisticated phase/mode/tool UI model. The Horecagrond editor is an early-stage implementation with 4 node types, simple BoxGeometry rendering, a flat scene graph, and basic tools operating through a single grid-event pipeline. The gap is substantial across every dimension.

---

## A. Node Types & Schema

| Node Type | Pascal | Horecagrond | Gap |
|-----------|--------|-------------|-----|
| **Wall** | Zod schema, start/end, optional thickness/height, children (doors/windows), frontSide/backSide for cutaway | TS interface, start/end, fixed thickness/height/material, no children | Missing: children array, space-detection sides, Zod validation |
| **Zone** | Zod, polygon, color, metadata | TS interface, polygon, zoneType enum, area, capacity, color | HG has extra horeca-specific fields (good), but no Zod |
| **Item** | Zod, position/rotation/scale, full Asset schema (src, dimensions, attachTo, interactive controls/effects, surface), wallId/wallT for wall attachment, collectionIds | TS interface, itemType enum, width/depth/height, no 3D model, no wall attachment | **Critical gap**: No GLTF model loading, no wall attachment, no asset catalog |
| **Door** | Zod, parametric (segments, frame, handle, hinges, panic bar, closer), wallId, side | Missing entirely | **Missing** |
| **Window** | Zod, parametric (column/row ratios, frame, sill, dividers), wallId, side | Missing entirely | **Missing** |
| **Slab** | Zod, polygon with holes, elevation | TS interface, polygon, thickness only, no holes | Missing: holes, elevation |
| **Ceiling** | Zod, polygon with holes, height, children for ceiling-mounted items | Missing entirely | **Missing** |
| **Roof** | Zod, container with children (RoofSegmentNodes), position, rotation | Missing entirely | **Missing** |
| **RoofSegment** | Zod, 7 roof types (hip/gable/shed/gambrel/dutch/mansard/flat), dimensions | Missing entirely | **Missing** |
| **Site** | Zod, property boundary polygon, children (buildings + items) | Missing entirely | **Missing** |
| **Building** | Zod, position/rotation, children (levels) | Missing entirely | **Missing** |
| **Level** | Zod, level number, children (walls/zones/slabs/ceilings/roofs/scans/guides) | Missing entirely | **Missing** |
| **Scan** | Zod, url for floor plan image overlay, position/rotation/scale/opacity | Missing entirely | **Missing** |
| **Guide** | Zod, url for reference image overlay, position/rotation/scale/opacity | Missing entirely | **Missing** |

### Schema Architecture Differences

| Aspect | Pascal | Horecagrond |
|--------|--------|-------------|
| Validation | **Zod schemas** with `.parse()`, `.default()`, discriminated unions | Raw TypeScript interfaces, no runtime validation |
| ID generation | `nanoid` with typed prefixes (`wall_xxx`, `door_xxx`) | `crypto.randomUUID()`, no type prefix |
| Node hierarchy | **parentId tree** with typed children arrays per container node | Flat parentId references, no children arrays |
| Schema location | `packages/core/src/schema/nodes/` (14 files) | `lib/editor/schema/nodes.ts` (1 file) |
| Node count | **14 discriminated union members** | **4 union members** |

---

## B. Tools Comparison

### Pascal Tools (11 tools)

| Tool | Pascal Implementation | Horecagrond | Status |
|------|----------------------|-------------|--------|
| **Wall Tool** | R3F component, listens to `grid:move`/`grid:click`, wall draft snapping (endpoint snap, angle snap), preview mesh with ShapeGeometry, creates wall on current level, sound effects | Embedded in `useToolEvents` hook, grid snap + 45-degree snap + wall join snap, wall chaining, DrawingPreview component | **Partial** - HG has similar snapping but no wall preview mesh, no per-node events, no level scoping |
| **Zone Tool** | R3F component, polygon creation on level | Embedded in `useToolEvents`, polygon with close-on-first-point | **Partial** - similar polygon logic but not level-scoped |
| **Door Tool** | Listens to `wall:enter/move/click/leave`, creates transient draft node on wall, clamps to wall bounds, overlap validation, visual cursor (green/red edges), side detection from surface normal, pauses undo during draft | **Missing entirely** | **Missing** |
| **Window Tool** | Same pattern as Door Tool, wall-attachment with clamping, pane grid defaults | **Missing entirely** | **Missing** |
| **Item Tool** | `useDraftNode` + `usePlacementCoordinator`, supports floor, wall-side, ceiling attachment via asset.attachTo, GLTF preview, surface placement | Embedded in `useToolEvents`, simple grid-click placement with fixed dimensions from ITEM_DEFAULTS | **Minimal** - no GLTF, no wall/ceiling attachment, no preview |
| **Slab Tool** | Polygon drawing with auto-detection from wall boundaries | **Missing** | **Missing** |
| **Ceiling Tool** | Polygon drawing, hole editing | **Missing** | **Missing** |
| **Roof Tool** | Place + move roof segments | **Missing** | **Missing** |
| **Move Tool** | Dedicated component for moving items/doors/windows/roofs with proper constraints | Drag-to-move in `useToolEvents` (items and walls only, basic) | **Minimal** |
| **Polygon Editor** | Shared component for editing slab/ceiling/zone boundaries with vertex handles | **Missing** | **Missing** |
| **Site Boundary Editor** | Edit property line polygon | **Missing** | **Missing** |

### Tool Architecture Difference

**Pascal**: Each tool is an **R3F component** (`<WallTool />`, `<DoorTool />`) managed by a `<ToolManager />` that renders the active tool based on `phase + mode + tool` state. Tools subscribe to **typed node events** (`wall:enter`, `wall:click`) and render 3D preview geometry.

**Horecagrond**: All tool logic lives in a single `useToolEvents()` hook with a giant switch statement on `activeTool`. Tools emit/consume only generic `grid:click`/`grid:pointermove` events. No per-tool components, no 3D preview (only 2D DrawingPreview overlay).

---

## C. Rendering Comparison

| Aspect | Pascal | Horecagrond |
|--------|--------|-------------|
| **Renderer count** | 14 renderers (one per node type) | 3 renderers (wall, zone, item) + slab returns null |
| **Wall geometry** | ExtrudeGeometry from mitered polygon footprint, CSG subtraction for door/window cutouts via `three-bvh-csg` | Simple `BoxGeometry(length, height, thickness)` centered at midpoint | **Critical gap** |
| **Wall mitering** | Full junction detection (L/T/X joins), polygon offset calculation, adjacent wall recalculation | None | **Critical gap** |
| **Zone rendering** | ExtrudeGeometry from polygon, dedicated zone layer for post-processing | ExtrudeGeometry from polygon (similar approach) | Comparable |
| **Item rendering** | GLTF model loading via `useGltfKtx2`, corrective transforms from asset metadata, wall/ceiling/surface attachment, interactive controls | `BoxGeometry(w, h, d)` colored by category | **Critical gap** - no 3D models |
| **Door rendering** | Parametric geometry (frame, segments with panel/glass/empty types, handle, hinges, panic bar, door closer), wall cutout mesh | N/A | **Missing** |
| **Window rendering** | Parametric geometry (frame, pane grid from ratios, sill), wall cutout mesh | N/A | **Missing** |
| **Slab rendering** | Polygon extrusion with holes, outset for wall overlap | N/A (returns null) | **Missing** |
| **Ceiling rendering** | Flat ShapeGeometry with holes | N/A | **Missing** |
| **Roof rendering** | Complex procedural geometry per roof type | N/A | **Missing** |
| **Materials** | `MeshStandardNodeMaterial` (WebGPU TSL), shared instances, presets system | `meshStandardMaterial` (WebGL JSX), per-instance | Different paradigm |
| **Renderer** | **WebGPU** (`WebGPURenderer` from `three/webgpu`) | **WebGL** (default R3F Canvas) | Pascal is next-gen |
| **Post-processing** | SSGI (screen-space GI), TRAA, outline passes (selected + hovered with pulse), denoise, MRT pipeline | None | **Missing** |
| **Scene Registry** | `Map<string, Object3D>` + per-type `Set<string>`, `useRegistry()` hook auto-registers | `userData.nodeId` on meshes, raycasted | Pascal can look up any 3D object by ID in O(1) |
| **Selection outlines** | WebGPU outline pass with configurable colors, pulsing hover | `<Edges>` component (drei) on items only | **Minimal** |
| **Layers** | `SCENE_LAYER` (0), `ZONE_LAYER` (2), `EDITOR_LAYER` for tool previews | None | **Missing** |

---

## D. Event System Comparison

| Aspect | Pascal | Horecagrond |
|--------|--------|-------------|
| **Event bus** | `mitt<EditorEvents>` with typed events for **12 node types** x 8 suffixes + grid + camera + tool + preset events | `mitt<EditorEvents>` with 5 grid events + 1 tool:cancel |
| **Node events** | `useNodeEvents(node, type)` hook returns R3F event handlers (`onPointerDown/Up/Enter/Leave/Move/DoubleClick/ContextMenu`), synthesizes click on pointerup to avoid R3F click issues | Manual raycasting in `useGridEvents`, walks `userData.nodeId` up parent chain |
| **Event payload** | `NodeEvent<T>` with node reference, world position, local position, normal vector, nativeEvent, stopPropagation | `GridEventPayload` with 2D position, 3D worldPosition, hitNodeId, hitNodeType |
| **Camera drag suppression** | `useViewer.cameraDragging` checked in every event handler | Pixel-distance click detection (< 5px = click, > 5px = drag) |
| **Click synthesis** | Custom: click emitted on pointerup to be more forgiving than R3F default | Pixel-distance between pointerdown/pointerup |
| **Event granularity** | Per-node-type: `wall:click`, `door:enter`, `item:move` etc. | Single: `grid:click`, `grid:pointermove` with hitNodeId lookup |

### Key Difference
Pascal's event system enables tools to listen to **specific node type events** (e.g., DoorTool only listens to `wall:enter/move/click/leave`). This makes tools composable and independent. Horecagrond's system routes all events through a single `grid:click` handler with a switch statement.

---

## E. Selection System Comparison

| Aspect | Pascal | Horecagrond |
|--------|--------|-------------|
| **Selection model** | **Hierarchical path**: `{ buildingId, levelId, zoneId, selectedIds[] }` | **Flat list**: `selectedNodeIds: string[]` |
| **Selection manager** | `<SelectionManager />` R3F component with phase-aware strategies | Part of `useToolEvents` switch case |
| **Drill-down** | Click building -> select building, click level -> select level, click zone -> select zone, click item -> select item. Clicking empty deselects current level. | Click node -> toggle in flat list |
| **Auto-phase-switching** | Changing buildingId resets levelId/zoneId/selectedIds; changing levelId resets zoneId/selectedIds | None |
| **Strategy pattern** | `getStrategy()` returns different `SelectionStrategy` objects based on current selection depth | None |
| **Outliner sync** | `<OutlinerSync />` maps selected/hovered node IDs to Object3D references for post-processing outline passes | None |
| **Multi-select** | Cmd/Ctrl+click toggles individual items within zone context | Ctrl+click toggles in flat list |
| **Zone containment** | Items are validated against zone polygon (with edge tolerance) before selection | No spatial containment check |

---

## F. State Management Comparison

### Pascal: 3 Stores

| Store | Purpose | Key State |
|-------|---------|-----------|
| `useScene` (core) | Scene data | nodes, rootNodeIds, dirtyNodes, collections; CRUD actions with parentId tree management; zundo temporal for undo (50 levels); migration support; dirty diff on undo/redo |
| `useViewer` (viewer) | Viewer preferences | selection (hierarchical path), hoveredId, cameraMode, theme, unit, levelMode (stacked/exploded/solo/manual), wallMode (up/cutaway/down), showScans/Guides/Grid, outliner, project preferences (persisted) |
| `useEditor` (editor) | Editor UI state | phase (site/structure/furnish), mode (select/edit/delete/build), tool, structureLayer (zones/elements), catalogCategory, selectedItem, movingNode, spaces, editingHole, previewMode, floorplanOpen |

### Horecagrond: 2 Stores

| Store | Purpose | Key State |
|-------|---------|-----------|
| `useSceneStore` | Scene data | nodes, rootNodeIds, dirtyNodes; CRUD with flat parentId; zundo temporal (50 levels, deep equality); dev-mode field validation |
| `useEditorStore` | Editor UI | activeTool (6 tools), selectedNodeIds, hoveredNodeId, gridVisible, gridSize, viewMode (2d/3d), isDrawing, drawPoints, placingItemType, cameraDragging, clipboard |

### Key Differences

| Aspect | Pascal | Horecagrond |
|--------|--------|-------------|
| Undo/Redo | Zundo with dirty-node diffing on undo/redo (only marks changed nodes dirty) | Zundo with deep equality (works but less efficient) |
| Temporal pause | Draft nodes use `temporal.pause()` to exclude transient operations from undo history | No transient/draft concept |
| Batch operations | `createNodes()`, `updateNodes()`, `deleteNodes()` for atomic multi-node ops | Single-node operations only |
| Collections | Named node groups with denormalized `collectionIds` on nodes | None |
| Node migrations | `migrateNodes()` handles schema evolution (e.g., old roof -> roof+segment) | None |

---

## G. Systems Comparison

Pascal runs 10+ "systems" as R3F components that process dirty nodes each frame via `useFrame()`:

| System | Pascal | Horecagrond | Priority |
|--------|--------|-------------|----------|
| **WallSystem** | Collects dirty walls by level, recalculates miters for the level, generates extruded geometry with CSG cutouts, updates mesh geometry + collision mesh, handles slab elevation | None (walls are static BoxGeometry) | **CRITICAL** |
| **DoorSystem** | Generates parametric door geometry (frame, leaf segments, handle, hinges, hardware), invisible hitbox root mesh, cutout mesh for CSG | N/A | HIGH |
| **WindowSystem** | Generates parametric window geometry (frame, pane grid, sill), cutout mesh for CSG | N/A | HIGH |
| **SlabSystem** | Generates extruded slab geometry with holes, polygon outset for wall overlap | N/A | MEDIUM |
| **CeilingSystem** | Generates flat shape geometry with holes, positioned at ceiling height | N/A | LOW |
| **RoofSystem** | Generates complex roof geometry per type | N/A | LOW |
| **ItemSystem** | GLTF loading, corrective transforms, shadow configuration | N/A | HIGH |
| **LevelSystem** | Animates level Y positions based on levelMode (stacked/exploded/solo), lerp transitions | N/A | MEDIUM |
| **ZoneSystem** | Zone-specific rendering and layer management | `useZoneSystem()` hook recalculates area/capacity on dirty nodes | Comparable (different scope) |
| **GuideSystem** | Loads and positions reference image overlays | N/A | MEDIUM |
| **ScanSystem** | Loads and positions scan image overlays | N/A | MEDIUM |
| **WallCutout** | Coordinates wall cutouts for cutaway mode using space detection | N/A | LOW |
| **InteractiveSystem** | Manages interactive item controls (toggles, sliders, animations) | N/A | LOW |
| **ItemLightSystem** | Manages point lights attached to items | N/A | LOW |
| **Space Detection** | Flood-fill algorithm to detect interior/exterior spaces, assigns wall frontSide/backSide | N/A | MEDIUM |

### Horecagrond Systems
- `useZoneSystem()` — recalculates zone area + capacity on dirty zone nodes
- `useSceneMeasurements()` — derived data hook for total area, wall count, seating capacity

---

## H. UI Components Comparison

| Component | Pascal | Horecagrond |
|-----------|--------|-------------|
| **Toolbar** | ActionMenu with structure tools, furnish tools, camera actions, view toggles, control modes | EditorToolbar with 6 tool buttons, 2D/3D toggle, grid toggle, undo/redo, AI tools, save |
| **Sidebar** | AppSidebar with icon rail, SitePanel (full node tree with per-type tree nodes, inline rename, drag), ZonePanel, SettingsPanel (audio, keyboard shortcuts) | AssetPanel (item catalog by category), PropertiesPanel (selected node properties) |
| **Property panels** | Per-type panels: WallPanel, DoorPanel, WindowPanel, SlabPanel, CeilingPanel, RoofPanel, RoofSegmentPanel, ItemPanel, PanelManager dispatches to correct panel | Single PropertiesPanel with switch on node type |
| **Item catalog** | Full catalog with thumbnails, categories, search, GLTF asset references | Category list with Dutch labels, hardcoded item types |
| **Command palette** | Full command palette with editor commands, keyboard shortcut discovery | ShortcutsHelp tooltip |
| **Site tree** | Full hierarchical tree (Site > Building > Level > nodes), per-type icons, inline rename, drag-to-reparent, context menus | None |
| **Keyboard shortcuts** | Full shortcut dialog, per-phase/mode key bindings, keyboard shortcut tokens in UI | Basic shortcuts (Delete, Escape, Enter, R, Ctrl+C/V, G, Ctrl+Z/Y) |
| **Phases/Modes** | 3 phases (Site/Structure/Furnish) x 4 modes (Select/Edit/Delete/Build) with phase-aware tool selection | Single tool selector |
| **Presets** | Presets system with popover, collections popover | Templates dialog (AI-generated) |
| **Helpers** | Per-type 3D helpers (wall helper, slab helper, ceiling helper, item helper, roof helper) for visual editing aids | DrawingPreview (2D lines/dots during drawing) |
| **Scene loader** | Scene loader with project loading/saving | Initial scene prop + save callback |
| **Preview mode** | Toggle to viewer-like experience inside editor | ReadOnly mode |
| **2D floorplan** | Toggleable 2D floorplan overlay in 3D view | 2D/3D view mode switch (separate camera) |

---

## I. Advanced Features

| Feature | Pascal | Horecagrond | Priority |
|---------|--------|-------------|----------|
| **Multi-level support** | Site > Building > Level hierarchy, level index, cumulative Y offset | None (flat scene, no levels) | **CRITICAL** for horeca (multi-floor venues) |
| **Level modes** | Stacked (normal), Exploded (gaps between levels), Solo (single level visible), Manual | None | HIGH |
| **Wall modes** | Up (full height), Cutaway (exterior walls lowered for interior view), Down (all walls lowered) | None | MEDIUM |
| **Camera modes** | Perspective/Orthographic toggle, persisted preference | 2D (ortho top-down) / 3D (perspective) toggle | Comparable concept |
| **Camera presets** | View-node camera, focus-node camera, top-view, orbit CW/CCW, thumbnail capture | Fixed positions only | MEDIUM |
| **Scene Registry** | `sceneRegistry.nodes` Map for O(1) Object3D lookup, `useRegistry()` auto-register | userData traversal during raycasting | HIGH |
| **Spatial Grid** | `spatialGridManager` for efficient spatial queries, slab elevation lookup, wall spatial grid | None | MEDIUM |
| **Space Detection** | Flood-fill grid algorithm to detect interior/exterior spaces, wall side assignment | None | MEDIUM |
| **Transient/Draft nodes** | Tools create temporary nodes with `metadata.isTransient`, undo paused during drafting | None (all nodes are permanent) | HIGH |
| **Collections** | Named groups of nodes, denormalized references, CRUD operations | None | LOW |
| **Scan overlays** | Load floor plan images as positioned overlays for tracing | None | MEDIUM |
| **Guide overlays** | Load reference images as overlays | None | MEDIUM |
| **Interactive items** | Toggle/slider/temperature controls, animation/light effects on GLTF models | None | LOW |
| **WebGPU** | Full WebGPU renderer with TSL materials | WebGL only | LOW (nice-to-have) |
| **Post-processing** | SSGI, TRAA, outline passes, denoising | None | LOW |
| **Sound effects** | `sfxEmitter` for grid-snap and item-place sounds | None | LOW |
| **Theme** | Light/dark mode with animated transitions | CSS theme variables | Comparable |
| **Units** | Metric/Imperial toggle | Fixed metric | LOW |
| **Hole editing** | Generic hole editor for slabs and ceilings | None | MEDIUM |
| **Per-node camera** | Each node can store a camera preset | None | LOW |
| **Export** | Scene export function, thumbnail generation | PNG export from canvas | MEDIUM |
| **Node migrations** | Schema version migration on scene load | None | MEDIUM |

---

## Architecture Comparison Summary

| Dimension | Pascal | Horecagrond |
|-----------|--------|-------------|
| Package structure | Monorepo: `core` (schema, stores, systems), `viewer` (renderers, selection, camera), `editor` (tools, UI, panels) | Single app: `lib/editor/` (all logic), `components/editor/` (UI) |
| Schema validation | Zod at every boundary | TypeScript interfaces only |
| Node hierarchy | Tree with typed parent-child relationships | Flat dictionary with parentId |
| Event architecture | Per-node-type events with rich payloads | Grid-level events with optional hitNodeId |
| Tool architecture | Independent R3F components managed by ToolManager | Single hook with switch statement |
| Geometry generation | Systems pattern (dirty-check + frame-update), CSG, ExtrudeGeometry | Static BoxGeometry in React components |
| Selection | Hierarchical drill-down with phase-aware strategies | Flat ID list |
| Rendering pipeline | WebGPU + post-processing pipeline + layers | WebGL + basic materials |

---

## Recommended Porting Roadmap

### Phase 1: Foundation (HIGH priority, max value)

1. **Node hierarchy (Site > Building > Level)** — Without this, nothing else works. Port the schema for Site, Building, Level nodes. Update scene store to use parentId tree with children arrays.

2. **Zod schema migration** — Replace TypeScript interfaces with Zod schemas. This enables runtime validation, default values, and typed ID prefixes.

3. **Door & Window nodes** — These are the most visually impactful missing elements for horeca floor plans. Port the parametric schemas.

4. **Scene Registry** — Port `sceneRegistry` and `useRegistry()`. This is required by every system and the selection manager.

5. **WallSystem with mitering** — Port wall-mitering.ts, wall-footprint.ts, and wall-system.tsx. This transforms walls from boxes into proper architectural geometry with clean corners.

### Phase 2: Tools & Interaction (HIGH priority)

6. **Per-node event system** — Port `useNodeEvents()` and expand the event bus to include node-type events. This is prerequisite for door/window tools.

7. **Door & Window tools** — Port the wall-attachment tools with draft/transient node pattern.

8. **Door & Window systems** — Port the parametric geometry generation systems.

9. **Tool Manager pattern** — Refactor from single useToolEvents hook to individual tool components managed by a ToolManager.

10. **Selection Manager** — Port hierarchical selection with drill-down (building > level > zone > item).

### Phase 3: Geometry & Visual Quality (MEDIUM priority)

11. **CSG wall cutouts** — Integrate `three-bvh-csg` for door/window wall openings.

12. **Slab & Ceiling systems** — Port polygon extrusion with holes.

13. **Item GLTF loading** — Replace BoxGeometry items with actual 3D models. Port asset schema and ItemSystem.

14. **Level system** — Port multi-level support with stacked/exploded/solo modes.

### Phase 4: Polish & Advanced (LOW priority)

15. **Scan/Guide overlays** — Floor plan tracing support.
16. **Space detection** — Interior/exterior classification for cutaway mode.
17. **Roof system** — Complex geometry, lower priority for horeca.
18. **Post-processing** — WebGPU pipeline with outlines and GI.
19. **Interactive items** — Controls and effects on GLTF models.
20. **Collections** — Named node groups.

---

## Estimated Effort

| Phase | Items | Estimated Effort |
|-------|-------|-----------------|
| Phase 1: Foundation | 5 items | 3-4 weeks |
| Phase 2: Tools & Interaction | 5 items | 3-4 weeks |
| Phase 3: Geometry & Visual | 4 items | 2-3 weeks |
| Phase 4: Polish & Advanced | 6 items | 4-6 weeks |
| **Total** | **20 items** | **12-17 weeks** |

The first two phases deliver the most value: proper architectural geometry (mitered walls with door/window cutouts), multi-level buildings, and professional tools for placing doors and windows on walls.
