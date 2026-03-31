// lib/editor/schema/constants.ts
// Constants for the horeca floor plan editor.
// Includes defaults for all node types from Pascal Editor + Horecagrond extensions.

import type {
  HorecaZoneType,
  HorecaItemType,
  NodeType,
  WallSide,
  DoorSegmentType,
  DoorSwing,
  DoorSide,
  DoorHandleType,
  WindowStyle,
  AttachTo,
  SurfaceType,
  RoofType,
} from "./nodes";

// ---------------------------------------------------------------------------
// Wall defaults
// ---------------------------------------------------------------------------

/** Default wall height in meters */
export const DEFAULT_WALL_HEIGHT = 3.0;

/** Default wall thickness in meters */
export const DEFAULT_WALL_THICKNESS = 0.2;

/** Default wall side classification */
export const DEFAULT_WALL_SIDE: WallSide = "unknown";

// ---------------------------------------------------------------------------
// Door defaults
// ---------------------------------------------------------------------------

/** Default door width in meters */
export const DEFAULT_DOOR_WIDTH = 0.9;

/** Default door height in meters */
export const DEFAULT_DOOR_HEIGHT = 2.1;

/** Default door segment type */
export const DEFAULT_DOOR_SEGMENT_TYPE: DoorSegmentType = "single";

/** Default door swing direction */
export const DEFAULT_DOOR_SWING: DoorSwing = "push";

/** Default door opening side */
export const DEFAULT_DOOR_SIDE: DoorSide = "left";

/** Default door handle type */
export const DEFAULT_DOOR_HANDLE_TYPE: DoorHandleType = "lever";

/** Default door handle height in meters */
export const DEFAULT_DOOR_HANDLE_HEIGHT = 1.0;

/** Default door frame width in meters */
export const DEFAULT_DOOR_FRAME_WIDTH = 0.05;

/** Default door frame depth in meters */
export const DEFAULT_DOOR_FRAME_DEPTH = 0.03;

// ---------------------------------------------------------------------------
// Window defaults
// ---------------------------------------------------------------------------

/** Default window width in meters */
export const DEFAULT_WINDOW_WIDTH = 1.2;

/** Default window height in meters */
export const DEFAULT_WINDOW_HEIGHT = 1.2;

/** Default window sill height from floor in meters */
export const DEFAULT_WINDOW_SILL_HEIGHT = 0.9;

/** Default window style */
export const DEFAULT_WINDOW_STYLE: WindowStyle = "fixed";

/** Default window frame width in meters */
export const DEFAULT_WINDOW_FRAME_WIDTH = 0.05;

/** Default window frame depth in meters */
export const DEFAULT_WINDOW_FRAME_DEPTH = 0.03;

// ---------------------------------------------------------------------------
// Slab defaults
// ---------------------------------------------------------------------------

/** Default slab thickness in meters */
export const DEFAULT_SLAB_THICKNESS = 0.2;

/** Default slab elevation in meters */
export const DEFAULT_SLAB_ELEVATION = 0;

// ---------------------------------------------------------------------------
// Ceiling defaults
// ---------------------------------------------------------------------------

/** Default ceiling height in meters */
export const DEFAULT_CEILING_HEIGHT = 3.0;

// ---------------------------------------------------------------------------
// Roof segment defaults
// ---------------------------------------------------------------------------

/** Default roof type */
export const DEFAULT_ROOF_TYPE: RoofType = "gable";

/** Default roof segment width in meters */
export const DEFAULT_ROOF_WIDTH = 5;

/** Default roof segment depth in meters */
export const DEFAULT_ROOF_DEPTH = 5;

/** Default ridge height in meters */
export const DEFAULT_ROOF_RIDGE_HEIGHT = 2;

/** Default roof overhang in meters */
export const DEFAULT_ROOF_OVERHANG = 0.3;

/** Default roof cover thickness in meters */
export const DEFAULT_ROOF_COVER_THICKNESS = 0.05;

/** Default fascia thickness in meters */
export const DEFAULT_ROOF_FASCIA_THICKNESS = 0.02;

/** Default soffit thickness in meters */
export const DEFAULT_ROOF_SOFFIT_THICKNESS = 0.02;

// ---------------------------------------------------------------------------
// Level defaults
// ---------------------------------------------------------------------------

/** Default level height (floor-to-ceiling) in meters */
export const DEFAULT_LEVEL_HEIGHT = 3.0;

// ---------------------------------------------------------------------------
// Item defaults
// ---------------------------------------------------------------------------

/** Default item attachment mode */
export const DEFAULT_ITEM_ATTACH_TO: AttachTo = "floor";

/** Default item surface type */
export const DEFAULT_ITEM_SURFACE: SurfaceType = "none";

// ---------------------------------------------------------------------------
// Scan / Guide defaults
// ---------------------------------------------------------------------------

/** Default scan/guide opacity */
export const DEFAULT_OVERLAY_OPACITY = 0.5;

// ---------------------------------------------------------------------------
// Zone visualization
// ---------------------------------------------------------------------------

/** Visualization color per zone type (hex) */
export const ZONE_COLORS = {
  dining_area: "#4CAF50",
  bar_area: "#FF9800",
  kitchen: "#F44336",
  storage: "#9E9E9E",
  terrace: "#8BC34A",
  entrance: "#03A9F4",
  restroom: "#9C27B0",
  office: "#3F51B5",
  prep_area: "#FF5722",
  walk_in_cooler: "#00BCD4",
  seating_outside: "#CDDC39",
  hallway: "#607D8B",
} as const satisfies Record<HorecaZoneType, string>;

/** Dutch labels per zone type */
export const ZONE_LABELS = {
  dining_area: "Eetruimte",
  bar_area: "Bargedeelte",
  kitchen: "Keuken",
  storage: "Opslag",
  terrace: "Terras",
  entrance: "Entree",
  restroom: "Toiletten",
  office: "Kantoor",
  prep_area: "Voorbereidingsruimte",
  walk_in_cooler: "Koelcel",
  seating_outside: "Buitenzitplaatsen",
  hallway: "Gang",
} as const satisfies Record<HorecaZoneType, string>;

/** CSS variable token names per zone type */
export const ZONE_COLOR_TOKENS: Record<HorecaZoneType, string> = {
  dining_area: "--editor-zone-dining",
  bar_area: "--editor-zone-bar",
  kitchen: "--editor-zone-kitchen",
  storage: "--editor-zone-storage",
  terrace: "--editor-zone-terrace",
  entrance: "--editor-zone-entrance",
  restroom: "--editor-zone-restroom",
  office: "--editor-zone-office",
  prep_area: "--editor-zone-prep-area",
  walk_in_cooler: "--editor-zone-walk-in-cooler",
  seating_outside: "--editor-zone-seating-outside",
  hallway: "--editor-zone-hallway",
};

// ---------------------------------------------------------------------------
// Item defaults
// ---------------------------------------------------------------------------

/** Default dimensions for items */
export interface ItemDefault {
  /** Width in meters */
  width: number;
  /** Depth in meters */
  depth: number;
  /** Height in meters */
  height: number;
  /** Dutch label */
  label: string;
  /** How the item attaches to surfaces (defaults to 'floor' if omitted) */
  attachTo?: AttachTo;
}

/** Realistic default dimensions (meters) and Dutch labels per item type */
export const ITEM_DEFAULTS = {
  // ── Meubilair ──────────────────────────────────────────────────────────
  table_round: { width: 0.9, depth: 0.9, height: 0.75, label: "Ronde tafel" },
  table_square: { width: 0.8, depth: 0.8, height: 0.75, label: "Vierkante tafel" },
  table_long: { width: 1.8, depth: 0.8, height: 0.75, label: "Lange tafel" },
  chair: { width: 0.45, depth: 0.45, height: 0.85, label: "Stoel" },
  barstool: { width: 0.4, depth: 0.4, height: 1.05, label: "Barkruk" },
  booth: { width: 1.5, depth: 1.2, height: 1.2, label: "Zitnis" },

  // ── Keuken ─────────────────────────────────────────────────────────────
  kitchen_counter: { width: 1.8, depth: 0.6, height: 0.9, label: "Keukenblad" },
  oven: { width: 0.6, depth: 0.6, height: 0.85, label: "Oven" },
  stove: { width: 0.7, depth: 0.7, height: 0.9, label: "Fornuis" },
  fridge: { width: 0.7, depth: 0.7, height: 1.85, label: "Koelkast" },
  sink: { width: 0.6, depth: 0.5, height: 0.85, label: "Spoelbak" },
  coffee_machine: { width: 0.5, depth: 0.5, height: 0.45, label: "Koffiemachine" },
  display_case: { width: 1.2, depth: 0.7, height: 1.3, label: "Vitrine" },
  register: { width: 0.4, depth: 0.4, height: 0.35, label: "Kassa" },
  exhaust_hood: { width: 1.5, depth: 0.8, height: 0.5, label: "Afzuigkap", attachTo: "ceiling" },
  dishwasher: { width: 0.6, depth: 0.6, height: 0.85, label: "Vaatwasser" },
  prep_table: { width: 1.8, depth: 0.7, height: 0.9, label: "Werktafel" },
  warming_cabinet: { width: 0.8, depth: 0.6, height: 0.85, label: "Warmhoudkast" },
  freezer: { width: 0.7, depth: 0.7, height: 2.0, label: "Vriezer" },
  pizza_oven: { width: 1.2, depth: 1.0, height: 0.5, label: "Pizzaoven" },
  grill: { width: 0.9, depth: 0.6, height: 0.3, label: "Grill" },
  deep_fryer: { width: 0.4, depth: 0.6, height: 0.3, label: "Frituur" },

  // ── Bar ────────────────────────────────────────────────────────────────
  bar_counter: { width: 2.4, depth: 0.6, height: 1.1, label: "Bar" },
  beer_tap: { width: 0.3, depth: 0.3, height: 0.5, label: "Biertap" },
  wine_cooler: { width: 0.6, depth: 0.6, height: 0.85, label: "Wijnkoeler" },
  ice_machine: { width: 0.5, depth: 0.6, height: 0.85, label: "IJsmachine" },
  glass_washer: { width: 0.5, depth: 0.5, height: 0.85, label: "Glazenspoeler" },
  cocktail_station: { width: 1.2, depth: 0.6, height: 0.9, label: "Cocktailstation" },
  espresso_machine: { width: 0.7, depth: 0.5, height: 0.5, label: "Espressomachine" },

  // ── Sanitair ───────────────────────────────────────────────────────────
  toilet: { width: 0.4, depth: 0.7, height: 0.4, label: "Toilet" },
  urinal: { width: 0.4, depth: 0.3, height: 0.6, label: "Urinoir", attachTo: "wall" },
  hand_basin: { width: 0.45, depth: 0.35, height: 0.85, label: "Handwasbak", attachTo: "wall" },
  mirror_cabinet: { width: 0.6, depth: 0.15, height: 0.8, label: "Spiegelkast", attachTo: "wall" },

  // ── Terras / Outdoor ──────────────────────────────────────────────────
  parasol: { width: 3.0, depth: 3.0, height: 2.5, label: "Parasol" },
  planter: { width: 0.5, depth: 0.5, height: 0.8, label: "Plantenbak" },
  terrace_heater: { width: 0.5, depth: 0.5, height: 2.2, label: "Terrasverwarmer" },
  windscreen: { width: 2.0, depth: 0.05, height: 1.5, label: "Windscherm" },
  outdoor_table: { width: 0.8, depth: 0.8, height: 0.75, label: "Terrastafel" },
  outdoor_chair: { width: 0.5, depth: 0.5, height: 0.85, label: "Terrasstoel" },
  flower_box: { width: 1.0, depth: 0.3, height: 0.4, label: "Bloembak" },

  // ── Verlichting & Klimaat ──────────────────────────────────────────────
  ceiling_light: { width: 0.5, depth: 0.5, height: 0.1, label: "Plafondlamp", attachTo: "ceiling" },
  wall_light: { width: 0.2, depth: 0.15, height: 0.3, label: "Wandlamp", attachTo: "wall" },
  airco_unit: { width: 1.0, depth: 0.3, height: 0.3, label: "Airco unit", attachTo: "wall" },
  ventilation: { width: 0.6, depth: 0.6, height: 0.3, label: "Ventilatie", attachTo: "ceiling" },
  smoke_detector: { width: 0.12, depth: 0.12, height: 0.05, label: "Rookmelder", attachTo: "ceiling" },
  fire_extinguisher: { width: 0.2, depth: 0.2, height: 0.5, label: "Brandblusser", attachTo: "wall" },

  // ── Opslag ─────────────────────────────────────────────────────────────
  shelf_unit: { width: 1.2, depth: 0.4, height: 2.0, label: "Stellingkast" },
  storage_rack: { width: 1.5, depth: 0.6, height: 1.8, label: "Opslagrek" },
  coat_rack: { width: 1.0, depth: 0.4, height: 1.8, label: "Kapstok" },
} as const satisfies Record<HorecaItemType, ItemDefault>;

// ---------------------------------------------------------------------------
// Dutch labels per node type
// ---------------------------------------------------------------------------

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  site: "Terrein",
  building: "Gebouw",
  level: "Verdieping",
  wall: "Muur",
  door: "Deur",
  window: "Raam",
  zone: "Zone",
  item: "Inventaris",
  slab: "Vloer",
  ceiling: "Plafond",
  roof: "Dak",
  "roof-segment": "Daksegment",
  scan: "Scan",
  guide: "Referentie",
};
