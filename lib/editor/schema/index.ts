// lib/editor/schema/index.ts
// Re-exports all editor schema types, Zod schemas, and constants.

// ---------------------------------------------------------------------------
// Zod schemas (runtime validators + type inference)
// ---------------------------------------------------------------------------

export {
  // Geometry primitives
  Vec2Schema,
  Vec3Schema,
  RGBASchema,

  // Camera
  CameraSchema,
  CameraModeSchema,

  // Collection
  CollectionSchema,

  // Node type discriminant
  NodeTypeSchema,

  // Base node
  BaseNodeSchema,

  // Wall
  WallSideSchema,
  WallMaterialSchema,
  WallNodeSchema,

  // Site / Building / Level
  SiteNodeSchema,
  BuildingNodeSchema,
  LevelNodeSchema,

  // Door (full Pascal schema)
  DoorSegmentTypeSchema,
  DoorSwingSchema,
  DoorSideSchema,
  DoorHandleTypeSchema,
  DoorSegmentSchema,
  DoorFrameSchema,
  DoorHandleSchema,
  DoorNodeSchema,

  // Window (full Pascal schema)
  WindowFrameSchema,
  WindowDividerSchema,
  WindowSillSchema,
  WindowStyleSchema,
  WindowNodeSchema,

  // Zone
  HorecaZoneTypeSchema,
  ZoneNodeSchema,

  // Item (full Pascal Asset model)
  AttachToSchema,
  SurfaceTypeSchema,
  AssetControlSchema,
  AssetEffectSchema,
  HorecaItemTypeSchema,
  ItemNodeSchema,

  // Slab
  SlabNodeSchema,

  // Ceiling
  CeilingNodeSchema,

  // Roof
  RoofNodeSchema,
  RoofTypeSchema,
  RoofSegmentNodeSchema,

  // Scan / Guide
  ScanNodeSchema,
  GuideNodeSchema,

  // Discriminated union
  AnyNodeSchema,

  // Scene data
  SceneDataSchema,

  // ID generators
  siteId,
  buildingId,
  levelId,
  wallId,
  doorId,
  windowId,
  zoneId,
  itemId,
  slabId,
  ceilingId,
  roofId,
  roofSegmentId,
  scanId,
  guideId,
} from "./nodes";

// ---------------------------------------------------------------------------
// TypeScript types (inferred from Zod schemas)
// ---------------------------------------------------------------------------

export type {
  Vec2,
  Vec3,
  RGBA,
  Camera,
  CameraMode,
  Collection,
  NodeType,
  BaseNode,
  WallSide,
  WallMaterial,
  WallNode,
  SiteNode,
  BuildingNode,
  LevelNode,
  DoorSegmentType,
  DoorSwing,
  DoorSide,
  DoorHandleType,
  DoorSegment,
  DoorFrame,
  DoorHandle,
  DoorNode,
  DoorStyle,
  WindowFrame,
  WindowDivider,
  WindowSill,
  WindowStyle,
  WindowNode,
  HorecaZoneType,
  ZoneNode,
  AttachTo,
  SurfaceType,
  AssetControl,
  AssetEffect,
  HorecaItemType,
  ItemNode,
  SlabNode,
  CeilingNode,
  RoofNode,
  RoofType,
  RoofSegmentNode,
  ScanNode,
  GuideNode,
  AnyNode,
  AnyNodeType,
  NodeOfType,
  SceneData,
} from "./nodes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type { ItemDefault } from "./constants";

export {
  // Wall
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  DEFAULT_WALL_SIDE,

  // Door
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_SEGMENT_TYPE,
  DEFAULT_DOOR_SWING,
  DEFAULT_DOOR_SIDE,
  DEFAULT_DOOR_HANDLE_TYPE,
  DEFAULT_DOOR_HANDLE_HEIGHT,
  DEFAULT_DOOR_FRAME_WIDTH,
  DEFAULT_DOOR_FRAME_DEPTH,

  // Window
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  DEFAULT_WINDOW_STYLE,
  DEFAULT_WINDOW_FRAME_WIDTH,
  DEFAULT_WINDOW_FRAME_DEPTH,

  // Slab
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_SLAB_ELEVATION,

  // Ceiling
  DEFAULT_CEILING_HEIGHT,

  // Roof
  DEFAULT_ROOF_TYPE,
  DEFAULT_ROOF_WIDTH,
  DEFAULT_ROOF_DEPTH,
  DEFAULT_ROOF_RIDGE_HEIGHT,
  DEFAULT_ROOF_OVERHANG,
  DEFAULT_ROOF_COVER_THICKNESS,
  DEFAULT_ROOF_FASCIA_THICKNESS,
  DEFAULT_ROOF_SOFFIT_THICKNESS,

  // Level
  DEFAULT_LEVEL_HEIGHT,

  // Item
  DEFAULT_ITEM_ATTACH_TO,
  DEFAULT_ITEM_SURFACE,

  // Overlay
  DEFAULT_OVERLAY_OPACITY,

  // Zone visualization
  ZONE_COLORS,
  ZONE_COLOR_TOKENS,
  ZONE_LABELS,

  // Item defaults
  ITEM_DEFAULTS,

  // Node type labels
  NODE_TYPE_LABELS,
} from "./constants";
