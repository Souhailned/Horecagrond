import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  CheckCircle,
  Users,
  Home,
  Trophy,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import MaxWidthWrapper from "@/components/blog/max-width-wrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/agency/agent-card";
import { PropertyCard } from "@/components/property/property-card";
import { getAgency, getPropertiesByAgency, getAllAgencySlugs } from "@/app/actions/agency";
import { constructMetadata } from "@/lib/constructMetadata";
import {
  generateAgencyStructuredData,
  generateBreadcrumbStructuredData,
  StructuredData,
} from "./structured-data";

// ============================================================================
// Static Generation
// ============================================================================

export async function generateStaticParams() {
  const slugs = await getAllAgencySlugs();
  return slugs.map((slug) => ({ slug }));
}

// ============================================================================
// Metadata
// ============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata | undefined> {
  const { slug } = await params;
  const result = await getAgency(slug);

  if (!result.success || !result.data) {
    return;
  }

  const agency = result.data;

  return constructMetadata({
    title: `${agency.name} - Horecamakelaar in ${agency.city}`,
    description:
      agency.description ||
      `${agency.name} is een gespecialiseerde horecamakelaar in ${agency.city}. Bekijk het aanbod van ${agency.activeListings} panden.`,
    image: agency.logo || undefined,
  });
}

// ============================================================================
// Page Component
// ============================================================================

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch agency and properties in parallel
  const [agencyResult, propertiesResult] = await Promise.all([
    getAgency(slug),
    getAgency(slug).then((res) =>
      res.success && res.data
        ? getPropertiesByAgency(res.data.id, { status: "ACTIVE", limit: 6 })
        : ({ success: false, error: "Agency not found" } as const)
    ),
  ]);

  if (!agencyResult.success || !agencyResult.data) {
    notFound();
  }

  const agency = agencyResult.data;
  const properties = propertiesResult.success ? propertiesResult.data : [];

  // Generate structured data
  const agencyStructuredData = generateAgencyStructuredData(agency);
  const breadcrumbData = generateBreadcrumbStructuredData([
    { name: "Home", url: "/" },
    { name: "Makelaars", url: "/makelaars" },
    { name: agency.name, url: `/makelaars/${agency.slug}` },
  ]);

  return (
    <>
      <StructuredData data={agencyStructuredData} />
      <StructuredData data={breadcrumbData} />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50 bg-gradient-to-b from-muted/30 to-background">
        {/* Decorative Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.15) 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <MaxWidthWrapper className="relative pb-16 pt-28">
          {/* Breadcrumbs */}
          <nav className="mb-8" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li className="text-border">/</li>
              <li>
                <Link href="/makelaars" className="hover:text-foreground transition-colors">
                  Makelaars
                </Link>
              </li>
              <li className="text-border">/</li>
              <li className="text-foreground font-medium">{agency.name}</li>
            </ol>
          </nav>

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
            {/* Agency Logo */}
            <div className="relative shrink-0">
              <div className="relative h-32 w-32 overflow-hidden rounded-2xl border-4 border-background bg-card shadow-xl lg:h-40 lg:w-40">
                {agency.logo ? (
                  <Image
                    src={agency.logo}
                    alt={`${agency.name} logo`}
                    fill
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                    <Building2 className="h-16 w-16 text-primary/50" />
                  </div>
                )}
              </div>

              {/* Verified Badge */}
              {agency.verified && (
                <div className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 p-2 text-white shadow-lg">
                  <CheckCircle className="h-5 w-5" />
                </div>
              )}
            </div>

            {/* Agency Info */}
            <div className="flex-1">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                  {agency.name}
                </h1>
                {agency.verified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Geverifieerd
                  </Badge>
                )}
                <Badge variant="secondary">{agency.plan}</Badge>
              </div>

              {agency.description && (
                <p className="mb-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  {agency.description}
                </p>
              )}

              {/* Quick Stats */}
              <div className="mb-6 flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Home className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">
                      {agency.activeListings}
                    </div>
                    <div className="text-xs text-muted-foreground">Actieve panden</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">
                      {agency.totalDeals}
                    </div>
                    <div className="text-xs text-muted-foreground">Succesvolle deals</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">
                      {agency.agents.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Makelaars</div>
                  </div>
                </div>
              </div>

              {/* Location & Contact Quick Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {agency.city && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {agency.city}
                      {agency.province && `, ${agency.province}`}
                    </span>
                  </div>
                )}
                {agency.phone && (
                  <a
                    href={`tel:${agency.phone}`}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{agency.phone}</span>
                  </a>
                )}
                {agency.website && (
                  <a
                    href={agency.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Website</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </MaxWidthWrapper>
      </section>

      {/* Team Section */}
      {agency.agents.length > 0 && (
        <section className="border-b border-border/50 py-16 lg:py-24">
          <MaxWidthWrapper>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-2xl font-bold text-foreground lg:text-3xl">
                Ons Team
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Maak kennis met onze ervaren makelaars die klaar staan om u te
                helpen bij het vinden van het perfecte horecapand.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agency.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </MaxWidthWrapper>
        </section>
      )}

      {/* Properties Section */}
      {properties.length > 0 && (
        <section className="border-b border-border/50 bg-muted/30 py-16 lg:py-24">
          <MaxWidthWrapper>
            <div className="mb-10 flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div>
                <h2 className="mb-2 text-2xl font-bold text-foreground lg:text-3xl">
                  Actueel Aanbod
                </h2>
                <p className="text-muted-foreground">
                  Bekijk onze beschikbare horecapanden
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/panden?makelaar=${agency.slug}`}>
                  Bekijk alle panden
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property, index) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  priority={index < 3}
                />
              ))}
            </div>
          </MaxWidthWrapper>
        </section>
      )}

      {/* Contact Section */}
      <section className="py-16 lg:py-24">
        <MaxWidthWrapper>
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm lg:p-12">
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Contact Info */}
                <div>
                  <h2 className="mb-4 text-2xl font-bold text-foreground">
                    Neem Contact Op
                  </h2>
                  <p className="mb-6 text-muted-foreground">
                    Heeft u vragen of wilt u meer informatie over een pand?
                    Neem gerust contact met ons op.
                  </p>

                  <div className="space-y-4">
                    {agency.address && (
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Adres</div>
                          <div className="text-sm text-muted-foreground">
                            {agency.address}
                            <br />
                            {agency.postalCode} {agency.city}
                          </div>
                        </div>
                      </div>
                    )}

                    {agency.phone && (
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Phone className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Telefoon</div>
                          <a
                            href={`tel:${agency.phone}`}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            {agency.phone}
                          </a>
                        </div>
                      </div>
                    )}

                    {agency.email && (
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">E-mail</div>
                          <a
                            href={`mailto:${agency.email}`}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            {agency.email}
                          </a>
                        </div>
                      </div>
                    )}

                    {agency.website && (
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Globe className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Website</div>
                          <a
                            href={agency.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            {agency.website.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* KvK Info */}
                  {agency.kvkNumber && (
                    <div className="mt-6 border-t border-border/50 pt-4 text-xs text-muted-foreground">
                      KvK: {agency.kvkNumber}
                      {agency.vatNumber && ` • BTW: ${agency.vatNumber}`}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="flex flex-col justify-center rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-6 lg:p-8">
                  <h3 className="mb-3 text-xl font-semibold text-foreground">
                    Direct contact opnemen?
                  </h3>
                  <p className="mb-6 text-sm text-muted-foreground">
                    Wij reageren meestal binnen 24 uur op uw bericht.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg" className="flex-1">
                      <a href={`mailto:${agency.email}`}>
                        <Mail className="mr-2 h-4 w-4" />
                        Stuur e-mail
                      </a>
                    </Button>
                    {agency.phone && (
                      <Button asChild variant="outline" size="lg" className="flex-1">
                        <a href={`tel:${agency.phone}`}>
                          <Phone className="mr-2 h-4 w-4" />
                          Bel direct
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </MaxWidthWrapper>
      </section>
    </>
  );
}
