/**
 * Catalog lookup for AI-generated floor plan furniture placement.
 *
 * Maps zone types to appropriate catalog items from the Pascal editor,
 * and provides helpers to build fully-formed ItemNode `asset` objects
 * that the 3D renderer can load directly (with real GLB model URLs).
 */

import type { HorecaZoneType } from "@/lib/editor/schema";

// ---------------------------------------------------------------------------
// Inline catalog subset (floor-placed items relevant for horeca)
// ---------------------------------------------------------------------------
// We define the catalog data inline rather than importing from
// `@pascal-app/editor` to avoid pulling the entire editor package into
// server-side action bundles. Values are copied from catalog-items.tsx.

export interface CatalogAsset {
  id: string;
  category: string;
  name: string;
  thumbnail: string;
  src: string;
  dimensions: [number, number, number]; // [width, height, depth]
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  surface?: { height: number };
  attachTo?: string;
  tags?: string[];
}

const CATALOG: Record<string, CatalogAsset> = {
  "dining-table": {
    id: "dining-table",
    category: "furniture",
    name: "Dining Table",
    thumbnail: "/items/dining-table/thumbnail.webp",
    src: "/items/dining-table/model.glb",
    dimensions: [2.5, 0.8, 1],
    offset: [0, 0, -0.01],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.8 },
  },
  "dining-chair": {
    id: "dining-chair",
    category: "furniture",
    name: "Dining Chair",
    thumbnail: "/items/dining-chair/thumbnail.webp",
    src: "/items/dining-chair/model.glb",
    dimensions: [0.5, 1, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  stool: {
    id: "stool",
    category: "furniture",
    name: "Stool",
    thumbnail: "/items/stool/thumbnail.webp",
    src: "/items/stool/model.glb",
    dimensions: [1, 1.2, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "coffee-table": {
    id: "coffee-table",
    category: "furniture",
    name: "Coffee Table",
    thumbnail: "/items/coffee-table/thumbnail.webp",
    src: "/items/coffee-table/model.glb",
    dimensions: [2, 0.4, 1.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.3 },
  },
  sofa: {
    id: "sofa",
    category: "furniture",
    name: "Sofa",
    thumbnail: "/items/sofa/thumbnail.webp",
    src: "/items/sofa/model.glb",
    dimensions: [2.5, 0.8, 1.5],
    offset: [0, 0, 0.04],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "lounge-chair": {
    id: "lounge-chair",
    category: "furniture",
    name: "Lounge Chair",
    thumbnail: "/items/lounge-chair/thumbnail.webp",
    src: "/items/lounge-chair/model.glb",
    dimensions: [1, 1.1, 1.5],
    offset: [0, 0, 0.09],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "kitchen-counter": {
    id: "kitchen-counter",
    category: "kitchen",
    name: "Kitchen Counter",
    thumbnail: "/items/kitchen-counter/thumbnail.webp",
    src: "/items/kitchen-counter/model.glb",
    dimensions: [2, 0.8, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.75 },
  },
  "kitchen-cabinet": {
    id: "kitchen-cabinet",
    category: "kitchen",
    name: "Kitchen Cabinet",
    thumbnail: "/items/kitchen-cabinet/thumbnail.webp",
    src: "/items/kitchen-cabinet/model.glb",
    dimensions: [2, 1.1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 1.1 },
  },
  kitchen: {
    id: "kitchen",
    category: "kitchen",
    name: "Kitchen",
    thumbnail: "/items/kitchen/thumbnail.webp",
    src: "/items/kitchen/model.glb",
    dimensions: [2.5, 1.1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  stove: {
    id: "stove",
    category: "kitchen",
    name: "Stove",
    thumbnail: "/items/stove/thumbnail.webp",
    src: "/items/stove/model.glb",
    dimensions: [1, 1, 1],
    offset: [0, 0, -0.05],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  fridge: {
    id: "fridge",
    category: "kitchen",
    name: "Fridge",
    thumbnail: "/items/fridge/thumbnail.webp",
    src: "/items/fridge/model.glb",
    dimensions: [1, 2, 1],
    offset: [0.01, 0, -0.05],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  microwave: {
    id: "microwave",
    category: "kitchen",
    name: "Microwave",
    thumbnail: "/items/microwave/thumbnail.webp",
    src: "/items/microwave/model.glb",
    dimensions: [1, 0.3, 0.5],
    offset: [0, 0, -0.03],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "coffee-machine": {
    id: "coffee-machine",
    category: "appliance",
    name: "Coffee Machine",
    thumbnail: "/items/coffee-machine/thumbnail.webp",
    src: "/items/coffee-machine/model.glb",
    dimensions: [0.5, 0.3, 0.5],
    offset: [0, 0, -0.03],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  toilet: {
    id: "toilet",
    category: "bathroom",
    name: "Toilet",
    thumbnail: "/items/toilet/thumbnail.webp",
    src: "/items/toilet/model.glb",
    dimensions: [1, 0.9, 1],
    offset: [0, 0, -0.23],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "bathroom-sink": {
    id: "bathroom-sink",
    category: "bathroom",
    name: "Bathroom Sink",
    thumbnail: "/items/bathroom-sink/thumbnail.webp",
    src: "/items/bathroom-sink/model.glb",
    dimensions: [2, 1, 1.5],
    offset: [0.11, 0, 0.02],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "coat-rack": {
    id: "coat-rack",
    category: "furniture",
    name: "Coat Rack",
    thumbnail: "/items/coat-rack/thumbnail.webp",
    src: "/items/coat-rack/model.glb",
    dimensions: [0.5, 1.8, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "trash-bin": {
    id: "trash-bin",
    category: "furniture",
    name: "Trash Bin",
    thumbnail: "/items/trash-bin/thumbnail.webp",
    src: "/items/trash-bin/model.glb",
    dimensions: [0.5, 0.6, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "office-table": {
    id: "office-table",
    category: "furniture",
    name: "Office Table",
    thumbnail: "/items/office-table/thumbnail.webp",
    src: "/items/office-table/model.glb",
    dimensions: [2, 0.8, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.75 },
  },
  "office-chair": {
    id: "office-chair",
    category: "furniture",
    name: "Office Chair",
    thumbnail: "/items/office-chair/thumbnail.webp",
    src: "/items/office-chair/model.glb",
    dimensions: [1, 1.2, 1],
    offset: [0.01, 0, 0.03],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "patio-umbrella": {
    id: "patio-umbrella",
    category: "outdoor",
    name: "Patio Umbrella",
    thumbnail: "/items/patio-umbrella/thumbnail.webp",
    src: "/items/patio-umbrella/model.glb",
    dimensions: [0.5, 3.7, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  bookshelf: {
    id: "bookshelf",
    category: "furniture",
    name: "Bookshelf",
    thumbnail: "/items/bookshelf/thumbnail.webp",
    src: "/items/bookshelf/model.glb",
    dimensions: [1, 2, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "indoor-plant": {
    id: "indoor-plant",
    category: "furniture",
    name: "Indoor Plant",
    thumbnail: "/items/indoor-plant/thumbnail.webp",
    src: "/items/indoor-plant/model.glb",
    dimensions: [1, 1.7, 1],
    offset: [-0.05, 0, 0.07],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "wine-bottle": {
    id: "wine-bottle",
    category: "kitchen",
    name: "Wine Bottle",
    thumbnail: "/items/wine-bottle/thumbnail.webp",
    src: "/items/wine-bottle/model.glb",
    dimensions: [0.5, 0.4, 0.5],
    offset: [-0.05, 0, 0.01],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  "floor-lamp": {
    id: "floor-lamp",
    category: "furniture",
    name: "Floor Lamp",
    thumbnail: "/items/floor-lamp/thumbnail.webp",
    src: "/items/floor-lamp/model.glb",
    dimensions: [1, 1.9, 1],
    offset: [0.04, 0, 0.02],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
};

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

/**
 * Get a catalog asset definition by ID. Returns `undefined` if not found.
 */
export function getCatalogAsset(id: string): CatalogAsset | undefined {
  return CATALOG[id];
}

// ---------------------------------------------------------------------------
// Zone furnishing configuration
// ---------------------------------------------------------------------------

/**
 * A placement instruction: which catalog item + how many + placement strategy.
 */
export interface FurnishingItem {
  /** Catalog item ID (must exist in CATALOG) */
  catalogId: string;
  /** Placement strategy */
  placement: "grid" | "wall" | "corner" | "center" | "scatter";
  /** Target density: items per square meter of usable zone area (for grid/scatter) */
  density?: number;
  /** Fixed count (overrides density) */
  count?: number;
  /** For grid placement: items grouped with a "host" item (e.g. chairs around a table) */
  groupWith?: string;
  /** Chairs/stools per host item in the group */
  perHost?: number;
  /** Spacing from host item center in meters */
  hostOffset?: number;
}

/**
 * Furnishing plan per zone type. Defines what to place and how.
 */
export const HORECA_ZONE_FURNISHING: Record<HorecaZoneType, FurnishingItem[]> = {
  dining_area: [
    {
      catalogId: "dining-table",
      placement: "grid",
      density: 0.08, // ~1 table per 12 m2
    },
    {
      catalogId: "dining-chair",
      placement: "grid",
      groupWith: "dining-table",
      perHost: 4,
      hostOffset: 0.3,
    },
    {
      catalogId: "indoor-plant",
      placement: "corner",
      count: 1,
    },
  ],

  bar_area: [
    {
      catalogId: "kitchen-counter",
      placement: "wall",
      count: 2,
    },
    {
      catalogId: "stool",
      placement: "grid",
      groupWith: "kitchen-counter",
      perHost: 3,
      hostOffset: 0.3,
    },
    {
      catalogId: "coffee-machine",
      placement: "corner",
      count: 1,
    },
    {
      catalogId: "wine-bottle",
      placement: "corner",
      count: 1,
    },
  ],

  kitchen: [
    {
      catalogId: "kitchen-counter",
      placement: "wall",
      count: 2,
    },
    {
      catalogId: "stove",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "fridge",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "kitchen-cabinet",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "trash-bin",
      placement: "corner",
      count: 1,
    },
  ],

  storage: [
    {
      catalogId: "bookshelf",
      placement: "wall",
      density: 0.15,
    },
    {
      catalogId: "trash-bin",
      placement: "corner",
      count: 1,
    },
  ],

  terrace: [
    {
      catalogId: "coffee-table",
      placement: "grid",
      density: 0.06,
    },
    {
      catalogId: "stool",
      placement: "grid",
      groupWith: "coffee-table",
      perHost: 4,
      hostOffset: 0.3,
    },
    {
      catalogId: "patio-umbrella",
      placement: "grid",
      groupWith: "coffee-table",
      perHost: 1,
      hostOffset: 0,
    },
  ],

  entrance: [
    {
      catalogId: "coat-rack",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "indoor-plant",
      placement: "corner",
      count: 1,
    },
  ],

  restroom: [
    {
      catalogId: "toilet",
      placement: "wall",
      count: 2,
    },
    {
      catalogId: "bathroom-sink",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "trash-bin",
      placement: "corner",
      count: 1,
    },
  ],

  office: [
    {
      catalogId: "office-table",
      placement: "center",
      count: 1,
    },
    {
      catalogId: "office-chair",
      placement: "grid",
      groupWith: "office-table",
      perHost: 1,
      hostOffset: 0.3,
    },
    {
      catalogId: "bookshelf",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "floor-lamp",
      placement: "corner",
      count: 1,
    },
  ],

  prep_area: [
    {
      catalogId: "kitchen-counter",
      placement: "wall",
      count: 2,
    },
    {
      catalogId: "kitchen-cabinet",
      placement: "wall",
      count: 1,
    },
    {
      catalogId: "trash-bin",
      placement: "corner",
      count: 1,
    },
  ],

  walk_in_cooler: [
    {
      catalogId: "bookshelf",
      placement: "wall",
      density: 0.2,
    },
  ],

  seating_outside: [
    {
      catalogId: "coffee-table",
      placement: "grid",
      density: 0.06,
    },
    {
      catalogId: "lounge-chair",
      placement: "grid",
      groupWith: "coffee-table",
      perHost: 2,
      hostOffset: 0.3,
    },
    {
      catalogId: "patio-umbrella",
      placement: "grid",
      groupWith: "coffee-table",
      perHost: 1,
      hostOffset: 0,
    },
  ],

  hallway: [
    {
      catalogId: "coat-rack",
      placement: "wall",
      count: 1,
    },
  ],
};
