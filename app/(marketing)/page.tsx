import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Testimonials } from "@/components/marketing/testimonials";
import { CtaSection } from "@/components/marketing/cta-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { HeroSearchCard } from "@/components/aanbod/hero-search-card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Building2,
  Users,
  MapPin,
  ArrowRight,
  Star,
  Briefcase,
  CheckCircle2,
  Clock,
  Handshake,
  Search,
  TrendingUp,
  Shield,
  Sparkles,
  Maximize2,
} from "lucide-react";

// Mock featured properties (prepared for Prisma)
const featuredProperties = [
  {
    id: "prop-001",
    slug: "restaurant-de-gouden-leeuw-amsterdam",
    title: "Restaurant De Gouden Leeuw",
    city: "Amsterdam",
    province: "Noord-Holland",
    propertyType: "RESTAURANT" as const,
    priceType: "SALE" as const,
    price: 175000,
    surfaceTotal: 180,
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
    features: ["TERRACE", "KITCHEN", "ALCOHOL_LICENSE"],
    isFeatured: true,
    isNew: true,
  },
  {
    id: "prop-002",
    slug: "grand-cafe-het-station-utrecht",
    title: "Grand Café Het Station",
    city: "Utrecht",
    province: "Utrecht",
    propertyType: "GRAND_CAFE" as const,
    priceType: "RENT" as const,
    price: 3500,
    surfaceTotal: 250,
    image:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop",
    features: ["TERRACE", "ALCOHOL_LICENSE", "LIVING_QUARTERS"],
    isFeatured: true,
    isNew: false,
  },
  {
    id: "prop-006",
    slug: "boutique-hotel-de-oranje-nassau-den-haag",
    title: "Boutique Hotel De Oranje Nassau",
    city: "Den Haag",
    province: "Zuid-Holland",
    propertyType: "HOTEL" as const,
    priceType: "SALE" as const,
    price: 890000,
    surfaceTotal: 650,
    image:
      "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=800&h=600&fit=crop",
    features: ["KITCHEN", "ALCOHOL_LICENSE", "PARKING"],
    isFeatured: true,
    isNew: false,
  },
  {
    id: "prop-009",
    slug: "partycentrum-de-feestzaal-tilburg",
    title: "Partycentrum De Feestzaal",
    city: "Tilburg",
    province: "Noord-Brabant",
    propertyType: "PARTYCENTRUM" as const,
    priceType: "SALE" as const,
    price: 450000,
    surfaceTotal: 1200,
    image:
      "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=800&h=600&fit=crop",
    features: ["KITCHEN", "ALCOHOL_LICENSE", "PARKING"],
    isFeatured: true,
    isNew: false,
  },
];

// Stats + popular cities from real data
async function getStats() {
  try {
    const prisma = (await import("@/lib/prisma")).default;
    const [propertyCount, distinctCities, agentCount] = await Promise.all([
      prisma.property.count({ where: { status: "ACTIVE" } }),
      prisma.property.findMany({
        where: { status: "ACTIVE" },
        select: { city: true },
        distinct: ["city"],
      }),
      prisma.user.count({ where: { role: "agent" } }),
    ]);
    return {
      properties: propertyCount,
      agents: agentCount,
      cities: distinctCities.length,
    };
  } catch {
    return { properties: 0, agents: 0, cities: 0 };
  }
}

async function getPopularCities(): Promise<string[]> {
  try {
    const prisma = (await import("@/lib/prisma")).default;
    const cities = await prisma.property.groupBy({
      by: ["city"],
      where: { status: "ACTIVE" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 6,
    });
    return cities.map((c) => c.city);
  } catch {
    return [];
  }
}

const propertyTypeLabels: Record<string, string> = {
  RESTAURANT: "Restaurant",
  CAFE: "Café",
  BAR: "Bar",
  HOTEL: "Hotel",
  DARK_KITCHEN: "Dark Kitchen",
  GRAND_CAFE: "Grand Café",
  LUNCHROOM: "Lunchroom",
  PARTYCENTRUM: "Partycentrum",
  PIZZERIA: "Pizzeria",
  BRASSERIE: "Brasserie",
  SNACKBAR: "Snackbar",
};

const featureLabels: Record<string, string> = {
  TERRACE: "Terras",
  KITCHEN: "Keuken",
  ALCOHOL_LICENSE: "Drank & Horeca",
  PARKING: "Parkeren",
  LIVING_QUARTERS: "Woonruimte",
};

const howItWorksSteps = [
  {
    icon: Search,
    step: 1,
    title: "Zoek & Filter",
    eyebrow: "Verken aanbod",
    description:
      "Gebruik filters op type, regio, prijs en oppervlakte om alleen relevante panden te zien.",
    points: [
      "Bewaar een shortlist in je favorieten",
      "Vergelijk panden naast elkaar",
      "Wissel direct tussen kaart en lijst",
    ],
    layout: "md:col-span-3",
  },
  {
    icon: Clock,
    step: 2,
    title: "Plan Bezichtiging",
    eyebrow: "Kom in contact",
    description:
      "Neem direct contact op met de makelaar en plan een bezichtiging wanneer het jou uitkomt.",
    note: "Gemiddelde reactietijd: binnen 24 uur",
    layout: "md:col-span-3",
  },
  {
    icon: Handshake,
    step: 3,
    title: "Onderteken Deal",
    eyebrow: "Rond veilig af",
    description:
      "Bij een match begeleidt de makelaar je door voorwaarden, contract en sleuteloverdracht.",
    note: "Inclusief ondersteuning bij documentcontrole",
    layout: "md:col-span-6",
  },
] as const;

const statsBentoMeta = [
  {
    key: "properties",
    icon: Building2,
    label: "Horecapanden",
    detail: "Actief aanbod op het platform",
    layout: "md:col-span-6",
    valueClass: "text-5xl sm:text-6xl",
  },
  {
    key: "agents",
    icon: Users,
    label: "Gecertificeerde Makelaars",
    detail: "Actieve professionals",
    layout: "md:col-span-3",
    valueClass: "text-4xl sm:text-5xl",
  },
  {
    key: "cities",
    icon: MapPin,
    label: "Steden in Nederland",
    detail: "Landelijke dekking",
    layout: "md:col-span-3",
    valueClass: "text-4xl sm:text-5xl",
  },
] as const;

function formatPrice(amount: number, priceType: string): string {
  const formatted = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
  return priceType === "RENT" ? `${formatted}/mnd` : formatted;
}

// Animation classes
const fadeUp =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 [animation-fill-mode:both]";
const animDelay = (ms: number) => ({ style: { animationDelay: `${ms}ms` } });

export default async function Home() {
  const [stats, popularCities] = await Promise.all([getStats(), getPopularCities()]);
  const statsBento = statsBentoMeta.map((item) => ({
    ...item,
    value:
      item.key === "properties"
        ? `${stats.properties.toLocaleString("nl-NL")}+`
        : item.key === "agents"
          ? stats.agents.toLocaleString("nl-NL")
          : stats.cities.toLocaleString("nl-NL"),
  }));

  return (
    <>
      {/* ─────────────────────────── HERO ─────────────────────────── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-background via-muted/20 to-background">
        {/* ── Background blurs ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />

        {/* ── Wide hero image with left + top fade (desktop only) ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] lg:block"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 40%), linear-gradient(to bottom, transparent 0%, black 45%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 40%), linear-gradient(to bottom, transparent 0%, black 45%)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in" as React.CSSProperties["WebkitMaskComposite"],
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=800&fit=crop"
            alt=""
            className="size-full object-cover"
          />
          {/* Subtle dark overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-background/10" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-24 sm:px-6 sm:pb-20 sm:pt-32 lg:px-12">
          {/* ── Text content — sits above the faded image ── */}
          <div className="relative z-10 max-w-xl">
            <Badge
              variant="secondary"
              className={cn("mb-4", fadeUp)}
              {...animDelay(0)}
            >
              Voor horecaondernemers
            </Badge>

            <h1
              className={cn(
                "text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]",
                fadeUp
              )}
              {...animDelay(80)}
            >
              Vind een horecapand dat echt past bij jouw concept
            </h1>

            <p
              className={cn(
                "mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg",
                fadeUp
              )}
              {...animDelay(160)}
            >
              Vergelijk locaties, bekijk de kaart en plan direct een bezichtiging
              — alles op een plek.
            </p>

            {/* Compact inline stats */}
            <div
              className={cn("mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground", fadeUp)}
              {...animDelay(220)}
            >
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Building2 className="size-4 text-primary" />
                {stats.properties}+ panden
              </span>
              <span aria-hidden className="h-4 w-px bg-border" />
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {stats.cities} steden
              </span>
              <span aria-hidden className="h-4 w-px bg-border" />
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                {stats.agents} makelaars
              </span>
            </div>
          </div>

          {/* ── Category tabs search card — full width below ── */}
          <div className="relative z-10 mt-10">
            <HeroSearchCard
              popularCities={popularCities}
              totalCount={stats.properties}
              animated
              animationDelay={300}
            />
          </div>
        </div>
      </section>

      {/* ──────────────── FEATURED PROPERTIES ──────────────── */}
      <section className="border-b bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Badge variant="secondary" className="mb-3">
                <Star className="mr-1 size-3 fill-amber-500 text-amber-500" />
                Uitgelicht
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Populaire locaties
              </h2>
              <p className="mt-2 text-muted-foreground">
                Ontdek de meest bekeken horecapanden van dit moment
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/aanbod">
                Bekijk alle panden
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProperties.map((property) => (
              <Link
                key={property.id}
                href={`/aanbod/${property.slug}`}
                className="group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={property.image}
                    alt={property.title}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                  {/* Badges */}
                  <div className="absolute left-3 top-3 flex gap-2">
                    {property.isNew && (
                      <Badge className="border-0 bg-primary text-primary-foreground shadow-lg">
                        <Sparkles className="mr-1 size-3" />
                        Nieuw
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="border-0 bg-white/90 shadow-lg backdrop-blur-sm"
                    >
                      {propertyTypeLabels[property.propertyType]}
                    </Badge>
                  </div>

                  {/* Price overlay */}
                  <div className="absolute bottom-3 left-3">
                    <p className="text-lg font-bold text-white">
                      {formatPrice(property.price, property.priceType)}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="line-clamp-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                    {property.title}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" />
                    <span>{property.city}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      <Maximize2 className="size-3" />
                      {property.surfaceTotal} m²
                    </span>
                    {property.features.slice(0, 2).map((f) => (
                      <span
                        key={f}
                        className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        {featureLabels[f] || f}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────── HOW IT WORKS ────────────────── */}
      <section className="border-b py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">
              Hoe het werkt
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              In 3 stappen naar jouw locatie
            </h2>
            <p className="mt-4 text-muted-foreground">
              Van zoeken tot ondertekenen — wij maken het proces zo eenvoudig
              mogelijk
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-6 lg:gap-5">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.step}
                  className={`group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 ${step.layout}`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 h-px w-full bg-border"
                  />

                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 text-primary">
                        <Icon className="size-5" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Stap {step.step}
                      </span>
                    </div>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {step.eyebrow}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {step.description}
                    </p>

                    {"points" in step ? (
                      <ul className="mt-5 space-y-2.5 border-t border-border/70 pt-4 text-sm text-foreground/80">
                        {step.points.map((point) => (
                          <li key={point} className="flex items-start gap-2">
                            <span
                              aria-hidden
                              className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50"
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-5 border-t border-border/70 pt-4 text-sm font-medium text-foreground/75">
                        {step.note}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ────────────────── STATS ────────────────── */}
      <section className="border-b bg-muted/15 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="mb-8 max-w-2xl">
            <Badge variant="secondary">Platform in cijfers</Badge>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Dagelijks geactualiseerde cijfers uit actieve panden en aangesloten
              makelaars.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-12 lg:gap-5">
            {statsBento.map((stat, index) => {
              const Icon = stat.icon;
              const isPrimary = stat.key === "properties";
              return (
                <Card
                  key={stat.label}
                  className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 ${isPrimary
                    ? "border-primary/25 bg-primary/5"
                    : "border-border/80 bg-card hover:border-primary/20"
                    } ${stat.layout}`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute left-0 top-0 h-px w-full ${isPrimary ? "bg-primary/35" : "bg-border"
                      }`}
                  />

                  <CardContent className="relative p-6 sm:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p
                          className={`text-xs font-semibold uppercase tracking-[0.14em] ${isPrimary ? "text-primary/80" : "text-muted-foreground/90"
                            }`}
                        >
                          {stat.detail}
                        </p>
                        <p
                          className={`${stat.valueClass} mt-5 font-bold tracking-tight text-foreground [font-variant-numeric:tabular-nums]`}
                        >
                          {stat.value}
                        </p>
                        <p
                          className={`mt-1.5 text-sm font-medium sm:text-base ${isPrimary
                            ? "text-foreground/85"
                            : "text-foreground/80"
                            }`}
                        >
                          {stat.label}
                        </p>
                        {isPrimary && (
                          <p className="mt-5 max-w-sm text-sm leading-relaxed text-foreground/70">
                            Groot en actueel aanbod verspreid over meerdere
                            steden, continu bijgewerkt.
                          </p>
                        )}
                      </div>
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${isPrimary
                          ? "bg-primary/12 text-primary"
                          : "bg-primary/10 text-primary"
                          }`}
                      >
                        <Icon className="size-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ──────────────── WHY HORECAGROND ──────────────── */}
      <section className="border-b py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Waarom Horecagrond?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Het platform dat horeca-ondernemers en makelaars samenbrengt
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: TrendingUp,
                title: "Marktinzichten",
                description:
                  "Locatiescores, voetgangersstroom en concurrentieanalyse per pand.",
              },
              {
                icon: Shield,
                title: "Geverifieerde Makelaars",
                description:
                  "Alle aangesloten makelaars zijn gecertificeerd en beoordeeld.",
              },
              {
                icon: Sparkles,
                title: "AI Foto Verbetering",
                description:
                  "Automatische beeldoptimalisatie voor professionele presentatie.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border bg-card p-6 transition-all hover:shadow-md"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ────────────── CTA BANNER ────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 sm:py-20">
            {/* Pattern */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
            <div
              aria-hidden
              className="absolute -right-20 -top-20 size-64 rounded-full bg-white/10 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-20 -left-20 size-64 rounded-full bg-white/10 blur-3xl"
            />

            <div className="relative">
              <Badge
                variant="secondary"
                className="mb-6 border-white/20 bg-white/10 text-white"
              >
                <Briefcase className="mr-1 size-3" />
                Voor Makelaars
              </Badge>
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Bereik duizenden horecaondernemers
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg text-primary-foreground/80">
                Plaats je horecapanden op Horecagrond en krijg toegang tot
                gekwalificeerde leads van ondernemers die actief op zoek zijn.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="h-12 px-8 text-base font-semibold shadow-lg"
                >
                  <Link href="/sign-up?role=agent">
                    Start Gratis
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="lg"
                  className="h-12 px-8 text-base text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/makelaars">Meer informatie</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-primary-foreground/70">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  <span>Eerste 3 panden gratis</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  <span>Directe lead notificaties</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  <span>AI foto verbetering</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <FeaturesSection />

      {/* Testimonials */}
      <Testimonials />

      {/* CTA */}
      <CtaSection />
    </>
  );
}
