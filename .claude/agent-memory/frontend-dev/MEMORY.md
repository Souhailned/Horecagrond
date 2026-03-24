# Frontend Dev Memory

## Panden Dashboard Architecture
- Orchestrator: `/app/dashboard/panden/panden-client.tsx` - manages state, filtering, sorting, bulk actions
- Views: `panden-table-view.tsx`, `panden-list-view.tsx`, `panden-grid-view.tsx` in `components/` subdirectory
- Shared: `status-styles.ts` (getStatusStyles), `property-quick-actions.tsx` (full dropdown with status change, duplicate, archive)
- The orchestrator spreads `viewProps` including `onStatusChange`, `onDuplicate`, `onArchive` -- views must accept these and forward to PropertyQuickActions
- Type: `DashboardProperty` exported from `@/app/actions/get-property`

## Icons
- Project uses Phosphor Icons from `@phosphor-icons/react/dist/ssr` (NOT lucide-react)
- Exception: shadcn internal components (Checkbox uses Check from phosphor already)
- Available icons confirmed: Buildings, Eye, ChatCircle, DotsThreeVertical, CaretUp, CaretDown, CaretUpDown, PencilSimple, ArrowSquareOut, CopySimple, Archive

## Styling Conventions
- Status badges: `rounded-full border px-2 py-0.5 text-xs font-medium` + color from getStatusStyles()
- Checkboxes: `rounded-full` class override for circular appearance
- Hover-reveal actions: `opacity-0 group-hover:opacity-100 transition-opacity`
- Row click navigation: `e.stopPropagation()` on checkboxes and action buttons

## Type Safety
- `PropertyStatus` imported from `@/generated/prisma/client` (for type annotations)
- Label maps: `PropertyStatusLabels`, `PropertyTypeLabels` from `@/types/property`
- `formatPrice()` from `@/types/property` handles cents-to-EUR formatting with Dutch locale
