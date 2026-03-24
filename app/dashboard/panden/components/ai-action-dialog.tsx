"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CircleNotch,
  Copy,
  Check,
  FloppyDisk,
  TextAa,
  ShareNetwork,
  Lightbulb,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiActionType = "description" | "social" | "advice";

export interface DescriptionResultData {
  description: string;
  shortDescription: string;
  highlights: string[];
}

export interface SocialResultData {
  instagram: string;
  linkedin: string;
  facebook: string;
}

export interface AdviceResultData {
  advice: string;
  suggestions: string[];
}

export type AiActionResultData =
  | DescriptionResultData
  | SocialResultData
  | AdviceResultData;

interface AiActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: AiActionType | null;
  propertyTitle: string;
  loading: boolean;
  error: string | null;
  result: AiActionResultData | null;
  onSave?: () => void;
  saving?: boolean;
}

// ---------------------------------------------------------------------------
// Config per action type
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<
  AiActionType,
  { title: string; description: string; icon: React.ReactNode }
> = {
  description: {
    title: "AI Beschrijving",
    description: "Automatisch gegenereerde beschrijving voor dit pand",
    icon: <TextAa className="h-5 w-5" />,
  },
  social: {
    title: "AI Social Posts",
    description: "Kant-en-klare social media posts",
    icon: <ShareNetwork className="h-5 w-5" />,
  },
  advice: {
    title: "AI Advies",
    description: "Analyse en verbetervoorstellen voor deze listing",
    icon: <Lightbulb className="h-5 w-5" />,
  },
};

// ---------------------------------------------------------------------------
// Copy Button
// ---------------------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Gekopieerd");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopiëren mislukt");
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 text-xs text-muted-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label ?? "Kopieer"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Section Wrapper
// ---------------------------------------------------------------------------

function Section({
  label,
  children,
  copyText,
}: {
  label: string;
  children: React.ReactNode;
  copyText?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result Renderers
// ---------------------------------------------------------------------------

function DescriptionResult({
  result,
  onSave,
  saving,
}: {
  result: DescriptionResultData;
  onSave?: () => void;
  saving?: boolean;
}) {
  const { description = "", shortDescription = "", highlights = [] } = result;

  return (
    <div className="space-y-4">
      <Section label="Beschrijving" copyText={description}>
        {description}
      </Section>

      {shortDescription && (
        <Section label="Korte beschrijving" copyText={shortDescription}>
          {shortDescription}
        </Section>
      )}

      {highlights.length > 0 && (
        <Section
          label="Highlights"
          copyText={highlights.map((h) => `- ${h}`).join("\n")}
        >
          <ul className="list-disc space-y-1 pl-4">
            {highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </Section>
      )}

      {onSave && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving} size="sm">
              {saving ? (
                <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FloppyDisk className="mr-2 h-4 w-4" />
              )}
              Opslaan
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SocialResult({ result }: { result: SocialResultData }) {
  const { instagram = "", linkedin = "", facebook = "" } = result;

  return (
    <div className="space-y-4">
      {instagram && (
        <Section label="Instagram" copyText={instagram}>
          {instagram}
        </Section>
      )}
      {linkedin && (
        <Section label="LinkedIn" copyText={linkedin}>
          {linkedin}
        </Section>
      )}
      {facebook && (
        <Section label="Facebook" copyText={facebook}>
          {facebook}
        </Section>
      )}
    </div>
  );
}

function AdviceResult({ result }: { result: AdviceResultData }) {
  const { advice = "", suggestions = [] } = result;

  return (
    <div className="space-y-4">
      {advice && (
        <Section label="Analyse" copyText={advice}>
          {advice}
        </Section>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Verbetervoorstellen
          </span>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog Component
// ---------------------------------------------------------------------------

export function AiActionDialog({
  open,
  onOpenChange,
  type,
  propertyTitle,
  loading,
  error,
  result,
  onSave,
  saving,
}: AiActionDialogProps) {
  if (!type) return null;

  const config = ACTION_CONFIG[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md",
                "bg-primary/10 text-primary"
              )}
            >
              {config.icon}
            </span>
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {config.description} &mdash;{" "}
            <span className="font-medium text-foreground">
              {propertyTitle}
            </span>
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <CircleNotch className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Even geduld...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Idle — no result yet */}
        {!loading && !error && !result && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-sm text-muted-foreground">
              Resultaat verschijnt hier na verwerking.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && !error && result && (
          <>
            {type === "description" && (
              <DescriptionResult
                result={result as DescriptionResultData}
                onSave={onSave}
                saving={saving}
              />
            )}
            {type === "social" && (
              <SocialResult result={result as SocialResultData} />
            )}
            {type === "advice" && (
              <AdviceResult result={result as AdviceResultData} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
