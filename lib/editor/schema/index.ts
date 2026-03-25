// lib/editor/schema/index.ts
// Re-exports all editor schema types and constants.

export type {
  Vec2,
  Vec3,
  BaseNode,
  WallMaterial,
  WallNode,
  SlabNode,
  HorecaZoneType,
  ZoneNode,
  HorecaItemType,
  ItemNode,
  AnyNode,
  NodeOfType,
  SceneData,
} from "./nodes";

export type { ItemDefault } from "./constants";

export {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_COLORS,
  ZONE_COLOR_TOKENS,
  ZONE_LABELS,
  ITEM_DEFAULTS,
} from "./constants";
