"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LeadThermometer } from "@/components/leads/lead-thermometer";
import {
  Envelope,
  Phone,
  Buildings,
  Clock,
  CaretDown,
  CaretUp,
  Funnel,
  Sparkle,
  ChatCircleDots,
  Fire,
  Thermometer,
  Snowflake,
  User,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DotsThreeVertical, Eye, ChatCircle, CalendarBlank, Trash } from "@phosphor-icons/react/dist/ssr";
import type { ScoredLead } from "@/app/actions/lead-scoring";
import { cn } from "@/lib/utils";
import type { LeadTemperature } from "@/lib/lead-scoring";

const statusConfig: Record<
  string,
  { label: string; dot: string; bg: string }
> = {
  NEW: {
    label: "Nieuw",
    dot: "bg-blue-500",
    bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  VIEWED: {
    label: "Bekeken",
    dot: "bg-muted-foreground",
    bg: "bg-muted text-muted-foreground",
  },
  CONTACTED: {
    label: "Contact",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  VIEWING_SCHEDULED: {
    label: "Bezichtiging",
    dot: "bg-purple-500",
    bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  NEGOTIATING: {
    label: "Onderhandeling",
    dot: "bg-orange-500",
    bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  CLOSED_WON: {
    label: "Gesloten",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  CLOSED_LOST: {
    label: "Verloren",
    dot: "bg-red-500",
    bg: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  SPAM: {
    label: "Spam",
    dot: "bg-red-500",
    bg: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

const tempConfig: Record<
  LeadTemperature,
  { icon: typeof Fire; label: string; color: string }
> = {
  hot: { icon: Fire, label: "Heet", color: "text-red-500" },
  warm: { icon: Thermometer, label: "Warm", color: "text-amber-500" },
  cold: { icon: Snowflake, label: "Koud", color: "text-blue-400" },
};

interface LeadsClientProps {
  leads: ScoredLead[];
  counts: {
    total: number;
    hot: number;
    warm: number;
    cold: number;
    new: number;
  };
}

export function LeadsClient({ leads, counts }: LeadsClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTemp, setFilterTemp] = useState<LeadTemperature | "all">("all");
  const [filterSource, setFilterSource] = useState<"all" | "DREAM_SLIDER">(
    "all"
  );

  const filtered = leads.filter((l) => {
    if (filterTemp !== "all" && l.score.temperature !== filterTemp) return false;
    if (filterSource !== "all" && l.source !== filterSource) return false;
    return true;
  });

  const tempFilters = [
    { key: "all" as const, label: "Alle", count: counts.total, icon: null },
    { key: "hot" as const, label: "Heet", count: counts.hot, icon: Fire },
    { key: "warm" as const, label: "Warm", count: counts.warm, icon: Thermometer },
    { key: "cold" as const, label: "Koud", count: counts.cold, icon: Snowflake },
  ];

  return (
    <>
      {/* Row 2: Filters */}
      <div className="flex items-center justify-between px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <Funnel className="h-4 w-4 text-muted-foreground" weight="bold" />
          {tempFilters.map((f) => {
            const active = filterTemp === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilterTemp(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f.icon && <f.icon className="h-3 w-3" weight="fill" />}
                {f.label}
                <span
                  className={cn(
                    "text-[10px]",
                    active ? "opacity-70" : "opacity-50"
                  )}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setFilterSource(filterSource === "all" ? "DREAM_SLIDER" : "all")
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filterSource === "DREAM_SLIDER"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Sparkle className="h-3 w-3" weight="fill" />
            AI Slider
            <span className="text-[10px] opacity-50">
              {leads.filter((l) => l.source === "DREAM_SLIDER").length}
            </span>
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground">
          {filtered.length} aanvragen
          {counts.new > 0 && (
            <span className="text-foreground font-medium">
              {" "}
              · {counts.new} nieuw
            </span>
          )}
          {counts.hot > 0 && (
            <span className="text-red-500 font-medium">
              {" "}
              · {counts.hot} heet
            </span>
          )}
        </p>
      </div>

      {/* Lead list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center text-center">
            <div className="p-3 bg-muted rounded-md mb-4">
              <ChatCircleDots
                className="h-6 w-6 text-foreground"
                weight="regular"
              />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Geen leads gevonden
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Pas je filters aan om meer resultaten te zien.
            </p>
          </div>
        ) : (
          filtered.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isExpanded={expandedId === lead.id}
              onToggle={() =>
                setExpandedId(expandedId === lead.id ? null : lead.id)
              }
              index={index}
            />
          ))
        )}
      </div>
    </>
  );
}

/* ─── Lead Card ─── */

function LeadCard({
  lead,
  isExpanded,
  onToggle,
  index,
}: {
  lead: ScoredLead;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const status = statusConfig[lead.status] || {
    label: lead.status,
    dot: "bg-muted-foreground",
    bg: "bg-muted text-muted-foreground",
  };
  const temp = tempConfig[lead.score.temperature];
  const initials = lead.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-background transition-all duration-200 group",
        "hover:shadow-lg/5",
        lead.score.temperature === "hot" &&
          lead.status === "NEW" &&
          "border-red-500/20",
        lead.status === "NEW" &&
          lead.score.temperature !== "hot" &&
          "border-primary/20"
      )}
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: "backwards",
      }}
    >
      <div className="p-4">
        {/* Top row: avatar + name + meta + actions */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Avatar
            className={cn(
              "size-10 shrink-0 border",
              lead.score.temperature === "hot"
                ? "border-red-500/30"
                : "border-border"
            )}
          >
            <AvatarFallback className="text-[11px] font-medium bg-muted text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Name row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-foreground leading-6 truncate">
                {lead.name}
              </span>

              {/* Temperature pill */}
              <LeadThermometer score={lead.score} compact />

              {/* Status badge */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  status.bg
                )}
              >
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    status.dot
                  )}
                />
                {status.label}
              </span>

              {/* Time */}
              <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto shrink-0">
                <Clock className="h-3 w-3" weight="regular" />
                {getTimeAgo(lead.createdAt)}
              </span>
            </div>

            {/* Contact row */}
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 truncate">
                <Envelope className="h-3.5 w-3.5 shrink-0" weight="regular" />
                {lead.email}
              </span>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" weight="regular" />
                  {lead.phone}
                </a>
              )}
              {lead.company && (
                <span className="flex items-center gap-1 truncate">
                  <Buildings
                    className="h-3.5 w-3.5 shrink-0"
                    weight="regular"
                  />
                  {lead.company}
                </span>
              )}
            </div>

            {/* Property */}
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Buildings className="h-3 w-3 shrink-0" weight="duotone" />
              <span className="truncate">{lead.propertyTitle}</span>
              {lead.source === "DREAM_SLIDER" && (
                <Badge
                  variant="outline"
                  className="ml-1 border-primary/30 text-primary bg-primary/5 text-[10px] px-1.5 py-0 h-4"
                >
                  <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="fill" />
                  AI
                </Badge>
              )}
            </div>
          </div>

          {/* Actions (hover-reveal) */}
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <DotsThreeVertical className="h-4 w-4" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Eye className="h-4 w-4" />
                  Markeer als bekeken
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ChatCircle className="h-4 w-4" />
                  Contact opnemen
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CalendarBlank className="h-4 w-4" />
                  Bezichtiging plannen
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive">
                  <Trash className="h-4 w-4" />
                  Markeer als spam
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-3 border-t border-border/60" />

        {/* Message preview + expand */}
        <div className="mt-3 flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
            {lead.message}
          </p>
          <button
            onClick={onToggle}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium shrink-0 rounded-full px-2.5 py-1 transition-colors",
              isExpanded
                ? "bg-foreground/5 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {isExpanded ? (
              <>
                <CaretUp className="h-3 w-3" weight="bold" />
                Minder
              </>
            ) : (
              <>
                Lead analyse
                <CaretDown className="h-3 w-3" weight="bold" />
              </>
            )}
          </button>
        </div>

        {/* Expanded analysis */}
        {isExpanded && (
          <div className="mt-4 rounded-xl bg-muted/50 p-4 space-y-4">
            <LeadThermometer score={lead.score} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function getTimeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d geleden`;
  return new Date(date).toLocaleDateString("nl-NL");
}
