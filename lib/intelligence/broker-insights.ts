import type {
  CrawledBusinessIntel,
  MonitoredBusiness,
} from "@/generated/prisma/client";
import {
  buildSourceCoverageReport,
  getAvailableSourceIds,
  INTELLIGENCE_SOURCE_REGISTRY,
  type IntelligenceSourceId,
  type SourceCoverageReport,
} from "@/lib/intelligence/source-registry";

export interface BrokerDecisionDimension {
  status: string;
  label: string;
  reasoning: string;
}

export interface BrokerDecision {
  verdict: "direct_action" | "investigate_now" | "monitor" | "deprioritize";
  verdictLabel: string;
  summary: string;
  whyInteresting: string[];
  watchouts: string[];
  missingCriticalSources: IntelligenceSourceId[];
  nextAction: string;
  confidenceNote: string;
  legalReadiness: BrokerDecisionDimension;
  economicFeasibility: BrokerDecisionDimension;
  transitionPotential: BrokerDecisionDimension;
}

export interface BrokerInsightSummary {
  confidenceLevel: "high" | "medium" | "low";
  sourcesUsed: string[];
  sourceCoverage: SourceCoverageReport;
  conceptSignals: string[];
  serviceModel: string[];
  acquisitionSignals: string[];
  strengths: string[];
  risks: string[];
  brokerAngles: string[];
  summary: string;
  brokerDecision: BrokerDecision;
}

type BusinessWithIntel = Pick<
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
> & { crawledIntel?: MinimalCrawledIntel | null };

type MinimalCrawledIntel = Pick<
  CrawledBusinessIntel,
  | "kvkData"
  | "tripadvisorData"
  | "thuisbezorgdData"
  | "allecijfersData"
  | "websiteData"
  | "newsData"
  | "competitorsData"
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function sourceLabel(source: IntelligenceSourceId): string {
  return INTELLIGENCE_SOURCE_REGISTRY[source]?.label ?? source;
}

function confidenceLabel(level: BrokerInsightSummary["confidenceLevel"]): string {
  if (level === "high") return "hoog";
  if (level === "medium") return "gemiddeld";
  return "laag";
}

function getSourcesUsed(intel: MinimalCrawledIntel | null | undefined): string[] {
  if (!intel) return [];
  return unique([
    intel.kvkData ? "kvk" : null,
    intel.tripadvisorData ? "tripadvisor" : null,
    intel.thuisbezorgdData ? "thuisbezorgd" : null,
    intel.allecijfersData ? "allecijfers" : null,
    intel.websiteData ? "website" : null,
    intel.newsData ? "news" : null,
    intel.competitorsData ? "competitors" : null,
  ]);
}

function extractServiceModel(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
): string[] {
  const website = asRecord(intel?.websiteData);
  const thuisbezorgd = asRecord(intel?.thuisbezorgdData);
  const serviceModes: string[] = [];

  if (website?.hasDelivery === true || thuisbezorgd != null) {
    serviceModes.push("bezorging actief");
  }
  if ((business.businessType ?? "").includes("lunchroom")) {
    serviceModes.push("lunchgericht");
  }
  if (business.isOpen) {
    serviceModes.push("eat-in mogelijk");
  }
  if (business.passantenPerDag != null && business.passantenPerDag > 1500) {
    serviceModes.push("geschikt voor afhaalvolume");
  }

  return unique(serviceModes);
}

function extractConceptSignals(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
): string[] {
  const website = asRecord(intel?.websiteData);
  const thuisbezorgd = asRecord(intel?.thuisbezorgdData);
  const tripadvisor = asRecord(intel?.tripadvisorData);

  return unique([
    business.businessType ? `business type: ${business.businessType}` : null,
    typeof website?.concept === "string" ? `website concept: ${website.concept}` : null,
    Array.isArray(thuisbezorgd?.cuisineTypes) && thuisbezorgd?.cuisineTypes.length > 0
      ? `delivery cuisines: ${(thuisbezorgd.cuisineTypes as string[]).join(", ")}`
      : null,
    typeof tripadvisor?.cuisineType === "string"
      ? `tripadvisor cuisine: ${tripadvisor.cuisineType}`
      : null,
  ]);
}

function extractAcquisitionSignals(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
): string[] {
  const news = asRecord(intel?.newsData);
  const kvk = asRecord(intel?.kvkData);
  const thuisbezorgd = asRecord(intel?.thuisbezorgdData);
  const signals = asRecord(business.signals);
  const results: string[] = [];

  if (signals?.listedForSale === true) {
    results.push("zaak staat expliciet als verkoopkandidaat gemarkeerd");
  }
  if (signals?.newsOvernameSignal === true || news?.hasOvernameSignal === true) {
    results.push("nieuwsbron noemt overname- of verkoopindicatie");
  }
  if (signals?.deliveryRatingLow === true) {
    results.push("delivery rating is laag en biedt ruimte voor operationele verbetering");
  }
  if (signals?.lowRating === true) {
    results.push("Google rating is laag genoeg voor een transitie- of herpositioneringscase");
  }
  if (signals?.ratingDrop === true) {
    results.push("ratingtrend is dalend");
  }
  if (signals?.reviewDecline === true || signals?.stalePresence === true) {
    results.push("online tractie neemt af");
  }
  if (typeof kvk?.ketenGrootte === "number" && kvk.ketenGrootte > 1) {
    results.push(`onderdeel van een keten met ${kvk.ketenGrootte} vestigingen`);
  }
  if (typeof thuisbezorgd?.rating === "number" && thuisbezorgd.rating < 6) {
    results.push(`Thuisbezorgd rating ${thuisbezorgd.rating}/10 is zwak`);
  }

  return results;
}

function extractStrengths(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
): string[] {
  const comp = asRecord(intel?.competitorsData);
  const demo = asRecord(business.demografieData);
  const website = asRecord(intel?.websiteData);
  const results: string[] = [];

  if (business.passantenPerDag != null && business.passantenPerDag >= 2000) {
    results.push(`sterke passantenstroom (~${business.passantenPerDag} p/dag)`);
  }
  if (business.bereikbaarheidOV === "uitstekend" || business.bereikbaarheidOV === "goed") {
    results.push(`OV-bereikbaarheid is ${business.bereikbaarheidOV}`);
  }
  if (business.currentRating != null && business.currentRating >= 4.3 && (business.totalReviews ?? 0) >= 200) {
    results.push(`sterke online reputatie (${business.currentRating}/5 uit ${business.totalReviews} reviews)`);
  }
  if (Array.isArray(comp?.competitors) && comp.competitors.length > 0 && typeof comp.avgRating === "number") {
    results.push(`marktcontext beschikbaar met ${comp.competitors.length} concurrenten`);
  }
  if (website?.hasOnlineReservation === true) {
    results.push("heeft al online reserveringsinfrastructuur");
  }
  if (typeof demo?.dichtheid === "number" && demo.dichtheid > 5000) {
    results.push("ligt in een dichtbevolkte stedelijke zone");
  }

  return results;
}

function extractRisks(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
): string[] {
  const news = asRecord(intel?.newsData);
  const comp = asRecord(intel?.competitorsData);
  const signals = asRecord(business.signals);
  const results: string[] = [];

  if (signals?.negativeSentiment === true) {
    results.push("negatieve review-sentimenten vragen reputatieherstel");
  }
  if (signals?.temporarilyClosed === true || signals?.recentlyClosed === true) {
    results.push("operationele continuiteit is onzeker");
  }
  if (signals?.fewReviews === true) {
    results.push("beperkte reviewbasis maakt prestaties minder voorspelbaar");
  }
  if (Array.isArray(comp?.competitors) && comp.competitors.length >= 5) {
    results.push("hoge concurrentiedruk in directe omgeving");
  }
  if (news?.hasFaillissementSignal === true) {
    results.push("faillissements- of financiële stresssignalen in nieuws");
  }

  return results;
}

function extractBrokerAngles(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined,
  strengths: string[],
  acquisitionSignals: string[],
): string[] {
  const website = asRecord(intel?.websiteData);
  const thuisbezorgd = asRecord(intel?.thuisbezorgdData);
  const kvk = asRecord(intel?.kvkData);
  const angles: string[] = [];

  if (acquisitionSignals.some((signal) => signal.includes("transitie") || signal.includes("rating"))) {
    angles.push("geschikt voor conceptverversing op bestaande locatie");
  }
  if (thuisbezorgd != null) {
    angles.push("delivery-kanaal is al aantoonbaar aanwezig");
  }
  if (website?.hasDelivery === true && business.passantenPerDag != null && business.passantenPerDag > 1500) {
    angles.push("hybride exploitatie mogelijk: delivery plus hoge straatvraag");
  }
  if (typeof kvk?.ketenGrootte === "number" && kvk.ketenGrootte >= 3) {
    angles.push("interessant als keten- of portefeuillelead");
  }
  if (strengths.some((strength) => strength.includes("OV-bereikbaarheid")) && strengths.some((strength) => strength.includes("passanten"))) {
    angles.push("sterke makelaarspropositie door bereikbaarheid plus volume");
  }

  return unique(angles);
}

function buildEconomicFeasibility(
  business: BusinessWithIntel,
  insights: Pick<BrokerInsightSummary, "strengths" | "risks" | "serviceModel">,
): BrokerDecisionDimension {
  let score = 0;
  const reasons: string[] = [];

  if (business.passantenPerDag != null && business.passantenPerDag >= 2000) {
    score += 2;
    reasons.push(`passantenvolume ~${business.passantenPerDag}/dag`);
  } else if (business.passantenPerDag != null && business.passantenPerDag >= 1000) {
    score += 1;
    reasons.push(`redelijk passantenvolume ~${business.passantenPerDag}/dag`);
  }

  if (
    business.bereikbaarheidOV === "uitstekend" ||
    business.bereikbaarheidOV === "goed"
  ) {
    score += 1;
    reasons.push(`OV-bereikbaarheid ${business.bereikbaarheidOV}`);
  }

  if (insights.strengths.some((item) => item.includes("dichtbevolkte stedelijke zone"))) {
    score += 1;
    reasons.push("stedelijke dichtheid ondersteunt vraag");
  }

  if (insights.serviceModel.some((item) => item.includes("bezorging"))) {
    score += 1;
    reasons.push("bestaand delivery-kanaal verlaagt opstartfrictie");
  }

  if (insights.risks.some((item) => item.includes("concurrentiedruk"))) {
    score -= 1;
    reasons.push("concurrentiedruk is hoog");
  }

  if (insights.risks.some((item) => item.includes("operationele continuiteit"))) {
    score -= 2;
    reasons.push("continuiteit van exploitatie is onzeker");
  }

  if (!business.isOpen) {
    score -= 1;
    reasons.push("bedrijf is niet aantoonbaar open");
  }

  if (score >= 3) {
    return {
      status: "strong",
      label: "Economisch gunstig",
      reasoning: reasons[0] ?? "locatiesignalen en exploitatiemodel ondersteunen de case",
    };
  }

  if (score >= 1) {
    return {
      status: "mixed",
      label: "Economisch gemengd",
      reasoning: reasons[0] ?? "er zijn positieve signalen, maar nadere economische validatie is nodig",
    };
  }

  return {
    status: "weak",
    label: "Economisch onzeker",
    reasoning: reasons[0] ?? "huidige bronnen geven nog te weinig economische zekerheid",
  };
}

function buildLegalReadiness(
  sourceCoverage: SourceCoverageReport,
  risks: string[],
): BrokerDecisionDimension {
  if (
    risks.some(
      (item) =>
        item.includes("faillissements") ||
        item.includes("operationele continuiteit"),
    )
  ) {
    return {
      status: "attention",
      label: "Juridische rode vlag",
      reasoning: "nieuws- of sluitingssignalen vragen eerst juridische en operationele triage",
    };
  }

  const requiresScreening =
    sourceCoverage.missingCritical.includes("kvk") ||
    sourceCoverage.missingCritical.includes("news") ||
    sourceCoverage.missingCritical.includes("website");

  if (requiresScreening) {
    return {
      status: "screening_required",
      label: "Vergunningcheck vereist",
      reasoning: "kritieke bronnen voor eigendom, nieuws of exploitatie ontbreken nog",
    };
  }

  return {
    status: "screening_required",
    label: "Vergunningcheck vereist",
    reasoning: "huidige bronnen tonen geen directe stress, maar vergunningen en omgevingsplan zijn nog niet geverifieerd",
  };
}

function buildTransitionPotential(
  acquisitionSignals: string[],
  brokerAngles: string[],
  risks: string[],
): BrokerDecisionDimension {
  let score = 0;
  const reasons = unique([
    acquisitionSignals[0] ?? null,
    brokerAngles[0] ?? null,
    risks.find((item) => item.includes("negatieve review") || item.includes("beperkte reviewbasis")) ?? null,
  ]);

  if (
    acquisitionSignals.some(
      (item) =>
        item.includes("verkoopkandidaat") ||
        item.includes("overname- of verkoopindicatie"),
    )
  ) {
    score += 2;
  }

  if (
    acquisitionSignals.some(
      (item) =>
        item.includes("operationele verbetering") ||
        item.includes("transitie") ||
        item.includes("ratingtrend") ||
        item.includes("tractie"),
    )
  ) {
    score += 1;
  }

  if (brokerAngles.length > 0) {
    score += 1;
  }

  if (risks.some((item) => item.includes("operationele continuiteit"))) {
    score -= 1;
  }

  if (score >= 3) {
    return {
      status: "high",
      label: "Hoge transitiepotentie",
      reasoning: reasons[0] ?? "meerdere signalen wijzen op een concrete acquisitie- of herpositioneringscase",
    };
  }

  if (score >= 1) {
    return {
      status: "medium",
      label: "Selectieve transitiepotentie",
      reasoning: reasons[0] ?? "er zijn bruikbare signalen, maar verdere onderbouwing is nodig",
    };
  }

  return {
    status: "low",
    label: "Beperkte transitiepotentie",
    reasoning: reasons[0] ?? "er zijn nog weinig harde signalen voor een broker-case",
  };
}

function buildNextAction(
  decision: Pick<
    BrokerDecision,
    "legalReadiness" | "economicFeasibility" | "transitionPotential" | "missingCriticalSources"
  >,
  acquisitionSignals: string[],
): string {
  const missingLabels = decision.missingCriticalSources.map(sourceLabel);
  const hasExplicitSaleSignal = acquisitionSignals.some(
    (item) =>
      item.includes("verkoopkandidaat") ||
      item.includes("overname- of verkoopindicatie"),
  );

  if (decision.legalReadiness.status === "attention") {
    return "Doe eerst juridische en operationele triage: check faillissementsstatus, contractpositie en exploitatiecontinuiteit voordat je outreach start.";
  }

  if (decision.missingCriticalSources.length > 0) {
    return `Verrijk eerst de ontbrekende kritieke bronnen (${missingLabels.join(", ")}) voordat je deze lead actief pitcht.`;
  }

  if (
    hasExplicitSaleSignal &&
    decision.economicFeasibility.status !== "weak"
  ) {
    return "Plan direct een acquisitiegesprek en valideer in dat traject huurpositie, vergunningen en omgevingsplan.";
  }

  if (decision.economicFeasibility.status === "weak") {
    return "Valideer eerst de unit economics: toets huur, capex, passantenpotentie en concurrentiedruk voordat je capaciteit inzet op outreach.";
  }

  if (decision.transitionPotential.status === "high") {
    return "Voer een broker quickscan uit op concepttransitie: exploitatievergunning, omgevingsplan, huurvoorwaarden en capex-impact.";
  }

  return "Zet deze zaak op de watchlist en monitor nieuws, reviewtrend en operationele signalen tot er een concreter acquisitiemoment ontstaat.";
}

function buildBrokerDecision(
  business: BusinessWithIntel,
  insights: Omit<BrokerInsightSummary, "brokerDecision">,
): BrokerDecision {
  const whyInteresting = unique([
    ...insights.acquisitionSignals,
    ...insights.brokerAngles,
    ...insights.strengths,
  ]).slice(0, 4);

  const watchouts = unique([
    ...insights.risks,
    ...insights.sourceCoverage.missingCritical.map(
      (source) => `kritieke bron ontbreekt: ${sourceLabel(source)}`,
    ),
  ]).slice(0, 4);

  const legalReadiness = buildLegalReadiness(
    insights.sourceCoverage,
    insights.risks,
  );
  const economicFeasibility = buildEconomicFeasibility(business, insights);
  const transitionPotential = buildTransitionPotential(
    insights.acquisitionSignals,
    insights.brokerAngles,
    insights.risks,
  );

  let verdict: BrokerDecision["verdict"] = "monitor";
  if (
    transitionPotential.status === "high" &&
    economicFeasibility.status !== "weak" &&
    legalReadiness.status !== "attention" &&
    insights.confidenceLevel !== "low"
  ) {
    verdict = "direct_action";
  } else if (
    transitionPotential.status !== "low" ||
    economicFeasibility.status === "strong" ||
    insights.acquisitionSignals.length > 0
  ) {
    verdict = "investigate_now";
  } else if (
    whyInteresting.length === 0 &&
    watchouts.length > 0 &&
    insights.confidenceLevel === "low"
  ) {
    verdict = "deprioritize";
  }

  const verdictLabelMap: Record<BrokerDecision["verdict"], string> = {
    direct_action: "Direct oppakken",
    investigate_now: "Eerst onderbouwen",
    monitor: "Monitoren",
    deprioritize: "Lage prioriteit",
  };

  const confidenceNote =
    insights.sourceCoverage.missingCritical.length > 0
      ? `Vertrouwen ${confidenceLabel(insights.confidenceLevel)}: ${insights.sourceCoverage.available.length} bronnen beschikbaar, maar kritieke hiaten in ${insights.sourceCoverage.missingCritical.map(sourceLabel).join(", ")}.`
      : `Vertrouwen ${confidenceLabel(insights.confidenceLevel)} op basis van ${insights.sourceCoverage.available.length} beschikbare bronnen.`;

  const nextAction = buildNextAction(
    {
      legalReadiness,
      economicFeasibility,
      transitionPotential,
      missingCriticalSources: insights.sourceCoverage.missingCritical,
    },
    insights.acquisitionSignals,
  );

  const summaryReason =
    whyInteresting[0] ??
    `${business.name} vraagt extra verrijking voordat dit een harde broker-case wordt`;
  const watchoutReason = watchouts[0];

  return {
    verdict,
    verdictLabel: verdictLabelMap[verdict],
    summary: watchoutReason
      ? `${verdictLabelMap[verdict]}: ${summaryReason}. Let op: ${watchoutReason}.`
      : `${verdictLabelMap[verdict]}: ${summaryReason}.`,
    whyInteresting,
    watchouts,
    missingCriticalSources: insights.sourceCoverage.missingCritical,
    nextAction,
    confidenceNote,
    legalReadiness,
    economicFeasibility,
    transitionPotential,
  };
}

export function extractBrokerInsights(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined = business.crawledIntel ?? null,
): BrokerInsightSummary {
  const sourcesUsed = getSourcesUsed(intel);
  const sourceCoverage = buildSourceCoverageReport(
    getAvailableSourceIds(intel, {
      hasGooglePlaces: true,
      hasBuurtData: business.demografieData != null,
      hasTransport: business.bereikbaarheidOV != null,
      hasBagData: !!asRecord(business.demografieData)?.oppervlakte,
    }),
  );
  const conceptSignals = extractConceptSignals(business, intel);
  const serviceModel = extractServiceModel(business, intel);
  const acquisitionSignals = extractAcquisitionSignals(business, intel);
  const strengths = extractStrengths(business, intel);
  const risks = extractRisks(business, intel);
  const brokerAngles = extractBrokerAngles(
    business,
    intel,
    strengths,
    acquisitionSignals,
  );

  const confidenceLevel: BrokerInsightSummary["confidenceLevel"] =
    sourceCoverage.confidenceLevel;

  const summaryParts = unique([
    acquisitionSignals[0] ?? null,
    strengths[0] ?? null,
    brokerAngles[0] ?? null,
  ]);

  const summary = summaryParts.length > 0
    ? summaryParts.join("; ")
    : `${business.name} heeft nog beperkte intelligence-data en vraagt aanvullende crawl-verrijking.`;

  const baseInsights = {
    confidenceLevel,
    sourcesUsed,
    sourceCoverage,
    conceptSignals,
    serviceModel,
    acquisitionSignals,
    strengths,
    risks,
    brokerAngles,
    summary,
  } satisfies Omit<BrokerInsightSummary, "brokerDecision">;

  return {
    ...baseInsights,
    brokerDecision: buildBrokerDecision(business, baseInsights),
  };
}

export function buildBrokerInsightLines(
  business: BusinessWithIntel,
  intel: MinimalCrawledIntel | null | undefined = business.crawledIntel ?? null,
): string[] {
  const insights = extractBrokerInsights(business, intel);

  return unique([
    insights.summary,
    insights.sourceCoverage.missingCritical.length > 0
      ? `Bronhiaten: ${insights.sourceCoverage.missingCritical.join(", ")}`
      : null,
    insights.serviceModel.length > 0
      ? `Exploitatiemodel: ${insights.serviceModel.join(", ")}`
      : null,
    insights.acquisitionSignals[0]
      ? `Overnamehoek: ${insights.acquisitionSignals[0]}`
      : null,
    insights.brokerAngles[0]
      ? `Broker angle: ${insights.brokerAngles[0]}`
      : null,
    insights.risks[0]
      ? `Aandachtspunt: ${insights.risks[0]}`
      : null,
    insights.brokerDecision.nextAction
      ? `Next action: ${insights.brokerDecision.nextAction}`
      : null,
  ]);
}
