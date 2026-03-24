"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createInquiry } from "@/app/actions/inquiries";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { addToRecentlyViewed, RecentlyViewed } from "@/components/recently-viewed/recently-viewed";
import { NeighborhoodInfo } from "@/components/property/neighborhood-info";
import { WhatsAppButton } from "@/components/property/whatsapp-button";
import { BuurtIntelligence } from "@/components/property/buurt-intelligence";
import { ConceptSuggestions } from "@/components/property/concept-suggestions";
import { ConceptChecker } from "@/components/property/concept-checker";
import { PropertyAdvisor } from "@/components/property/property-advisor";
import { ViewingRequestDialog } from "@/components/property/viewing-request-dialog";
import { RevealPhone } from "@/components/property/reveal-phone";
import { SaveReminderBar } from "@/components/property/save-reminder-bar";
import { SimilarProperties } from "@/components/property/similar-properties";
import { addRecentView } from "@/lib/recent-views";
import { formatPrice } from "@/lib/format";
import { toast } from "sonner";
import type { EnhancedBuurtAnalysis } from "@/lib/buurt/types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  MapPin,
  Maximize2,
  Users,
  Utensils,
  Coffee,
  Wine,
  ChefHat,
  Building2,
  Bed,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  Share2,
  Printer,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  Sparkles,
  Tag,
  ArrowLeft,
  X,
} from "lucide-react";
import type { Property, PropertyImage } from "@/types/property";
import type { DemoConceptData } from "@/app/actions/public-demo-concepts";
import type { PublishedAiMedia } from "@/app/actions/public-ai-media";
import {
  PropertyTypeLabels,
  PropertyFeatureLabels,
  PriceTypeLabels,
} from "@/types/property";
import { cn } from "@/lib/utils";

const AiInterieurSection = dynamic(
  () =>
    import("@/components/property/ai-interieur-section").then(
      (m) => m.AiInterieurSection
    ),
  { ssr: false }
);

const PropertyDetailMap = dynamic(
  () => import("@/components/aanbod/property-map").then((mod) => mod.PropertyDetailMap),
  {
    loading: () => (
      <div className="flex aspect-[16/9] items-center justify-center rounded-xl border bg-muted/30">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Kaart laden...</span>
        </div>
      </div>
    ),
    ssr: false,
  }
);

// Property type icons mapping
const propertyTypeIcons: Record<string, React.ReactNode> = {
  RESTAURANT: <Utensils className="size-4" />,
  CAFE: <Coffee className="size-4" />,
  BAR: <Wine className="size-4" />,
  HOTEL: <Bed className="size-4" />,
  DARK_KITCHEN: <ChefHat className="size-4" />,
  GRAND_CAFE: <Coffee className="size-4" />,
  LUNCHROOM: <UtensilsCrossed className="size-4" />,
  SNACKBAR: <Utensils className="size-4" />,
  PIZZERIA: <Utensils className="size-4" />,
  BRASSERIE: <Utensils className="size-4" />,
  PARTYCENTRUM: <Building2 className="size-4" />,
};

interface SimilarProperty {
  id: string;
  title: string;
  slug: string;
  city: string;
  propertyType: string;
  rentPrice: number | null;
  surfaceTotal: number | null;
  images: string[];
  matchReason: string;
}

interface PropertyDetailProps {
  property: Property;
  demoConcepts?: DemoConceptData[];
  isLoggedIn?: boolean;
  publishedAiMedia?: PublishedAiMedia;
  similarProperties?: SimilarProperty[];
  teaserStyle?: string | null;
  aiQuota?: { freeEditsUsed: number; freeEditsLimit: number; remaining: number; totalEdits: number } | null;
  bestStagingImageUrl?: string;
}

export function PropertyDetail({
  property,
  demoConcepts,
  isLoggedIn,
  publishedAiMedia,
  similarProperties = [],
  teaserStyle,
  aiQuota,
  bestStagingImageUrl,
}: PropertyDetailProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [sharedAnalysis, setSharedAnalysis] = useState<EnhancedBuurtAnalysis | null>(null);
  const handleAnalysisLoaded = useCallback((data: EnhancedBuurtAnalysis) => {
    setSharedAnalysis(data);
  }, []);
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    phone: "",
    message: `Beste makelaar,\n\nIk heb interesse in "${property.title}" en zou graag meer informatie ontvangen.\n\nMet vriendelijke groet`,
  });

  // Track recently viewed
  useEffect(() => {
    const firstImage = property.images?.[0];
    const previewImage = firstImage?.originalUrl || firstImage?.thumbnailUrl || "";

    addToRecentlyViewed({
      id: property.id,
      title: property.title,
      slug: property.slug,
      city: property.city,
      type: property.propertyType,
    });
    addRecentView({
      id: property.id,
      slug: property.slug,
      title: property.title,
      city: property.city,
      image: previewImage,
      price:
        property.priceType === "SALE"
          ? property.salePrice ?? null
          : property.rentPrice ?? property.salePrice ?? null,
      priceType: property.priceType,
    });
  }, [property.id]);

  // Get images from PropertyImage[]
  const images: string[] = Array.isArray(property.images)
    ? property.images.map((img: PropertyImage) => img.originalUrl || img.thumbnailUrl || "")
    : [];

  const currentImage = images[currentImageIndex] || "";

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + images.length) % images.length
    );
  };

  // Get price display (prices in cents, formatPrice divides by 100)
  const price = property.rentPrice || property.salePrice;
  const priceType = property.priceType;
  const priceDisplay = formatPrice(price);
  const priceSuffix = priceType === "RENT" ? "/maand" : "";

  // Get features
  const features: string[] = property.features || [];

  // Area
  const area = property.surfaceTotal || 0;

  // Focus lightbox on open
  useEffect(() => {
    if (lightboxOpen && lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, [lightboxOpen]);

  // Lightbox keyboard handler
  const handleLightboxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
      } else if (e.key === "ArrowLeft") {
        prevImage();
      } else if (e.key === "ArrowRight") {
        nextImage();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images.length]
  );

  return (
    <>
      {/* Breadcrumbs */}
      <div className="border-b bg-muted/30 pt-16">
        <div className="mx-auto max-w-6xl px-6 py-4 lg:px-12">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/aanbod">Aanbod</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-[200px] truncate">
                  {property.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-12">
        {/* Back link */}
        <Link
          href="/aanbod"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Terug naar aanbod
        </Link>

        {/* Gallery */}
        <div className="mb-8">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            {/* Main image */}
            <button
              type="button"
              className="group relative aspect-[16/10] cursor-pointer overflow-hidden rounded-xl bg-muted text-left md:aspect-auto"
              onClick={() => setLightboxOpen(true)}
              aria-label="Open foto galerij"
            >
              {currentImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentImage}
                  alt={property.title}
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Building2 className="size-16 opacity-20" />
                </div>
              )}

              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Vorige foto"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevImage();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        prevImage();
                      }
                    }}
                    className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-lg transition-all hover:bg-background"
                  >
                    <ChevronLeft className="size-5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Volgende foto"
                    onClick={(e) => {
                      e.stopPropagation();
                      nextImage();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        nextImage();
                      }
                    }}
                    className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-lg transition-all hover:bg-background"
                  >
                    <ChevronRight className="size-5" />
                  </span>
                </>
              )}

              {/* Image count badge */}
              {images.length > 0 && (
                <div className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
                  {currentImageIndex + 1} / {images.length}
                </div>
              )}

              {/* Badges */}
              <div className="absolute left-3 top-3 flex gap-2">
                {property.isNew && (
                  <Badge className="border-0 bg-primary text-primary-foreground shadow-lg">
                    <Sparkles className="mr-1 size-3" />
                    Nieuw
                  </Badge>
                )}
                {property.isFeatured && (
                  <Badge
                    variant="secondary"
                    className="border-0 bg-background/90 shadow-lg backdrop-blur-sm"
                  >
                    Uitgelicht
                  </Badge>
                )}
              </div>
            </button>

            {/* Thumbnail grid */}
            <div className="hidden gap-3 md:grid md:grid-rows-3">
              {images.slice(0, 3).map((img, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={cn(
                    "relative overflow-hidden rounded-xl bg-muted transition-all",
                    currentImageIndex === index
                      ? "ring-2 ring-primary ring-offset-2"
                      : "hover:opacity-80"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img}
                    alt={`${property.title} - foto ${index + 1}`}
                    className="size-full object-cover"
                  />
                  {index === 2 && images.length > 3 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg font-semibold text-white">
                      +{images.length - 3} foto&apos;s
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Share action bar */}
        <div className="mb-8 flex items-center gap-2 rounded-xl border bg-muted/30 p-3">
          <FavoriteButton
            propertyId={property.id}
            size="md"
            className="rounded-lg"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: property.title,
                    text: `Bekijk dit horecapand: ${property.title}`,
                    url: window.location.href,
                  });
                } else {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("Link gekopieerd!");
                }
              } catch {
                // User cancelled share dialog — ignore
              }
            }}
          >
            <Share2 className="mr-1.5 size-4" />
            Delen
          </Button>
          <WhatsAppButton title={property.title} slug={property.slug} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden sm:flex"
          >
            <Printer className="mr-1.5 size-4" />
            Print
          </Button>
        </div>

        {/* Content grid */}
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* LEFT: Main content */}
          <div className="min-h-[80vh]">
            {/* Header */}
            <div className="mb-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1"
                >
                  {propertyTypeIcons[property.propertyType]}
                  {PropertyTypeLabels[property.propertyType]}
                </Badge>
                <Badge variant="outline">
                  {PriceTypeLabels[priceType] || priceType}
                </Badge>
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {property.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  <span>
                    {property.address}
                    {property.city ? `, ${property.city}` : ""}
                  </span>
                </div>
                {area > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Maximize2 className="size-4" />
                    <span>{area} m²</span>
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="mt-4">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {priceDisplay}
                </span>
                {priceSuffix && (
                  <span className="text-lg text-muted-foreground">
                    {priceSuffix}
                  </span>
                )}
              </div>
            </div>

            <Separator className="mb-6" />

            {/* Quick stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border bg-card p-4 text-center">
                <Maximize2 className="mx-auto mb-2 size-5 text-primary" />
                <p className="text-lg font-semibold">{area} m²</p>
                <p className="text-xs text-muted-foreground">Oppervlakte</p>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <Users className="mx-auto mb-2 size-5 text-primary" />
                <p className="text-lg font-semibold">
                  {property.seatingCapacityInside ||
                    property.seatingCapacityOutside ||
                    "—"}
                </p>
                <p className="text-xs text-muted-foreground">Zitplaatsen</p>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <Tag className="mx-auto mb-2 size-5 text-primary" />
                <p className="text-lg font-semibold">
                  {PriceTypeLabels[priceType] || "—"}
                </p>
                <p className="text-xs text-muted-foreground">Aanbod type</p>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <Calendar className="mx-auto mb-2 size-5 text-primary" />
                <p className="text-lg font-semibold">
                  {property.availableFrom
                    ? new Date(property.availableFrom).toLocaleDateString(
                        "nl-NL",
                        { month: "short", year: "numeric" }
                      )
                    : "Direct"}
                </p>
                <p className="text-xs text-muted-foreground">Beschikbaar</p>
              </div>
            </div>

            {/* AI Interieur Preview / Studio */}
            <Separator className="my-6" />
            <AiInterieurSection
              propertyId={property.id}
              propertySlug={property.slug}
              propertyTitle={property.title}
              sourceImageUrl={bestStagingImageUrl ?? property.images?.[0]?.originalUrl ?? ""}
              demoConcepts={demoConcepts || []}
              publishedAiMedia={publishedAiMedia}
              isLoggedIn={!!isLoggedIn}
              teaserStyle={teaserStyle ?? undefined}
              aiQuota={aiQuota ?? undefined}
            />
            <Separator className="mb-6" />

            {/* Tabs */}
            <Tabs defaultValue="algemeen" className="w-full">
              <TabsList className="mb-6 w-full justify-start">
                <TabsTrigger value="algemeen">Algemeen</TabsTrigger>
                <TabsTrigger value="kenmerken">Kenmerken</TabsTrigger>
                <TabsTrigger value="locatie">Locatie</TabsTrigger>
              </TabsList>

              <TabsContent value="algemeen" className="space-y-6">
                {/* Description */}
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Beschrijving</h2>
                  <p className="whitespace-pre-line text-muted-foreground leading-relaxed">
                    {property.description ||
                      "Geen beschrijving beschikbaar voor dit pand."}
                  </p>
                </div>

                {/* Key details */}
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Details</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "Type", value: PropertyTypeLabels[property.propertyType] },
                      { label: "Oppervlakte", value: `${area} m²` },
                      { label: "Prijs type", value: PriceTypeLabels[priceType] || priceType },
                      { label: "Stad", value: property.city },
                      { label: "Provincie", value: property.province || "—" },
                      {
                        label: "Bouwjaar",
                        value: property.buildYear
                          ? String(property.buildYear)
                          : "Onbekend",
                      },
                      {
                        label: "Energielabel",
                        value: property.energyLabel || "Onbekend",
                      },
                      {
                        label: "Monument",
                        value: property.monumentStatus ? "Ja" : "Nee",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="kenmerken" className="space-y-6">
                <div>
                  <h2 className="mb-3 text-lg font-semibold">
                    Kenmerken &amp; Faciliteiten
                  </h2>
                  {features.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {features.map((feature) => (
                        <div
                          key={feature}
                          className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
                        >
                          <CheckCircle2 className="size-5 shrink-0 text-primary" />
                          <span className="text-sm font-medium">
                            {PropertyFeatureLabels[
                              feature as keyof typeof PropertyFeatureLabels
                            ] || feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Geen kenmerken beschikbaar voor dit pand.
                    </p>
                  )}
                </div>

                {/* Horeca specifics */}
                <div>
                  <h2 className="mb-3 text-lg font-semibold">
                    Horeca Specificaties
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: "Terras",
                        value: property.hasTerrace ? "Ja" : "Nee",
                      },
                      {
                        label: "Parkeren",
                        value: property.hasParking ? "Ja" : "Nee",
                      },
                      {
                        label: "Kelder",
                        value: property.hasBasement ? "Ja" : "Nee",
                      },
                      {
                        label: "Opslag",
                        value: property.hasStorage ? "Ja" : "Nee",
                      },
                    ]
                      .filter((item) => item.value === "Ja")
                      .map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
                        >
                          <CheckCircle2 className="size-5 shrink-0 text-primary" />
                          <span className="text-sm font-medium">
                            {item.label}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="locatie" className="space-y-6">
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Locatie</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "Adres", value: property.address },
                      { label: "Stad", value: property.city },
                      {
                        label: "Postcode",
                        value: property.postalCode || "—",
                      },
                      {
                        label: "Provincie",
                        value: property.province || "—",
                      },
                      {
                        label: "Buurt",
                        value: property.neighborhood || "—",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Map */}
                {property.latitude != null && property.longitude != null ? (
                  <PropertyDetailMap
                    latitude={property.latitude}
                    longitude={property.longitude}
                    title={property.title}
                    className="aspect-[16/9]"
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border bg-muted/30">
                    <div className="flex aspect-[16/9] items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <MapPin className="mx-auto mb-3 size-10 opacity-30" />
                        <p className="font-medium">
                          {property.address}, {property.city}
                        </p>
                        <p className="mt-1 text-sm">
                          Geen locatiegegevens beschikbaar
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Buurtintelligentie */}
                {property.latitude != null && property.longitude != null && (
                  <>
                    <BuurtIntelligence
                      lat={property.latitude}
                      lng={property.longitude}
                      radius={500}
                      onAnalysisLoaded={handleAnalysisLoaded}
                    />
                    <ConceptSuggestions
                      lat={property.latitude}
                      lng={property.longitude}
                      surface={property.surfaceTotal || 100}
                      sharedAnalysis={sharedAnalysis}
                    />
                    <ConceptChecker
                      lat={property.latitude}
                      lng={property.longitude}
                      radius={500}
                    />
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT: Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            {/* Contact form card */}
            <Card className="overflow-hidden">
              <div className="bg-primary/5 p-6">
                <h3 className="text-lg font-semibold">Interesse?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Laat je gegevens achter en de makelaar neemt contact met je op
                </p>
              </div>
              <CardContent className="p-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitStatus("idle");
                    startTransition(async () => {
                      const result = await createInquiry({
                        propertyId: property.id,
                        name: formState.name,
                        email: formState.email,
                        phone: formState.phone,
                        message: formState.message,
                      });
                      if (!result.success) {
                        setSubmitStatus("error");
                      } else {
                        setSubmitStatus("success");
                        setFormState((s) => ({
                          ...s,
                          name: "",
                          email: "",
                          phone: "",
                          message: `Beste makelaar,\n\nIk heb interesse in "${property.title}" en zou graag meer informatie ontvangen.\n\nMet vriendelijke groet`,
                        }));
                      }
                    });
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="name"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Naam *
                    </label>
                    <Input
                      id="name"
                      required
                      placeholder="Je volledige naam"
                      value={formState.name}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      E-mail *
                    </label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="je@email.nl"
                      value={formState.email}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, email: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Telefoonnummer
                    </label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="06-12345678"
                      value={formState.phone}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, phone: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="message"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Bericht
                    </label>
                    <Textarea
                      id="message"
                      rows={5}
                      value={formState.message}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, message: e.target.value }))
                      }
                    />
                  </div>
                  {submitStatus === "success" && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                      Bedankt voor je interesse! De makelaar neemt spoedig contact met je op.
                    </div>
                  )}
                  {submitStatus === "error" && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                      Er ging iets mis. Probeer het opnieuw.
                    </div>
                  )}
                  <Button type="submit" className="w-full" size="lg" disabled={isPending || submitStatus === "success"}>
                    <Mail className="mr-2 size-4" />
                    {isPending ? "Versturen..." : submitStatus === "success" ? "Verstuurd!" : "Verstuur interesse"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Bezichtiging + Telefoon */}
            <div className="mt-4 space-y-2">
              <ViewingRequestDialog
                propertyId={property.id}
                propertyTitle={property.title}
              />
              <RevealPhone
                phone={property.agency?.phone || null}
                agencyName={property.agency?.name}
              />
            </div>


            {/* Agent info */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Building2 className="size-6" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {property.agency?.name || "Horecagrond Makelaardij"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Makelaar
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="space-y-2 text-sm">
                  {property.agency?.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4" />
                      <span>{property.agency.phone}</span>
                    </div>
                  )}
                  {property.agency?.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="size-4" />
                      <span>{property.agency.email}</span>
                    </div>
                  )}
                  {!property.agency?.phone && !property.agency?.email && (
                    <p className="text-muted-foreground">Contactgegevens niet beschikbaar</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Pand Adviseur */}
            <div className="mt-4">
              <PropertyAdvisor
                propertySlug={property.slug}
                propertyTitle={property.title}
                propertyType={property.propertyType}
                city={property.city}
              />
            </div>

            {/* Neighborhood info */}
            <NeighborhoodInfo city={property.city} neighborhood={property.neighborhood} className="mt-4" />

            {/* Recently viewed */}
            <RecentlyViewed currentId={property.id} />
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label="Foto galerij"
          tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 outline-none"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={handleLightboxKeyDown}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            aria-label="Galerij sluiten"
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                aria-label="Vorige foto"
                className="absolute left-4 flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                aria-label="Volgende foto"
                className="absolute right-4 flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}

          <div
            className="max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImage}
              alt={`${property.title} - foto ${currentImageIndex + 1}`}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
            {currentImageIndex + 1} / {images.length}
          </div>
        </div>
      )}

      {/* Similar properties */}
      <div className="mx-auto max-w-6xl px-6 pb-12 lg:px-12">
        <SimilarProperties properties={similarProperties} />
      </div>

      <SaveReminderBar propertyId={property.id} />
    </>
  );
}
