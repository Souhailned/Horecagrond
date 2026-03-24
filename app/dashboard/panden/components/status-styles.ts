import type { PropertyStatus } from "@/generated/prisma/client";

/**
 * Returns Tailwind class string for a property status badge.
 * Shared across table, list, and grid views.
 */
export function getStatusStyles(status: PropertyStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "UNDER_OFFER":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
    case "RENTED":
    case "SOLD":
      return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400";
    case "PENDING_REVIEW":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
    case "REJECTED":
      return "bg-destructive/10 text-destructive";
    case "DRAFT":
    case "ARCHIVED":
    default:
      return "bg-muted text-muted-foreground";
  }
}
