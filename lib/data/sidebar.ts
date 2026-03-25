import type { UserRole } from "@/types/user";

export type NavItemId =
  | "dashboard"
  | "panden"
  | "plattegronden"
  | "leads"
  | "projects"
  | "tasks"
  | "analytics"
  | "images"
  | "videos"
  | "favorieten"
  | "alerts"
  | "zoeken"
  | "vergelijk"
  | "intelligence";

export type SidebarFooterItemId = "settings" | "help";

export type NavItem = {
  id: NavItemId;
  label: string;
  href: string;
  badge?: number;
  /** Which roles can see this item. undefined = all roles */
  roles?: UserRole[];
};

export type SidebarFooterItem = {
  id: SidebarFooterItemId;
  label: string;
  href: string;
  roles?: UserRole[];
};

/**
 * Main navigation items — filtered by role in the sidebar component
 */
export const navItems: NavItem[] = [
  // Shared
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },

  // Agent items
  { id: "panden", label: "Mijn Panden", href: "/dashboard/panden", roles: ["agent", "admin"] },
  { id: "plattegronden", label: "Plattegronden", href: "/dashboard/plattegronden", roles: ["agent", "admin"] },
  { id: "leads", label: "Leads", href: "/dashboard/leads", roles: ["agent", "admin"] },
  { id: "projects", label: "Projects", href: "/dashboard/projects", roles: ["agent", "admin"] },
  { id: "tasks", label: "My Tasks", href: "/dashboard/tasks", roles: ["agent", "admin"] },
  { id: "analytics", label: "Analytics", href: "/dashboard/analytics", roles: ["agent", "admin"] },
  { id: "images", label: "Images", href: "/dashboard/images", roles: ["agent", "admin"] },
  { id: "videos", label: "Video's", href: "/dashboard/videos", roles: ["agent", "admin"] },

  // Intelligence (all roles — makelaar scant voor klanten, seeker self-service)
  { id: "intelligence", label: "Intelligence", href: "/dashboard/intelligence", roles: ["agent", "seeker", "admin"] },

  // Seeker items
  { id: "zoeken", label: "Zoeken", href: "/aanbod", roles: ["seeker"] },
  { id: "favorieten", label: "Favorieten", href: "/dashboard/favorieten", roles: ["seeker"] },
  { id: "alerts", label: "Zoekopdrachten", href: "/dashboard/alerts", roles: ["seeker"] },
  { id: "vergelijk", label: "Vergelijken", href: "/vergelijk", roles: ["seeker"] },
];

export const footerItems: SidebarFooterItem[] = [
  { id: "settings", label: "Instellingen", href: "/dashboard/instellingen" },
  { id: "help", label: "Help & FAQ", href: "/faq" },
  // Removed standalone "Admin" link — admin dropdown handles this
];

/**
 * Filter nav items by user role
 */
export function getNavItemsForRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => !item.roles || item.roles.includes(role));
}

/**
 * Filter footer items by user role
 */
export function getFooterItemsForRole(role: UserRole): SidebarFooterItem[] {
  return footerItems.filter((item) => !item.roles || item.roles.includes(role));
}
