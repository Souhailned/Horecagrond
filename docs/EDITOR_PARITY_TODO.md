# Editor Parity TODO

Doel: de Horecagrond editor stapsgewijs richting de upstream `pascalorg/editor` brengen, zonder regressies te introduceren.

## Werkregels

- Elke wijziging begint met een duidelijke root-cause en een afgebakende scope.
- Elke fase krijgt acceptatiecriteria.
- Na elke fase:
  - gerichte lint-check op aangepaste bestanden
  - gerichte typecheck op aangepaste bestanden
  - minimaal één functionele smoke-test
- Pas daarna start de volgende fase.

## Fase 1: Selection Architecture

Status: grotendeels afgerond

Taken:
- [x] Voeg een echte selection path toe (`buildingId`, `levelId`, `zoneId`, `selectedIds`)
- [x] Houd bestaande `selectedNodeIds` tijdelijk als compatibiliteitslaag
- [x] Sync selectie automatisch met scene-wijzigingen
- [x] Maak keyboard- en command-selectie level-aware
- [x] Port `double-click` phase-switch basisgedrag
- [ ] Port volledige upstream selection-manager interacties (`enter`, `leave`, verfijnde phase/layer heuristiek)

Acceptatie:
- Selectie verwijst nooit naar niet-bestaande nodes
- Selectie blijft binnen de actieve level
- `Ctrl/Cmd+A` selecteert alleen geldige nodes in de huidige level
- Zone-selectie en gewone node-selectie werken naast elkaar

## Fase 2: Floorplan Panel

Status: in uitvoering

Taken:
- [x] Bouw een echte 2D floorplan overlay in plaats van alleen minimap/raycast-mix
- [x] Render current-level walls/zones/openings/slabs in SVG
- [x] Voeg ruime hit areas toe voor muren en openingen
- [x] Gebruik de overlay voor selectie in 2D `select`-modus
- [x] Voeg pan/zoom basis toe zonder bestaande tools te breken
- [x] Render opening footprints in plaats van alleen points
- [x] Voeg wall endpoint handles en drag toe
- [x] Voeg polygon editing toe voor zones/slabs/plafonds
- [x] Voeg opening move/edit in de 2D panel basis toe
- [x] Voeg marquee selection toe
- [x] Voeg eerste bruikbare wall dimension overlays toe
- [ ] Breid dimension overlays uit voor openingen en complexere cases

Acceptatie:
- Muren in 2D zijn makkelijk klikbaar
- Zones zijn stabiel selecteerbaar
- Openingen zijn zichtbaar en klikbaar
- Overlay volgt current level en current selection

## Fase 3: 2D Editing Interactions

Status: gedeeltelijk meegenomen in fase 2

Taken:
- [x] Port endpoint dragging voor walls
- [x] Port polygon editing voor zones/slabs/plafonds in de panel-laag
- [x] Voeg opening placement en opening move/edit in 2D toe
- [x] Voeg marquee selection toe
- [x] Voeg eerste bruikbare wall dimension overlays toe
- [ ] Voeg opening dimension overlays toe

Acceptatie:
- Wall endpoints zijn stabiel sleepbaar
- Marquee selection werkt betrouwbaar
- Zone/slab editing gebeurt in 2D zonder canvas hacks
- Metingen zijn visueel en logisch consistent

## Fase 4: Containment & Parenting

Status: in uitvoering

Taken:
- [x] Maak `door` en `window` echte children van `wall`
- [x] Maak wand-items parent-aware in create/move flows
- [x] Maak plafond-items basis parent-aware
- [x] Laat duplicate/copy/paste parent-structuur behouden
- [x] Laat render-tree child nodes onder leaf nodes kunnen renderen
- [x] Laat CSG en spatial queries zowel `parentId` als legacy `wallId` respecteren
- [ ] Laat delete/update cascades voor alle attached node types volledig upstream-correct volgen

Acceptatie:
- Delete van parent ruimt children correct op
- Move/update van wall houdt children consistent
- Scene tree toont echte containment

## Fase 5: Persistence Model

Status: in uitvoering

Taken:
- Beslis tussen:
  - één gebouwscene per pand
  - of expliciete aggregatie van losse floor scenes
- [x] Centraliseer standaard scene-hiërarchie in één helper
- [x] Laat nieuwe vloeren direct met hiërarchische scene-data starten
- [x] Laat templates direct hiërarchische scene-data genereren
- [x] Laat AI-transform direct hiërarchische scene-data genereren
- [ ] Pas save/load/autosave/recovery volledig op één coherente gebouwscene aan
- [ ] Zorg dat level-hiërarchie roundtrip-bestendig blijft over alle dashboard-flows

Acceptatie:
- Opslaan en opnieuw laden behoudt volledige hiërarchie
- Meerdere verdiepingen vormen één logisch 3D model
- Geen cross-floor state leaks

## Fase 6: Templates & AI

Status: in uitvoering

Taken:
- [x] Laat templates level-aware output genereren
- [x] Laat AI-transform direct hiërarchische scene-data maken
- [x] Maak template- en AI-import level-aware in de editor
- [x] Leid AI toegestane item- en zone-types af uit de echte editorcatalogus
- [ ] Vermijd runtime-normalisatie als primaire strategie over alle import/split flows
- [ ] Breid AI prompts en fallback-layouts verder uit voor horeca-specifieke scenario’s

Acceptatie:
- Template-load geeft direct geldige scene
- AI-output past direct in gebouwmodel

## Fase 7: Final Verification

Status: gepland

Taken:
- Store-level smoke-tests
- Editor integration tests
- Playwright flows voor kernscenario’s
- Performance sanity-check op grotere scenes

Acceptatie:
- Nieuwe scene starten
- Muur/zone/opening/item plaatsen
- Selectie in 2D en 3D werkt
- Verdieping wisselen werkt
- Save/reload/recover werkt

## Reviewpunten

- Houd nieuwe editorfeatures level-aware; geen nieuwe flat-root shortcuts meer toevoegen.
- Voorkom dat 2D panel en 3D raycast-tools tegelijk dezelfde interactie claimen.
- Test elke nieuwe drag-flow expliciet op:
  - selectiebehoud
  - pointer-capture cleanup
  - grid snapping
  - state na Escape of scene switch
