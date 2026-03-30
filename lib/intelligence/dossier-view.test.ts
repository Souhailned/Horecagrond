import { describe, expect, it } from "vitest";

import { buildPublicDossierView } from "./dossier-view";

describe("buildPublicDossierView", () => {
  it("maps crawled intel and source evidence into a public dossier view", () => {
    const view = buildPublicDossierView({
      id: "biz-1",
      googlePlaceId: "places/1",
      name: "Test Grill",
      address: "Damrak 1",
      city: "Amsterdam",
      lat: 0,
      lng: 0,
      types: ["turkish_restaurant", "restaurant"],
      businessType: "turkish_restaurant",
      currentRating: 4.2,
      totalReviews: 120,
      priceLevel: "PRICE_LEVEL_MODERATE",
      website: "https://example.com",
      phone: null,
      isOpen: true,
      openingHours: null,
      bereikbaarheidOV: "goed",
      passantenPerDag: 2200,
      demografieData: { dichtheid: 8000 },
      locationScore: null,
      signalScore: 18,
      signals: { newsOvernameSignal: true },
      chainName: null,
      chainSize: 2,
      kvkNumber: null,
      postalCode: null,
      tripadvisorRating: null,
      tripadvisorReviews: null,
      tripadvisorUrl: null,
      tripadvisorRanking: null,
      aiAnalysis: null,
      firstScannedAt: null,
      lastScannedAt: new Date(),
      scanCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      crawledIntel: {
        aiDossier: `## 1. EXECUTIVE SUMMARY
Sterke locatie met operationele ruimte.

## 7. OVERNAME SIGNALEN & KANSEN
Nieuws en delivery signaleren een mogelijke transitiecase.

## 8. AANBEVELING
Valideer huur en vergunningen voordat je outreach start.`,
        sourcesCompleted: ["website", "news"],
        crawledAt: new Date(),
        kvkData: null,
        tripadvisorData: null,
        thuisbezorgdData: null,
        allecijfersData: null,
        websiteData: { hasDelivery: true, concept: "Turkish grill" },
        newsData: { hasOvernameSignal: true },
        competitorsData: null,
      },
      sourceEvidence: [
        {
          source: "website",
          status: "fetched",
          confidence: "high",
          qualityScore: 5,
          fetchedAt: new Date(),
          expiresAt: new Date(),
          error: null,
        },
        {
          source: "news",
          status: "fetched",
          confidence: "low",
          qualityScore: 0,
          fetchedAt: new Date(),
          expiresAt: new Date(),
          error: null,
        },
      ],
    });

    expect(view).not.toBeNull();
    expect(view?.sourcesCompleted).toEqual(["website", "news"]);
    expect(view?.sourceEvidence).toHaveLength(2);
    expect(view?.sourceCoverage.available).toContain("google_places");
    expect(view?.parsedAiDossier?.executiveSummary).toContain("Sterke locatie");
    expect(view?.brokerDecision.verdictLabel).toBeTruthy();
  });

  it("downgrades the broker verdict when match-fit or evidence quality is weak", () => {
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000);

    const view = buildPublicDossierView(
      {
        name: "Portfolio Lead",
        city: "Amsterdam",
        businessType: "restaurant",
        currentRating: 3.3,
        totalReviews: 260,
        priceLevel: "PRICE_LEVEL_MODERATE",
        isOpen: true,
        bereikbaarheidOV: "uitstekend",
        passantenPerDag: 2600,
        signalScore: 48,
        signals: {
          newsOvernameSignal: true,
          deliveryRatingLow: true,
        },
        chainSize: 4,
        demografieData: { dichtheid: 9000 },
        crawledIntel: {
          aiDossier: null,
          sourcesCompleted: ["kvk", "website", "news", "thuisbezorgd"],
          crawledAt: new Date(),
          kvkData: { ketenGrootte: 4 },
          tripadvisorData: null,
          thuisbezorgdData: { rating: 5.5 },
          allecijfersData: null,
          websiteData: { hasDelivery: true },
          newsData: { hasOvernameSignal: true },
          competitorsData: null,
        },
        sourceEvidence: [
          {
            source: "website",
            status: "stale",
            confidence: "high",
            qualityScore: 4,
            fetchedAt: new Date(),
            expiresAt: expiredAt,
            error: null,
          },
          {
            source: "news",
            status: "fetched",
            confidence: "high",
            qualityScore: 2,
            fetchedAt: new Date(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            error: null,
          },
        ],
      },
      {
        matchScore: 52,
        matchBreakdown: { concept: 9 },
      },
    );

    expect(view?.confidenceLevel).toBe("Laag");
    expect(view?.brokerDecision.verdict).toBe("monitor");
    expect(view?.brokerDecision.watchouts.join(" ")).toContain("profiel-fit");
  });
});
