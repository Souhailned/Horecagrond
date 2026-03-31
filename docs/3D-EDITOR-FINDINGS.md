# 3D Editor — Research Findings

## Pascal Editor (pascalorg/editor) — Key Takeaways

### Architecture
- Turborepo monorepo: `packages/core`, `packages/viewer`, `packages/editor`, `packages/ui`
- Three-store pattern (Zustand): Scene Store (nodes + undo), Viewer Store (camera + selection), Editor Store (tools + prefs)
- Flat node dictionary: `Record<string, AnyNode>` — geen nested tree, snel voor updates
- Dirty nodes tracking: alleen gewijzigde nodes re-renderen
- Event emitter (mitt): losse koppeling tussen systems

### Key Features We Need
1. **Slab rendering** — vloer/plafond surfaces (ExtrudeGeometry van polygon)
2. **Display modes** — stacked (normaal), exploded (uiteen), solo (alleen actieve verdieping)
3. **Transform controls** — drag-to-move nodes, rotation handles
4. **Wall snapping** — auto-connect endpoints
5. **Hierarchy** — Site → Building → Level → Zone → Items
6. **CSG operations** — Boolean operations op muren (later, met three-bvh-csg)

### What We Already Have (Good)
- Node types: Wall, Slab (partial), Zone, Item ✅
- Scene store met zundo undo/redo ✅
- Editor store met tools, selection, drawing state ✅
- Renderers voor wall, zone, item, grid ✅
- Keyboard shortcuts ✅
- AI generatie + vision scanning ✅

## React Three Fiber Performance Patterns

### Must-Do
1. **InstancedMesh** voor herhalende objecten (tafels, stoelen) — 1 draw call ipv 100+
2. **Geometry sharing** via `useMemo` — niet voor elk object nieuw aanmaken
3. **Geometry disposal** via `useEffect` cleanup — voorkom GPU memory leaks
4. **React.memo** op renderers — voorkom onnodige re-renders
5. **Keep meshes under 1000** — target: paar honderd max

### Nice-to-Have
- Level of Detail (LOD) voor grote scenes
- Frustum culling (automatisch door Three.js)
- Texture atlasing voor materialen

## Zundo (Undo/Redo) Best Practices

1. `partialize` — exclude non-serializable state (dirtyNodes Set) ✅ (al gedaan)
2. `equality` — gebruik `fast-deep-equal` ipv `JSON.stringify` ⚠️ (moet gefixed)
3. `limit: 50` — cap history length ✅ (al gedaan)
4. `diff` optie — sla alleen delta's op ipv volledige state snapshots (future optimization)

## Horecagrond Bestaande Patronen

### AI Model Chain
```
getModel() → { model: LanguageModel, supportsTools: boolean }
  Priority: Groq (llama-3.3-70b) → OpenAI (gpt-4o-mini) → Ollama (llama3.2:3b)

getVisionModel() → NIEUW TOE TE VOEGEN
  Priority: Groq (llama-4-scout) → OpenAI (gpt-4o-mini)
```

### Rate Limiting Tiers
```
"ai"           → 10 req/min (sliding window)
"export"       → 5 req/min
"dream-guest"  → 1 req/24h
"ai-seeker"    → 3 req/24h
```

### Permission Structure
```
admin  → 25+ permissions (alles)
agent  → 16+ permissions (property management + AI)
seeker → 6 permissions (view + limited AI)

Toe te voegen:
  floorplans:manage → admin, agent
  floorplans:view   → admin, agent, seeker
```

### AI Persistence Pattern
```typescript
// Na elke AI generatie:
prisma.aiUsageLog.create({
  data: {
    userId,
    service: "groq",           // of "openai"
    model: "llama-3.3-70b",
    feature: "floor-plan-generate",
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    costCents: estimatedCost,
    status: "success",
  }
}).catch(() => {});
```

### Quota System
```typescript
// Check voor generatie:
const { allowed, remaining, message } = await canUserGenerate(userId);
// Na generatie:
await incrementAiEditCount(userId);
```
