import { describe, expect, it } from "vitest";

import { planProfileScan, rankDeepCrawlCandidates } from "./pipeline";

describe("planProfileScan", () => {
  it("reuses centralized profile planning for high-precision scan terms", () => {
    const plan = planProfileScan({
      name: "turks amsterdam",
      concept: "restaurant",
      conceptDescription: "Turkse keuken in Amsterdam centrum",
      competitorKeywords: ["turks", "kebab"],
      operatingModel: ["afhaal", "bezorging"],
    });

    expect(plan.primary).toEqual(
      expect.arrayContaining(["turks restaurant", "kebab"]),
    );
    expect(plan.secondary).toEqual(
      expect.arrayContaining(["restaurant", "afhaalrestaurant", "bezorgrestaurant"]),
    );
  });
});

describe("rankDeepCrawlCandidates", () => {
  it("prioritizes relevance above raw signal score", () => {
    const ranked = rankDeepCrawlCandidates(
      {
        name: "turks amsterdam",
        concept: "restaurant",
        conceptDescription: "Turkse keuken in Amsterdam centrum",
        competitorKeywords: ["turks", "kebab"],
        operatingModel: ["afhaal"],
      } as never,
      [
        {
          id: "1",
          googlePlaceId: "places/1",
          name: "McDonald's Centrum",
          address: "Damrak 1",
          city: "Amsterdam",
          lat: 0,
          lng: 0,
          types: ["fast_food_restaurant", "restaurant"],
          businessType: null,
          currentRating: 3.1,
          totalReviews: 900,
          priceLevel: null,
          website: null,
          phone: null,
          isOpen: true,
          openingHours: null,
          bereikbaarheidOV: "uitstekend",
          passantenPerDag: 5000,
          demografieData: null,
          locationScore: null,
          signalScore: 80,
          signals: null,
          chainName: null,
          chainSize: null,
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
          crawledIntel: null,
        },
        {
          id: "2",
          googlePlaceId: "places/2",
          name: "Ali Ocakbaşı",
          address: "Ceintuurbaan 1",
          city: "Amsterdam",
          lat: 0,
          lng: 0,
          types: ["turkish_restaurant", "restaurant"],
          businessType: null,
          currentRating: 4.3,
          totalReviews: 300,
          priceLevel: null,
          website: null,
          phone: null,
          isOpen: true,
          openingHours: null,
          bereikbaarheidOV: "goed",
          passantenPerDag: 1800,
          demografieData: null,
          locationScore: null,
          signalScore: 10,
          signals: null,
          chainName: null,
          chainSize: null,
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
          crawledIntel: null,
        },
      ],
    );

    expect(ranked[0]?.business.name).toBe("Ali Ocakbaşı");
  });
});
