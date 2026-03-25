/**
 * Role-Based Access Control for Horecagrond
 * 
 * Roles:
 * - admin: Platform eigenaar, alle rechten
 * - agent: Makelaar, eigen panden + leads beheren
 * - seeker: Ondernemer, zoeken + favorieten
 */

export type UserRole = "admin" | "agent" | "seeker";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    // Platform management
    "platform:manage",
    "users:manage",
    "users:list",
    "users:delete",
    "users:change-role",
    // Properties
    "properties:manage-all",
    "properties:approve",
    "properties:feature",
    "properties:create",
    "properties:edit-own",
    "properties:delete-own",
    // Leads
    "leads:view-all",
    "leads:view-own",
    // Analytics
    "analytics:platform",
    "analytics:own",
    // AI
    "ai:unlimited",
    "ai:visualize",
    "ai:description",
    "ai:listing-package",
    "ai:inpaint",
    // Export
    "export:all",
    "export:own",
    // Floor plans
    "floorplans:manage",
    "floorplans:view",
    // Projects
    "projects:create",
    "projects:manage",
    // Intelligence (full access)
    "intelligence:view",
    "intelligence:manage",
    "intelligence:scan",
    "intelligence:share",
  ],
  agent: [
    // Properties
    "properties:create",
    "properties:edit-own",
    "properties:delete-own",
    "properties:duplicate",
    "properties:bulk-status",
    // Leads
    "leads:view-own",
    "leads:update-status",
    // Analytics
    "analytics:own",
    // AI
    "ai:description",
    "ai:visualize",
    "ai:listing-package",
    "ai:inpaint",
    // Export
    "export:own",
    // Agency
    "agency:manage",
    "agency:invite-members",
    // Floor plans
    "floorplans:manage",
    "floorplans:view",
    // Projects
    "projects:create",
    // Intelligence (full access — makelaar scant voor klanten)
    "intelligence:view",
    "intelligence:manage",
    "intelligence:scan",
    "intelligence:share",
  ],
  seeker: [
    // Search
    "properties:view",
    "properties:compare",
    // Favorites
    "favorites:manage",
    "search-alerts:manage",
    // Floor plans (view only)
    "floorplans:view",
    // AI (limited)
    "ai:visualize",
    // Contact
    "inquiries:create",
    // Intelligence (self-service — ondernemer zoekt zelf)
    "intelligence:view",
    "intelligence:manage",
    "intelligence:scan",
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getUserPermissions(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Column-level edit permissions for EditableDataTable.
 * Key = "resource:columnId", value = required permission.
 */
export const TABLE_COLUMN_PERMISSIONS: Record<string, string> = {
  // Admin Users table
  "admin-users:role": "users:change-role",
  "admin-users:status": "users:manage",
  "admin-users:phone": "users:manage",
  // Admin Workspaces table
  "admin-workspaces:name": "platform:manage",
  "admin-workspaces:slug": "platform:manage",
  "admin-workspaces:type": "platform:manage",
  // Admin Agencies table
  "admin-agencies:plan": "platform:manage",
  "admin-agencies:verified": "platform:manage",
};

/**
 * Check if a role can edit a specific column in a resource table.
 */
export function canEditColumn(
  role: UserRole,
  resource: string,
  columnId: string
): boolean {
  const key = `${resource}:${columnId}`;
  const requiredPermission = TABLE_COLUMN_PERMISSIONS[key];
  if (!requiredPermission) return false;
  return hasPermission(role, requiredPermission);
}
