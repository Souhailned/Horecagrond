"use client";

import { useSession } from "@/lib/auth-client";
import {
  hasPermission,
  canEditColumn,
  type UserRole,
  type Permission,
} from "@/lib/rbac";

/**
 * Client-side permission hook.
 * Wraps useSession() and exposes permission helpers from lib/rbac.ts.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const role = ((session?.user as Record<string, unknown> | undefined)?.role ?? "seeker") as UserRole;
  const userId = session?.user?.id ?? null;

  return {
    role,
    userId,
    /** Check if user has a specific permission (type-safe) */
    can: (permission: Permission) => hasPermission(role, permission),
    /** Check if user can edit a specific table column */
    canEdit: (resource: string, columnId: string) =>
      canEditColumn(role, resource, columnId),
    isAdmin: role === "admin",
    isAgent: role === "agent",
    isSeeker: role === "seeker",
  };
}
