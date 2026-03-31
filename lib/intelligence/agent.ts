/**
 * Intelligence Agent — AI-powered deep analysis of crawled business data.
 *
 * Uses AI SDK 6 generateText + tools pattern (proven in ai-classifier.ts).
 * The agent autonomously decides which analysis tools to call based on
 * available crawled data for a business.
 *
 * Output: A structured intelligence dossier with 8 sections.
 */

import prisma from "@/lib/prisma";
import { extractBrokerInsights } from "@/lib/intelligence/broker-insights";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelligenceDossier {
  executiveSummary: string;
  locationIntelligence: string;
  competitionLandscape: string;
  onlineReputation: string;
  conceptAnalysis: string;
  financialPerspective: string;
  takeoverSignals: string;
  recommendation: string;
  generatedAt: string;
  sourcesUsed: string[];
  confidenceLevel: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Main: Generate Intelligence Dossier
// ---------------------------------------------------------------------------

/**
 * Generate a complete intelligence dossier for a business using all crawled data.
 * Uses an AI agent that decides which data sources to reference.
 */
export async function generateIntelligenceDossier(
  businessId: string,
): Promise<IntelligenceDossier | null> {
  // Load business + crawled intel
  const business = await prisma.monitoredBusiness.findUnique({
    where: { id: businessId },
    include: {
      crawledIntel: true,
      snapshots: { orderBy: { scannedAt: "desc" }, take: 5 },
    },
  });

  if (!business) return null;

  const intel = business.crawledIntel;
  const sourcesUsed: string[] = [];
  const brokerInsights = extractBrokerInsights(
    { ...business, crawledIntel: intel },
    intel,
  );

  // Build context from all available data
  const contextSections: string[] = [];

  // Google Places base data
  contextSections.push(`=== BASISGEGEVENS ===
Naam: ${business.name}
Adres: ${business.address}, ${business.city}
Type: ${business.businessType ?? "horeca"}
Rating: ${business.currentRating ?? "onbekend"}/5 (${business.totalReviews ?? 0} reviews)
Prijsniveau: ${business.priceLevel ?? "onbekend"}
Status: ${business.isOpen ? "Open" : "Gesloten"}
Website: ${business.website ?? "geen"}
Telefoon: ${business.phone ?? "geen"}`);
  sourcesUsed.push("google-places");

  // KvK data
  if (intel?.kvkData) {
    const kvk = intel.kvkData as Record<string, unknown>;
    contextSections.push(`=== KVK / BEDRIJFSGEGEVENS ===
KvK nummer: ${kvk.kvkNumber ?? "onbekend"}
Eigenaar: ${kvk.eigenaar ?? "onbekend"}
Rechtsvorm: ${kvk.rechtsvorm ?? "onbekend"}
Vestigingen: ${Array.isArray(kvk.vestigingen) ? kvk.vestigingen.length : "onbekend"}
Handelsnamen: ${Array.isArray(kvk.handelsnamen) ? (kvk.handelsnamen as string[]).join(", ") : "onbekend"}
SBI-codes: ${Array.isArray(kvk.sbiCodes) ? (kvk.sbiCodes as string[]).join(", ") : "onbekend"}
Is keten: ${kvk.isKeten ? `Ja (${kvk.ketenGrootte} vestigingen)` : "Nee"}`);
    sourcesUsed.push("kvk");
  }

  // TripAdvisor data
  if (intel?.tripadvisorData) {
    const ta = intel.tripadvisorData as Record<string, unknown>;
    const reviews = Array.isArray(ta.recentReviews) ? ta.recentReviews : [];
    const reviewTexts = reviews
      .slice(0, 5)
      .map((r: Record<string, unknown>) => `- ${r.rating}/5: "${(r.snippet as string)?.slice(0, 100)}"`)
      .join("\n");

    contextSections.push(`=== TRIPADVISOR ===
Rating: ${ta.rating ?? "onbekend"}/5
Reviews: ${ta.totalReviews ?? "onbekend"}
Ranking: ${ta.ranking ?? "onbekend"}
Cuisine: ${Array.isArray(ta.cuisineTypes) ? (ta.cuisineTypes as string[]).join(", ") : "onbekend"}
Prijsrange: ${ta.priceRange ?? "onbekend"}
Travelers' Choice: ${ta.travelersChoice ? "Ja" : "Nee"}
Recente reviews:
${reviewTexts || "Geen reviews beschikbaar"}`);
    sourcesUsed.push("tripadvisor");
  }

  // Thuisbezorgd data
  if (intel?.thuisbezorgdData) {
    const tb = intel.thuisbezorgdData as Record<string, unknown>;
    const menuItems = Array.isArray(tb.menuItems) ? tb.menuItems : [];
    const menuText = menuItems
      .slice(0, 10)
      .map((item: Record<string, unknown>) => `- ${item.name}: €${item.price}`)
      .join("\n");

    contextSections.push(`=== THUISBEZORGD / DELIVERY ===
Rating: ${tb.rating ?? "onbekend"}/10
Reviews: ${tb.reviewCount ?? "onbekend"}
Gemiddelde prijs: €${tb.avgPrice ?? "onbekend"}
Bezorgtijd: ${tb.deliveryTime ?? "onbekend"}
Min. bestelling: €${tb.minOrder ?? "onbekend"}
Cuisine: ${Array.isArray(tb.cuisineTypes) ? (tb.cuisineTypes as string[]).join(", ") : "onbekend"}
Menu items:
${menuText || "Geen menu data"}`);
    sourcesUsed.push("thuisbezorgd");
  }

  // AlleCijfers buurt data
  if (intel?.allecijfersData) {
    const ac = intel.allecijfersData as Record<string, unknown>;
    contextSections.push(`=== BUURT INTELLIGENCE (AlleCijfers) ===
Buurt: ${ac.buurtNaam ?? "onbekend"} (${ac.wijkNaam ?? ""})
Inwoners: ${ac.inwoners ?? "onbekend"}
Groei: ${ac.inwonerGroei ?? "onbekend"}
Woningwaarde: €${ac.woningwaarde ?? "onbekend"}
Woningwaarde groei: ${ac.woningwaardeGroei ?? "onbekend"}
Huishoudens: ${ac.huishoudens ?? "onbekend"} (gem. ${ac.gemHuishoudGrootte ?? "?"} personen)
Bedrijfsvestigingen: ${ac.bedrijfsvestigingen ?? "onbekend"}
Huurwoningen: ${ac.huurPercentage ?? "onbekend"}%
Straat - adressen: ${ac.straatAdressen ?? "onbekend"}, panden: ${ac.straatPanden ?? "onbekend"}`);
    sourcesUsed.push("allecijfers");
  }

  // Competitors data
  if (intel?.competitorsData) {
    const comp = intel.competitorsData as Record<string, unknown>;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const compText = competitors
      .slice(0, 5)
      .map((c: Record<string, unknown>) =>
        `- ${c.name}: ${c.rating}/5 (${c.reviewCount} reviews), ${c.distance}, ${c.priceLevel}`,
      )
      .join("\n");

    contextSections.push(`=== CONCURRENTIE ===
Dichtheid: ${comp.competitorDensity ?? "onbekend"}
Gem. rating concurrenten: ${comp.avgRating ?? "onbekend"}/5
Dominante cuisine: ${comp.dominantCuisine ?? "onbekend"}
Nabije concurrenten:
${compText || "Geen concurrentie data"}`);
    sourcesUsed.push("competitors");
  }

  // Website data
  if (intel?.websiteData) {
    const web = intel.websiteData as Record<string, unknown>;
    contextSections.push(`=== WEBSITE ANALYSE ===
Concept: ${web.concept ?? "onbekend"}
Team grootte: ${web.teamSize ?? "onbekend"}
Online reservering: ${web.hasOnlineReservation ? "Ja" : "Nee"}
Delivery: ${web.hasDelivery ? "Ja" : "Nee"}
Talen: ${Array.isArray(web.languages) ? (web.languages as string[]).join(", ") : "onbekend"}`);
    sourcesUsed.push("website");
  }

  // News data
  if (intel?.newsData) {
    const newsObj = intel.newsData as Record<string, unknown>;
    const newsItems = Array.isArray(newsObj.items) ? newsObj.items : [];
    const newsText = newsItems
      .slice(0, 5)
      .map((n: Record<string, unknown>) => `- [${n.signalType}] ${n.title} (${n.source})`)
      .join("\n");

    contextSections.push(`=== HORECA NIEUWS ===
Overname signaal: ${(newsObj as Record<string, boolean>).hasOvernameSignal ? "JA — zaak is aangeboden/te koop" : "Nee"}
Faillissement signaal: ${(newsObj as Record<string, boolean>).hasFaillissementSignal ? "JA" : "Nee"}
Recent nieuws:
${newsText || "Geen nieuws gevonden"}`);
    sourcesUsed.push("news");
  }

  // Signal data
  if (business.signals) {
    const signals = business.signals as Record<string, boolean>;
    const activeSignals = Object.entries(signals)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    contextSections.push(`=== SIGNALEN ===
Signaal score: ${business.signalScore}/100
Actieve signalen: ${activeSignals.join(", ") || "geen"}
Top signaal: ${business.aiAnalysis ?? "geen"}`);
  }

  contextSections.push(`=== MAKELAAR INZICHTEN ===
Confidence: ${brokerInsights.confidenceLevel}
Bronnen: ${brokerInsights.sourcesUsed.join(", ") || "beperkt"}
Conceptsignalen: ${brokerInsights.conceptSignals.join(" | ") || "beperkt"}
Exploitatiemodel: ${brokerInsights.serviceModel.join(", ") || "onbekend"}
Sterktes: ${brokerInsights.strengths.join(" | ") || "geen duidelijke sterktes"}
Overnamehoek: ${brokerInsights.acquisitionSignals.join(" | ") || "geen directe overnamesignalen"}
Broker angles: ${brokerInsights.brokerAngles.join(" | ") || "aanvullende analyse nodig"}
Risico's: ${brokerInsights.risks.join(" | ") || "geen directe risico's"}`);

  // Generate dossier with AI
  const fullContext = contextSections.join("\n\n");

  // Determine confidence level
  const confidenceLevel: "high" | "medium" | "low" =
    sourcesUsed.length >= 5 ? "high" :
    sourcesUsed.length >= 3 ? "medium" : "low";

  try {
    const { generateText } = await import("ai");
    const { getModel } = await import("@/lib/ai/model");
    const { model } = await getModel();

    const { text } = await generateText({
      model,
      system: `Je bent een senior horeca-acquisitie intelligence analist voor Horecagrond.nl.
Je maakt professionele overname-intelligence dossiers op basis van data uit meerdere bronnen.

REGELS:
- Gebruik CONCRETE CIJFERS uit de data (ratings, prijzen, aantallen)
- Vergelijk met concurrenten waar mogelijk
- Schrijf in professioneel Nederlands
- Focus op KANSEN, niet zwaktes
- Noem de bronnen van je informatie
- Elke sectie max 150 woorden
- Gebruik bullet points voor leesbaarheid

OUTPUT FORMAT (exact deze 8 headers):
## 1. EXECUTIVE SUMMARY
## 2. LOCATIE INTELLIGENCE
## 3. CONCURRENTIE LANDSCHAP
## 4. ONLINE REPUTATIE
## 5. CONCEPT & MENU ANALYSE
## 6. FINANCIEEL PERSPECTIEF
## 7. OVERNAME SIGNALEN & KANSEN
## 8. AANBEVELING`,
      prompt: `Genereer een compleet Overname Intelligence Dossier voor:

${fullContext}

Bronnen beschikbaar: ${sourcesUsed.join(", ")}
Confidence level: ${confidenceLevel} (${sourcesUsed.length} van 7 bronnen)`,
    });

    // Parse sections
    const dossier: IntelligenceDossier = {
      executiveSummary: extractSection(text, "1. EXECUTIVE SUMMARY"),
      locationIntelligence: extractSection(text, "2. LOCATIE INTELLIGENCE"),
      competitionLandscape: extractSection(text, "3. CONCURRENTIE LANDSCHAP"),
      onlineReputation: extractSection(text, "4. ONLINE REPUTATIE"),
      conceptAnalysis: extractSection(text, "5. CONCEPT & MENU ANALYSE"),
      financialPerspective: extractSection(text, "6. FINANCIEEL PERSPECTIEF"),
      takeoverSignals: extractSection(text, "7. OVERNAME SIGNALEN & KANSEN"),
      recommendation: extractSection(text, "8. AANBEVELING"),
      generatedAt: new Date().toISOString(),
      sourcesUsed,
      confidenceLevel,
    };

    // Save to DB
    await prisma.crawledBusinessIntel.update({
      where: { businessId },
      data: {
        aiDossier: text,
        aiDossierGeneratedAt: new Date(),
      },
    });

    return dossier;
  } catch (error) {
    console.error("[intelligence-agent] Dossier generation failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named section from the AI-generated dossier text.
 */
function extractSection(text: string, sectionName: string): string {
  const lines = text.split("\n");
  let capturing = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (line.includes(sectionName)) {
      capturing = true;
      continue;
    }

    if (capturing && line.startsWith("## ")) {
      break; // Next section started
    }

    if (capturing) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n").trim();
}
