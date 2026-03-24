import Link from "next/link";
import {
  SparklesIcon,
  ClockIcon,
  BellIcon,
  ArrowRightIcon,
  SearchIcon,
} from "lucide-react";

import type { PropertyListItem } from "@/types/property";
import { getSeekerRecommendations } from "@/app/actions/seeker-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PropertyCard, PropertyCardSkeleton } from "./property-card";
import {
  SeekerNoPreferencesState,
  SeekerSectionEmptyState,
} from "./seeker-empty-state";

/**
 * Section header component for dashboard sections
 */
function SectionHeader({
  icon: Icon,
  title,
  badge,
  href,
  linkLabel = "Bekijk alles",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {badge !== undefined && badge > 0 && (
          <Badge variant="secondary" className="ml-1">
            {badge} nieuw
          </Badge>
        )}
      </div>
      {href && (
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href={href}>
            {linkLabel}
            <ArrowRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Property cards grid component
 */
function PropertyCardsGrid({
  properties,
  emptyState,
}: {
  properties: React.ComponentProps<typeof PropertyCard>["property"][];
  emptyState?: React.ReactNode;
}) {
  if (properties.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {properties.map((property) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  );
}

/**
 * Welcome header for the seeker dashboard
 */
function WelcomeHeader({ hasPreferences }: { hasPreferences: boolean }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welkom terug
        </h1>
        <p className="mt-1 text-muted-foreground">
          {hasPreferences
            ? "Ontdek horecalocaties die bij jouw wensen passen"
            : "Stel je voorkeuren in voor gepersonaliseerde aanbevelingen"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/aanbod">
            <SearchIcon className="mr-2 h-4 w-4" />
            Zoeken
          </Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard/alerts">
            <BellIcon className="mr-2 h-4 w-4" />
            Alerts beheren
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the dashboard
 */
export function SeekerDashboardSkeleton() {
  return (
    <div className="space-y-10 p-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="mt-2 h-5 w-72 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded-lg bg-muted animate-pulse" />
          <div className="h-10 w-36 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>

      {/* Sections skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
            <div className="h-6 w-40 rounded bg-muted animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((j) => (
              <PropertyCardSkeleton key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Seeker Dashboard - Server Component
 *
 * Main dashboard view for seekers (horeca entrepreneurs looking for locations).
 * Shows personalized recommendations, recently viewed properties, and new matches
 * based on user preferences and search alerts.
 */
export async function SeekerDashboard() {
  const result = await getSeekerRecommendations();

  // Handle error state
  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <p className="text-sm text-destructive">
            {result.error ?? "Er ging iets mis bij het laden van het dashboard"}
          </p>
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link href="/aanbod">Ga naar zoeken</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { recommended, recentlyViewed, newMatches, hasPreferences } = result.data;

  // Show empty state if no preferences are set
  if (!hasPreferences) {
    return (
      <div className="p-6">
        <WelcomeHeader hasPreferences={false} />
        <SeekerNoPreferencesState />
      </div>
    );
  }

  return (
    <div className="space-y-10 p-6">
      {/* Welcome Header */}
      <WelcomeHeader hasPreferences={true} />

      {/* Recommended Section */}
      <section>
        <SectionHeader
          icon={SparklesIcon}
          title="Aanbevolen voor jou"
          href="/aanbod"
          linkLabel="Bekijk alle panden"
        />
        <PropertyCardsGrid
          properties={recommended as PropertyListItem[]}
          emptyState={
            <SeekerSectionEmptyState
              title="Nog geen aanbevelingen"
              description="We zijn druk bezig met het vinden van de perfecte locaties voor jou. Kom later terug!"
              action={{ label: "Direct zoeken", href: "/aanbod" }}
            />
          }
        />
      </section>

      {/* Recently Viewed Section */}
      <section>
        <SectionHeader
          icon={ClockIcon}
          title="Recent bekeken"
          href="/dashboard/favorieten"
          linkLabel="Bekijk favorieten"
        />
        <PropertyCardsGrid
          properties={recentlyViewed as PropertyListItem[]}
          emptyState={
            <SeekerSectionEmptyState
              title="Nog geen bekeken panden"
              description="Panden die je bekijkt verschijnen hier, zodat je ze makkelijk terug kunt vinden."
              action={{ label: "Start met zoeken", href: "/aanbod" }}
            />
          }
        />
      </section>

      {/* New Matches Section */}
      <section>
        <SectionHeader
          icon={BellIcon}
          title="Nieuwe matches"
          badge={newMatches.length}
          href="/dashboard/alerts"
          linkLabel="Beheer alerts"
        />
        <PropertyCardsGrid
          properties={newMatches as PropertyListItem[]}
          emptyState={
            <SeekerSectionEmptyState
              title="Geen nieuwe matches"
              description="Stel zoek alerts in om op de hoogte te blijven van nieuwe panden die aan je criteria voldoen."
              action={{ label: "Alert aanmaken", href: "/dashboard/alerts" }}
            />
          }
        />
      </section>
    </div>
  );
}
