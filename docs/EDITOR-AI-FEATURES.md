# AI Features — Pascal Editor Integration

> Research document: hoe AI professioneel te integreren in de Pascal 3D floor plan editor.

---

## 1. Editor Extension Architecture

De Pascal editor biedt twee extension systemen:

### Command Palette (Cmd/Ctrl+K)
- **Command Registry**: `useCommandRegistry().register()` — registreer acties met icon, keywords, shortcuts
- **View Registry**: `usePaletteViewRegistry().register()` — twee types:
  - `page`: formulier binnen de command list (parameters invullen)
  - `mode`: vervangt hele dialog (generating screen, review screen)
- **Navigation**: `navigateTo('ai-generate')` / `setMode('ai-executing')` / `goBack()`

### Scene Manipulation
- **`applySceneGraphToEditor(sceneGraph)`** — laadt een complete scene
- **`useScene.getState().createNodes()`** — voeg nodes toe aan bestaande scene
- **`useScene.getState().setScene()`** — vervang hele scene
- **Undo/redo** via `zundo` temporal middleware

### Bestaande AI Infra
- `ai-floor-plan.ts` — text-to-floorplan (Groq/OpenAI)
- `ai-floor-plan-vision.ts` — image-to-floorplan (vision models)
- `ai-transform.ts` — LLM output → SceneData transformatie
- `fal.ai` — image processing (virtual staging, inpainting)
- `Trigger.dev` — background jobs (heavy AI tasks)

---

## 2. Feature Roadmap

### Phase 1: AI Generate in Editor (1-2 dagen)

**Wat**: Knop in command palette → genereer plattegrond vanuit parameters → laad in editor.

**Integratie-patroon**:
```
[Cmd+K] → "Generate Floor Plan" → [Page View: formulier]
  → propertyType, surface, seating, etc.
  → [Generate] → [Mode View: loading + progress]
  → [Mode View: preview + accept/reject]
  → applySceneGraphToEditor(result)
```

**Technisch**:
1. `AiCommandsProvider` component in editor-client.tsx
2. Registreer commands via `useCommandRegistry`
3. Formulier als palette page view
4. Server action `generateAiFloorPlan()` (al bestaand)
5. Resultaat laden via `applySceneGraphToEditor()`

**AI model**: Groq `llama-3.3-70b-versatile` (snel, gratis) → fallback OpenAI `gpt-4o-mini`

---

### Phase 2: Scan-to-Plan (3-5 dagen)

**Wat**: Upload foto van papieren plattegrond → AI extraheert ruimtes → 3D model.

**Integratie-patroon**:
```
[Upload scan/floorplan knop] → [Drag & drop / file picker]
  → Upload naar S3 → [Mode View: analyzing...]
  → scanFloorPlanImage(imageUrl) (al bestaand)
  → [Mode View: preview overlay op originele foto]
  → applySceneGraphToEditor(result)
```

**Technisch**:
1. Koppel aan bestaande "Upload scan/floorplan" knop in sidebar
2. Upload via S3 (infra klaar)
3. Server action `scanFloorPlanImage()` (al bestaand)
4. Vision model: Groq `llama-4-scout-17b` of OpenAI `gpt-4o-mini`

---

### Phase 3: AI Layout Optimizer (1 week)

**Wat**: Analyseer bestaande plattegrond → suggesties voor betere indeling.

**Twee modes**:
1. **Analyse**: Score (0-100) + suggesties (flow, capaciteit, compliance)
2. **Auto-optimize**: Herschik zones/items automatisch

**Integratie-patroon**:
```
[Cmd+K] → "Optimize Layout" → [Mode View: analyzing...]
  → Stuur huidige sceneData als JSON naar LLM
  → LLM retourneert:
    - Score (0-100)
    - Problemen (flow bottlenecks, compliance issues)
    - Verbeterde versie (optioneel)
  → [Mode View: rapport + diff-preview]
  → Accept/Reject per suggestie
```

**Prompt-strategie**:
```
Analyseer deze horeca plattegrond:
- Zones: {zones als JSON}
- Items: {items als JSON}
- Oppervlakte: {m2}

Beoordeel op:
1. Klantstroom (geen dead ends, logische routing)
2. Keuken-efficiency (werkdriehoek, HACCP-afstand)
3. Capaciteit (m2 per zitplaats, gangpaden 90cm+)
4. Brandveiligheid (max 30m tot nooduitgang, 2+ vluchtroutes)
5. Toegankelijkheid (rolstoel 85cm gangpad)

Retourneer JSON: { score, issues[], optimizedPlan? }
```

---

### Phase 4: Virtual Staging / Rendering (1-2 weken)

**Wat**: Genereer fotorealistische afbeelding van de plattegrond in een specifieke stijl.

**Pipeline**:
```
[Editor 3D view] → PNG screenshot (editor export)
  → fal.ai "flux-2-lora-gallery/apartment-staging"
  → Fotorealistische afbeelding
  → Toon in overlay / download
```

**fal.ai Model**: `fal-ai/flux-2-lora-gallery/apartment-staging`
- Input: lege ruimte afbeelding + prompt
- Output: gemeubileerde ruimte
- Kosten: $0.021/megapixel
- 6 bestaande stijl-presets: specialty_coffee, wine_tapas, bakery_brunch, etc.

**Alternatief voor 3D→foto**:
1. Export 3D als PNG (top-down of perspectief)
2. Gebruik fal.ai image-to-image met stijl-prompt
3. Of: gebruik Three.js post-processing voor stylized render

**Trigger.dev job** voor heavy rendering (>30s):
```typescript
export const virtualStagingTask = task({
  id: "virtual-staging",
  maxDuration: 300,
  retry: { maxAttempts: 3 },
  run: async (payload: { imageUrl: string; style: string }) => {
    const result = await fal.subscribe("fal-ai/flux-2-lora-gallery/apartment-staging", {
      input: {
        image_urls: [payload.imageUrl],
        prompt: `${payload.style} interior design, photorealistic`,
      },
    });
    return result.images[0].url;
  },
});
```

---

### Phase 5: AI Chat Assistant (2-3 weken)

**Wat**: Chat sidebar in editor: "maak de keuken groter" → editor past scene aan.

**Integratie-patroon**:
```
[Chat panel in sidebar] → Natural language input
  → AI SDK streamText + tool calling
  → Tools:
    - get_current_scene() → leest useScene state
    - modify_zone(id, changes) → useScene.updateNode()
    - add_item(type, position) → useScene.createNode()
    - remove_node(id) → useScene.deleteNode()
    - suggest_layout(constraints) → generateAiFloorPlan()
  → Streaming response + real-time scene updates
```

**AI SDK v6 pattern**:
```typescript
const result = await streamText({
  model: 'anthropic/claude-sonnet-4.6',
  system: `Je bent een horeca interieur architect.
    Je hebt toegang tot een 3D plattegrond editor.
    Huidige scene: ${JSON.stringify(currentScene)}`,
  tools: {
    modify_zone: tool({
      description: 'Wijzig een zone (grootte, positie, type)',
      inputSchema: z.object({
        zoneId: z.string(),
        changes: z.object({ ... }),
      }),
      execute: async ({ zoneId, changes }) => {
        useScene.getState().updateNode(zoneId, changes);
        return { success: true };
      },
    }),
    add_furniture: tool({
      description: 'Voeg meubel toe aan de scene',
      inputSchema: z.object({
        type: z.enum([...VALID_ITEM_TYPES]),
        x: z.number(),
        y: z.number(),
      }),
      execute: async ({ type, x, y }) => {
        const node = ItemNode.parse({ type, position: [x, 0, y] });
        useScene.getState().createNode(node, currentLevelId);
        return { success: true, itemId: node.id };
      },
    }),
  },
});
```

---

### Phase 6: Horeca Compliance Checker (1 week)

**Wat**: Automatische check tegen NL/EU regelgeving.

**Regels**:
| Regel | Bron | Check |
|-------|------|-------|
| Max 30m tot nooduitgang | Bouwbesluit 2012 | Pathfinding van elk punt |
| Min 2 vluchtroutes | Bouwbesluit 2012 | Graph analysis op zones |
| Gangpad min 85cm (rolstoel) | Bouwbesluit 2012 | Afstand tussen items |
| Keuken gescheiden van eetruimte | HACCP | Zone adjacency check |
| 1.5m2 per zitplaats restaurant | Horecavergunning | Zone area / item count |
| Brandblussers per 200m2 | PGS 15 | Item count check |
| Noodverlichting bij uitgangen | NEN 1838 | Item presence check |

**Implementatie**: Puur algoritmisch (geen LLM nodig) — analyseer scene graph:
1. Bereken afstanden met spatial grid
2. Check zone-adjacency
3. Tel items per zone
4. Genereer rapport met pass/fail per regel

---

## 3. Prioriteit & Effort Matrix

| # | Feature | Impact | Effort | Dependencies |
|---|---------|--------|--------|-------------|
| 1 | AI Generate in Editor | Hoog | 1-2d | Bestaande actions |
| 2 | Scan-to-Plan | Hoog | 3-5d | Bestaande vision action |
| 3 | Compliance Checker | Medium | 1w | Geen (algoritmisch) |
| 4 | Layout Optimizer | Hoog | 1w | LLM prompt engineering |
| 5 | Virtual Staging | Medium | 1-2w | fal.ai + Trigger.dev |
| 6 | AI Chat Assistant | Zeer hoog | 2-3w | AI SDK v6 + tool calling |

**Aanbeveling**: Start met Phase 1 (AI Generate) — het koppelt bestaande infra aan de editor met minimale effort en geeft direct waarde.

---

## 4. Externe APIs & Modellen (Research)

### Floor Plan Scanning
| Tool | Aanpak | Nauwkeurigheid | Prijs | Integratie |
|------|--------|----------------|-------|------------|
| **CubiCasa** | Mobile SDK + REST API | 1-5% marge | $15-30/scan | GoToScan API (async, 24h delivery) |
| **Archilogic** | npm SDK + GraphQL API | Hoog | Enterprise | `@archilogic/floor-plan-sdk` |
| **Apple RoomPlan** | LiDAR scan → USDZ | Zeer hoog | Gratis | iOS-only, Swift API |
| **Onze aanpak** | GPT-4o vision | Medium | ~$0.01/scan | Al gebouwd in `ai-floor-plan-vision.ts` |

### Rendering (3D → Fotorealistisch)
| Model | Platform | Aanpak | Prijs |
|-------|----------|--------|-------|
| **FLUX.1 + Depth ControlNet** | fal.ai | Depth map input → preserveert geometrie | $0.025/img |
| **FLUX.2 Apartment Staging** | fal.ai | Image-to-image, meubels toevoegen | $0.021/MP |
| **Interior Design SDXL** | Replicate | ControlNet + interieur stijlen | ~$0.03/img |

**Aanbevolen rendering pipeline**:
```
Three.js → Depth map (MeshDepthMaterial) + Screenshot (orthographic)
    → fal.ai FLUX.1 + Depth ControlNet
    → Prompt: "Photorealistic {type} interior, {style}, warm lighting"
    → Fotorealistisch beeld (opslaan in S3/Vercel Blob)
```

### NL Horeca Regelgeving (voor Compliance Checker)
| Vereiste | Norm | Waarde |
|----------|------|--------|
| Min oppervlakte | BBL | 35 m2 |
| Plafondhoogte nieuwbouw | BBL | 2.60m |
| Plafondhoogte bestaand | BBL | 2.10m |
| Bezettingsmelding | BBL | Bij 50+ bezoekers |
| Ventilatie nieuwbouw | BBL | 4 dm3/s per persoon |
| Deuropening | BBL/EAA | Min 80cm breed |
| Brandblusser inspectie | NEN 2559 | Jaarlijks |
| HACCP rauw/bereid scheiding | NVWA | Verplicht |

### Capaciteitsberekening (per type)
| Type | m2 per persoon | Efficiency factor |
|------|----------------|-------------------|
| Fine Dining | 1.7 - 2.0 | 0.65 |
| Casual Dining | 1.1 - 1.4 | 0.75 |
| Cafe / Fast Casual | 0.9 - 1.1 | 0.80 |
| Bar (staand) | 0.5 - 0.7 | 0.70 |

**Formule**: `Capaciteit = (netto_eetruimte / m2_per_persoon) * efficiency`

### AI Scene Editing (State of the Art)
- **SceneTeller** (ECCV 2024): Text → 3D bounding boxes → CAD model placement
- **Spline AI / Omma**: Natural language → interactive 3D web experiences
- **Onze aanpak**: Scene graph JSON → LLM structured output → edit operations → apply

**Bronnen**: CubiCasa Developer APIs, Archilogic SDK, fal.ai FLUX models, BBL/NVWA regelgeving, SevenRooms AI Seating, HACCP-regels NVWA, KHN brandveiligheidseisen.

---

## 5. Technische Architectuur

```
                    ┌─────────────────────────┐
                    │   Pascal Editor (R3F)    │
                    │                          │
                    │  ┌───────────────────┐   │
                    │  │ Command Palette    │   │
                    │  │ ├─ AI Generate     │   │
                    │  │ ├─ AI Scan         │   │
                    │  │ ├─ AI Optimize     │   │
                    │  │ └─ AI Chat         │   │
                    │  └───────────────────┘   │
                    │           │               │
                    │  applySceneGraphToEditor  │
                    │           │               │
                    │  ┌───────────────────┐   │
                    │  │ Scene Store        │   │
                    │  │ (Zustand + zundo)  │   │
                    │  └───────────────────┘   │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼───────────────┐
                    │   Next.js Server Actions  │
                    │                           │
                    │  ├─ generateAiFloorPlan   │
                    │  ├─ scanFloorPlanImage    │
                    │  ├─ optimizeLayout        │
                    │  └─ ai-transform.ts       │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
     │  Groq / OpenAI │  │  fal.ai    │  │ Trigger.dev │
     │  (text + vision)│  │  (images)  │  │ (bg jobs)   │
     └────────────────┘  └────────────┘  └─────────────┘
```
