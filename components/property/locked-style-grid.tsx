"use client";

import Image from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface LockedStyleGridProps {
  /** The active/visible teaser concept */
  teaserConcept: {
    id: string;
    style: string;
    imageUrl: string;
  } | null;
  /** Sign up URL for CTA */
  signUpUrl: string;
  /** Callback when locked thumbnail is clicked */
  onLockedClick?: () => void;
}

/** Readable style labels */
const styleLabels: Record<string, string> = {
  restaurant_modern: "Modern Restaurant",
  restaurant_klassiek: "Klassiek Restaurant",
  cafe_gezellig: "Gezellig Cafe",
  bar_lounge: "Bar & Lounge",
  hotel_boutique: "Boutique Hotel",
  lunchroom_hip: "Hip Lunchroom",
};

/** All 6 styles in display order */
const ALL_STYLES = [
  "restaurant_modern",
  "restaurant_klassiek",
  "cafe_gezellig",
  "bar_lounge",
  "hotel_boutique",
  "lunchroom_hip",
];

export function LockedStyleGrid({
  teaserConcept,
  signUpUrl,
  onLockedClick,
}: LockedStyleGridProps) {
  // Put the teaser style first, then remaining styles
  const teaserStyle = teaserConcept?.style;
  const orderedStyles = teaserStyle
    ? [teaserStyle, ...ALL_STYLES.filter((s) => s !== teaserStyle)]
    : ALL_STYLES;

  return (
    <div className="grid grid-cols-3 gap-2">
      {orderedStyles.slice(0, 6).map((style, index) => {
        const isTeaser = index === 0 && teaserConcept;

        if (isTeaser) {
          // Active teaser -- clear, no blur
          return (
            <div
              key={style}
              className="relative aspect-video overflow-hidden rounded-lg border-2 border-primary ring-1 ring-primary/20"
            >
              <Image
                src={teaserConcept.imageUrl}
                alt={styleLabels[style] || style}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                <span className="text-[10px] font-medium text-white">
                  {styleLabels[style] || style}
                </span>
              </div>
            </div>
          );
        }

        // Locked styles -- blurred with lock overlay
        return (
          <a
            key={style}
            href={signUpUrl}
            onClick={onLockedClick}
            className="group relative aspect-video overflow-hidden rounded-lg border-2 border-transparent transition-colors hover:border-muted-foreground/30"
          >
            {/* Blurred background -- use teaser image or a gradient placeholder */}
            {teaserConcept?.imageUrl ? (
              <Image
                src={teaserConcept.imageUrl}
                alt={styleLabels[style] || style}
                fill
                className="object-cover blur-md brightness-75 saturate-50 transition-all group-hover:blur-lg"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 bg-muted" />
            )}

            {/* Lock overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>

            {/* Style label */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
              <span className="text-[10px] font-medium text-white">
                {styleLabels[style] || style}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
