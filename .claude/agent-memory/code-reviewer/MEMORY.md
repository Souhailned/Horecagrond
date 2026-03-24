# Code Reviewer Memory

## Project-Specific Patterns

### Map Integration (Property Map)
- Map components are dynamically imported with `ssr: false` to avoid SSR issues
- Map markers use non-null assertions (`!`) for lat/lng after filtering - acceptable pattern
- All map-related components are client components (`"use client"`)
- Loading states should show spinner with proper accessibility labels

### Type Safety Patterns
- `Property` interface is the superset in `types/property.ts`
- Price fields are stored in cents (number | null)
- Coordinates: `latitude` and `longitude` as `number | null`
- Always filter for non-null coordinates before rendering markers
- Use `formatPrice()` helper from `types/property.ts` for price display

### Accessibility Requirements
- Interactive controls need ARIA labels in Dutch
- Map regions need `role="region"` with `aria-label`
- Toggle buttons should use `role="radio"` with `aria-checked`
- Hide text on mobile with `sm:inline` pattern

### React Best Practices (Next.js 16 + React 19)
- Use `useMemo` for expensive filters/transforms
- Wrap filter handlers with `useCallback` when deps are stable
- Dynamic imports for heavy components (maps, charts)
- Use CSS variables for theme colors (never hardcode)

## Buurt Analysis Architecture (lib/buurt/)
- `analyze.ts` is the orchestrator: Promise.allSettled for 5 providers, graceful degradation
- OSM is always the base; Google/CBS/BAG/Transport are enhancement layers
- `bruisIndex` is calculated ONLY from OSM data (buurt-intelligence.ts `analyzeBuurt()`); it is NOT recalculated after merging Google competitors — this is a known design limitation
- `stats.horecaCount` = OSM `concurrenten.length + complementair.length` (NOT the merged competitor list length) — these counts diverge when Google is available
- `dataQuality` thresholds: "volledig" >= 4 sources (max 5), "gedeeltelijk" >= 2, "basis" otherwise. OSM is always counted — minimum is always "basis"
- `fetchedAt` is set at the END of the full analysis, not per-provider. If result comes from cache, `fetchedAt` reflects when the cache was originally populated (correct)
- The quality scorer `isDataFresh()` checks `fetchedAt < 24h` — consistent with "full-analysis" cache TTL of 24h
- Dedup in `mergeCompetitors()`: uses `afstand` difference < 50m AND first-word name substring match — both conditions must be true (AND, not OR). This is fragile: name mismatches bypass geo check
- No global timeout on the full `analyzeLocation()` call — only individual providers have AbortSignal timeouts
- CBS sentiment values (-99995 etc.) are handled with `toNum()` guard in cbs.ts

## Common Issues Found

### Missing Accessibility
- Buttons need `aria-label` when text is hidden on mobile
- Interactive regions need ARIA roles
- Focus management for keyboard navigation

### Type Safety Gaps
- Non-null assertions are OK after explicit null checks/filters
- Avoid casting with `as` - use type guards instead

### Performance Concerns
- N+1 queries in property listings (watch for missing includes)
- Unnecessary re-renders when filter state changes
- Missing React.memo for expensive child components

### Debounce Pattern — Memory Leak in useCallback
- `handleSearchChange` in panden-client.tsx returns `clearTimeout` inside useCallback — the onChange caller discards the cleanup function. setTimeout leaks.
- Fix: hold timeoutId in a `useRef` and call `clearTimeout(timerRef.current)` before each `setTimeout`. Do NOT return cleanup from a useCallback.

### viewProps Inline Object — Re-render trap
- `viewProps` plain object literal defined in render body (not `useMemo`) creates a new reference every render, defeating React.memo on Table/List/Grid children.
- Fix: wrap with `useMemo` when passing as props to multiple heavy children.

### PandenTableView columns useMemo — selectedIds in deps
- `selectedIds` (a Set) in the columns `useMemo` dep array causes full TanStack column rebuild on every checkbox click, forcing full table reconciliation.
- Fix: remove `selectedIds` from columns deps; pass selection state via a stable ref or stable selector callback.

### Polling ref pattern — confirmed correct
- `bulkPollingRef.current` with `setInterval` + cleanup in `useEffect` return is the correct React pattern. Existing implementation is sound.

### PortfolioSummaryWidget localStorage — confirmed correct
- Reading localStorage only in `useEffect` avoids SSR mismatch. Default `true` (collapsed) prevents layout flash. Pattern is sound.

## Server Action Security Patterns (AI Actions)

### Confirmed Good Patterns
- `requirePermission()` is called at the very top of each action before any DB access
- Error forwarding is always `return { success: false, error: authCheck.error }` — never `return authCheck` (correct)
- All errors are caught in a top-level try/catch; error messages to client are generic Dutch strings (no stack traces)
- Scope escalation guard: `scope === "all" && role === "admin"` — non-admin requests are always scoped to `createdById: userId`
- AI generation errors fall back to template output rather than hard-failing (good UX)
- `calculatePropertyHealthScores` uses a batched `$transaction` for bulk updates (no N+1 writes)

### Confirmed Issues (to watch for in future)
- `fetchPropertyForAi(id)` in `ai-quick-actions.ts` has NO ownership check — any authenticated user with `ai:description` permission can read any property's data and trigger writes. The `where: { id }` clause alone is insufficient for agent-role users.
- `bulkAiGenerateTask` (Trigger.dev worker) re-fetches properties using `prisma.property.findUnique({ where: { id } })` with NO `createdById` filter — the userId in the payload is trusted for logging only, not for authorization. Any propertyId string in the payload will be processed.
- `getBulkAiProgress(runId)` has no check that the runId belongs to the requesting user — any authenticated user with `ai:listing-package` can poll any run.
- `getPortfolioSummary` "hot leads" query uses `.catch()` fallback silently — if `priority` field throws a DB error it falls back, but this masks real schema problems.
- No Zod validation on raw string inputs (`propertyId`, `runId`, `scope`) in action function signatures — CUID format should be validated.
- No rate limiting on AI generation actions — each call can trigger an LLM API request.
