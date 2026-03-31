# Pascal Editor Complete Audit — Feature Parity Status

**Datum:** 2026-03-26
**Huidige dekking:** ~28% (21 YES, 49 PARTIAL, 91 NO van 161 features)

---

## Implementatie Roadmap (65 taken, 6 fasen)

### Phase 0: Foundation (10 taken)
1. Migrate schema naar Zod validatie
2. Voeg ontbrekende node types toe (Ceiling, Roof, Scan, Guide)
3. Upgrade DoorNode (25+ parametrische velden)
4. Upgrade WindowNode (frame, pane ratios, dividers)
5. Upgrade ItemNode (Asset schema met GLB, attachTo, controls)
6. Upgrade SiteNode (polygon property line)
7. Voeg parent children arrays toe
8. Upgrade scene store (batch CRUD, migration, diff-undo)
9. Node actions module (reparenting)
10. Event bus types uitbreiden (14 types x 8 suffixes)

### Phase 1: Core Systems (9 taken)
11. Spatial grid systeem
12. Space detection (flood-fill interior/exterior)
13. Wall mitering T-junction upgrade
14. Door systeem (parametrische geometrie)
15. Window systeem (parametrische geometrie)
16. Item systeem (wall offset, surface placement)
17. Slab systeem (polygon + holes)
18. Ceiling systeem
19. Wall systeem upgrade (per-level, collision mesh)

### Phase 2: Asset Pipeline (7 taken)
20. Asset storage (IndexedDB)
21. Asset URL resolution
22. GLTF/KTX2 loading hook
23. Item renderer upgrade (GLTF modellen)
24. Item catalog met GLB thumbnails
25. Wall/ceiling attachment
26. Surface placement

### Phase 3: Editor UI (14 taken)
27-40. Editor/viewer stores, keyboard shortcuts, auto-save, door/window/slab/ceiling tools, move tool, measurement labels, context menu, command palette

### Phase 4: Renderers (6 taken)
41-46. Slab, ceiling, door, window renderers, site boundary, scan overlay

### Phase 5: Advanced Features (8 taken)
47-54. Wall cutaway, camera controls, floorplan overlay, scene sidebar, level system upgrade, migration, property panels, scan/guide uploads

### Phase 6: Polish (11 taken)
55-65. Roof systeem, interactive items, item lights, SFX, collections, presets, preview mode, guides, helpers, thumbnails

---

## Feature Dekking per Categorie

| Categorie | Pascal | Gedekt | % |
|-----------|--------|--------|---|
| Schema/Types | 18 | 33% | Basis types aanwezig, parametrische details ontbreken |
| Stores | 9 | 22% | 2 van 9 stores, missing viewer/interactive/command |
| Systems | 16 | 19% | Wall mitering en zone systeem, rest ontbreekt |
| Renderers | 16 | 47% | Basis renderers aanwezig, parametrische ontbreekt |
| Tools | 13 | 38% | Wall/zone/item basis, missing slab/ceiling/roof |
| Hooks | 15 | 20% | Grid events en registry, missing spatial/asset |
| UI Components | 28 | 21% | Toolbar en panels, missing sidebar/command palette |
| Items/Assets | 9 | 6% | 17 hardcoded items vs 145+ GLTF modellen |
| Shortcuts | 17 | 47% | Basis shortcuts, missing phase/level navigation |
| Advanced | 19 | 21% | Undo/grid/snap, missing auto-save/cutaway/SFX |
