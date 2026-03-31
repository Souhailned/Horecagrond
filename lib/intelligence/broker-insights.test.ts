import { describe, expect, it } from "vitest";

import { buildBrokerInsightLines, extractBrokerInsights } from "./broker-insights";

describe("extractBrokerInsights", () => {
  it("translates crawled data into broker-usable takeover angles", () => {
    const insights = extractBrokerInsights(
      {
        name: "Urban Bowl Hub",
        city: "Amsterdam",
        businessType: "poke_bowl",
        currentRating: 3.6,
        totalReviews: 412,
        priceLevel: "PRICE_LEVEL_MODERATE",
        isOpen: true,
        passantenPerDag: 2400,
        bereikbaarheidOV: "uitstekend",
        signalScore: 41,
        signals: {
          lowRating: false,
          fewReviews: false,
          ratingDrop: true,
          reducedHours: false,
          listedForSale: false,
          priceMismatch: false,
          reviewDecline: true,
          stalePresence: false,
          recentlyClosed: false,
          ketenWithIssues: false,
          deliveryRatingLow: true,
          negativeSentiment: true,
          temporarilyClosed: false,
          newsOvernameSignal: true,
          ownerMultipleLocations: false,
        },
        chainSize: 4,
        demografieData: { dichtheid: 9000 },
      },
      {
        id: "intel-1",
        businessId: "biz-1",
        crawlStatus: "complete",
        crawlProgress: 100,
        crawlError: null,
        crawledAt: new Date(),
        sourcesCompleted: ["kvk", "thuisbezorgd", "news", "website"],
        kvkNumber: "123",
        kvkData: { ketenGrootte: 4, isKeten: true },
        tripadvisorUrl: null,
        tripadvisorData: null,
        thuisbezorgdUrl: "https://tb.example",
        thuisbezorgdData: { rating: 5.8, cuisineTypes: ["Poke", "Healthy"] },
        allecijfersUrl: null,
        allecijfersData: null,
        websiteUrl: "https://urbanbowl.example",
        websiteData: { hasDelivery: true, hasOnlineReservation: false, concept: "Healthy poke bowls" },
        newsData: { hasOvernameSignal: true, hasFaillissementSignal: false },
        competitorsData: null,
        aiDossier: null,
        aiDossierGeneratedAt: null,
        confidenceLevel: "medium",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    expect(insights.confidenceLevel).toBe("medium");
    expect(insights.acquisitionSignals.join(" ")).toContain("nieuwsbron noemt overname");
    expect(insights.acquisitionSignals.join(" ")).toContain("delivery rating");
    expect(insights.brokerAngles.join(" ")).toContain("portefeuillelead");
    expect(insights.summary.length).toBeGreaterThan(20);
    expect(insights.brokerDecision.verdict).toBe("direct_action");
    expect(insights.brokerDecision.whyInteresting.join(" ")).toContain("nieuwsbron noemt overname");
    expect(insights.brokerDecision.nextAction).toContain("acquisitiegesprek");
  });

  it("surfaces limited-data situations as low-confidence", () => {
    const insights = extractBrokerInsights({
      name: "Corner Snack",
      city: "Amsterdam",
      businessType: null,
      currentRating: 4.1,
      totalReviews: 18,
      priceLevel: null,
      isOpen: true,
      passantenPerDag: null,
      bereikbaarheidOV: null,
      signalScore: 0,
      signals: null,
      chainSize: null,
      demografieData: null,
    });

    expect(insights.confidenceLevel).toBe("low");
    expect(insights.summary).toContain("beperkte intelligence-data");
    expect(insights.brokerDecision.verdict).toBe("deprioritize");
    expect(insights.brokerDecision.missingCriticalSources.length).toBeGreaterThan(0);
  });
});

describe("buildBrokerInsightLines", () => {
  it("returns compact lines for summaries and prompts", () => {
    const lines = buildBrokerInsightLines(
      {
        name: "Delivery Pasta",
        city: "Amsterdam",
        businessType: "restaurant",
        currentRating: 4.2,
        totalReviews: 220,
        priceLevel: "PRICE_LEVEL_MODERATE",
        isOpen: true,
        passantenPerDag: 1800,
        bereikbaarheidOV: "goed",
        signalScore: 12,
        signals: { deliveryRatingLow: true },
        chainSize: null,
        demografieData: null,
      },
      {
        id: "intel-2",
        businessId: "biz-2",
        crawlStatus: "partial",
        crawlProgress: 75,
        crawlError: null,
        crawledAt: new Date(),
        sourcesCompleted: ["thuisbezorgd"],
        kvkNumber: null,
        kvkData: null,
        tripadvisorUrl: null,
        tripadvisorData: null,
        thuisbezorgdUrl: "https://tb.example",
        thuisbezorgdData: { rating: 5.4, cuisineTypes: ["Italian"] },
        allecijfersUrl: null,
        allecijfersData: null,
        websiteUrl: null,
        websiteData: null,
        newsData: null,
        competitorsData: null,
        aiDossier: null,
        aiDossierGeneratedAt: null,
        confidenceLevel: "low",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" ")).toContain("Overnamehoek");
    expect(lines.join(" ")).toContain("Next action");
  });
});
