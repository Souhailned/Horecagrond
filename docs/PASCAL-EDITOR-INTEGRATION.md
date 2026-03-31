# Pascal 3D Editor Integratie — Complete Roadmap

## Doel
De Pascal 3D floor plan editor (uit `~/Projects/editor`) exact reproduceren binnen Horecagrond. De editor is een full-screen Three.js/R3F applicatie waarmee makelaars horeca-panden (restaurants, bars, hotels) in 3D kunnen tekenen, inrichten en exporteren. De editor moet er identiek uitzien als de standalone Pascal app, maar met onze backend (Prisma/PostgreSQL) voor opslag.

---

## Referentie: De Pascal Editor
**Bron**: `~/Projects/editor` (monorepo met Turborepo)

### Architectuur (3 packages)
| Package | Pad | Rol |
|---------|-----|-----|
| `@pascal-app/core` | `packages/core/` (42 bestanden) | Scene graph (Zustand), event bus, node types (Building/Level/Wall/Door/Window/Item/Zone/Slab/Ceiling/Roof), spatial grid, space detection |
| `@pascal-app/viewer` | `packages/viewer/` (46 bestanden) | R3F `<Viewer>` canvas, interactive system (hover/select/drag), renderers (wall/door/window/item/zone/slab/ceiling/roof), asset CDN resolver, camera controls |
| `@pascal-app/editor` | `packages/editor/` (150 bestanden) | UI shell: sidebar, panels, tools, command palette, auto-save, SFX, keyboard shortcuts. Exports `<Editor>` component |

### Complete Feature Inventaris

#### Tools (11 stuks)
1. **Wall Tool** — Tekenen van muren met snap-to-grid en aansluiting
2. **Door Tool** — Plaatsen van deuren in muren + Move Door Tool
3. **Window Tool** — Plaatsen van ramen in muren + Move Window Tool
4. **Item Tool** — 3D meubels/objecten plaatsen (145 GLB modellen via CDN)
5. **Zone Tool** — Zones tekenen (keuken, bar, dining, terras, opslag, etc.)
6. **Slab Tool** — Vloerplaten tekenen + gaten uitsnijden
7. **Ceiling Tool** — Plafonds tekenen + gaten + boundary editing
8. **Roof Tool** — Dakconstructies plaatsen + Move Roof Tool
9. **Site Boundary Editor** — Perceelgrenzen bewerken
10. **Polygon Editor** — Gedeelde polygon-bewerkingstool
11. **Selection/Move Tool** — Items selecteren en verplaatsen

#### Panels (12 stuks)
1. **Wall Panel** — Muur properties (dikte, hoogte, materiaal)
2. **Door Panel** — Deur properties (type, afmetingen)
3. **Window Panel** — Raam properties (type, afmetingen)
4. **Item Panel** — Item properties (positie, rotatie, schaal)
5. **Ceiling Panel** — Plafond properties
6. **Slab Panel** — Vloerplaat properties
7. **Roof Panel** — Dak properties
8. **Roof Segment Panel** — Individueel daksegment
9. **Zone Panel** — Zone properties en labels
10. **Reference Panel** — Referentie-afbeeldingen
11. **Settings Panel** — Audio instellingen, keyboard shortcuts dialog
12. **Site Panel** — Scene tree (gebouw → verdieping → elementen), drag-and-drop, inline rename

#### UI Systemen
- **Action Menu** — Floating toolbar: Structure tools, Furnish tools, Camera actions, View toggles, Control modes
- **Command Palette** — `Cmd+K`: alle tools, undo/redo, export, screenshot, fullscreen, level navigatie
- **Item Catalog** — 145 items in categorieën: furniture, appliance, bathroom, kitchen, outdoor
- **Floating Action Menu** — Contextgevoelige acties bij selectie
- **Node Action Menu** — Per-node acties
- **Floorplan Panel** — 2D minimap van de plattegrond
- **Icon Rail** — Compacte sidebar navigatie iconen
- **Scene Loader** — Loading state bij scene laden

#### 3D Rendering
- **Grid** — Snap grid met visuele lijnen
- **Wall Measurement Labels** — Automatische afmetingsweergave op muren
- **Site Edge Labels** — Labels op perceelgrenzen
- **Custom Camera Controls** — Orbit, pan, zoom met constraints
- **Selection Manager** — Multi-select, bounding boxes
- **Helper Manager** — Visuele helpers per node type (wall/item/ceiling/slab/roof)

#### Presets Systeem
- **Door Presets** — Custom deur-configuraties opslaan/laden
- **Window Presets** — Custom raam-configuraties opslaan/laden
- **Preset Management** — Opslaan, laden, hernoemen, verwijderen, thumbnail uploaden
- **Twee tabs** — "Mine" (persoonlijk) en "Community" (gedeeld)
- **PresetsAdapter interface** — Pluggable backend (localStorage default, of custom API)

#### Persistence & Export
- **Auto-save** — Debounced opslag (1000ms) met status indicator (pending/saving/saved/error)
- **Scene Graph** — `{ nodes: Record<string, unknown>, rootNodeIds: string[] }`
- **Export GLB** — Scene als 3D model exporteren
- **Export STL** — Voor 3D printing
- **Export OBJ** — Wavefront Object format
- **Screenshot** — Canvas als PNG exporteren
- **Thumbnail Generator** — Automatische thumbnail capture
- **Preset Thumbnail Generator** — Thumbnails voor presets
- **UI State Persistence** — Phase, mode, tool, camera snapshots, floorplan state

#### Keyboard Shortcuts
| Key | Actie |
|-----|-------|
| `1` | Site phase |
| `2` | Structure phase |
| `3` | Furnish phase |
| `S` | Structure → Elements layer |
| `F` | Furnish phase |
| `Z` | Structure → Zones layer |
| `V` | Select mode |
| `B` | Build mode |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+↑/↓` | Level up/down |
| `Delete/Backspace` | Verwijder selectie |
| `Escape` | Cancel tool / deselect |

#### Camera & View Modes
- **Camera modes**: Perspective / Orthographic
- **Wall modes**: Cutaway (cross-section) / Up (full height) / Down (low walls)
- **Level modes**: Manual / Stacked / Exploded / Solo
- **Camera Snapshots** — Opslaan/herstellen van camera posities
- **Floorplan Panel** — 2D interactieve overlay met grid, metingen, wall/zone tekenen (resizable, draggable)

#### Audio/SFX (7 geluiden via Howler.js)
`grid_snap`, `item_delete`, `item_pick`, `item_place`, `item_rotate`, `structure_build`, `structure_delete`
- Audio settings: master volume, SFX volume, radio volume, mute toggle

#### Node Types (13 stuks)
Site, Building, Level, Wall, Slab, Ceiling, Roof, RoofSegment, Door, Window, Item, Zone, Scan, Guide

#### Editor Phases & Modes
- **3 Phases**: Site (perceelgrenzen) → Structure (muren/vloeren/plafonds) → Furnish (meubels)
- **4 Modes**: Select, Edit, Build, Delete
- **Structure layers**: Elements (muren etc.) / Zones (ruimte-indeling)

#### Asset Delivery
- 3D modellen (GLB): `https://editor.pascal.app/items/{id}/model.glb`
- Thumbnails: `https://editor.pascal.app/items/{id}/thumbnail.webp`
- SFX (MP3): `https://editor.pascal.app/audios/sfx/{name}.mp3`
- Env var: `NEXT_PUBLIC_ASSETS_CDN_URL` (fallback: `https://editor.pascal.app`)

#### Scene Hiërarchie
```
Site
 └── Building(s)
      └── Level(s) (verdiepingen)
           ├── Wall(s) → Door(s), Window(s)
           ├── Item(s) (meubels, apparaten)
           ├── Zone(s) (ruimte-indeling)
           ├── Slab(s) (vloerplaten)
           ├── Ceiling(s) (plafonds)
           └── Roof (dakconstructie)
```

---

## Huidige Status (wat al gedaan is)

### Correct gedaan
- [x] 3 packages gekopieerd naar `packages/core`, `packages/viewer`, `packages/editor`
- [x] `next.config.ts`: `transpilePackages` + `turbopack.resolveAlias`
- [x] `globals.css`: `@source "../packages/editor/src"` voor Tailwind scanning
- [x] Route `app/(editor)/editor/[propertyId]/page.tsx` met auth + Prisma query
- [x] Client wrapper `editor-client.tsx` met dynamic import, `onLoad`/`onSave`, back button
- [x] Layout `app/(editor)/layout.tsx` met auth/onboarding checks
- [x] Editor CSS variabelen (zone kleuren, materialen, categorieën) in `globals.css`
- [x] Core peer dependencies: `three`, `@react-three/fiber`, `@react-three/drei`

### Bekende issues (moeten eerst gefixt worden)

#### CRITICAL
1. **`zustand` ontbreekt in root `package.json`** — Alle 3 packages vereisen zustand v5
   - Fix: `bun add zustand`

#### HIGH
2. **`@pascal/typescript-config` package ontbreekt** — Alle 3 packages refereren dit in hun `tsconfig.json`
   - Fix: Kopieer `~/Projects/editor/packages/typescript-config/` naar `packages/typescript-config/`
   - OF: Update de `extends` in elke package tsconfig

3. **`@types/three` ontbreekt in editor package** — Veroorzaakt TS errors voor JSX elementen (`<mesh>`, `<group>`, etc.)
   - Fix: `bun add -d @types/three` of toevoegen aan editor package

#### MEDIUM
4. **Static assets niet lokaal beschikbaar** — 145 GLB modellen + 7 SFX bestanden
   - De editor valt terug op CDN (`https://editor.pascal.app`) — dit WERKT maar is afhankelijk van externe service
   - Overweeg: `NEXT_PUBLIC_ASSETS_CDN_URL` env var instellen
   - Lange termijn: assets naar eigen CDN/R2 bucket kopiëren

5. **`saveFloorPlan` actie mist floor plan ID tracking** — Bij herhaald opslaan wordt steeds een nieuwe upsert gedaan op `[propertyId, floor]`, maar de editor wrapper slaat `floorPlanId` niet bij na eerste save

---

## Sprint Plan

### Sprint 0: Fundament Fixen (BLOKKEEREND)
**Doel**: Editor start op zonder crashes

Taken:
1. `bun add zustand` — zustand v5 toevoegen
2. Kopieer `~/Projects/editor/packages/typescript-config/` naar `packages/typescript-config/`
3. `bun add -d @types/three` — Three.js types toevoegen
4. Voeg `NEXT_PUBLIC_ASSETS_CDN_URL=https://editor.pascal.app` toe aan `.env.local`
5. Start `bun dev` en navigeer naar `/editor/{propertyId}`
6. Fix alle runtime errors (console, module resolution, React duplication)
7. Verifieer: 3D canvas rendert, grid zichtbaar, sidebar zichtbaar

**Acceptatiecriteria**: Editor opent full-screen met werkende 3D canvas en sidebar

---

### Sprint 1: Persistence & Navigatie
**Doel**: Data flows correct tussen editor en database

Taken:
1. Test auto-save: teken muren → wacht → check database (`PropertyFloorPlan.sceneData`)
2. Test load: refresh pagina → scene moet herladen
3. Fix `floorPlanId` tracking in editor-client (na eerste save, bewaar het ID voor updates)
4. Voeg "Open Editor" knop toe op property detail page (`/dashboard/panden/[id]`)
5. Voeg "Open Editor" knop toe in de plattegrond tab
6. Test multi-floor support: meerdere verdiepingen opslaan/laden

**Acceptatiecriteria**: Scene opslaan, pagina refreshen, scene is er nog. Navigatie vanuit dashboard werkt.

---

### Sprint 2: Feature Pariteit Verificatie
**Doel**: Alle Pascal editor features werken identiek

Taken per categorie:

**Structuur tools**:
1. Wall tool: muren tekenen, snap-to-grid, wall-to-wall connections
2. Door tool: deur in muur plaatsen, verplaatsen
3. Window tool: raam in muur plaatsen, verplaatsen
4. Slab tool: vloerplaat tekenen, gaten uitsnijden
5. Ceiling tool: plafond tekenen, gaten, boundary editing
6. Roof tool: dak plaatsen, verplaatsen

**Furnish tools**:
7. Item catalog: 145 items laden van CDN, thumbnail weergave
8. Item placement: 3D model plaatsen, rotatie, snap
9. Item move: verplaatsen na plaatsing
10. Wall/ceiling attachment: items aan muur/plafond hangen

**Zones**:
11. Zone tool: zones tekenen (keuken, bar, dining, terras)
12. Zone labels: automatische labels in 3D
13. Zone panel: zone properties bewerken

**UI**:
14. Command palette (Cmd+K): alle commando's werken
15. Keyboard shortcuts: alle 12+ shortcuts werken
16. Context menus: rechtermuisklik acties
17. Action menu: floating toolbar met alle tools
18. Site panel: scene tree navigatie, drag-and-drop, rename

**Export**:
19. Export GLB: 3D model exporteren
20. Export STL: voor 3D printing
21. Export OBJ: Wavefront Object format
22. Screenshot: canvas als PNG
23. Thumbnail auto-capture

**Audio**:
24. SFX: alle 7 geluiden werken (grid_snap, item_delete, item_pick, item_place, item_rotate, structure_build, structure_delete)
25. Audio settings panel: volume controls, mute

**Camera & Views**:
26. Perspective/Orthographic camera toggle
27. Wall modes: Cutaway, Up, Down
28. Level modes: Manual, Stacked, Exploded, Solo
29. Camera snapshots: opslaan/herstellen camera posities
30. Floorplan panel: 2D overlay met grid en metingen

**Presets**:
31. Door presets: opslaan/laden custom deur configuraties
32. Window presets: opslaan/laden custom raam configuraties

**Acceptatiecriteria**: Elke feature werkt identiek aan `~/Projects/editor`. Test door dezelfde plattegrond te tekenen in beide apps.

---

### Sprint 3: Horecagrond-specifieke Aanpassingen
**Doel**: Editor aanpassen voor horeca makelaardij context

Taken:
1. Back-button linkt correct naar property detail page
2. Save-status indicator zichtbaar voor gebruiker (opgeslagen/bezig/fout)
3. Property titel zichtbaar in editor
4. Horeca-specifieke zone types: keuken, bar, dining area, terras, opslag, toiletten, kantoor
5. Horeca-specifieke items prioriteren in catalog (tafels, stoelen, bar, keukenapparatuur)
6. Dark theme consistent met Horecagrond design tokens (of accepteer Pascal's eigen dark theme)

**Acceptatiecriteria**: Editor voelt als onderdeel van Horecagrond, niet als een externe app.

---

### Sprint 4: Opruiming & Optimalisatie
**Doel**: Oude code verwijderen, performance optimaliseren

Taken:
1. Verwijder oude editor code in `lib/editor/` (stores, renderers, systems, tools, hooks, templates, theme)
2. Verwijder oude editor componenten in `components/editor/` (als niet meer gebruikt)
3. Verwijder oude editor page `app/dashboard/panden/[id]/plattegrond/`
4. Update imports die naar oude editor verwezen
5. Lazy-load editor chunk (al dynamic import, maar verify bundle size)
6. Test: hele app build nog steeds (`bun run build`)

**Acceptatiecriteria**: Geen oude editor code meer. Build slaagt. Bundle size is acceptabel.

---

## Werkwijze voor Claude Code

### Gebruik /tasks voor voortgang
Maak bij elke sprint een takenlijst aan met TaskCreate. Markeer taken als `in_progress` bij start en `completed` bij afronding. Dit geeft de gebruiker real-time zicht op voortgang.

### Volgorde
1. Begin ALTIJD met Sprint 0 (fundament) — zonder dit werkt niets
2. Test na elke wijziging met `bun dev` + browser verificatie
3. Bij runtime errors: check browser console, fix, herstart
4. Pas daarna door naar Sprint 1, 2, 3, 4

### Belangrijke paden
```
~/Projects/editor/                     # Bron (referentie, NIET wijzigen)
~/Projects/Horecagrond/packages/       # Gekopieerde Pascal packages
~/Projects/Horecagrond/app/(editor)/   # Editor route
~/Projects/Horecagrond/app/actions/floor-plans.ts  # Database persistence
~/Projects/Horecagrond/next.config.ts  # Transpile + alias config
~/Projects/Horecagrond/app/globals.css # Tailwind @source + CSS vars
```

### EditorProps interface (de API die we gebruiken)
```typescript
interface EditorProps {
  appMenuButton?: ReactNode        // Back-button slot
  sidebarTop?: ReactNode           // Extra sidebar content
  projectId?: string | null        // Voor localStorage key scoping
  onLoad?: () => Promise<SceneGraph | null>  // Database → editor
  onSave?: (scene: SceneGraph) => Promise<void>  // Editor → database
  onDirty?: () => void             // Scene gewijzigd callback
  onSaveStatusChange?: (status: SaveStatus) => void  // Status UI
  previewScene?: SceneGraph        // Read-only preview
  isVersionPreviewMode?: boolean   // Disable editing
  isLoading?: boolean              // Loading state
  onThumbnailCapture?: (blob: Blob) => void  // Thumbnail callback
  settingsPanelProps?: SettingsPanelProps  // Settings panel config
  sitePanelProps?: SitePanelProps   // Site panel config
  presetsAdapter?: PresetsAdapter  // Custom presets backend
}
```

### Architectuurbeslissingen
- **NIET** de Pascal packages herschrijven — gebruik ze als-is
- **WEL** de client wrapper (`editor-client.tsx`) aanpassen voor onze backend
- **CDN voor assets** — gebruik `https://editor.pascal.app` als CDN (of eigen CDN later)
- **Dark theme** — Editor draait in dark mode (`<div className="dark">`)
- **Auth** — Server-side via `requirePagePermission("floorplans:manage")`
- **Persistence** — Via `onLoad`/`onSave` callbacks naar `saveFloorPlan` server action
