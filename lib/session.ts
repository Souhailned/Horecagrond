"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, type UserRole, type Permission } from "@/lib/rbac";
import type { ActionResult } from "@/types/actions";

// ─── Session Helper ──────────────────────────────────────────────────────────

/**
 * Get the current session with the user's role.
 * Uses the session's additionalFields (no extra DB query needed).
 */
export async function getSessionWithRole() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  const rawRole = (session.user as Record<string, unknown>).role;
  const validRoles: UserRole[] = ["admin", "agent", "seeker"];
  const role: UserRole = validRoles.includes(rawRole as UserRole)
    ? (rawRole as UserRole)
    : "seeker";

  return { userId: session.user.id, role, session };
}

// ─── Permission Guards ───────────────────────────────────────────────────────

/**
 * Server action guard: require a specific permission.
 * Returns ActionResult with userId + role on success.
 *
 * Permission param is type-safe — typos are compile-time errors.
 */
export async function requirePermission(
  permission: Permission
): Promise<ActionResult<{ userId: string; role: UserRole }>> {
  const ctx = await getSessionWithRole();
  if (!ctx) return { success: false, error: "Niet ingelogd" };
  if (!hasPermission(ctx.role, permission)) {
    return { success: false, error: "Geen toegang" };
  }
  return { success: true, data: { userId: ctx.userId, role: ctx.role } };
}

/**
 * Page-level guard: require a specific permission or redirect.
 * For use in Server Components (page.tsx).
 */
export async function requirePagePermission(
  permission: Permission,
  redirectTo = "/dashboard"
): Promise<{ userId: string; role: UserRole }> {
  const ctx = await getSessionWithRole();
  if (!ctx) redirect("/sign-in");
  if (!hasPermission(ctx.role, permission)) redirect(redirectTo);
  return { userId: ctx.userId, role: ctx.role };
}

// ─── Property Ownership ─────────────────────────────────────────────────────

/**
 * Verify that a user has access to a specific property.
 *
 * - Admin: can access ALL properties (properties:manage-all)
 * - Agent: can access properties belonging to their agency
 * - Seeker: no property access
 *
 * Returns the property ID on success, or an error ActionResult.
 */
export async function authorizePropertyAccess(
  userId: string,
  role: UserRole,
  propertyId: string
): Promise<ActionResult<{ propertyId: string }>> {
  if (!propertyId) {
    return { success: false, error: "Ongeldig pand ID" };
  }

  // Admin: can access any property
  if (hasPermission(role, "properties:manage-all")) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) return { success: false, error: "Pand niet gevonden" };
    return { success: true, data: { propertyId: property.id } };
  }

  // Agent: can access properties in their agency
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      agency: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (!property) {
    return { success: false, error: "Pand niet gevonden of geen toegang" };
  }

  return { success: true, data: { propertyId: property.id } };
}
