// lib/editor/schema/nodes.ts
// Zod-based node type definitions for the 3D horeca property floor plan editor.
// Ported from Pascal Editor (pascalorg/editor) packages/core/src/schema/
// with Horecagrond-specific extensions (zoneType, area, capacity, material).
//
// New Pascal fields use `.optional()` so existing code that creates nodes
// without specifying them continues to compile and work. When parsing stored
// JSON, use `AnyNodeSchema.parse()` which fills in defaults.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** 3D coordinate tuple [x, y, z] in meters */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = [number, number, number];

/** 2D coordinate tuple [x, y] in meters */
export const Vec2Schema = z.tuple([z.number(), z.number()]);
export type Vec2 = [number, number];

/** RGBA color tuple [r, g, b, a] -- values 0-1 */
export const RGBASchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type RGBA = [number, number, number, number];

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export const CameraModeSchema = z.enum(["perspective", "orthographic"]);
export type CameraMode = "perspective" | "orthographic";

export const CameraSchema = z.object({
  position: Vec3Schema.optional(),
  target: Vec3Schema.optional(),
  mode: CameraModeSchema.optional(),
  fov: z.number().optional(),
  zoom: z.number().optional(),
});
export type Camera = {
  position?: Vec3;
  target?: Vec3;
  mode?: CameraMode;
  fov?: number;
  zoom?: number;
};

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export const CollectionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
  controlNodeId: z.string().nullable().optional(),
});
export type Collection = {
  id: string;
  name?: string;
  color?: string;
  controlNodeId?: string | null;
};

// ---------------------------------------------------------------------------
// Node type discriminant
// ---------------------------------------------------------------------------

export const NodeTypeSchema = z.enum([
  "site",
  "building",
  "level",
  "wall",
  "door",
  "window",
  "zone",
  "item",
  "slab",
  "ceiling",
  "roof",
  "roof-segment",
  "scan",
  "guide",
]);
export type NodeType =
  | "site"
  | "building"
  | "level"
  | "wall"
  | "door"
  | "window"
  | "zone"
  | "item"
  | "slab"
  | "ceiling"
  | "roof"
  | "roof-segment"
  | "scan"
  | "guide";

// ---------------------------------------------------------------------------
// Prefixed ID generators (matching Pascal Editor convention)
// ---------------------------------------------------------------------------

function prefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function siteId(): string { return prefixedId("site"); }
export function buildingId(): string { return prefixedId("bldg"); }
export function levelId(): string { return prefixedId("lvl"); }
export function wallId(): string { return prefixedId("wall"); }
export function doorId(): string { return prefixedId("door"); }
export function windowId(): string { return prefixedId("win"); }
export function zoneId(): string { return prefixedId("zone"); }
export function itemId(): string { return prefixedId("item"); }
export function slabId(): string { return prefixedId("slab"); }
export function ceilingId(): string { return prefixedId("ceil"); }
export function roofId(): string { return prefixedId("roof"); }
export function roofSegmentId(): string { return prefixedId("rseg"); }
export function scanId(): string { return prefixedId("scan"); }
export function guideId(): string { return prefixedId("guide"); }

// ---------------------------------------------------------------------------
// BaseNode
// ---------------------------------------------------------------------------

export interface BaseNode {
  id: string;
  type: string;
  name?: string;
  parentId: string | null;
  children?: string[];
  visible: boolean;
  position: Vec3;
  rotation: Vec3;
  camera?: Camera;
  metadata?: Record<string, unknown>;
}

export const BaseNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  name: z.string().optional(),
  parentId: z.string().nullable().default(null),
  children: z.array(z.string()).optional(),
  visible: z.boolean().default(true),
  position: Vec3Schema.default([0, 0, 0]),
  rotation: Vec3Schema.default([0, 0, 0]),
  camera: CameraSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Wall side classification (Pascal: interior / exterior / unknown)
// ---------------------------------------------------------------------------

export const WallSideSchema = z.enum(["interior", "exterior", "unknown"]);
export type WallSide = "interior" | "exterior" | "unknown";

// ---------------------------------------------------------------------------
// Wall materials (Horecagrond extension)
// ---------------------------------------------------------------------------

export const WallMaterialSchema = z.enum(["brick", "glass", "drywall", "concrete"]);
export type WallMaterial = "brick" | "glass" | "drywall" | "concrete";

// ---------------------------------------------------------------------------
// SiteNode
// ---------------------------------------------------------------------------

export interface SiteNode extends BaseNode {
  type: "site";
  /** Polygon defining the property boundary line */
  polygon?: Vec2[];
}

export const SiteNodeSchema = BaseNodeSchema.extend({
  type: z.literal("site"),
  polygon: z.array(Vec2Schema).optional(),
});

// ---------------------------------------------------------------------------
// BuildingNode
// ---------------------------------------------------------------------------

export interface BuildingNode extends BaseNode {
  type: "building";
}

export const BuildingNodeSchema = BaseNodeSchema.extend({
  type: z.literal("building"),
});

// ---------------------------------------------------------------------------
// LevelNode
// ---------------------------------------------------------------------------

export interface LevelNode extends BaseNode {
  type: "level";
  /** Floor index: 0 = ground, 1 = first floor, -1 = basement */
  level: number;
  /** Height of this level in meters (floor-to-ceiling) */
  height: number;
}

export const LevelNodeSchema = BaseNodeSchema.extend({
  type: z.literal("level"),
  level: z.number().default(0),
  height: z.number().default(3.0),
});

// ---------------------------------------------------------------------------
// WallNode (Pascal: start, end, thickness, height, frontSide, backSide)
// ---------------------------------------------------------------------------

export interface WallNode extends BaseNode {
  type: "wall";
  start: Vec2;
  end: Vec2;
  /** Wall thickness in meters */
  thickness: number;
  /** Wall height in meters */
  height: number;
  /** Front side classification (Pascal Editor) */
  frontSide?: WallSide;
  /** Back side classification (Pascal Editor) */
  backSide?: WallSide;
  /** Horecagrond extension: wall material for rendering */
  material: WallMaterial;
}

export const WallNodeSchema = BaseNodeSchema.extend({
  type: z.literal("wall"),
  start: Vec2Schema,
  end: Vec2Schema,
  thickness: z.number().default(0.2),
  height: z.number().default(3.0),
  frontSide: WallSideSchema.optional(),
  backSide: WallSideSchema.optional(),
  material: WallMaterialSchema.default("brick"),
});

// ---------------------------------------------------------------------------
// DoorNode -- Pascal has 25+ fields for detailed door configuration
// ---------------------------------------------------------------------------

export const DoorSegmentTypeSchema = z.enum([
  "single", "double", "sliding", "folding", "revolving", "garage", "opening",
]);
export type DoorSegmentType =
  | "single" | "double" | "sliding" | "folding"
  | "revolving" | "garage" | "opening";

export const DoorSwingSchema = z.enum(["push", "pull"]);
export type DoorSwing = "push" | "pull";

export const DoorSideSchema = z.enum(["left", "right"]);
export type DoorSide = "left" | "right";

export const DoorHandleTypeSchema = z.enum([
  "lever", "knob", "pull", "push-bar", "none",
]);
export type DoorHandleType = "lever" | "knob" | "pull" | "push-bar" | "none";

export interface DoorSegment {
  type: DoorSegmentType;
  width: number;
  swing: DoorSwing;
  side: DoorSide;
}

export const DoorSegmentSchema = z.object({
  type: DoorSegmentTypeSchema.default("single"),
  width: z.number().default(0.9),
  swing: DoorSwingSchema.default("push"),
  side: DoorSideSchema.default("left"),
});

export interface DoorFrame {
  width: number;
  depth: number;
  visible: boolean;
}

export const DoorFrameSchema = z.object({
  width: z.number().default(0.05),
  depth: z.number().default(0.03),
  visible: z.boolean().default(true),
});

export interface DoorHandle {
  type: DoorHandleType;
  height: number;
  visible: boolean;
}

export const DoorHandleSchema = z.object({
  type: DoorHandleTypeSchema.default("lever"),
  height: z.number().default(1.0),
  visible: z.boolean().default(true),
});

export interface DoorNode extends BaseNode {
  type: "door";
  /** Width of the door opening in meters */
  width: number;
  /** Height of the door in meters */
  height: number;
  /** Door segments (e.g. two segments for double door) -- Pascal */
  segments?: DoorSegment[];
  /** Frame configuration -- Pascal */
  frame?: DoorFrame;
  /** Handle configuration -- Pascal */
  handle?: DoorHandle;
  /** Whether hinges are visible -- Pascal */
  hinges?: boolean;
  /** Door closer (self-closing mechanism) -- Pascal */
  doorCloser?: boolean;
  /** Panic bar for fire exits -- Pascal */
  panicBar?: boolean;
  /** Default swing direction -- Pascal */
  swing?: DoorSwing;
  /** Which side the door opens from -- Pascal */
  side?: DoorSide;
  /** Elevation from floor level in meters -- Pascal */
  elevation?: number;
  /** ID of the wall this door belongs to */
  wallId: string;
  /** Position along the wall as a ratio 0-1 */
  wallPosition: number;
  /** Visual style (backward compat alias for primary segment type) */
  style: DoorSegmentType;
}

export const DoorNodeSchema = BaseNodeSchema.extend({
  type: z.literal("door"),
  width: z.number().default(0.9),
  height: z.number().default(2.1),
  segments: z.array(DoorSegmentSchema).optional(),
  frame: DoorFrameSchema.optional(),
  handle: DoorHandleSchema.optional(),
  hinges: z.boolean().optional(),
  doorCloser: z.boolean().optional(),
  panicBar: z.boolean().optional(),
  swing: DoorSwingSchema.optional(),
  side: DoorSideSchema.optional(),
  elevation: z.number().optional(),
  wallId: z.string().default(""),
  wallPosition: z.number().default(0.5),
  style: DoorSegmentTypeSchema.default("single"),
});

/** @deprecated Use DoorSegmentType instead */
export type DoorStyle = DoorSegmentType;

// ---------------------------------------------------------------------------
// WindowNode -- Pascal: frame, columnRatios, rowRatios, dividers, sill
// ---------------------------------------------------------------------------

export interface WindowFrame {
  width: number;
  depth: number;
  visible: boolean;
}

export const WindowFrameSchema = z.object({
  width: z.number().default(0.05),
  depth: z.number().default(0.03),
  visible: z.boolean().default(true),
});

export interface WindowDivider {
  width: number;
  visible: boolean;
}

export const WindowDividerSchema = z.object({
  width: z.number().default(0.02),
  visible: z.boolean().default(false),
});

export interface WindowSill {
  depth: number;
  visible: boolean;
}

export const WindowSillSchema = z.object({
  depth: z.number().default(0.05),
  visible: z.boolean().default(true),
});

/** Window styles (Horecagrond extension for backward compat) */
export const WindowStyleSchema = z.enum(["fixed", "casement", "sliding"]);
export type WindowStyle = "fixed" | "casement" | "sliding";

export interface WindowNode extends BaseNode {
  type: "window";
  /** Width of the window in meters */
  width: number;
  /** Height of the window in meters */
  height: number;
  /** Height of the window sill from floor level in meters */
  sillHeight: number;
  /** Frame configuration (Pascal) */
  frame?: WindowFrame;
  /** Column ratios for multi-pane windows (Pascal) */
  columnRatios?: number[];
  /** Row ratios for multi-pane windows (Pascal) */
  rowRatios?: number[];
  /** Divider configuration (Pascal) */
  dividers?: WindowDivider;
  /** Sill configuration (Pascal) */
  sill?: WindowSill;
  /** ID of the wall this window belongs to */
  wallId: string;
  /** Position along the wall as a ratio 0-1 */
  wallPosition: number;
  /** Horecagrond extension: visual style */
  style: WindowStyle;
}

export const WindowNodeSchema = BaseNodeSchema.extend({
  type: z.literal("window"),
  width: z.number().default(1.2),
  height: z.number().default(1.2),
  sillHeight: z.number().default(0.9),
  frame: WindowFrameSchema.optional(),
  columnRatios: z.array(z.number()).optional(),
  rowRatios: z.array(z.number()).optional(),
  dividers: WindowDividerSchema.optional(),
  sill: WindowSillSchema.optional(),
  wallId: z.string().default(""),
  wallPosition: z.number().default(0.5),
  style: WindowStyleSchema.default("fixed"),
});

// ---------------------------------------------------------------------------
// ZoneNode -- Pascal + Horecagrond extensions
// ---------------------------------------------------------------------------

/** Zone types specific to horeca (hospitality) venues */
export const HorecaZoneTypeSchema = z.enum([
  "dining_area",
  "bar_area",
  "kitchen",
  "storage",
  "terrace",
  "entrance",
  "restroom",
  "office",
  "prep_area",
  "walk_in_cooler",
  "seating_outside",
  "hallway",
]);
export type HorecaZoneType =
  | "dining_area"
  | "bar_area"
  | "kitchen"
  | "storage"
  | "terrace"
  | "entrance"
  | "restroom"
  | "office"
  | "prep_area"
  | "walk_in_cooler"
  | "seating_outside"
  | "hallway";

export interface ZoneNode extends BaseNode {
  type: "zone";
  /** 2D outline points defining the zone boundary */
  polygon: Vec2[];
  /** Hex color string for visualization */
  color: string;
  /** Horecagrond extension: zone classification */
  zoneType: HorecaZoneType;
  /** Horecagrond extension: auto-calculated area in square meters */
  area: number;
  /** Horecagrond extension: optional seating capacity for this zone */
  capacity?: number;
}

export const ZoneNodeSchema = BaseNodeSchema.extend({
  type: z.literal("zone"),
  polygon: z.array(Vec2Schema).default([]),
  color: z.string().default("#808080"),
  zoneType: HorecaZoneTypeSchema.default("dining_area"),
  area: z.number().default(0),
  capacity: z.number().optional(),
});

// ---------------------------------------------------------------------------
// ItemNode -- Pascal Asset model with full configuration
// ---------------------------------------------------------------------------

export const AttachToSchema = z.enum(["floor", "wall", "ceiling", "none"]);
export type AttachTo = "floor" | "wall" | "ceiling" | "none";

export const SurfaceTypeSchema = z.enum([
  "matte", "glossy", "metallic", "wood", "fabric", "none",
]);
export type SurfaceType = "matte" | "glossy" | "metallic" | "wood" | "fabric" | "none";

export interface AssetControl {
  property: string;
  label?: string;
  type?: "slider" | "toggle" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  value?: string | number | boolean;
}

export const AssetControlSchema = z.object({
  property: z.string(),
  label: z.string().optional(),
  type: z.enum(["slider", "toggle", "select"]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export interface AssetEffect {
  type: string;
  intensity?: number;
  color?: string;
}

export const AssetEffectSchema = z.object({
  type: z.string(),
  intensity: z.number().optional(),
  color: z.string().optional(),
});

/** Item types for horeca furniture and equipment (Horecagrond extension) */
export const HorecaItemTypeSchema = z.enum([
  // Meubilair
  "table_round",
  "table_square",
  "table_long",
  "chair",
  "barstool",
  "booth",
  // Keuken
  "kitchen_counter",
  "oven",
  "stove",
  "fridge",
  "sink",
  "coffee_machine",
  "display_case",
  "register",
  "exhaust_hood",
  "dishwasher",
  "prep_table",
  "warming_cabinet",
  "freezer",
  "pizza_oven",
  "grill",
  "deep_fryer",
  // Bar
  "bar_counter",
  "beer_tap",
  "wine_cooler",
  "ice_machine",
  "glass_washer",
  "cocktail_station",
  "espresso_machine",
  // Sanitair
  "toilet",
  "urinal",
  "hand_basin",
  "mirror_cabinet",
  // Terras / Outdoor
  "parasol",
  "planter",
  "terrace_heater",
  "windscreen",
  "outdoor_table",
  "outdoor_chair",
  "flower_box",
  // Verlichting & Klimaat
  "ceiling_light",
  "wall_light",
  "airco_unit",
  "ventilation",
  "smoke_detector",
  "fire_extinguisher",
  // Opslag
  "shelf_unit",
  "storage_rack",
  "coat_rack",
]);
export type HorecaItemType =
  // Meubilair
  | "table_round"
  | "table_square"
  | "table_long"
  | "chair"
  | "barstool"
  | "booth"
  // Keuken
  | "kitchen_counter"
  | "oven"
  | "stove"
  | "fridge"
  | "sink"
  | "coffee_machine"
  | "display_case"
  | "register"
  | "exhaust_hood"
  | "dishwasher"
  | "prep_table"
  | "warming_cabinet"
  | "freezer"
  | "pizza_oven"
  | "grill"
  | "deep_fryer"
  // Bar
  | "bar_counter"
  | "beer_tap"
  | "wine_cooler"
  | "ice_machine"
  | "glass_washer"
  | "cocktail_station"
  | "espresso_machine"
  // Sanitair
  | "toilet"
  | "urinal"
  | "hand_basin"
  | "mirror_cabinet"
  // Terras / Outdoor
  | "parasol"
  | "planter"
  | "terrace_heater"
  | "windscreen"
  | "outdoor_table"
  | "outdoor_chair"
  | "flower_box"
  // Verlichting & Klimaat
  | "ceiling_light"
  | "wall_light"
  | "airco_unit"
  | "ventilation"
  | "smoke_detector"
  | "fire_extinguisher"
  // Opslag
  | "shelf_unit"
  | "storage_rack"
  | "coat_rack";

export interface ItemNode extends BaseNode {
  type: "item";
  /** Horecagrond extension: furniture/equipment classification */
  itemType: HorecaItemType;
  /** Width in meters */
  width: number;
  /** Depth in meters */
  depth: number;
  /** Height in meters */
  height: number;
  /** 3D model source URL (Pascal: Asset.src) */
  src?: string;
  /** Thumbnail URL (Pascal: Asset.thumbnail) */
  thumbnail?: string;
  /** Asset category (Pascal: Asset.category) */
  category?: string;
  /** Asset dimensions override (Pascal: Asset.dimensions) */
  dimensions?: Vec3;
  /** How the item attaches to surfaces (Pascal: Asset.attachTo) */
  attachTo?: AttachTo;
  /** Interactive controls (Pascal: Asset.controls) */
  controls?: AssetControl[];
  /** Visual effects (Pascal: Asset.effects) */
  effects?: AssetEffect[];
  /** Surface material type (Pascal: Asset.surface) */
  surface?: SurfaceType;
  /** Scale multiplier */
  scale?: Vec3;
  /** ID of wall this item is attached to (for wall-mounted items) */
  wallId?: string;
  /** Position along the wall as a ratio 0-1 */
  wallT?: number;
  /** Collection IDs this item belongs to */
  collectionIds?: string[];
  /** Optional 3D model reference (Horecagrond legacy) */
  model?: string;
}

export const ItemNodeSchema = BaseNodeSchema.extend({
  type: z.literal("item"),
  itemType: HorecaItemTypeSchema.default("chair"),
  width: z.number().default(0.5),
  depth: z.number().default(0.5),
  height: z.number().default(0.5),
  src: z.string().optional(),
  thumbnail: z.string().optional(),
  category: z.string().optional(),
  dimensions: Vec3Schema.optional(),
  attachTo: AttachToSchema.optional(),
  controls: z.array(AssetControlSchema).optional(),
  effects: z.array(AssetEffectSchema).optional(),
  surface: SurfaceTypeSchema.optional(),
  scale: Vec3Schema.optional(),
  wallId: z.string().optional(),
  wallT: z.number().optional(),
  collectionIds: z.array(z.string()).optional(),
  model: z.string().optional(),
});

// ---------------------------------------------------------------------------
// SlabNode -- Pascal: polygon + holes + elevation + thickness
// ---------------------------------------------------------------------------

export interface SlabNode extends BaseNode {
  type: "slab";
  /** 2D outline points defining the slab boundary */
  polygon: Vec2[];
  /** Holes cut in the slab (each is a polygon) */
  holes?: Vec2[][];
  /** Elevation from ground in meters */
  elevation?: number;
  /** Slab thickness in meters */
  thickness: number;
}

export const SlabNodeSchema = BaseNodeSchema.extend({
  type: z.literal("slab"),
  polygon: z.array(Vec2Schema).default([]),
  holes: z.array(z.array(Vec2Schema)).optional(),
  elevation: z.number().optional(),
  thickness: z.number().default(0.2),
});

// ---------------------------------------------------------------------------
// CeilingNode -- Pascal: polygon + holes + height + children
// ---------------------------------------------------------------------------

export interface CeilingNode extends BaseNode {
  type: "ceiling";
  /** 2D outline points defining the ceiling boundary */
  polygon: Vec2[];
  /** Holes cut in the ceiling (each is a polygon) */
  holes?: Vec2[][];
  /** Height from floor in meters */
  height: number;
}

export const CeilingNodeSchema = BaseNodeSchema.extend({
  type: z.literal("ceiling"),
  polygon: z.array(Vec2Schema).default([]),
  holes: z.array(z.array(Vec2Schema)).optional(),
  height: z.number().default(3.0),
});

// ---------------------------------------------------------------------------
// RoofNode -- Pascal: container for roof segments
// ---------------------------------------------------------------------------

export interface RoofNode extends BaseNode {
  type: "roof";
}

export const RoofNodeSchema = BaseNodeSchema.extend({
  type: z.literal("roof"),
});

// ---------------------------------------------------------------------------
// RoofSegmentNode -- Pascal: 7 roof types with full dimensions
// ---------------------------------------------------------------------------

export const RoofTypeSchema = z.enum([
  "gable", "hip", "shed", "flat", "mansard", "gambrel", "butterfly",
]);
export type RoofType =
  | "gable" | "hip" | "shed" | "flat"
  | "mansard" | "gambrel" | "butterfly";

export interface RoofSegmentNode extends BaseNode {
  type: "roof-segment";
  /** Roof shape type */
  roofType: RoofType;
  /** Width of the roof segment in meters */
  width: number;
  /** Depth of the roof segment in meters */
  depth: number;
  /** Height of the ridge in meters */
  ridgeHeight: number;
  /** Overhang from the building perimeter in meters */
  overhang?: number;
  /** Roof covering thickness in meters */
  coverThickness?: number;
  /** Fascia board thickness in meters */
  fasciaThickness?: number;
  /** Soffit thickness in meters */
  soffitThickness?: number;
}

export const RoofSegmentNodeSchema = BaseNodeSchema.extend({
  type: z.literal("roof-segment"),
  roofType: RoofTypeSchema.default("gable"),
  width: z.number().default(5),
  depth: z.number().default(5),
  ridgeHeight: z.number().default(2),
  overhang: z.number().optional(),
  coverThickness: z.number().optional(),
  fasciaThickness: z.number().optional(),
  soffitThickness: z.number().optional(),
});

// ---------------------------------------------------------------------------
// ScanNode -- Pascal: imported point cloud / image scan
// ---------------------------------------------------------------------------

export interface ScanNode extends BaseNode {
  type: "scan";
  /** URL to the scan data file */
  url: string;
  /** Scale factor for the scan model */
  scale?: Vec3;
  /** Opacity of the scan overlay */
  opacity?: number;
}

export const ScanNodeSchema = BaseNodeSchema.extend({
  type: z.literal("scan"),
  url: z.string().default(""),
  scale: Vec3Schema.optional(),
  opacity: z.number().optional(),
});

// ---------------------------------------------------------------------------
// GuideNode -- Pascal: reference image / plan overlay
// ---------------------------------------------------------------------------

export interface GuideNode extends BaseNode {
  type: "guide";
  /** URL to the guide image */
  url: string;
  /** Scale factor for the guide image */
  scale?: Vec3;
  /** Opacity of the guide overlay */
  opacity?: number;
}

export const GuideNodeSchema = BaseNodeSchema.extend({
  type: z.literal("guide"),
  url: z.string().default(""),
  scale: Vec3Schema.optional(),
  opacity: z.number().optional(),
});

// ---------------------------------------------------------------------------
// AnyNode -- Discriminated union on `type`
// ---------------------------------------------------------------------------

export const AnyNodeSchema = z.discriminatedUnion("type", [
  SiteNodeSchema,
  BuildingNodeSchema,
  LevelNodeSchema,
  WallNodeSchema,
  DoorNodeSchema,
  WindowNodeSchema,
  ZoneNodeSchema,
  ItemNodeSchema,
  SlabNodeSchema,
  CeilingNodeSchema,
  RoofNodeSchema,
  RoofSegmentNodeSchema,
  ScanNodeSchema,
  GuideNodeSchema,
]);

/** Discriminated union of all possible node types */
export type AnyNode =
  | SiteNode
  | BuildingNode
  | LevelNode
  | WallNode
  | DoorNode
  | WindowNode
  | ZoneNode
  | ItemNode
  | SlabNode
  | CeilingNode
  | RoofNode
  | RoofSegmentNode
  | ScanNode
  | GuideNode;

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/** Extracts the node type matching a given type string */
export type NodeOfType<T extends AnyNode["type"]> = Extract<AnyNode, { type: T }>;

/** All possible node type discriminant values */
export type AnyNodeType = AnyNode["type"];

// ---------------------------------------------------------------------------
// Scene data structure stored in the database as JSON
// ---------------------------------------------------------------------------

export interface SceneData {
  nodes: Record<string, AnyNode>;
  rootNodeIds: string[];
  camera?: Camera;
  collections?: Collection[];
}

export const SceneDataSchema = z.object({
  nodes: z.record(z.string(), AnyNodeSchema),
  rootNodeIds: z.array(z.string()),
  camera: CameraSchema.optional(),
  collections: z.array(CollectionSchema).optional(),
});
