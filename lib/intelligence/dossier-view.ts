import type {
  BusinessSourceEvidence,
  CrawledBusinessIntel,
  MonitoredBusiness,
} from "@/generated/prisma/client";
import { extractBrokerInsights } from "@/lib/intelligence/broker-insights";

type BusinessWithIntelAndEvidence = Pick<
  MonitoredBusiness,
  | "name"
  | "city"
  | "businessType"
  | "currentRating"
  | "totalReviews"
  | "priceLevel"
  | "isOpen"
  | "passantenPerDag"
  | "bereikbaarheidOV"
  | "signalScore"
  | "signals"
  | "chainSize"
  | "demografieData"
> & {
  crawledIntel?: Pick<
    CrawledBusinessIntel,
    | "aiDossier"
    | "sourcesCompleted"
    | "crawledAt"
    | "kvkData"
    | "tripadvisorData"
    | "thuisbezorgdData"
    | "allecijfersData"
    | "websiteData"
    | "newsData"
    | "competitorsData"
  > | null;
  sourceEvidence?: Array<
    Pick<
      BusinessSourceEvidence,
      "source" | "status" | "confidence" | "qualityScore" | "fetchedAt" | "expiresAt" | "error"
    >
  >;
};

export interface ParsedAiDossier {
  executiveSummary: string | null;
  takeoverSignals: string | null;
  recommendation: string | null;
}

export interface DossierMatchContext {
  matchScore?: number | null;
  matchBreakdown?: Record<string, number | null | undefined> | null;
}

interface PublicSourceEvidenceItem {
  source: string;
  status: string;
  confidence: string;
  qualityScore: number | null;
  fetchedAt: Date | null;
  expiresAt: Date | null;
  error: string | null;
}

export interface PublicDossierView {
  aiDossier: string | null;
  parsedAiDossier: ParsedAiDossier | null;
  sourcesCompleted: string[];
  confidenceLevel: string;
  crawledAt: Date | null;
  sourceCoverage: ReturnType<typeof extractBrokerInsights>["sourceCoverage"];
  brokerInsights: ReturnType<typeof extractBrokerInsights>;
  brokerDecision: ReturnType<typeof extractBrokerInsights>["brokerDecision"];
  sourceEvidence: PublicSourceEvidenceItem[];
}

const VERDICT_ORDER = [
  "deprioritize",
  "monitor",
  "investigate_now",
  "direct_action",
] as const;

type Verdict = (typeof VERDICT_ORDER)[number];
type ConfidenceLevel = ReturnType<typeof extractBrokerInsights>["confidenceLevel"];

function verdictLabel(verdict: Verdict): string {
  const labels: Record<Verdict, string> = {
    deprioritize: "Lage prioriteit",
    monitor: "Monitoren",
    investigate_now: "Eerst onderbouwen",
    direct_action: "Direct oppakken",
  };

  return labels[verdict];
}

function displayConfidenceLevel(level: ConfidenceLevel): string {
  if (level === "high") return "Hoog";
  if (level === "medium") return "Gemiddeld";
  return "Laag";
}

function downgradeConfidence(
  level: ConfidenceLevel,
  steps: number,
): ConfidenceLevel {
  const order: ConfidenceLevel[] = ["low", "medium", "high"];
  const currentIndex = order.indexOf(level);
  return order[Math.max(0, currentIndex - steps)];
}

function capVerdict(current: Verdict, maximum: Verdict): Verdict {
  const currentIndex = VERDICT_ORDER.indexOf(current);
  const maximumIndex = VERDICT_ORDER.indexOf(maximum);
  return VERDICT_ORDER[Math.min(currentIndex, maximumIndex)];
}

function buildDecisionSummary(
  decision: ReturnType<typeof extractBrokerInsights>["brokerDecision"],
): string {
  const leadReason =
    decision.whyInteresting[0] ??
    "de huidige bronnen geven nog geen harde broker-case";
  const watchout = decision.watchouts[0];

  return watchout
    ? `${decision.verdictLabel}: ${leadReason}. Let op: ${watchout}.`
    : `${decision.verdictLabel}: ${leadReason}.`;
}

function assessEvidenceIntegrity(sourceEvidence: PublicSourceEvidenceItem[]): {
  warnings: string[];
  confidencePenalty: number;
  maxVerdict: Verdict | null;
} {
  const now = new Date();
  const warnings: string[] = [];
  let confidencePenalty = 0;
  let maxVerdict: Verdict | null = null;

  for (const item of sourceEvidence) {
    const isCritical = ["kvk", "website", "thuisbezorgd", "news"].includes(item.source);
    const isExpired = item.expiresAt != null && item.expiresAt < now;
    const isStale = item.status === "stale" || isExpired;

    if (item.status === "failed" && isCritical) {
      warnings.push(`kritieke bron ${item.source} is mislukt`);
      confidencePenalty = Math.max(confidencePenalty, 2);
      maxVerdict = "monitor";
      continue;
    }

    if (isStale && isCritical) {
      warnings.push(`kritieke bron ${item.source} is verouderd`);
      confidencePenalty = Math.max(confidencePenalty, 1);
      maxVerdict = maxVerdict === "monitor" ? maxVerdict : "investigate_now";
      continue;
    }

    if (item.confidence === "low" && isCritical) {
      warnings.push(`kritieke bron ${item.source} heeft lage betrouwbaarheid`);
      confidencePenalty = Math.max(confidencePenalty, 1);
      maxVerdict = maxVerdict === "monitor" ? maxVerdict : "investigate_now";
    }
  }

  return { warnings, confidencePenalty, maxVerdict };
}

function assessMatchFit(
  context?: DossierMatchContext,
): {
  warnings: string[];
  maxVerdict: Verdict | null;
} {
  if (!context) return { warnings: [], maxVerdict: null };

  const warnings: string[] = [];
  let maxVerdict: Verdict | null = null;
  const matchScore = context.matchScore ?? null;
  const conceptScore = context.matchBreakdown?.concept ?? null;

  if (matchScore != null && matchScore < 60) {
    warnings.push(`profiel-fit is nog matig (${matchScore}/100)`);
    maxVerdict = "monitor";
  } else if (matchScore != null && matchScore < 75) {
    warnings.push(`match vraagt extra validatie vóór outreach (${matchScore}/100)`);
    maxVerdict = maxVerdict ?? "investigate_now";
  }

  if (conceptScore != null && conceptScore < 12) {
    warnings.push(`concept-fit is nog onvoldoende onderbouwd (${conceptScore}/25)`);
    maxVerdict = "monitor";
  } else if (conceptScore != null && conceptScore < 16) {
    warnings.push(`concept-fit vraagt nog makelaarsvalidatie (${conceptScore}/25)`);
    maxVerdict = maxVerdict ?? "investigate_now";
  }

  return { warnings, maxVerdict };
}

function buildAdjustedBrokerDecision(
  decision: ReturnType<typeof extractBrokerInsights>["brokerDecision"],
  sourceEvidence: PublicSourceEvidenceItem[],
  baseConfidenceLevel: ConfidenceLevel,
  context?: DossierMatchContext,
): {
  brokerDecision: ReturnType<typeof extractBrokerInsights>["brokerDecision"];
  confidenceLevel: ConfidenceLevel;
} {
  const evidenceAssessment = assessEvidenceIntegrity(sourceEvidence);
  const matchAssessment = assessMatchFit(context);
  const adjustedConfidence = downgradeConfidence(
    baseConfidenceLevel,
    evidenceAssessment.confidencePenalty,
  );

  let verdict = decision.verdict as Verdict;
  if (evidenceAssessment.maxVerdict) {
    verdict = capVerdict(verdict, evidenceAssessment.maxVerdict);
  }
  if (matchAssessment.maxVerdict) {
    verdict = capVerdict(verdict, matchAssessment.maxVerdict);
  }
  if (adjustedConfidence === "low") {
    verdict = capVerdict(verdict, "monitor");
  }
  if (
    adjustedConfidence === "low" &&
    decision.whyInteresting.length === 0 &&
    (evidenceAssessment.warnings.length > 0 || matchAssessment.warnings.length > 0)
  ) {
    verdict = "deprioritize";
  }

  const watchouts = [
    ...new Set([
      ...matchAssessment.warnings,
      ...evidenceAssessment.warnings,
      ...decision.watchouts,
    ]),
  ].slice(0, 5);

  let nextAction = decision.nextAction;
  if (matchAssessment.maxVerdict === "monitor") {
    nextAction = "Valideer eerst de profiel-fit en concept-fit voordat je brokercapaciteit inzet op outreach.";
  } else if (evidenceAssessment.maxVerdict === "monitor") {
    nextAction = "Herstel of ververs eerst de kritieke bronnen voordat je dit dossier als outreach-ready behandelt.";
  } else if (evidenceAssessment.maxVerdict === "investigate_now") {
    nextAction = "Verifieer eerst de verouderde of zwakke bronnen en ga pas daarna door naar juridische of commerciële follow-up.";
  }

  const confidenceNotes = [
    decision.confidenceNote,
    ...evidenceAssessment.warnings,
    ...matchAssessment.warnings,
  ];

  const brokerDecision = {
    ...decision,
    verdict,
    verdictLabel: verdictLabel(verdict),
    watchouts,
    nextAction,
    confidenceNote: confidenceNotes.join(" "),
  };

  brokerDecision.summary = buildDecisionSummary(brokerDecision);

  return {
    brokerDecision,
    confidenceLevel: adjustedConfidence,
  };
}

function normalizeHeading(value: string): string {
  return value.replace(/^#+\s*/, "").trim().toLowerCase();
}

function extractSection(text: string, headings: string[]): string | null {
  const normalizedHeadings = headings.map((heading) => heading.toLowerCase());
  const lines = text.split("\n");
  const collected: string[] = [];
  let capture = false;

  for (const line of lines) {
    const normalizedLine = normalizeHeading(line);

    if (normalizedHeadings.includes(normalizedLine)) {
      capture = true;
      continue;
    }

    if (capture && line.trim().startsWith("## ")) {
      break;
    }

    if (capture) {
      collected.push(line);
    }
  }

  const section = collected.join("\n").trim();
  return section.length > 0 ? section : null;
}

function parseAiDossier(aiDossier: string | null): ParsedAiDossier | null {
  if (!aiDossier) return null;

  return {
    executiveSummary: extractSection(aiDossier, [
      "1. executive summary",
      "executive summary",
    ]),
    takeoverSignals: extractSection(aiDossier, [
      "7. overname signalen & kansen",
      "overname signalen & kansen",
    ]),
    recommendation: extractSection(aiDossier, [
      "8. aanbeveling",
      "aanbeveling",
    ]),
  };
}

export function buildPublicDossierView(
  business: BusinessWithIntelAndEvidence,
  context?: DossierMatchContext,
): PublicDossierView | null {
  const intel = business.crawledIntel;
  if (!intel) return null;

  const sourceEvidence = (business.sourceEvidence ?? []).map((item) => ({
    source: item.source,
    status: item.status,
    confidence: item.confidence,
    qualityScore: item.qualityScore ?? null,
    fetchedAt: item.fetchedAt ?? null,
    expiresAt: item.expiresAt ?? null,
    error: item.error ?? null,
  }));

  const brokerInsights = extractBrokerInsights(
    {
      ...business,
      crawledIntel: intel as CrawledBusinessIntel,
    },
    intel as CrawledBusinessIntel,
  );
  const adjusted = buildAdjustedBrokerDecision(
    brokerInsights.brokerDecision,
    sourceEvidence,
    brokerInsights.confidenceLevel,
    context,
  );

  return {
    aiDossier: intel.aiDossier,
    parsedAiDossier: parseAiDossier(intel.aiDossier),
    sourcesCompleted: intel.sourcesCompleted,
    confidenceLevel: displayConfidenceLevel(adjusted.confidenceLevel),
    crawledAt: intel.crawledAt,
    sourceCoverage: brokerInsights.sourceCoverage,
    brokerInsights,
    brokerDecision: adjusted.brokerDecision,
    sourceEvidence,
  };
}
