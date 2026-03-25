import type {
  SceneData,
  WallNode,
  ZoneNode,
  ItemNode,
  HorecaItemType,
  HorecaZoneType,
} from "../schema";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  ZONE_COLORS,
  ITEM_DEFAULTS,
} from "../schema";

export interface FloorPlanTemplate {
  id: string;
  name: string;
  description: string;
  surfaceM2: number;
  sceneData: SceneData;
}

function id(): string {
  return crypto.randomUUID();
}

function wall(start: [number, number], end: [number, number]): WallNode {
  return {
    id: id(),
    type: "wall",
    parentId: null,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    start,
    end,
    thickness: DEFAULT_WALL_THICKNESS,
    height: DEFAULT_WALL_HEIGHT,
    material: "brick",
  };
}

function zone(
  zoneType: HorecaZoneType,
  polygon: [number, number][],
  area: number,
  capacity?: number,
): ZoneNode {
  return {
    id: id(),
    type: "zone",
    parentId: null,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    zoneType,
    polygon,
    area,
    color: ZONE_COLORS[zoneType],
    capacity,
  };
}

function item(
  itemType: HorecaItemType,
  x: number,
  z: number,
  rot: number = 0,
): ItemNode {
  const def = ITEM_DEFAULTS[itemType];
  return {
    id: id(),
    type: "item",
    parentId: null,
    visible: true,
    position: [x, 0, z],
    rotation: [0, rot, 0],
    itemType,
    width: def.width,
    depth: def.depth,
    height: def.height,
  };
}

function buildScene(nodes: (WallNode | ZoneNode | ItemNode)[]): SceneData {
  const result: SceneData = { nodes: {}, rootNodeIds: [] };
  for (const n of nodes) {
    result.nodes[n.id] = n;
    result.rootNodeIds.push(n.id);
  }
  return result;
}

export const TEMPLATES: FloorPlanTemplate[] = [
  {
    id: "restaurant-80",
    name: "Restaurant 80m\u00B2",
    description: "Klassiek restaurant met keuken, eetruimte en bar",
    surfaceM2: 80,
    sceneData: buildScene([
      // Perimeter walls (10m x 8m)
      wall([0, 0], [10, 0]),
      wall([10, 0], [10, 8]),
      wall([10, 8], [0, 8]),
      wall([0, 8], [0, 0]),
      // Zones
      zone("entrance", [[0, 0], [10, 0], [10, 2], [0, 2]], 20),
      zone(
        "dining_area",
        [[0, 2], [7, 2], [7, 8], [0, 8]],
        42,
        24,
      ),
      zone("kitchen", [[7, 4], [10, 4], [10, 8], [7, 8]], 12),
      zone("bar_area", [[7, 2], [10, 2], [10, 4], [7, 4]], 6),
      // Tables (6 tables in dining)
      item("table_square", 1.5, 3.5),
      item("chair", 1.5, 2.9),
      item("chair", 1.5, 4.1),
      item("chair", 0.9, 3.5),
      item("chair", 2.1, 3.5),
      item("table_square", 4, 3.5),
      item("chair", 4, 2.9),
      item("chair", 4, 4.1),
      item("chair", 3.4, 3.5),
      item("chair", 4.6, 3.5),
      item("table_square", 1.5, 6),
      item("chair", 1.5, 5.4),
      item("chair", 1.5, 6.6),
      item("chair", 0.9, 6),
      item("chair", 2.1, 6),
      item("table_square", 4, 6),
      item("chair", 4, 5.4),
      item("chair", 4, 6.6),
      item("chair", 3.4, 6),
      item("chair", 4.6, 6),
      // Bar
      item("bar_counter", 8.5, 3),
      item("barstool", 8, 2.5),
      item("barstool", 9, 2.5),
      // Kitchen
      item("kitchen_counter", 8, 6),
      item("stove", 9, 6),
      item("fridge", 9.3, 7),
      item("sink", 8, 7),
    ]),
  },
  {
    id: "cafe-50",
    name: "Caf\u00E9 50m\u00B2",
    description: "Gezellig caf\u00E9 met terras",
    surfaceM2: 50,
    sceneData: buildScene([
      wall([0, 0], [8, 0]),
      wall([8, 0], [8, 6.25]),
      wall([8, 6.25], [0, 6.25]),
      wall([0, 6.25], [0, 0]),
      zone("entrance", [[0, 0], [8, 0], [8, 1.5], [0, 1.5]], 12),
      zone(
        "dining_area",
        [[0, 1.5], [5.5, 1.5], [5.5, 6.25], [0, 6.25]],
        26,
        16,
      ),
      zone(
        "bar_area",
        [[5.5, 1.5], [8, 1.5], [8, 6.25], [5.5, 6.25]],
        12,
      ),
      item("table_round", 2, 3),
      item("chair", 1.4, 3),
      item("chair", 2.6, 3),
      item("table_round", 2, 5),
      item("chair", 1.4, 5),
      item("chair", 2.6, 5),
      item("bar_counter", 6.75, 4),
      item("barstool", 6.2, 3.5),
      item("barstool", 6.2, 4.5),
      item("coffee_machine", 7.2, 5),
    ]),
  },
  {
    id: "dark-kitchen-40",
    name: "Dark Kitchen 40m\u00B2",
    description: "Professionele afleveringskeuken",
    surfaceM2: 40,
    sceneData: buildScene([
      wall([0, 0], [8, 0]),
      wall([8, 0], [8, 5]),
      wall([8, 5], [0, 5]),
      wall([0, 5], [0, 0]),
      zone("entrance", [[0, 0], [3, 0], [3, 1.5], [0, 1.5]], 4.5),
      zone("kitchen", [[0, 1.5], [8, 1.5], [8, 5], [0, 5]], 28),
      zone("storage", [[3, 0], [8, 0], [8, 1.5], [3, 1.5]], 7.5),
      item("kitchen_counter", 2, 3),
      item("stove", 4, 3),
      item("oven", 6, 3),
      item("sink", 2, 4.2),
      item("fridge", 6, 4.2),
      item("fridge", 7, 4.2),
    ]),
  },
];
