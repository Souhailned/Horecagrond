import { describe, expect, it } from "vitest";

import { assessBusinessAgainstProfile } from "./profile-intent";
import { rankDeepCrawlCandidates } from "./pipeline";

function makeBusiness(overrides: Record<string, unknown>) {
  return {
    id: "biz",
    googlePlaceId: "places/test",
    name: "Test Business",
    address: "Damrak 1",
    city: "Amsterdam",
    lat: 0,
    lng: 0,
    types: ["restaurant"],
    businessType: null,
    currentRating: 4.2,
    totalReviews: 120,
    priceLevel: null,
    website: null,
    phone: null,
    isOpen: true,
    openingHours: null,
    bereikbaarheidOV: "goed",
    passantenPerDag: 1800,
    demografieData: null,
    locationScore: null,
    signalScore: 0,
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
    ...overrides,
  };
}

describe("gold profile regression suite", () => {
  it("keeps McDonald's out of top Turkish candidates", () => {
    const profile = {
      name: "turks amsterdam",
      concept: "restaurant",
      conceptDescription: "Turkse keuken in Amsterdam centrum",
      competitorKeywords: ["turks", "kebab", "mezze"],
      operatingModel: ["afhaal", "bezorging"],
    };

    const ranked = rankDeepCrawlCandidates(profile as never, [
      makeBusiness({
        id: "mc",
        name: "McDonald's Amsterdam",
        types: ["fast_food_restaurant", "restaurant"],
        signalScore: 90,
      }),
      makeBusiness({
        id: "ali",
        name: "Ali Ocakbaşı",
        types: ["turkish_restaurant", "restaurant"],
      }),
      makeBusiness({
        id: "wdc",
        name: "World doner center",
        types: ["kebab_shop", "restaurant"],
      }),
    ]);

    expect(ranked.map((item) => item.business.name)).not.toContain("McDonald's Amsterdam");
    expect(ranked.slice(0, 2).map((item) => item.business.name)).toEqual(
      expect.arrayContaining(["Ali Ocakbaşı", "World doner center"]),
    );
  });

  it("keeps sushi as adjacent for a poke profile, not irrelevant", () => {
    const assessment = assessBusinessAgainstProfile(
      makeBusiness({
        name: "Mr. Sushi Amsterdam",
        types: ["sushi_restaurant", "meal_delivery", "restaurant"],
      }),
      {
        name: "pokebowl amsterdam",
        concept: "poke_bowl",
        conceptDescription: "Gezonde bowls met delivery",
        competitorKeywords: ["poke bowl", "healthy bowl", "salad"],
        operatingModel: ["bezorging"],
      },
      null,
    );

    expect(assessment.tier).toBe("adjacent");
  });

  it("keeps poke businesses out of exact burger matches", () => {
    const assessment = assessBusinessAgainstProfile(
      makeBusiness({
        name: "Hawaiian Poké Bowl Amsterdam",
        types: ["hawaiian_restaurant", "meal_takeaway", "restaurant"],
      }),
      {
        name: "burger amsterdam",
        concept: "burger",
        conceptDescription: "Burgerbar fast casual",
        competitorKeywords: ["burger", "smash burger", "hamburger"],
        operatingModel: ["eat_in", "afhaal"],
      },
      null,
    );

    expect(assessment.tier).not.toBe("exact");
  });
});
