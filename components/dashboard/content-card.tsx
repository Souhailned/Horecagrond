"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface ContentCardHeaderProps {
  title: string
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
  children?: React.ReactNode
}

export function ContentCardHeader({ title, actions, breadcrumb, children }: ContentCardHeaderProps) {
  return (
    <header className="flex flex-col border-b border-border/40">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb && (
              <div className="text-xs text-muted-foreground">
                {breadcrumb}
              </div>
            )}
            <p className="text-base font-medium text-foreground">{title}</p>
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children && (
        <div className="flex items-center justify-between px-4 pb-3 pt-3">
          {children}
        </div>
      )}
    </header>
  )
}

interface ContentCardProps {
  children: React.ReactNode
  className?: string
}

export function ContentCard({ children, className }: ContentCardProps) {
  return (
    <div className={cn(
      "flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-hidden",
      className
    )}>
      {children}
    </div>
  )
}

interface ContentCardBodyProps {
  children: React.ReactNode
  className?: string
}

export function ContentCardBody({ children, className }: ContentCardBodyProps) {
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      {children}
    </div>
  )
}
