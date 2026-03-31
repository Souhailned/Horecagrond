import { describe, expect, it } from "vitest";

import {
  assessBusinessAgainstProfile,
  assessPlaceAgainstProfile,
  buildKeywordSetFromProfile,
  buildProfileIntent,
  deriveScanCategories,
  inferBusinessTypeFromPlace,
} from "./profile-intent";

describe("buildProfileIntent", () => {
  it("infers a Turkish concept from profile text even when concept is generic", () => {
    const intent = buildProfileIntent({
      name: "turks amsterdam",
      concept: "restaurant",
      conceptDescription: "Turkse keuken met bezorging en afhaal",
      competitorKeywords: ["turks"],
      operatingModel: ["afhaal", "bezorging"],
    });

    expect(intent.conceptKey).toBe("turkish_restaurant");
    expect(intent.primaryTerms).toContain("turks restaurant");
    expect(intent.primaryTerms).toContain("turks");
    expect(intent.genericTerms).toContain("afhaalrestaurant");
    expect(intent.scanCategories).toEqual(
      expect.arrayContaining(["restaurant", "meal_takeaway", "meal_delivery"]),
    );
  });

  it("derives scan categories from concept and operating model", () => {
    expect(
      deriveScanCategories({
        concept: "poke_bowl",
        competitorKeywords: ["poke bowl"],
        operatingModel: ["bezorging"],
      }),
    ).toEqual(
      expect.arrayContaining(["restaurant", "meal_takeaway", "meal_delivery"]),
    );
  });
});

describe("concept relevance assessment", () => {
  const turkishProfile = {
    name: "turks amsterdam",
    concept: "restaurant",
    conceptDescription: "Turks concept voor lunch en diner",
    competitorKeywords: ["turks", "kebab", "mezze"],
    operatingModel: ["afhaal", "bezorging"],
  };

  it("marks McDonald's style businesses as irrelevant for a Turkish profile", () => {
    const assessment = assessPlaceAgainstProfile(
      {
        name: "McDonald's Amsterdam Buikslotermeerplein",
        address: "Buikslotermeerplein 60-62, Amsterdam",
        website: "https://www.mcdonaldsrestaurant.nl/amsterdam",
        types: ["fast_food_restaurant", "meal_takeaway", "restaurant"],
      },
      turkishProfile,
    );

    expect(assessment.tier).toBe("irrelevant");
    expect(assessment.conflictingTags).toEqual(
      expect.arrayContaining(["burger", "fastfood"]),
    );
  });

  it("keeps directly matching Turkish concepts as exact matches", () => {
    const assessment = assessBusinessAgainstProfile(
      {
        name: "Anatolia Grill & Doner",
        address: "Albert Cuypstraat 10, Amsterdam",
        website: "https://anatolia.example",
        businessType: null,
        types: ["turkish_restaurant", "meal_takeaway", "restaurant"],
      },
      turkishProfile,
      null,
    );

    expect(assessment.tier).toBe("exact");
    expect(assessment.score).toBeGreaterThanOrEqual(18);
  });

  it("does not treat poke restaurants as exact burger matches", () => {
    const assessment = assessBusinessAgainstProfile(
      {
        name: "Hawaiian Poké Bowl - Amsterdam Ferdinand Bolstraat",
        address: "Ferdinand Bolstraat 53, Amsterdam",
        website: null,
        businessType: null,
        types: ["hawaiian_restaurant", "american_restaurant", "meal_takeaway", "fast_food_restaurant", "restaurant"],
      },
      {
        name: "burger amsterdam",
        concept: "burger",
        conceptDescription: "Burgerbar fast casual in Amsterdam",
        competitorKeywords: ["burger", "smash burger", "hamburger"],
        operatingModel: ["eat_in", "afhaal"],
      },
      null,
    );

    expect(assessment.tier).not.toBe("exact");
  });
});

describe("keyword planning and quick type inference", () => {
  it("builds high-precision keywords before generic fallback terms", () => {
    const keywordSet = buildKeywordSetFromProfile({
      concept: "restaurant",
      conceptDescription: "Turkse keuken",
      competitorKeywords: ["turks", "mezze"],
    });

    expect(keywordSet.primary).toEqual(
      expect.arrayContaining(["turks restaurant", "mezze"]),
    );
    expect(keywordSet.secondary).toEqual(
      expect.arrayContaining(["restaurant", "afhaalrestaurant"]),
    );
  });

  it("infers a useful businessType from place data", () => {
    expect(
      inferBusinessTypeFromPlace({
        name: "Sushi Hub Amsterdam",
        address: "Ceintuurbaan 1, Amsterdam",
        website: "https://sushihub.example",
        types: ["sushi_restaurant", "meal_delivery", "restaurant"],
      }),
    ).toBe("sushi");
  });
});
