# Editor AI — Next Session Tasks

> Status: ToolLoopAgent werkt, 76 items + 7 zones + muren gegenereerd.
> Branch: `claude/pascal-editor-integration-uwrSe`
> Laatste commit: `c5c09f1`

---

## P0 — Moet eerst

### 1. LLM-gestuurde muur plaatsing (verwijder automatische wall generation)
**Probleem**: Alle zone-grenzen worden automatisch muren. "Open keuken" krijgt een muur.
**Oplossing**:
- Verwijder `generateWallSegments()` uit `ai-transform.ts`
- De LLM gebruikt `create_walls` tool om ZELF te bepalen waar muren komen
- Update de agent instructions: "Plaats muren waar scheidingswanden nodig zijn. Open ruimtes (open keuken, doorloop bar) krijgen GEEN muur."
- De `SceneBuilder.toSceneData()` moet werken zonder automatische walls

**Bestanden**: `lib/editor/scene-builder.ts`, `app/actions/ai-floor-plan.ts`

### 2. Deuren toevoegen
**Probleem**: Geen deuren in de plattegrond. Entree heeft geen deur.
**Oplossing**:
- Bestudeer `packages/core/src/schema/nodes/door.ts` voor het DoorNode schema
- Bestudeer hoe deuren als children van WallNode werken
- Voeg `create_door` tool toe aan de agent:
  ```
  create_door(wallId, position: 0-1, width, doorType?)
  ```
- Deuren zijn children van muren: `wall.children.push(doorId)`
- Update SceneBuilder met `createDoor(wallId, t, width)` methode
- Agent instructions: "Plaats deuren bij elke zone-overgang. Entree MOET een deur hebben."

**Bestanden**: `lib/editor/scene-builder.ts`, `app/actions/ai-floor-plan.ts`
**Referentie**: `packages/core/src/schema/nodes/door.ts`, `packages/editor/src/components/tools/door/`

### 3. Ramen toevoegen
**Probleem**: Geen ramen in buitenmuren.
**Oplossing**:
- Bestudeer `packages/core/src/schema/nodes/window.ts`
- Voeg `create_window` tool toe
- Windows zijn ook children van WallNode
- Agent instructions: "Buitenmuren moeten ramen hebben. Keuken heeft klein raam, eetruimte grote ramen."

**Bestanden**: `lib/editor/scene-builder.ts`, `app/actions/ai-floor-plan.ts`
**Referentie**: `packages/core/src/schema/nodes/window.ts`

---

## P1 — Kwaliteitsverbeteringen

### 4. Collision detection in get_scene_summary
**Probleem**: Items overlappen elkaar, items staan buiten zones.
**Oplossing**:
- Extend `SceneBuilder.getSceneSummary()` met:
  - Items die buiten hun zone vallen
  - Items die overlappen (AABB collision check)
  - Muren zonder deuren bij zone-overgangen
- De LLM kan dan corrigeren na `get_scene_summary`

### 5. Muur zichtbaarheid verbeteren
**Probleem**: Witte muren op witte achtergrond.
**Oplossing opties**:
- A: WallCutout material aanpassen (donkerder kleur)
- B: Edge highlighting via post-processing
- C: Standaard dark mode voor de editor
**Referentie**: `packages/viewer/src/systems/wall/wall-cutout.tsx`

### 6. Terrace buiten het gebouw
**Probleem**: Terrace zone overlapt soms met het gebouw.
**Oplossing**:
- Agent instructions: "Terrace zones MOETEN buiten het gebouw zijn (negatieve y-waarden)"
- Terrace walls zijn optioneel (alleen hekwerk/railing)
- Parasol schaling fixen in catalog-lookup.ts

### 7. Tafel variatie
**Probleem**: Alleen langwerpige dining-tables (2.5x1m).
**Oplossing**:
- `coffee-table` (2.0x1.5m) gebruiken voor 2-persoons tafels
- Of: nieuw catalog item "small-table" met andere afmetingen
- Agent instructions: "Gebruik dining-table voor 4+ personen, coffee-table voor 2 personen"

---

## P2 — Advanced features

### 8. Visuele validatie loop (vision-in-the-loop)
**Idee**: Na generatie, render 2D top-down view → stuur als afbeelding terug naar LLM → LLM beoordeelt en corrigeert.
**Technisch**:
- Export scene als PNG via Three.js orthographic camera
- Stuur naar vision model (Gemini 3 Flash)
- LLM roept correctie-tools aan
- Herhaal tot LLM tevreden is

### 9. prepareStep voor fase-gebaseerde tool control
**Idee**: Gebruik `prepareStep` om tools per fase te beperken:
- Fase 1 (stap 0-3): alleen `create_zone`
- Fase 2 (stap 4-8): alleen `create_walls` + `create_door` + `create_window`
- Fase 3 (stap 9-25): alleen `place_furniture` + `place_table_with_chairs`
- Fase 4 (stap 26-30): alleen `get_scene_summary` voor verificatie

### 10. Streaming progress naar de UI
**Idee**: `onStepFinish` callback gebruiken om real-time progress te tonen:
- "Zones aanmaken... (3/7)"
- "Muren tekenen... (12 muren)"
- "Meubels plaatsen... (45/80)"
- Vereist: API route i.p.v. server action + SSE streaming

---

## Architectuur referentie

```
User beschrijving
       │
       ▼
┌──────────────────┐
│  ToolLoopAgent    │
│  (AI SDK v6)      │
│                   │
│  Tools:           │
│  ├─ create_walls  │  ← LLM bepaalt WAAR muren komen
│  ├─ create_zone   │
│  ├─ create_door   │  ← NIEUW
│  ├─ create_window │  ← NIEUW
│  ├─ place_*       │
│  └─ get_summary   │  ← met collision detection
│                   │
│  SceneBuilder     │  ← accumuleert nodes
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  SceneData       │
│  (Site→Bldg→Lvl) │
│  + walls + zones  │
│  + items + doors  │
│  + windows        │
└────────┬─────────┘
         │
         ▼
  applySceneGraphToEditor()
```

## Key bestanden
- `app/actions/ai-floor-plan.ts` — ToolLoopAgent + tools
- `lib/editor/scene-builder.ts` — SceneBuilder class
- `lib/editor/catalog-lookup.ts` — meubel catalog
- `lib/editor/ai-transform.ts` — LLM response parsing + zone wall generation
- `lib/editor/scene-graph.ts` — wrapNodesInDefaultHierarchy
- `components/editor/ai-commands-provider.tsx` — UI (command palette)
- `packages/core/src/schema/nodes/door.ts` — DoorNode schema
- `packages/core/src/schema/nodes/window.ts` — WindowNode schema
- `packages/viewer/src/systems/wall/wall-cutout.tsx` — muur materiaal
