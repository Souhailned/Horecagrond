# Editor Gap Analysis — Horecagrond Floor Plan Editor

**Datum:** 2026-03-25
**Codebase:** 4,741 lines across 37 files

---

## 1. CRITICAL GAPS (Blocking Production Use)

| # | Issue | Locatie | Impact | Effort |
|---|-------|---------|--------|--------|
| 1.1 | Geen Slab/Floor Renderer | `scene-renderer.tsx:118` returns null | Geen vloer visualisatie | 2-3u |
| 1.2 | Drag-to-move voor muren gebroken | `use-tool-events.ts:346` | Core interactie kapot | 1u |
| 1.3 | Zone vertices niet bewerkbaar na creatie | `zone-renderer.tsx` read-only | Fouten niet corrigeerbaar | 2-3u |
| 1.4 | Geen delete cascade voor parent nodes | `scene-store.ts:132` | Data inconsistentie | 1.5u |
| 1.5 | Clipboard memory leak | `editor-store.ts:75` nooit gecleaned | Memory leak bij lange sessies | 0.5u |

## 2. IMPORTANT GAPS (Needed for Good UX)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 2.1 | Geen visuele feedback voor snapping | Users weten niet waarom muren niet alignen | 1-2u |
| 2.2 | Geen multi-select context menu | Acties vereisen keyboard kennis | 1.5u |
| 2.3 | Muur materialen niet realistisch | Misleidende visuele representatie | 2u |
| 2.4 | Geen batch item placement feedback | Workflow inefficientie | 1u |
| 2.5 | Geen collision detection | Fysiek onmogelijke plattegronden | 2-3u |
| 2.6 | Grid size niet persistent | User preference verloren bij reload | 0.5u |
| 2.7 | Measurement export ontbreekt | Business requirement voor rapporten | 2-3u |

## 3. NICE-TO-HAVE GAPS (Polish)

- Layer/visibility toggle systeem
- Dimensie labels op getekende objecten
- Alignment/distribution tools
- Rotatie in graden (niet radialen)
- Custom zone kleuren via color picker
- Snap distance aanpasbaar
- Keyboard shortcut hints in toolbar tooltips

## 4. CODE QUALITY

- **0 tests** — Geen test coverage voor geometrie, transforms, snapping
- **5x `as unknown` type casts** — TypeScript veiligheid compromised
- **Geen error boundary** rond Canvas — crash = hele editor weg
- **Hardcoded NL/EN mix** — i18n niet mogelijk
- **Geen input validatie** — negatieve dimensies mogelijk

## 5. ARCHITECTURALE STERKE PUNTEN

- Clean mitt event emitter voor decoupled tool events
- Zustand stores met duidelijke scheiding (editor vs scene)
- Zundo undo/redo middleware werkt smooth
- Multi-layered snapping (join > grid > angle)
- Component memoization voor renderers
- Goede type safety met discriminated unions
- Dynamic CSS variable resolution voor dark mode

## 6. PRIORITIZED FIX ROADMAP

### Phase 1: Critical Stability (~7u)
1. Fix drag-to-move voor walls
2. Add error boundary
3. Fix zone vertex editing
4. Add undo/redo state indicators
5. Write tests voor geometry

### Phase 2: Important UX (~9.5u)
6. Implement slab/floor renderer
7. Add snap feedback visualization
8. Add collision detection
9. Batch item placement feedback
10. Measurement export feature

### Phase 3: Polish (~10u)
11. Layer visibility system
12. Context menu voor multi-select
13. Settings panel
14. i18n extraction

**Totaal geschatte effort naar production-ready: ~30-35 uur**
