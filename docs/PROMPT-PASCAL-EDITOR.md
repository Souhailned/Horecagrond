# Prompt voor nieuwe Claude Code sessie

Kopieer alles hieronder en plak het in een nieuwe Claude Code sessie:

---

Lees eerst `docs/PASCAL-EDITOR-INTEGRATION.md` — dat is de complete roadmap voor wat we bouwen.

## Wat ik wil

We integreren de **Pascal 3D floor plan editor** (extern project `~/Projects/editor`) in Horecagrond. De editor moet **exact hetzelfde** werken en eruitzien als de standalone Pascal app — zelfde tools, zelfde UI, zelfde look — maar met onze PostgreSQL database als backend.

De Pascal editor heeft:
- 3 phases (Site/Structure/Furnish), 4 modes (Select/Edit/Build/Delete)
- 11 tekentools (muren, deuren, ramen, meubels, zones, vloeren, plafonds, daken)
- 145 3D GLB modellen via CDN (`https://editor.pascal.app`)
- 13 node types, 12 property panels, command palette (Cmd+K), 20+ keyboard shortcuts
- 7 SFX geluiden, camera snapshots, presets systeem, 3 export formaten (GLB/STL/OBJ)
- 2D floorplan overlay panel
- Auto-save met debounce (1000ms)
- Volledige scene graph: `{ nodes: Record<string, unknown>, rootNodeIds: string[] }`

## Wat al gedaan is (maar NIET getest)

De 3 Pascal packages (`@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`) zijn gekopieerd naar `packages/`. De route `app/(editor)/editor/[propertyId]/` bestaat met auth check en client wrapper die `<Editor>` rendert met `onLoad`/`onSave` callbacks naar onze `saveFloorPlan` server action.

Er zijn **bekende blokkerende issues** (zie Sprint 0 in de roadmap).

## Hoe te werken

1. **Lees `docs/PASCAL-EDITOR-INTEGRATION.md`** — volledige roadmap met 5 sprints, feature inventaris, bekende issues
2. **Gebruik TaskCreate** om per sprint taken aan te maken — markeer als `completed` wanneer af
3. **Begin met Sprint 0** (fundament fixen) — dit BLOKKEERT alles
4. **Test na elke fix** met `bun dev` + open `/editor/{een-property-id}` in de browser
5. **Gebruik de browser console** om runtime errors te vinden
6. **Ga pas naar volgende sprint** als de huidige 100% af is
7. **Refereer altijd aan `~/Projects/editor/`** als bron — NIET wijzigen, alleen lezen

## Sprint overzicht

| Sprint | Doel | Taken |
|--------|------|-------|
| **0** | Fundament fixen (BLOKKEEREND) | zustand, typescript-config, @types/three, env vars, runtime errors fixen |
| **1** | Persistence & navigatie | Save/load testen, floorPlanId tracking, dashboard links toevoegen |
| **2** | Feature pariteit (32 checks) | Alle tools, panels, shortcuts, export, SFX, camera modes, presets verifiëren |
| **3** | Horecagrond aanpassingen | Horeca zones, catalog prioritering, save status UI, branding |
| **4** | Opruiming | Oude editor code verwijderen, build testen, bundle size check |

Begin nu met Sprint 0. Maak tasks aan en werk ze een voor een af.
