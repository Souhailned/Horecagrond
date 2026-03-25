// lib/editor/schema/constants.ts
// Constants for the horeca floor plan editor.

import type { HorecaZoneType, HorecaItemType } from "./nodes";

/** Default wall height in meters */
export const DEFAULT_WALL_HEIGHT = 3.0;

/** Default wall thickness in meters */
export const DEFAULT_WALL_THICKNESS = 0.2;

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
}

/** Realistic default dimensions (meters) and Dutch labels per item type */
export const ITEM_DEFAULTS = {
  table_round: { width: 0.9, depth: 0.9, height: 0.75, label: "Ronde tafel" },
  table_square: { width: 0.8, depth: 0.8, height: 0.75, label: "Vierkante tafel" },
  table_long: { width: 1.8, depth: 0.8, height: 0.75, label: "Lange tafel" },
  chair: { width: 0.45, depth: 0.45, height: 0.85, label: "Stoel" },
  barstool: { width: 0.4, depth: 0.4, height: 1.05, label: "Barkruk" },
  bar_counter: { width: 2.4, depth: 0.6, height: 1.1, label: "Bar" },
  kitchen_counter: { width: 1.8, depth: 0.6, height: 0.9, label: "Keukenblad" },
  oven: { width: 0.6, depth: 0.6, height: 0.85, label: "Oven" },
  stove: { width: 0.7, depth: 0.7, height: 0.9, label: "Fornuis" },
  fridge: { width: 0.7, depth: 0.7, height: 1.85, label: "Koelkast" },
  sink: { width: 0.6, depth: 0.5, height: 0.85, label: "Spoelbak" },
  coffee_machine: { width: 0.5, depth: 0.5, height: 0.45, label: "Koffiemachine" },
  display_case: { width: 1.2, depth: 0.7, height: 1.3, label: "Vitrine" },
  register: { width: 0.4, depth: 0.4, height: 0.35, label: "Kassa" },
  booth: { width: 1.5, depth: 1.2, height: 1.2, label: "Zitnis" },
  planter: { width: 0.5, depth: 0.5, height: 0.8, label: "Plantenbak" },
  parasol: { width: 3.0, depth: 3.0, height: 2.5, label: "Parasol" },
} as const satisfies Record<HorecaItemType, ItemDefault>;

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
