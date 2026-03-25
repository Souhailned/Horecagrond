"use client";

// lib/editor/theme.ts
// Runtime bridge: reads OKLCH CSS variables and converts them to hex
// strings that Three.js can consume. Provides a React hook that
// re-resolves whenever the theme (light/dark) changes.

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

/* ------------------------------------------------------------------ */
/*  Color conversion helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Convert any CSS color string (including oklch) to a #rrggbb hex
 * string by letting the browser's canvas 2D context normalise it.
 */
function cssColorToHex(cssColor: string): string {
  if (typeof document === "undefined") return cssColor; // SSR guard
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return cssColor;
  ctx.fillStyle = cssColor;
  return ctx.fillStyle; // Always returns #rrggbb
}

/**
 * Read a computed CSS custom property from :root and return it as hex.
 * Falls back to the raw token string if resolution fails.
 */
function resolveVar(token: string): string {
  if (typeof document === "undefined") return token;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (!raw) return token;
  return cssColorToHex(raw);
}

/* ------------------------------------------------------------------ */
/*  EditorColors interface                                            */
/* ------------------------------------------------------------------ */

export interface EditorColors {
  /** Selection highlight (mapped from --primary) */
  selected: string;

  /* Zone colors */
  zoneDining: string;
  zoneBar: string;
  zoneKitchen: string;
  zoneStorage: string;
  zoneTerrace: string;
  zoneEntrance: string;
  zoneRestroom: string;
  zoneOffice: string;
  zonePrepArea: string;
  zoneWalkInCooler: string;
  zoneSeatingOutside: string;
  zoneHallway: string;

  /* Wall material colors */
  wallBrick: string;
  wallGlass: string;
  wallDrywall: string;
  wallConcrete: string;

  /* Item category colors */
  itemTable: string;
  itemSeating: string;
  itemKitchen: string;
  itemBar: string;
  itemDecor: string;

  /* Grid colors */
  gridCell: string;
  gridSection: string;

  /* Floor */
  floorPlane: string;
}

/* ------------------------------------------------------------------ */
/*  Default fallback (light-mode hex values from original constants)  */
/* ------------------------------------------------------------------ */

export const DEFAULT_COLORS: EditorColors = {
  selected: "#3b82f6",

  zoneDining: "#4CAF50",
  zoneBar: "#FF9800",
  zoneKitchen: "#F44336",
  zoneStorage: "#9E9E9E",
  zoneTerrace: "#8BC34A",
  zoneEntrance: "#03A9F4",
  zoneRestroom: "#9C27B0",
  zoneOffice: "#3F51B5",
  zonePrepArea: "#FF5722",
  zoneWalkInCooler: "#00BCD4",
  zoneSeatingOutside: "#CDDC39",
  zoneHallway: "#607D8B",

  wallBrick: "#b87333",
  wallGlass: "#87ceeb",
  wallDrywall: "#f5f5f0",
  wallConcrete: "#808080",

  itemTable: "#8B4513",
  itemSeating: "#DEB887",
  itemKitchen: "#C0C0C0",
  itemBar: "#4a3728",
  itemDecor: "#228B22",

  gridCell: "#888888",
  gridSection: "#555555",

  floorPlane: "#f8f8f8",
};

/* ------------------------------------------------------------------ */
/*  Resolve all editor colors from current CSS variables              */
/* ------------------------------------------------------------------ */

function resolveEditorColors(): EditorColors {
  return {
    selected: resolveVar("--primary"),

    zoneDining: resolveVar("--editor-zone-dining"),
    zoneBar: resolveVar("--editor-zone-bar"),
    zoneKitchen: resolveVar("--editor-zone-kitchen"),
    zoneStorage: resolveVar("--editor-zone-storage"),
    zoneTerrace: resolveVar("--editor-zone-terrace"),
    zoneEntrance: resolveVar("--editor-zone-entrance"),
    zoneRestroom: resolveVar("--editor-zone-restroom"),
    zoneOffice: resolveVar("--editor-zone-office"),
    zonePrepArea: resolveVar("--editor-zone-prep-area"),
    zoneWalkInCooler: resolveVar("--editor-zone-walk-in-cooler"),
    zoneSeatingOutside: resolveVar("--editor-zone-seating-outside"),
    zoneHallway: resolveVar("--editor-zone-hallway"),

    wallBrick: resolveVar("--editor-wall-brick"),
    wallGlass: resolveVar("--editor-wall-glass"),
    wallDrywall: resolveVar("--editor-wall-drywall"),
    wallConcrete: resolveVar("--editor-wall-concrete"),

    itemTable: resolveVar("--editor-item-table"),
    itemSeating: resolveVar("--editor-item-seating"),
    itemKitchen: resolveVar("--editor-item-kitchen"),
    itemBar: resolveVar("--editor-item-bar"),
    itemDecor: resolveVar("--editor-item-decor"),

    gridCell: resolveVar("--editor-grid-cell"),
    gridSection: resolveVar("--editor-grid-section"),

    floorPlane: resolveVar("--editor-floor-plane"),
  };
}

/* ------------------------------------------------------------------ */
/*  React hook — re-resolves when the resolved theme changes          */
/* ------------------------------------------------------------------ */

export function useEditorColors(): EditorColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<EditorColors>(DEFAULT_COLORS);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setColors(resolveEditorColors());
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return colors;
}
