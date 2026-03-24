"use client";

import Link from "next/link";
import {
  DotsThreeVertical,
  PencilSimple,
  ArrowSquareOut,
  ArrowsClockwise,
  CopySimple,
  Archive,
  TextAa,
  ShareNetwork,
  Lightbulb,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardProperty } from "@/app/actions/get-property";
import type { AiActionType } from "./ai-action-dialog";

export type { AiActionType };

interface PropertyQuickActionsProps {
  property: DashboardProperty;
  onStatusChange?: (propertyId: string, status: string) => void;
  onDuplicate?: (propertyId: string) => void;
  onArchive?: (propertyId: string) => void;
  onAiAction?: (propertyId: string, action: AiActionType) => void;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Concept" },
  { value: "ACTIVE", label: "Actief" },
  { value: "UNDER_OFFER", label: "Onder bod" },
  { value: "RENTED", label: "Verhuurd" },
  { value: "SOLD", label: "Verkocht" },
] as const;

const STATUS_DOT_COLORS: Record<string, string> = {
  DRAFT: "bg-muted-foreground/50",
  ACTIVE: "bg-emerald-500",
  UNDER_OFFER: "bg-amber-500",
  RENTED: "bg-sky-500",
  SOLD: "bg-sky-500",
};

export function PropertyQuickActions({
  property,
  onStatusChange,
  onDuplicate,
  onArchive,
  onAiAction,
}: PropertyQuickActionsProps) {
  const { can } = usePermissions();

  const canEdit = can("properties:edit-own");
  const canDuplicate = can("properties:duplicate");
  const canDelete = can("properties:delete-own");
  const canAi = can("ai:description");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <DotsThreeVertical className="h-4 w-4" />
          <span className="sr-only">Acties voor {property.title}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Acties</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Edit */}
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/panden/${property.id}/bewerken`}>
              <PencilSimple className="h-4 w-4" />
              Bewerken
            </Link>
          </DropdownMenuItem>
        )}

        {/* View on site */}
        <DropdownMenuItem asChild>
          <Link
            href={`/aanbod/${property.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowSquareOut className="h-4 w-4" />
            Bekijken op site
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Status change submenu */}
        {canEdit && onStatusChange && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowsClockwise className="h-4 w-4" />
              Status wijzigen
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUS_OPTIONS.map(({ value, label }) => {
                const isCurrent = property.status === value;
                const dotColor = STATUS_DOT_COLORS[value];

                return (
                  <DropdownMenuItem
                    key={value}
                    disabled={isCurrent}
                    onClick={() => onStatusChange(property.id, value)}
                    className={cn(isCurrent && "font-medium")}
                  >
                    <span
                      className={cn(
                        "inline-block size-2 rounded-full",
                        dotColor
                      )}
                    />
                    {label}
                    {isCurrent && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        huidig
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Duplicate */}
        {canDuplicate && onDuplicate && (
          <DropdownMenuItem onClick={() => onDuplicate(property.id)}>
            <CopySimple className="h-4 w-4" />
            Dupliceren
          </DropdownMenuItem>
        )}

        {/* AI Actions */}
        {canAi && onAiAction && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>AI Acties</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAiAction(property.id, "description")}>
              <TextAa className="h-4 w-4" />
              Genereer beschrijving
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAiAction(property.id, "social")}>
              <ShareNetwork className="h-4 w-4" />
              Genereer social posts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAiAction(property.id, "advice")}>
              <Lightbulb className="h-4 w-4" />
              AI advies
            </DropdownMenuItem>
          </>
        )}

        {/* Archive */}
        {canDelete && onArchive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onArchive(property.id)}
            >
              <Archive className="h-4 w-4" />
              Archiveren
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
