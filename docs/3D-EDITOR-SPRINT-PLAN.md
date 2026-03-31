# 3D Floor Plan Editor — Sprint Plan & Task List

> Branch: `claude/pascal-editor-integration-uwrSe`
> Gebaseerd op: [pascalorg/editor](https://github.com/pascalorg/editor) (MIT)
> Review: 2 CRITICAL, 4 HIGH, 6 MEDIUM, 7 LOW bevindingen

---

## Architectuur: Pascal Editor → Horecagrond Mapping

```
Pascal Editor (Turborepo monorepo)        Horecagrond (single Next.js app)
─────────────────────────────────         ────────────────────────────────
packages/core/src/nodes/        ────→     lib/editor/schema/nodes.ts
packages/core/src/stores/       ────→     lib/editor/stores/
packages/core/src/systems/      ────→     lib/editor/systems/
packages/viewer/src/renderers/  ────→     lib/editor/renderers/
packages/editor/src/tools/      ────→     components/editor/ (React UI)
packages/ui/                    ────→     components/ui/ (bestaande shadcn)

Pascal: three-bvh-csg (CSG)    ────→     Later: Boolean wall operations
Pascal: three-mesh-bvh          ────→     Later: Spatial queries
Pascal: polygon-clipping        ────→     Later: Zone polygon operations
Pascal: idb-keyval              ────→     PostgreSQL JSON (PropertyFloorPlan)
Pascal: mitt (events)           ────→     mitt (al geïnstalleerd)
Pascal: zundo (undo/redo)       ────→     zundo (al geïnstalleerd)
```

### Waarom GEEN Turborepo?
Horecagrond is een single Next.js app. De editor code leeft in `lib/editor/` en `components/editor/` — dezelfde structuur als Pascal's packages, maar als lokale modules. Extractie naar `packages/editor/` is mogelijk als Horecagrond multi-app wordt.

---

## Bestaande Patronen (VERPLICHT te volgen)

### Backend Patronen
```typescript
// Server Action pattern (app/actions/*.ts)
"use server";
import { requirePermission } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUserGenerate, incrementAiEditCount } from "@/app/actions/ai-quota";
import { getModel } from "@/lib/ai/model";

export async function myAction(input): Promise<ActionResult<T>> {
  // 1. Auth + permission
  const auth = await requirePermission("permission:string");
  if (!auth.success) return { success: false, error: auth.error };

  // 2. Rate limit (AI actions)
  const rl = await checkRateLimit(auth.data!.userId, "ai");
  if (!rl.success) return { success: false, error: "Te veel verzoeken" };

  // 3. Quota check (seeker role)
  const quota = await canUserGenerate(auth.data!.userId);
  if (!quota.allowed) return { success: false, error: quota.message };

  // 4. Validate input (Zod)
  const validated = schema.safeParse(input);
  if (!validated.success) return { success: false, error: validated.error.issues[0].message };

  // 5. Business logic
  const { model } = await getModel();  // Groq → OpenAI → Ollama
  const result = await generateText({ model, ... });

  // 6. Persist + log (fire-and-forget)
  prisma.aiUsageLog.create({ data: { ... } }).catch(() => {});
  incrementAiEditCount(auth.data!.userId).catch(() => {});

  // 7. Revalidate + return
  revalidatePath("/dashboard/...");
  return { success: true, data: result };
}
```

### Frontend Patronen
```typescript
// Dashboard page pattern
import { requirePagePermission } from "@/lib/session";
import { ContentCard, ContentCardHeader, ContentCardBody } from "@/components/dashboard/content-card";

export default async function Page({ params }) {
  const { userId, role } = await requirePagePermission("permission:string");
  // ... fetch data with admin elevation
  return (
    <ContentCard>
      <ContentCardHeader title="..." actions={...} />
      <ContentCardBody>{children}</ContentCardBody>
    </ContentCard>
  );
}
```

### Styling: GEEN hardcoded kleuren
```typescript
// ❌ FOUT
const SELECTED_COLOR = '#3b82f6';
style={{ background: "#fafafa" }}

// ✅ GOED — Three.js kleuren via runtime CSS var
function getCSSColor(varName: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName).trim();
}
// Canvas achtergrond via className, niet style
<div className="bg-background"><Canvas gl={{ alpha: true }} /></div>
```

---

## Sprint 1: Critical Fixes & Backend Hardening

**Doel:** Alle security issues, auth bugs, en AI integration problemen fixen.
**Parallel: 3 workflows**

### WF-1A: Security & Auth Fixes
**Agent type:** `backend-dev`
**Files:** `app/actions/floor-plans.ts`, `app/dashboard/panden/[id]/plattegrond/page.tsx`, `lib/rbac.ts`

| # | Task | Ernst | Detail |
|---|------|-------|--------|
| 1.1 | Auth op read actions | CRITICAL | Voeg `requirePermission("floorplans:view")` toe aan `getFloorPlan()` en `getFloorPlans()`. Voeg `verifyPropertyAccess()` check toe zodat users alleen hun eigen panden kunnen zien (admin ziet alles). |
| 1.2 | Page permission fix | MEDIUM | Vervang `auth.api.getSession()` met `requirePagePermission("floorplans:manage")` in `plattegrond/page.tsx`. Pas query aan met admin elevation: `role !== "admin" ? { createdById: userId } : {}`. |
| 1.3 | sceneData Zod schema | MEDIUM | Vervang `z.record(z.string(), z.unknown())` met: `z.object({ nodes: z.record(z.string(), z.unknown()), rootNodeIds: z.array(z.string()) })` |
| 1.4 | Image size limit | HIGH | Voeg `.max(14_000_000, "Afbeelding te groot (max 10 MB)")` toe aan `imageUrl` schema in `scanFloorPlanImageSchema`. |
| 1.5 | CUID validatie | LOW | Vervang `z.string().min(1)` met `z.string().cuid()` voor `propertyId` en `id` velden. |
| 1.6 | RBAC permissions | — | Voeg toe aan `ROLE_PERMISSIONS` in `lib/rbac.ts`: `"floorplans:manage"` (admin, agent), `"floorplans:view"` (admin, agent, seeker). |

### WF-1B: AI Backend Integration
**Agent type:** `backend-dev`
**Files:** `app/actions/ai-floor-plan.ts`, `app/actions/ai-floor-plan-vision.ts`, `lib/ai/model.ts`, `lib/editor/ai-transform.ts`

| # | Task | Ernst | Detail |
|---|------|-------|--------|
| 1.7 | Gebruik `lib/ai/model.ts` | HIGH | Verwijder inline `getModel()` en `getVisionModel()` uit beide AI action files. Import `getModel` van `@/lib/ai/model`. |
| 1.8 | Extract shared code | HIGH | Maak `lib/editor/ai-transform.ts` met: `transformToSceneData()`, `parseLlmResponse()`, `VALID_ZONE_TYPES`, `VALID_ITEM_TYPES`, `LlmFloorPlan` interface. Import in beide AI actions. |
| 1.9 | AI persistence | HIGH | Na elke generatie: `prisma.aiUsageLog.create({ data: { userId, service: "groq"/"openai", model: "...", feature: "floor-plan-generate"/"floor-plan-vision", promptTokens, completionTokens, costCents, status: "success" } }).catch(() => {})`. Gebruik `result.usage` van AI SDK. |
| 1.10 | Rate limiting | MEDIUM | Voeg `checkRateLimit(userId, "ai")` toe aan begin van `generateAiFloorPlan()` en `scanFloorPlanImage()`, na permission check. |
| 1.11 | Quota tracking | — | Voeg `canUserGenerate()` check toe (voor seeker role). Na succesvolle generatie: `incrementAiEditCount()`. |
| 1.12 | getVisionModel export | HIGH | Voeg aan `lib/ai/model.ts` toe: `export async function getVisionModel()` met chain: Groq `llama-4-scout-17b-16e-instruct` → OpenAI `gpt-4o-mini` → return null. |

### WF-1C: Critical Frontend Bug
**Agent type:** `frontend-dev`
**Files:** `components/editor/property-editor.tsx`, `floor-plan-editor-client.tsx`, `lib/editor/utils/`

| # | Task | Ernst | Detail |
|---|------|-------|--------|
| 1.13 | Stale closure fix | CRITICAL | Verplaats `completeDrawing` useCallback definitie BOVEN de keyboard `useEffect`. Voeg `completeDrawing` toe aan de useEffect dependency array. |
| 1.14 | useCallback deps fix | LOW | In `handleDeleteFloor`: voeg ontbrekende deps toe of verwijder useCallback (niet doorgegeven aan memo'd child). |
| 1.15 | Extract getFloorLabel | LOW | Maak `lib/editor/utils/floor-labels.ts` met `getFloorLabel(floor: number): string`. Import in `floor-plan-editor-client.tsx` en `floor-plan-viewer.tsx`. |

---

## Sprint 2: Frontend Quality & Performance

**Doel:** Theme compliance, 3D performance, memory management.
**Parallel: 2 workflows**

### WF-2A: Theme & Styling Compliance
**Agent type:** `frontend-dev`
**Files:** `lib/editor/theme.ts`, `lib/editor/schema/constants.ts`, renderers, `app/globals.css`

| # | Task | Detail |
|---|------|--------|
| 2.1 | Maak `lib/editor/theme.ts` | Runtime CSS variable reader: `getEditorColor(token: string): string`. Cache resultaten. Tokens: `--editor-zone-dining`, `--editor-zone-kitchen`, `--editor-wall-brick`, `--editor-selected`, etc. |
| 2.2 | CSS variables in globals.css | Voeg editor-specifieke CSS vars toe onder `:root` en `.dark`. Light: warme kleuren. Dark: gedempte varianten. |
| 2.3 | ZONE_COLORS refactor | `constants.ts`: vervang hardcoded hex met token names. Runtime: resolve via `getEditorColor()`. |
| 2.4 | Renderer kleuren | `wall-renderer.tsx`: MATERIAL_COLORS → theme tokens. `item-renderer.tsx`: CATEGORY_COLORS → theme tokens. SELECTED_COLOR → `--primary` CSS var. |
| 2.5 | Canvas background | Verwijder `style={{ background: "#fafafa" }}`. Wrap Canvas in `<div className="bg-muted/30">`. Canvas `gl={{ alpha: true }}` is al ingesteld. |
| 2.6 | Zone label overlay | Vervang inline styles in ZoneRenderer Html met Tailwind classes: `className="bg-foreground/75 text-background px-2 py-1 rounded text-xs font-semibold"`. |

### WF-2B: 3D Performance & Memory
**Agent type:** `frontend-dev`
**Files:** Alle renderers, `scene-store.ts`, `scene-renderer.tsx`

| # | Task | Detail |
|---|------|--------|
| 2.7 | Geometry disposal | Voeg `useEffect(() => () => geometry.dispose(), [geometry])` toe in WallRenderer en ZoneRenderer. Voorkomt GPU memory leaks bij resize/delete. |
| 2.8 | handleSelect memo | `scene-renderer.tsx`: wrap `handleSelect` in `useCallback((id: string) => selectNode(id), [selectNode])`. |
| 2.9 | Selection Set | `scene-renderer.tsx`: `const selectionSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])`. Gebruik `selectionSet.has(node.id)` ipv `includes()`. |
| 2.10 | Centroid dedup | `zone-renderer.tsx`: import `polygonCentroid` van `lib/editor/utils/geometry` ipv inline berekening. |
| 2.11 | Zundo equality | Installeer `fast-deep-equal`. Vervang `JSON.stringify` vergelijking met: `equality: isDeepEqual`. |
| 2.12 | Viewer state decoupling | `floor-plan-viewer.tsx`: vervang `useEditorStore` met lokale `const [viewMode, setViewMode] = useState<"2d" | "3d">("3d")`. Verwijder alle `useEffect` die store muteren. |
| 2.13 | updateNode type safety | Optie A: `updateNode<T extends AnyNode["type"]>(id, type: T, updates: Partial<NodeOfType<T>>)`. Optie B: runtime guard dat `updates` keys geldig zijn voor `existing.type`. |
| 2.14 | React.memo renderers | Wrap elke renderer in `React.memo` met custom comparator die `node` (by value) en `selected` (by value) vergelijkt. |
| 2.15 | InstancedMesh | Voor items met dezelfde `itemType` in een scene: gebruik `<instancedMesh>` ipv individuele meshes. Reduceert draw calls van 100+ tafels/stoelen naar 1 per type. |

---

## Sprint 3: Pascal Editor Feature Parity

**Doel:** Core features van Pascal Editor implementeren voor horeca use cases.
**Parallel: 3 workflows**

### WF-3A: Building Structure & Slab
**Agent type:** `frontend-dev`

| # | Task | Detail |
|---|------|--------|
| 3.1 | SlabRenderer | Implementeer `lib/editor/renderers/slab-renderer.tsx`: ExtrudeGeometry van polygon outline, configureerbare dikte. Materiaal: beton/hout. |
| 3.2 | Slab tool | Voeg "Vloer/Plafond" tool toe aan EditorToolbar. Tekenmodus: klik punten → sluit polygon → creeer SlabNode. |
| 3.3 | Hierarchy nodes | Voeg `BuildingNode` en `LevelNode` toe aan `nodes.ts`. Houdt meta-data: gebouwnaam, verdiepingshoogte. ParentId chain: Building → Level → Zone/Wall/Item. |
| 3.4 | SceneRenderer update | Voeg SlabRenderer case toe aan switch statement. |
| 3.5 | Display modes | Voeg `displayMode: "stacked" | "exploded" | "solo"` toe aan editor-store. "Stacked": alle verdiepingen op juiste hoogte. "Exploded": verdiepingen met extra Y-offset. "Solo": alleen actieve verdieping. |

### WF-3B: Interactive Tools & UX
**Agent type:** `frontend-dev`

| # | Task | Detail |
|---|------|--------|
| 3.6 | Drag-to-move | Gebruik `TransformControls` van `@react-three/drei` voor geselecteerde nodes. Mode: "translate" voor items, beperkt tot XZ plane. |
| 3.7 | Wall snapping | In `geometry.ts`: `snapToNearestEndpoint(point, existingWalls, threshold=0.15)`. Auto-connect muuruiteinden binnen drempel. |
| 3.8 | Wall measurements | In WallRenderer: voeg `<Html>` label toe op midpoint van muur met `length.toFixed(2)m`. Alleen zichtbaar in 2D modus. |
| 3.9 | Item rotation | R-toets: roteer geselecteerd item 90° (Y-as). Optioneel: rotation handle gizmo met TransformControls mode="rotate". |
| 3.10 | Copy/paste | Ctrl+C: sla geselecteerde nodes op in clipboard (editor-store). Ctrl+V: dupliceer met offset (+0.5m X/Z). Nieuwe IDs genereren. |
| 3.11 | Box select | Shift+drag: teken selectie-rectangle op canvas. Alle nodes binnen rectangle worden geselecteerd. Gebruik `raycaster.intersectObjects()`. |
| 3.12 | Snap feedback | Grid-renderer: highlight dichtstbijzijnde snap punt tijdens tekenen/verplaatsen. Klein blauw bolletje op grid intersectie. |

### WF-3C: Assets & Templates
**Agent type:** `frontend-dev` + `backend-dev`

| # | Task | Detail |
|---|------|--------|
| 3.13 | Asset categorieën | Herstructureer AssetPanel met tabs/accordeons: **Meubilair** (tafels, stoelen, banken), **Keuken** (oven, fornuis, spoelbak, koelkast, koffiemachine), **Bar** (bar counter, barkrukken, vitrine), **Terras** (parasol, plantenbak), **Overig** (kassa, display). |
| 3.14 | Drag-from-panel | Implementeer pointer event based drag: `onPointerDown` op asset item → track mouse → op canvas drop: createNode op cursor positie. Geen react-dnd dependency nodig. |
| 3.15 | Template presets | Maak `lib/editor/templates/` met JSON files: `restaurant-80m2.json`, `cafe-50m2.json`, `dark-kitchen-40m2.json`, `bar-60m2.json`. Elk bevat volledige SceneData. |
| 3.16 | Template dialog | Nieuwe `components/editor/template-dialog.tsx`: grid van template previews (thumbnail + naam + m²). Klik → laad in scene (bevestiging als scene niet leeg). |
| 3.17 | Capaciteitsberekening | `lib/editor/systems/capacity-system.ts`: tel items van type chair/barstool/booth in dining/bar zones → totaal zitplaatsen. Hook: `useCapacity()`. Toon in toolbar. Optioneel: sync naar Property.seatingCapacityInside bij opslaan. |

---

## Sprint 4: Public Viewer & Export

**Doel:** Floor plans tonen op publieke listing pagina's, export mogelijkheden.
**Parallel: 2 workflows**

### WF-4A: Public Integration
**Agent type:** `frontend-dev`

| # | Task | Detail |
|---|------|--------|
| 4.1 | Viewer refactor | FloorPlanViewer volledig ontkoppelen van editor store. Eigen lokale state voor viewMode, selected floor. Props-only interface. |
| 4.2 | Property detail integratie | Op `aanbod/[slug]` pagina: als property.floorPlans.length > 0, toon FloorPlanViewer sectie onder foto gallerij. |
| 4.3 | Touch controls | OrbitControls met touch support: twee-vingers pan, pinch zoom, enkele vinger rotatie (alleen 3D modus). |
| 4.4 | Fullscreen | Fullscreen button: gebruik `document.documentElement.requestFullscreen()` op viewer container. Escape om te sluiten. |

### WF-4B: Export Pipeline
**Agent type:** `backend-dev` + `frontend-dev`

| # | Task | Detail |
|---|------|--------|
| 4.5 | PNG export | `lib/editor/utils/export.ts`: `captureTopDown(canvas, width, height)` → stel orthografische camera in op top-down → `renderer.render()` → `canvas.toDataURL("image/png")`. |
| 4.6 | Auto thumbnail | Na opslaan in `handleSave`: capture top-down PNG → upload naar R2 via presigned URL → `updateFloorPlanThumbnail({ id, thumbnailUrl })`. |
| 4.7 | Thumbnail in zoekresultaten | In property card component: als `floorPlans[0]?.thumbnailUrl` bestaat, toon kleine thumbnail badge. |
| 4.8 | SVG export | Render 2D bovenaanzicht als SVG: muren als `<rect>`, zones als `<polygon>`, items als `<rect>` met labels. Print-ready met schaal indicator. |

---

## Sprint 5: AI Enhancement & Polish

**Doel:** AI features verbeteren, auto-save, testing.
**Parallel: 2 workflows**

### WF-5A: AI Features
**Agent type:** `backend-dev`

| # | Task | Detail |
|---|------|--------|
| 5.1 | Structured output | Vervang JSON prompt+parsing door AI SDK `Output.object()` met Zod schema voor `LlmFloorPlan`. Elimineert `parseLlmResponse()` volledig. |
| 5.2 | AI Layout Optimizer | Nieuwe action: analyseert huidige SceneData → suggereert verbeteringen (looppaden, nooduitgangen, maximale capaciteit). Retourneert geoptimaliseerde SceneData + uitleg. |
| 5.3 | Auto-furnish zone | Selecteer lege zone → AI vult met gepaste meubels/apparatuur op basis van zone type en oppervlakte. "Vul keuken 25m²" → stove, counter, fridge, sink geplaatst. |
| 5.4 | Vision + classification | Integreer `scanFloorPlanImage` met bestaande `lib/ai/photo-classification.ts`. Als foto herkend als plattegrond → auto-suggest "Wilt u deze scannen?". |

### WF-5B: Polish & QA
**Agent type:** `qa-reviewer`

| # | Task | Detail |
|---|------|--------|
| 5.5 | Loading/error states | Skeleton loader voor editor canvas. Error boundary rond PropertyEditor. Toast notifications voor alle foutmeldingen. |
| 5.6 | Auto-save | Debounced auto-save: na 3 seconden inactiviteit, auto `handleSave()`. Toon "Opgeslagen" indicator. Disable auto-save tijdens actief tekenen (`isDrawing`). |
| 5.7 | Shortcuts help | `?` toets: toon overlay met alle keyboard shortcuts. Escape sluit. Shortcuts: Delete, Ctrl+Z/Y, G (grid), Enter (finish draw), Escape, R (rotate). |
| 5.8 | Playwright tests | Test scenarios: laden editor → muur tekenen → zone tekenen → item plaatsen → opslaan → pagina herladen → data intact. |
| 5.9 | Build check | `bun run build` + `bun run lint` zonder errors/warnings op alle nieuwe bestanden. |

---

## Dependencies & Install

### Nieuwe packages (Sprint 1)
```bash
bun add fast-deep-equal
# Bestaande packages al geïnstalleerd: three, @react-three/fiber, @react-three/drei, zustand, zundo, mitt
```

### Toekomstige packages (Sprint 3, optioneel)
```bash
# Alleen als CSG operations nodig zijn:
bun add three-bvh-csg three-mesh-bvh
# Alleen als complexe polygon operations nodig zijn:
bun add polygon-clipping
```

---

## Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|----------|
| Three.js bundle size (+500KB) | Hogere load time | Dynamic import met `ssr: false` (al gedaan). Code splitting per route. |
| WebGPU niet beschikbaar | Editor werkt niet in oudere browsers | Canvas `gl` config valt terug naar WebGL (Three.js default). |
| Performance bij 200+ nodes | Lag in scene render | InstancedMesh (Sprint 2), React.memo, geometry sharing. |
| AI generatie inconsistentie | LLM genereert onverwachte JSON | Output.object() met Zod schema (Sprint 5), fallback generator. |
| Scene data corruption | Kapotte floor plans | Zod validatie op read, undo/redo (50 stappen), auto-save. |

---

## Success Criteria per Sprint

| Sprint | Criteria |
|--------|----------|
| 1 | Geen CRITICAL/HIGH bevindingen open. `bun run build` slaagt. |
| 2 | Geen hardcoded kleuren. Dark mode werkt. Scene met 100 nodes: <16ms frame time. |
| 3 | Muren tekenen + zones + items plaatsen + templates laden + drag-to-move werkt. |
| 4 | Floor plan viewer op publieke listing pagina. PNG export + thumbnail generatie. |
| 5 | AI genereert via structured output. Auto-save werkt. Playwright tests groen. |
