"use client";

import { motion } from "motion/react";
import {
  Seal,
  ChatCircle,
  Lightning,
  CalendarBlank,
  Envelope,
  NavigationArrow,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ReportMatchCard } from "@/components/intelligence/report/report-match-card";
import type { SharedReportData } from "@/components/intelligence/report/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

const EASE_OUT_QUART: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT_QUART },
  },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SharedReportContentProps {
  data: SharedReportData;
}

export function SharedReportContent({ data }: SharedReportContentProps) {
  const displayName = data.clientName ?? data.profileName;

  return (
    <motion.div
      className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16 print:py-6 print:px-0"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ----------------------------------------------------------------- */}
      {/* Report Header                                                     */}
      {/* ----------------------------------------------------------------- */}
      <motion.header variants={itemVariants} className="mb-10 sm:mb-14">
        {/* Brand + Document type */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  H
                </span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Horecagrond
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Overname Intelligence Rapport
            </h1>
          </div>
          <Badge
            variant="outline"
            className="hidden shrink-0 gap-1.5 sm:inline-flex"
          >
            <Seal weight="fill" className="h-3.5 w-3.5 text-primary" />
            Vertrouwelijk
          </Badge>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3 sm:gap-6 sm:p-6">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Opgesteld voor
            </p>
            <p className="text-sm font-semibold text-foreground">
              {displayName}
            </p>
            {data.clientName && data.profileName !== data.clientName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Profiel: {data.profileName}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Door
            </p>
            <p className="text-sm font-semibold text-foreground">
              Horecagrond Makelaardij
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Datum
            </p>
            <p className="text-sm font-semibold text-foreground">
              {formatDate(data.createdAt)}
            </p>
          </div>
        </div>
      </motion.header>

      {/* ----------------------------------------------------------------- */}
      {/* Custom note from makelaar                                         */}
      {/* ----------------------------------------------------------------- */}
      {data.customNote && (
        <motion.section variants={itemVariants} className="mb-10 sm:mb-14">
          <div className="rounded-xl border-l-4 border-l-primary bg-card p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <ChatCircle
                weight="fill"
                className="h-4 w-4 text-primary"
              />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Persoonlijke notitie van uw makelaar
              </p>
            </div>
            <blockquote className="text-sm leading-relaxed text-foreground italic">
              &ldquo;{data.customNote}&rdquo;
            </blockquote>
          </div>
        </motion.section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Match Cards                                                       */}
      {/* ----------------------------------------------------------------- */}
      <motion.section variants={itemVariants}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Lightning weight="fill" className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Geselecteerde Kansen
            </h2>
            <p className="text-xs text-muted-foreground">
              {data.matchCount} bedrijf
              {data.matchCount === 1 ? "" : "en"} geselecteerd op basis van uw
              zoekprofiel
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {data.matches.map((match, index) => (
            <motion.div
              key={`${match.business.name}-${index}`}
              variants={itemVariants}
            >
              <ReportMatchCard match={match} />
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ----------------------------------------------------------------- */}
      {/* Call to Action                                                     */}
      {/* ----------------------------------------------------------------- */}
      <motion.section
        variants={itemVariants}
        className="mt-12 sm:mt-16"
      >
        <Separator className="mb-10" />
        <div className="rounded-xl border bg-card p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <NavigationArrow
              weight="fill"
              className="h-5 w-5 text-primary"
            />
          </div>
          <h3 className="mb-2 text-lg font-bold text-foreground">
            Interesse in een van deze kansen?
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            Uw makelaar staat klaar om u verder te helpen. Plan een
            vrijblijvend gesprek of vraag meer informatie aan over een
            specifiek bedrijf.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg">
              <Envelope className="mr-2 h-4 w-4" />
              Neem contact op
            </Button>
            <Button variant="outline" size="lg">
              <CalendarBlank className="mr-2 h-4 w-4" />
              Plan een gesprek
            </Button>
          </div>
        </div>
      </motion.section>

      {/* ----------------------------------------------------------------- */}
      {/* Footer                                                            */}
      {/* ----------------------------------------------------------------- */}
      <motion.footer
        variants={itemVariants}
        className="mt-10 text-center"
      >
        <Separator className="mb-6" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary">
              <span className="text-[10px] font-bold text-primary-foreground">
                H
              </span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Gegenereerd door Horecagrond.nl
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Dit rapport is vertrouwelijk en uitsluitend bedoeld voor de
            geadresseerde. Verspreiding is niet toegestaan.
          </p>
        </div>
      </motion.footer>
    </motion.div>
  );
}
