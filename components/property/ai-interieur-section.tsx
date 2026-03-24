"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wand2,
  Loader2,
  Lock,
  Pencil,
  Sparkles,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BeforeAfterSlider } from "@/components/property/before-after-slider";
import { triggerVirtualStaging } from "@/app/actions/ai-visualize";
import { trackDreamInteraction } from "@/app/actions/public-demo-concepts";
import type { DemoConceptData } from "@/app/actions/public-demo-concepts";
import type {
  PublishedAiMedia,
  PublishedAiImage,
} from "@/app/actions/public-ai-media";

const InpaintEditorModal = lazy(() =>
  import("@/components/property/inpaint-editor-modal").then((m) => ({
    default: m.InpaintEditorModal,
  }))
);

/* -------------------------------------------------------------------------- */
/*  Types & constants                                                          */
/* -------------------------------------------------------------------------- */

interface AiInterieurSectionProps {
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  sourceImageUrl: string;
  demoConcepts: DemoConceptData[];
  publishedAiMedia?: PublishedAiMedia;
  isLoggedIn: boolean;
  teaserStyle?: string;
  aiQuota?: {
    freeEditsUsed: number;
    freeEditsLimit: number;
    remaining: number;
    totalEdits: number;
  };
}

/** Custom generation styles */
const generateStyles = [
  { value: "specialty_coffee", label: "Specialty Coffee" },
  { value: "wine_tapas", label: "Wijnbar & Tapas" },
  { value: "bakery_brunch", label: "Bakkerij & Brunch" },
  { value: "healthy_bar", label: "Healthy Bar" },
  { value: "restaurant_modern", label: "Modern Restaurant" },
  { value: "industrial_loft", label: "Industrial Loft" },
];

/** Readable style labels for all concept types */
const styleLabels: Record<string, string> = {
  restaurant_modern: "Modern Restaurant",
  restaurant_klassiek: "Klassiek Restaurant",
  cafe_gezellig: "Gezellig Cafe",
  bar_lounge: "Bar & Lounge",
  hotel_boutique: "Boutique Hotel",
  lunchroom_hip: "Hip Lunchroom",
  specialty_coffee: "Specialty Coffee",
  wine_tapas: "Wijnbar & Tapas",
  bakery_brunch: "Bakkerij & Brunch",
  healthy_bar: "Healthy Bar",
  industrial_loft: "Industrial Loft",
};

/** All demo concept styles for locked grid (guests) */
const ALL_DEMO_STYLES = [
  "restaurant_modern",
  "restaurant_klassiek",
  "cafe_gezellig",
  "bar_lounge",
  "hotel_boutique",
  "lunchroom_hip",
];

const AI_DISCLAIMER =
  "Deze visualisaties zijn AI-gegenereerd en dienen ter inspiratie. Het werkelijke pand kan afwijken.";

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AiInterieurSection({
  propertyId,
  propertySlug,
  propertyTitle,
  sourceImageUrl,
  demoConcepts,
  publishedAiMedia,
  isLoggedIn,
  teaserStyle,
  aiQuota,
}: AiInterieurSectionProps) {
  /* -- Determine teaser concept for guests -------------------------------- */
  const teaserConcept = teaserStyle
    ? (demoConcepts.find((c) => c.style === teaserStyle) ??
      demoConcepts[0] ??
      null)
    : (demoConcepts[0] ?? null);

  /* -- Active display state ----------------------------------------------- */
  const [activeConcept, setActiveConcept] = useState<DemoConceptData | null>(
    isLoggedIn ? (demoConcepts[0] ?? null) : teaserConcept
  );
  const [activePublishedImage, setActivePublishedImage] =
    useState<PublishedAiImage | null>(null);

  /* -- Generate state ----------------------------------------------------- */
  const [style, setStyle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* -- Editor modal state ------------------------------------------------- */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSourceUrl, setEditorSourceUrl] = useState("");
  const [editorConceptId, setEditorConceptId] = useState<string | undefined>();

  const signUpUrl = `/sign-up?source=ai_preview&property=${propertySlug}`;
  const aiImages = publishedAiMedia?.aiImages ?? [];
  const remaining = aiQuota ? aiQuota.remaining : -1;
  const isLimitReached = remaining === 0;

  /* -- Derived slider state ----------------------------------------------- */
  const sliderResult = generatedImage
    ? generatedImage
    : activePublishedImage
      ? activePublishedImage.resultImageUrl
      : (activeConcept?.imageUrl ?? null);

  const sliderOriginal = activePublishedImage
    ? activePublishedImage.originalImageUrl
    : sourceImageUrl;

  /* -- Track view on mount ------------------------------------------------ */
  useEffect(() => {
    trackDreamInteraction(propertyId, "view").catch(() => {});
  }, [propertyId]);

  /* -- Generate handler --------------------------------------------------- */
  async function handleGenerate() {
    if (!style || !isLoggedIn || !sourceImageUrl) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setActivePublishedImage(null);

    const result = await triggerVirtualStaging({
      propertyId,
      imageUrl: sourceImageUrl,
      style,
    });

    setIsGenerating(false);

    if (!result.success) {
      setError(result.error || "Kon de visualisatie niet starten");
      return;
    }

    setGeneratedImage(result.data!.resultUrl);
  }

  /* -- Open inpaint editor ------------------------------------------------ */
  function openEditor() {
    const url = sliderResult || sourceImageUrl;
    if (!url) return;
    setEditorSourceUrl(url);
    setEditorConceptId(activeConcept?.id);
    setEditorOpen(true);
  }

  /* -- Select a concept --------------------------------------------------- */
  function selectConcept(concept: DemoConceptData) {
    setActiveConcept(concept);
    setActivePublishedImage(null);
    setGeneratedImage(null);
    setError(null);
    trackDreamInteraction(propertyId, "style_click", concept.style).catch(
      () => {}
    );
  }

  /* -- Build ordered styles for guest locked grid ------------------------- */
  const guestOrderedStyles = teaserConcept
    ? [
        teaserConcept.style,
        ...ALL_DEMO_STYLES.filter((s) => s !== teaserConcept.style),
      ]
    : ALL_DEMO_STYLES;

  /* ======================================================================== */
  /*  Render                                                                   */
  /* ======================================================================== */

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* ================================================================= */}
      {/*  HEADER                                                            */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight text-foreground">
              AI Interieur
            </h3>
            <p className="text-xs text-muted-foreground">
              Bekijk {propertyTitle} in verschillende stijlen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isLoggedIn && remaining >= 0 && (
            <Badge
              variant="outline"
              className="text-[10px] tabular-nums font-normal"
            >
              {remaining} over
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="text-[10px] font-medium text-muted-foreground"
          >
            Beta
          </Badge>
        </div>
      </div>

      {/* ================================================================= */}
      {/*  MAIN VISUAL — Before/After Slider                                 */}
      {/* ================================================================= */}
      <div className="relative px-5 pb-3">
        {sliderResult && sliderOriginal ? (
          <div className="relative">
            <BeforeAfterSlider
              originalUrl={sliderOriginal}
              resultUrl={sliderResult}
            />

            {/* Edit button overlay */}
            {isLoggedIn && !isGenerating && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute right-3 bottom-3 gap-1.5 border border-white/20 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 hover:text-white"
                onClick={openEditor}
                disabled={isLimitReached}
              >
                <Pencil className="h-3 w-3" />
                Bewerk
              </Button>
            )}
          </div>
        ) : (
          /* Placeholder when no concepts exist */
          <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl bg-muted/40">
            {sourceImageUrl ? (
              <>
                <Image
                  src={sourceImageUrl}
                  alt={propertyTitle}
                  fill
                  className="object-cover opacity-30"
                  unoptimized
                />
                <div className="relative z-10 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Wand2 className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    AI concepten binnenkort beschikbaar
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <Wand2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  AI preview binnenkort beschikbaar
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading overlay — solid dark, covers the slider cleanly */}
        {isGenerating && (
          <div className="absolute inset-x-5 inset-y-0 z-20 flex items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
            {/* Subtle animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-800" />
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />

            <div className="relative text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <Loader2 className="h-5 w-5 animate-spin text-white/80" />
              </div>
              <p className="text-sm font-medium text-white">
                AI genereert jouw stijl
              </p>
              <p className="mt-1 text-xs text-white/40">
                Dit duurt 30-60 seconden
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/*  STYLE STRIP — Logged-in users: clickable concepts                 */}
      {/* ================================================================= */}
      {isLoggedIn && demoConcepts.length > 0 && !isGenerating && (
        <div className="px-5 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {demoConcepts.slice(0, 6).map((concept) => {
              const isActive =
                activeConcept?.id === concept.id &&
                !activePublishedImage &&
                !generatedImage;

              return (
                <button
                  key={concept.id}
                  onClick={() => selectConcept(concept)}
                  className={cn(
                    "relative h-14 w-24 shrink-0 overflow-hidden rounded-lg transition-all",
                    isActive
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-card"
                      : "opacity-75 hover:opacity-100"
                  )}
                >
                  <Image
                    src={concept.imageUrl}
                    alt={styleLabels[concept.style] || concept.style}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                    <span className="text-[9px] font-medium leading-tight text-white">
                      {styleLabels[concept.style] || concept.style}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  PUBLISHED AI IMAGES (makelaar) — inline strip                     */}
      {/* ================================================================= */}
      {aiImages.length > 0 && !isGenerating && (
        <div className="px-5 pb-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            AI-verbeterde foto&apos;s
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {aiImages.map((img, i) => (
              <button
                key={img.id}
                onClick={() => {
                  setActivePublishedImage(img);
                  setGeneratedImage(null);
                }}
                className={cn(
                  "relative h-14 w-24 shrink-0 overflow-hidden rounded-lg transition-all",
                  activePublishedImage?.id === img.id
                    ? "ring-2 ring-primary ring-offset-1 ring-offset-card"
                    : "opacity-75 hover:opacity-100"
                )}
              >
                <img
                  src={img.resultImageUrl}
                  alt={img.roomType ?? `AI foto ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  GENERATE BAR — Logged-in: compact style selector + button         */}
      {/* ================================================================= */}
      {isLoggedIn && !isGenerating && (
        <div className="border-t px-5 py-3">
          {/* Error display — subtle inline */}
          {error && (
            <p className="mb-2 text-xs text-destructive">{error}</p>
          )}

          {isLimitReached ? (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary/60" />
                <span className="text-xs text-muted-foreground">
                  Je gratis bewerkingen zijn op
                </span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Bekijk opties
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="h-9 flex-1 text-xs">
                  <SelectValue placeholder="Kies een stijl om te genereren..." />
                </SelectTrigger>
                <SelectContent>
                  {generateStyles.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleGenerate}
                disabled={!style || !sourceImageUrl || isGenerating}
                size="sm"
                className="h-9 shrink-0 gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Genereer
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/*  GUEST VIEW — Locked styles + CTA                                  */}
      {/* ================================================================= */}
      {!isLoggedIn && (
        <div className="border-t">
          {/* Locked style strip */}
          <div className="px-5 pt-3 pb-2">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Beschikbare stijlen
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {guestOrderedStyles.slice(0, 6).map((s, index) => {
                const isTeaser = index === 0 && teaserConcept;

                if (isTeaser) {
                  return (
                    <div
                      key={s}
                      className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ring-primary ring-offset-1 ring-offset-card"
                    >
                      <Image
                        src={teaserConcept.imageUrl}
                        alt={styleLabels[s] || s}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                        <span className="text-[9px] font-medium text-white">
                          {styleLabels[s] || s}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={s}
                    href={signUpUrl}
                    onClick={() =>
                      trackDreamInteraction(propertyId, "cta_click").catch(
                        () => {}
                      )
                    }
                    className="group relative h-14 w-24 shrink-0 overflow-hidden rounded-lg"
                  >
                    {teaserConcept?.imageUrl ? (
                      <Image
                        src={teaserConcept.imageUrl}
                        alt={styleLabels[s] || s}
                        fill
                        className="object-cover blur-[6px] brightness-50 saturate-50 transition-all group-hover:blur-[8px]"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                        <Lock className="h-3 w-3 text-white/80" />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                      <span className="text-[9px] font-medium text-white/70">
                        {styleLabels[s] || s}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="px-5 pb-4 pt-2">
            <div className="rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4 text-center">
              <p className="mb-1 text-sm font-semibold text-foreground">
                Bekijk alle 6 stijlen
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Plus AI aanpassingen op maat van jouw concept
              </p>
              <Button size="sm" className="gap-1.5" asChild>
                <Link
                  href={signUpUrl}
                  onClick={() =>
                    trackDreamInteraction(propertyId, "cta_click").catch(
                      () => {}
                    )
                  }
                >
                  Gratis aanmelden
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground/70">
                Geen creditcard nodig
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  DISCLAIMER                                                        */}
      {/* ================================================================= */}
      <div className="border-t px-5 py-2">
        <p className="text-center text-[10px] text-muted-foreground/60">
          {AI_DISCLAIMER}
        </p>
      </div>

      {/* ================================================================= */}
      {/*  INPAINT EDITOR MODAL                                              */}
      {/* ================================================================= */}
      {isLoggedIn && editorOpen && (
        <Suspense fallback={null}>
          <InpaintEditorModal
            open={editorOpen}
            onOpenChange={setEditorOpen}
            sourceImageUrl={editorSourceUrl}
            propertyTitle={propertyTitle}
            propertyId={propertyId}
            sourceConceptId={editorConceptId}
            aiQuota={
              aiQuota
                ? {
                    freeEditsUsed: aiQuota.freeEditsUsed,
                    freeEditsLimit: aiQuota.freeEditsLimit,
                  }
                : undefined
            }
            onSuccess={(resultUrl) => {
              setGeneratedImage(resultUrl);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
