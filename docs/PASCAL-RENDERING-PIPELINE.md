# Pascal Editor Rendering Pipeline — Deep Dive

**Datum:** 2026-03-25

---

## Architectuur: Thin Renderers + Fat Systems

Pascal scheidt rendering van geometrie-generatie:
- **Renderers** mounten lege placeholder geometrie + registreren zich bij Scene Registry
- **Systems** draaien in `useFrame` en vullen de geometrie op basis van dirty tracking
- **Scene Registry** is de brug tussen React/Zustand state en Three.js scene graph

---

## 1. Wall System (CSG-based)

### Pipeline (3 stages)

**Stage 1: Dirty Tracking**
- `dirtyNodes: Set<AnyNodeId>` in Zustand store
- WallSystem filtert voor `type === 'wall'` elke frame
- Groepering per level (mitering vereist level-brede herberekening)

**Stage 2: Miter Joint Berekening**
- `findJunctions()` groepeert muren op endpoint nabijheid (0.001m tolerantie)
- T-junctions gedetecteerd via parametric projection
- `calculateJunctionIntersections()` sorteert muren per hoek, intersect aangrenzende muurlijnen
- Output: `WallMiterData` map

**Stage 3: Geometry Generatie**
- `getWallPlanFootprint()` bouwt 2D polygon met miter punten
- `THREE.Shape` → `ExtrudeGeometry` → roteer naar Y-as
- **CSG cutouts** via `three-bvh-csg`: voor elke deur/raam wordt een `BoxGeometry` afgetrokken
- **Collision mesh**: apart mesh ZONDER cutouts voor betrouwbare pointer events

### Horecagrond Gap
Huidige implementatie: simpele `BoxGeometry` op midpoint. Geen mitering, geen CSG, geen collision mesh.

---

## 2. Scene Registry

```typescript
// ~50 regels, geen dependencies
export const sceneRegistry = {
  nodes: new Map<string, THREE.Object3D>(),  // ID → Object3D
  byType: {                                   // Type → Set<ID>
    wall: new Set<string>(),
    item: new Set<string>(),
    zone: new Set<string>(),
    // ... 14 types
  },
  clear() { /* reset */ }
}
```

- Registration via `useRegistry(id, type, ref)` in `useLayoutEffect`
- Alle Systems lezen uit registry in plaats van React props
- **Porting: EASY** — 50 regels, self-contained

---

## 3. Camera & View Modes

### Level Modes
| Mode | Gedrag |
|------|--------|
| `stacked` | Levels gestapeld op natuurlijke hoogte |
| `exploded` | 5m gap per level, smooth `lerp` animatie |
| `solo` | Alleen geselecteerde level zichtbaar |

### Wall Modes
| Mode | Gedrag |
|------|--------|
| `up` | Alle muren zichtbaar, solid white |
| `cutaway` | Camera-aware: muren richting camera worden transparant (TSL dot pattern) |
| `down` | Alle muren invisible (dot pattern) |

### Hierarchical Selection (4 niveaus)
1. Geen building → klik building
2. Building → klik level
3. Level → klik zone
4. Zone → klik items (multi-select met Cmd)

---

## 4. Post-Processing Pipeline (WebGPU)

**Vereist WebGPU renderer** — niet direct portable naar Horecagrond.

| Stage | Technologie |
|-------|------------|
| Scene pass | MRT (color, diffuse, normal, velocity) |
| Zone pass | Separate render layer |
| SSGI | Screen-Space Global Illumination (AO only) |
| Denoise | Depth + normals denoising |
| Outlines (selected) | White visible, yellow hidden, strength 3 |
| Outlines (hovered) | Blue visible, pulsing via `oscSine(time)` |
| TRAA | Temporal Anti-Aliasing |
| Background | Theme-animated lerp (dark/light) |

**WebGL Alternatief:** `@react-three/postprocessing` met `EffectComposer` voor outlines + basic AO.

---

## 5. Item Rendering

Pascal laadt **GLTF modellen** via `useGLTF` van CDN:
- Suspense fallback met "holographic" loading box (TSL shaders)
- `<Clone object={scene}>` voor loaded model
- Shared `MeshStandardNodeMaterial` instances
- Animation support via `useAnimations` met crossfade
- ErrorBoundary met rode wireframe fallback

Horecagrond: simpele `BoxGeometry` per item type.

---

## Porting Priority Matrix

| Systeem | Complexiteit | Priority | Reden |
|---------|-------------|----------|-------|
| Scene Registry | **EASY** | Must-have | Prerequisite voor alles |
| Dirty Tracking | **EASY** | Must-have | Performance basis |
| Wall Mitering | **MEDIUM** | Hoog | Visuele kwaliteit hoeken |
| Wall CSG Cutouts | **MEDIUM** | Hoog | Deur/raam integratie |
| Collision Mesh | **EASY** | Hoog | UX verbetering |
| Thin Renderer Pattern | **MEDIUM** | Hoog | Architectuur |
| Door/Window Systems | **MEDIUM** | Medium | Nieuwe features |
| Item GLTF Loading | **MEDIUM** | Medium | Visuele kwaliteit |
| Level System | **EASY** | Medium | Multi-verdiepingen |
| Wall Cutaway | **MEDIUM** | Medium | 3D navigatie |
| Selection Hierarchy | **MEDIUM** | Medium | UX |
| Zone TSL Materials | **HARD** | Laag | WebGPU vereist |
| Post-Processing | **HARD** | Laag | WebGPU vereist |

### Aanbevolen volgorde:
1. Scene Registry + Dirty Tracking
2. Wall Mitering + CSG + Collision Mesh
3. Thin Renderer refactor
4. Door/Window Systems
5. Level System
6. Item GLTF loading
7. Post-processing (wanneer WebGPU production-ready)
