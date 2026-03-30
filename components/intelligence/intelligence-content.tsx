"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import {
  Crosshair,
  Plus,
  MagnifyingGlass,
  ArrowRight,
  ArrowClockwise,
  Lightning,
  ChartLineUp,
  MapPin,
} from "@phosphor-icons/react/dist/ssr";
import type { IconWeight } from "@phosphor-icons/react";
import { startScan } from "@/app/actions/intelligence-scan";
import { usePermissions } from "@/hooks/use-permissions";
import type { IntelligenceProfile } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileWithCounts = IntelligenceProfile & {
  _count: { matches: number; scanJobs: number };
};

interface IntelligenceStats {
  totalScanned: number;
  totalMatches: number;
  signalsThisWeek: number;
  activeProfiles: number;
}

interface IntelligenceContentProps {
  profiles: ProfileWithCounts[];
  stats: IntelligenceStats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return n.toString();
}

function formatDate(date: Date | null): string {
  if (!date) return "Nog niet gescand";
  return new Date(date).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  value: number;
  label: string;
  iconColor: string;
}

function StatCard({ icon: Icon, value, label, iconColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} weight="duotone" />
      </div>
      <p className="text-xl font-semibold text-foreground">
        {formatNumber(value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Card
// ---------------------------------------------------------------------------

interface ProfileCardProps {
  profile: ProfileWithCounts;
  onScan: (profileId: string) => void;
  scanning: boolean;
}

function ProfileCard({ profile, onScan, scanning }: ProfileCardProps) {
  const cities = profile.targetCities.slice(0, 4).join(", ");
  const hasMore = profile.targetCities.length > 4;

  return (
    <div className="group rounded-xl border border-border bg-background px-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        {/* Left: info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[15px] font-semibold text-foreground leading-6 truncate">
              {profile.name}
            </p>
            {profile.active ? (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                Actief
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                Gepauzeerd
              </span>
            )}
          </div>
          {profile.clientName && (
            <p className="text-xs text-muted-foreground mb-1">
              Voor: {profile.clientName}
            </p>
          )}

          <p className="text-xs text-muted-foreground mb-2">
            <span className="font-medium text-foreground">
              {profile.concept}
            </span>
            {" "}
            {cities && (
              <>
                <span className="mx-1 text-border">|</span>
                <MapPin
                  className="inline h-3 w-3 text-muted-foreground mr-0.5"
                  weight="regular"
                />
                {cities}
                {hasMore && ` +${profile.targetCities.length - 4}`}
              </>
            )}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {profile._count.matches}
              </span>{" "}
              matches
            </span>
            <span>
              Laatste scan: {formatDate(profile.lastScanAt)}
            </span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onScan(profile.id)}
            disabled={scanning}
          >
            <ArrowClockwise
              className={`h-3.5 w-3.5 mr-1 ${scanning ? "animate-spin" : ""}`}
              weight="bold"
            />
            Scan
          </Button>
          <Link href={`/dashboard/intelligence/${profile.id}`}>
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              Bekijk matches
              <ArrowRight className="h-3.5 w-3.5 ml-1" weight="bold" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex h-60 flex-col items-center justify-center text-center">
      <div className="p-3 bg-muted rounded-md mb-4">
        <Crosshair className="h-6 w-6 text-foreground" weight="regular" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Nog geen zoekprofielen
      </h3>
      <p className="mb-6 text-sm text-muted-foreground max-w-sm">
        Maak je eerste zoekprofiel aan om de markt te scannen op
        overnamekansen
      </p>
      <Link href="/dashboard/intelligence/nieuw">
        <Button size="sm" variant="ghost">
          <Plus className="h-4 w-4 mr-1.5" weight="bold" />
          Eerste profiel aanmaken
        </Button>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function IntelligenceContent({
  profiles,
  stats,
}: IntelligenceContentProps) {
  const { isAgent, isSeeker } = usePermissions();
  const [scanningId, setScanningId] = useState<string | null>(null);

  async function handleScan(profileId: string) {
    setScanningId(profileId);
    try {
      const result = await startScan(profileId);
      if (result.success) {
        toast.success("Scan gestart", {
          description: "De resultaten verschijnen zodra de scan klaar is.",
        });
      } else {
        toast.error("Scan mislukt", {
          description: result.error ?? "Probeer het later opnieuw.",
        });
      }
    } catch {
      toast.error("Er ging iets mis", {
        description: "Kon de scan niet starten.",
      });
    } finally {
      setScanningId(null);
    }
  }

  return (
    <ContentCard>
      <ContentCardHeader
        title={isAgent ? "Klant Zoekprofielen" : isSeeker ? "Mijn Zoekopdrachten" : "Overname Intelligence"}
        actions={
          <Link href="/dashboard/intelligence/nieuw">
            <Button size="sm" variant="ghost">
              <Plus className="h-4 w-4 mr-1.5" weight="bold" />
              {isAgent ? "Nieuw klantprofiel" : isSeeker ? "Nieuw zoekprofiel" : "Nieuw profiel"}
            </Button>
          </Link>
        }
      />

      <ContentCardBody className="p-4 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: MagnifyingGlass, value: stats.totalScanned, label: "Zaken gescand", iconColor: "text-primary" },
            { icon: ChartLineUp, value: stats.totalMatches, label: "Matches gevonden", iconColor: "text-emerald-500" },
            { icon: Lightning, value: stats.signalsThisWeek, label: "Signalen deze week", iconColor: "text-amber-500" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.06 }}
            >
              <StatCard
                icon={stat.icon}
                value={stat.value}
                label={stat.label}
                iconColor={stat.iconColor}
              />
            </motion.div>
          ))}
        </div>

        {/* Profiles section */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {isAgent ? "Klantprofielen" : "Zoekprofielen"}
            {profiles.length > 0 && (
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                ({profiles.length})
              </span>
            )}
          </h3>

          {profiles.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {profiles.map((profile, index) => (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.18 + index * 0.04 }}
                >
                  <ProfileCard
                    profile={profile}
                    onScan={handleScan}
                    scanning={scanningId === profile.id}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}
