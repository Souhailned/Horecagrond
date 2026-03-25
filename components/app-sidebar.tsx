"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useMemo } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  House,
  Buildings,
  ChatCircle,
  ChartBar,
  Image,
  VideoCamera,
  MagnifyingGlass,
  Heart,
  Bell,
  Scales,
  Crosshair,
  Gear,
  Question,
  ShieldCheck,
  Users,
  UserCircle,
  FileText,
  GearSix,
  SignOut,
  CaretRight,
  CaretUpDown,
  Building,
  ChartLine,
  Kanban,
  CheckSquare,
  Sparkle,
  Blueprint,
} from "@phosphor-icons/react/dist/ssr"
import { signOut } from "@/lib/auth-client"
import { toast } from "sonner"
import { getNavItemsForRole, getFooterItemsForRole, type NavItemId, type SidebarFooterItemId } from "@/lib/data/sidebar"
import type { SidebarUser, UserRole } from "@/types/user"

// Icon mapping for nav items
const navItemIcons: Record<NavItemId, React.ComponentType<{ className?: string }>> = {
  dashboard: House,
  panden: Buildings,
  leads: ChatCircle,
  projects: Kanban,
  tasks: CheckSquare,
  analytics: ChartBar,
  images: Image,
  videos: VideoCamera,
  zoeken: MagnifyingGlass,
  favorieten: Heart,
  alerts: Bell,
  vergelijk: Scales,
  intelligence: Crosshair,
  plattegronden: Blueprint,
}

// Icon mapping for footer items
const footerItemIcons: Record<SidebarFooterItemId, React.ComponentType<{ className?: string }>> = {
  settings: Gear,
  help: Question,
}

// Admin navigation items
const adminNavItems = [
  { id: "users", label: "Gebruikers", href: "/dashboard/admin/users", icon: Users },
  { id: "workspaces", label: "Workspaces", href: "/dashboard/admin/workspaces", icon: Buildings },
  { id: "properties", label: "Panden Beheer", href: "/dashboard/admin/properties", icon: Building },
  { id: "agencies", label: "Kantoren", href: "/dashboard/admin/agencies", icon: Buildings },
  { id: "analytics", label: "Platform Analytics", href: "/dashboard/admin/analytics", icon: ChartLine },
  { id: "ai-costs", label: "AI Kosten", href: "/dashboard/admin/ai-costs", icon: Sparkle },
  { id: "impersonate", label: "Impersoneren", href: "/dashboard/admin/impersonate", icon: UserCircle },
  { id: "audit-logs", label: "Audit Logs", href: "/dashboard/admin/audit-logs", icon: FileText },
  { id: "settings", label: "Systeem Instellingen", href: "/dashboard/admin/settings", icon: GearSix },
] as const

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: SidebarUser
}) {
  const pathname = usePathname()
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith("/dashboard/admin"))
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { isMobile } = useSidebar()

  const userRole: UserRole = user?.role ?? "seeker"
  const isAdmin = userRole === "admin"

  // Filter nav/footer items by role
  const filteredNavItems = useMemo(() => getNavItemsForRole(userRole), [userRole])
  const filteredFooterItems = useMemo(() => getFooterItemsForRole(userRole), [userRole])

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "G"

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            toast.success("Uitgelogd")
            window.location.href = "/"
          },
          onError: () => {
            toast.error("Uitloggen mislukt. Probeer het opnieuw.")
            setIsSigningOut(false)
          },
        },
      })
    } catch {
      toast.error("Er ging iets mis")
      setIsSigningOut(false)
    }
  }

  const isItemActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <Sidebar className="border-border/40 border-r-0 shadow-none border-none" {...props}>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">H</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Horecagrond</span>
            <span className="text-xs text-muted-foreground capitalize">{userRole}</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-0 gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const Icon = navItemIcons[item.id]
                const active = isItemActive(item.href)

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-9 rounded-lg px-3 font-normal text-muted-foreground"
                    >
                      <Link href={item.href}>
                        {Icon && <Icon className="h-[18px] w-[18px]" />}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2">
        {/* Admin section */}
        {isAdmin && (
          <Collapsible open={adminOpen} onOpenChange={setAdminOpen} className="mb-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="h-9 rounded-lg px-3 font-normal text-muted-foreground">
                    <ShieldCheck className="h-[18px] w-[18px]" />
                    <span className="flex-1 text-left">Admin</span>
                    <CaretRight className={`h-4 w-4 transition-transform ${adminOpen ? "rotate-90" : ""}`} />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
              </SidebarMenuItem>
            </SidebarMenu>
            <CollapsibleContent>
              <SidebarMenu className="pl-4 pt-1">
                {adminNavItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isItemActive(item.href)}
                        className="h-8 rounded-lg px-3 font-normal text-muted-foreground"
                      >
                        <Link href={item.href}>
                          <Icon className="h-[16px] w-[16px]" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Footer items */}
        <SidebarMenu>
          {filteredFooterItems.map((item) => {
            const Icon = footerItemIcons[item.id]
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild className="h-9 rounded-lg px-3 text-muted-foreground">
                  <Link href={item.href}>
                    {Icon && <Icon className="h-[18px] w-[18px]" />}
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mt-2 flex w-full items-center gap-3 rounded-lg p-2 hover:bg-accent cursor-pointer text-left transition-colors data-[state=open]:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? ""} />
                <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-sm font-medium truncate">{user?.name ?? "Gebruiker"}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</span>
              </div>
              <CaretUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2 py-2 text-left">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image ?? ""} />
                  <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{user?.name ?? "Gebruiker"}</span>
                  <span className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profiel" className="cursor-pointer">
                <UserCircle className="mr-2 h-4 w-4" />
                Profiel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/instellingen" className="cursor-pointer">
                <Gear className="mr-2 h-4 w-4" />
                Instellingen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <SignOut className={`mr-2 h-4 w-4 ${isSigningOut ? "animate-pulse" : ""}`} />
              {isSigningOut ? "Uitloggen..." : "Uitloggen"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
