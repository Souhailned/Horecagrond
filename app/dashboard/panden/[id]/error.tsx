"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ContentCard, ContentCardHeader, ContentCardBody } from "@/components/dashboard/content-card";
import { WarningCircle } from "@phosphor-icons/react";

export default function PropertyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Property page error:", error);
  }, [error]);

  return (
    <ContentCard>
      <ContentCardHeader title="Er ging iets mis" />
      <ContentCardBody className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10">
            <WarningCircle className="h-6 w-6 text-destructive" weight="regular" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">Er is een fout opgetreden</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Er ging iets mis bij het laden van dit pand. Probeer het opnieuw of ga terug naar het overzicht.
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground font-mono">Fout-ID: {error.digest}</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
            >
              Probeer opnieuw
            </button>
            <Link
              href="/dashboard/panden"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Terug naar Mijn Panden
            </Link>
          </div>
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}
