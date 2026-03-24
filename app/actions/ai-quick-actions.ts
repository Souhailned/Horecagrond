"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import {
  generateListingTurbo,
  type ListingTurboInput,
} from "@/app/actions/listing-turbo";
import type { ActionResult } from "@/types/actions";

// ---------------------------------------------------------------------------
// Shared Types & Validation
// ---------------------------------------------------------------------------

const propertyIdSchema = z.string().min(1, "Ongeldig pand-ID");

export interface StaleListingAdvice {
  diagnosis: string;
  suggestions: Array<{
    action: string;
    impact: "hoog" | "midden" | "laag";
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ListingTurboInput from a Property record. */
function toTurboInput(property: {
  propertyType: string;
  title: string;
  city: string;
  address: string;
  surfaceTotal: number;
  rentPrice: number | null;
  salePrice: number | null;
  priceType: string;
  buildYear: number | null;
  seatingCapacityInside: number | null;
  features: { key: string }[];
}): ListingTurboInput {
  return {
    propertyType: property.propertyType,
    title: property.title,
    city: property.city,
    address: property.address,
    surface: property.surfaceTotal,
    rentPrice: property.rentPrice ?? undefined,
    salePrice: property.salePrice ?? undefined,
    priceType: property.priceType as "RENT" | "SALE" | "BOTH",
    features: property.features.map((f) => f.key),
    buildYear: property.buildYear ?? undefined,
    seatingCapacity: property.seatingCapacityInside ?? undefined,
  };
}

/** Fetch the minimum set of property fields needed for AI generation.
 * Enforces ownership: non-admin users can only access their own properties.
 */
async function fetchPropertyForAi(
  id: string,
  userId: string,
  role: string
) {
  return prisma.property.findFirst({
    where: {
      id,
      ...(role === "admin" ? {} : { createdById: userId }),
    },
    select: {
      id: true,
      title: true,
      city: true,
      address: true,
      propertyType: true,
      priceType: true,
      rentPrice: true,
      salePrice: true,
      surfaceTotal: true,
      buildYear: true,
      seatingCapacityInside: true,
      description: true,
      shortDescription: true,
      status: true,
      viewCount: true,
      inquiryCount: true,
      savedCount: true,
      publishedAt: true,
      energyLabel: true,
      hasTerrace: true,
      hasParking: true,
      hasBasement: true,
      hasStorage: true,
      seatingCapacityOutside: true,
      surfaceTerrace: true,
      kitchenType: true,
      tags: true,
      features: { select: { key: true } },
      _count: { select: { images: true, inquiries: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Generate Property Description
// ---------------------------------------------------------------------------

export async function generatePropertyDescription(
  propertyId: string
): Promise<
  ActionResult<{
    description: string;
    shortDescription: string;
    highlights: string[];
  }>
> {
  const parsed = propertyIdSchema.safeParse(propertyId);
  if (!parsed.success) return { success: false, error: "Ongeldig pand-ID" };

  const authCheck = await requirePermission("ai:description");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };

  try {
    const property = await fetchPropertyForAi(parsed.data, sessionData.userId, sessionData.role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    const input = toTurboInput(property);
    const result = await generateListingTurbo(input);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const { description, shortDescription, highlights } = result.data;

    // Persist the generated description to the property record
    // Use property.id (fetched with ownership check) instead of raw propertyId
    await prisma.property.update({
      where: { id: property.id },
      data: { description, shortDescription },
    });

    return {
      success: true,
      data: { description, shortDescription, highlights },
    };
  } catch (error) {
    console.error("generatePropertyDescription error:", error);
    return { success: false, error: "Beschrijving genereren mislukt" };
  }
}

// ---------------------------------------------------------------------------
// 2. Generate Social Posts
// ---------------------------------------------------------------------------

export async function generatePropertySocialPosts(
  propertyId: string
): Promise<
  ActionResult<{
    instagram: string;
    linkedin: string;
    facebook: string;
  }>
> {
  const parsed = propertyIdSchema.safeParse(propertyId);
  if (!parsed.success) return { success: false, error: "Ongeldig pand-ID" };

  const authCheck = await requirePermission("ai:description");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };

  try {
    const property = await fetchPropertyForAi(parsed.data, sessionData.userId, sessionData.role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    const input = toTurboInput(property);
    const result = await generateListingTurbo(input);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const { socialMedia } = result.data;

    return {
      success: true,
      data: {
        instagram: socialMedia.instagram,
        linkedin: socialMedia.linkedin,
        facebook: socialMedia.facebook,
      },
    };
  } catch (error) {
    console.error("generatePropertySocialPosts error:", error);
    return { success: false, error: "Social posts genereren mislukt" };
  }
}

// ---------------------------------------------------------------------------
// 3. AI Advice
// ---------------------------------------------------------------------------

const adviceSchema = z.object({
  advice: z
    .string()
    .describe(
      "Korte analyse van de listing kwaliteit in 2-3 zinnen, Nederlands"
    ),
  suggestions: z
    .array(z.string())
    .describe(
      "3-5 concrete verbetervoorstellen, Nederlands, kort en actionable"
    ),
});

function generateAdviceTemplate(
  property: NonNullable<Awaited<ReturnType<typeof fetchPropertyForAi>>>
) {
  const suggestions: string[] = [];

  if (!property.description || property.description.length < 50) {
    suggestions.push(
      "Voeg een uitgebreide beschrijving toe (minstens 100 woorden) om beter gevonden te worden"
    );
  }
  if (property._count.images < 5) {
    suggestions.push(
      `Je hebt ${property._count.images} foto's. Voeg er minimaal 8-10 toe voor betere resultaten`
    );
  }
  if (!property.rentPrice && !property.salePrice) {
    suggestions.push(
      "Stel een vraagprijs in - panden zonder prijs krijgen minder reacties"
    );
  }
  if (property.features.length < 3) {
    suggestions.push(
      "Voeg meer kenmerken toe (keukentype, terras, parkeren) om zoekfilters te matchen"
    );
  }
  if (!property.energyLabel) {
    suggestions.push(
      "Vul het energielabel in - dit is voor veel zoekenden een belangrijke factor"
    );
  }
  if (suggestions.length === 0) {
    suggestions.push(
      "Overweeg professionele fotografie voor een betere eerste indruk",
      "Voeg een video-tour toe om de online bezichtiging te versterken",
      "Deel het pand op social media voor extra bereik"
    );
  }

  const score =
    (property.description && property.description.length > 50 ? 25 : 0) +
    (property._count.images >= 5 ? 25 : 0) +
    (property.rentPrice || property.salePrice ? 25 : 0) +
    (property.features.length >= 3 ? 25 : 0);

  const quality =
    score >= 75 ? "goed" : score >= 50 ? "gemiddeld" : "onvoldoende";

  return {
    advice: `De listing kwaliteit van "${property.title}" is ${quality} (${score}/100). ${
      score < 75
        ? "Er zijn verbeterpunten waarmee je meer bereik en reacties kunt genereren."
        : "De basis is op orde, maar er is altijd ruimte voor verbetering."
    }`,
    suggestions,
  };
}

export async function getPropertyAiAdvice(
  propertyId: string
): Promise<
  ActionResult<{
    advice: string;
    suggestions: string[];
  }>
> {
  const parsed = propertyIdSchema.safeParse(propertyId);
  if (!parsed.success) return { success: false, error: "Ongeldig pand-ID" };

  const authCheck = await requirePermission("ai:description");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };

  try {
    const property = await fetchPropertyForAi(parsed.data, sessionData.userId, sessionData.role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    let modelResult;
    try {
      const { model } = await getModel();
      modelResult = model;
    } catch {
      // No AI model available, use template
      return { success: true, data: generateAdviceTemplate(property) };
    }

    const prompt = `Je bent een ervaren horeca-makelaar en listing specialist. Analyseer deze horecapand listing en geef concrete verbetervoorstellen.

PAND:
- Titel: ${property.title}
- Type: ${property.propertyType}
- Locatie: ${property.city}
- Oppervlakte: ${property.surfaceTotal} m2
- Prijs huur: ${property.rentPrice ? `${(property.rentPrice / 100).toLocaleString("nl-NL")} euro/mnd` : "niet ingesteld"}
- Prijs koop: ${property.salePrice ? `${(property.salePrice / 100).toLocaleString("nl-NL")} euro` : "niet ingesteld"}
- Beschrijving: ${property.description ? `${property.description.length} tekens` : "GEEN"}
- Korte beschrijving: ${property.shortDescription ? "ja" : "GEEN"}
- Foto's: ${property._count.images}
- Kenmerken: ${property.features.length > 0 ? property.features.map((f) => f.key).join(", ") : "GEEN"}
- Energielabel: ${property.energyLabel ?? "niet ingesteld"}
- Bouwjaar: ${property.buildYear ?? "niet ingesteld"}
- Zitplaatsen binnen: ${property.seatingCapacityInside ?? "niet ingesteld"}
- Zitplaatsen buiten: ${property.seatingCapacityOutside ?? "niet ingesteld"}
- Terras: ${property.hasTerrace ? "ja" : "nee"}
- Parkeren: ${property.hasParking ? "ja" : "nee"}
- Status: ${property.status}
- Views: ${property.viewCount}
- Aanvragen: ${property.inquiryCount}
- Opgeslagen: ${property.savedCount}
- Tags: ${property.tags.length > 0 ? property.tags.join(", ") : "GEEN"}

REGELS:
- Schrijf alles in het Nederlands
- Wees concreet en actionable
- Focus op wat mist en wat beter kan
- Denk als een potentiele huurder/koper: wat zou je willen weten?`;

    try {
      const { object } = await generateObject({
        model: modelResult,
        schema: adviceSchema,
        prompt,
        temperature: 0.6,
        maxOutputTokens: 1000,
      });

      return { success: true, data: object };
    } catch (aiError) {
      console.error("AI advice generation failed, using template:", aiError);
      return { success: true, data: generateAdviceTemplate(property) };
    }
  } catch (error) {
    console.error("getPropertyAiAdvice error:", error);
    return { success: false, error: "AI advies ophalen mislukt" };
  }
}

// ---------------------------------------------------------------------------
// 4. Stale Listing Advice
// ---------------------------------------------------------------------------

const staleAdviceSchema = z.object({
  diagnosis: z
    .string()
    .describe(
      "Korte diagnose waarom dit pand achterblijft, 2-3 zinnen, Nederlands"
    ),
  suggestions: z
    .array(
      z.object({
        action: z
          .string()
          .describe("Concrete actie die de makelaar kan nemen"),
        impact: z
          .enum(["hoog", "midden", "laag"])
          .describe("Verwachte impact"),
      })
    )
    .describe("3-5 verbetervoorstellen met impact"),
});

function generateStaleTemplate(
  property: NonNullable<Awaited<ReturnType<typeof fetchPropertyForAi>>>,
  avgStats: { avgViews: number; avgInquiries: number }
): StaleListingAdvice {
  const suggestions: StaleListingAdvice["suggestions"] = [];
  const daysOnline = property.publishedAt
    ? Math.floor(
        (Date.now() - new Date(property.publishedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  // Analyze weak points based on data
  if (property.viewCount < avgStats.avgViews * 0.5) {
    suggestions.push({
      action:
        "Vernieuw de titel en eerste foto om de klikratio te verbeteren",
      impact: "hoog",
    });
  }

  if (
    property.viewCount > 0 &&
    property.inquiryCount < avgStats.avgInquiries * 0.5
  ) {
    suggestions.push({
      action:
        "Verbeter de beschrijving en voeg meer foto's toe om bezoekers te overtuigen",
      impact: "hoog",
    });
  }

  if (!property.rentPrice && !property.salePrice) {
    suggestions.push({
      action:
        "Stel een duidelijke vraagprijs in - panden zonder prijs worden vaak overgeslagen",
      impact: "hoog",
    });
  }

  if (property._count.images < 8) {
    suggestions.push({
      action: `Voeg meer foto's toe (nu ${property._count.images}, advies: minimaal 8-10)`,
      impact: "midden",
    });
  }

  if (daysOnline > 60) {
    suggestions.push({
      action:
        "Overweeg een prijsaanpassing - na 60+ dagen online kan de markt een signaal nodig hebben",
      impact: "midden",
    });
  }

  if (!property.description || property.description.length < 100) {
    suggestions.push({
      action:
        "Schrijf een uitgebreide beschrijving van minimaal 150 woorden",
      impact: "midden",
    });
  }

  if (suggestions.length < 3) {
    suggestions.push({
      action:
        "Deel het pand actief op social media en in je netwerk voor extra bereik",
      impact: "laag",
    });
    suggestions.push({
      action:
        "Organiseer een open huis of virtuele tour om meer interesse te wekken",
      impact: "midden",
    });
  }

  const viewRatio =
    avgStats.avgViews > 0
      ? Math.round((property.viewCount / avgStats.avgViews) * 100)
      : 0;

  return {
    diagnosis: `Dit pand staat ${daysOnline} dagen online met ${property.viewCount} views (${viewRatio}% van het gemiddelde in ${property.city}). ${
      property.inquiryCount === 0
        ? "Er zijn nog geen aanvragen binnengekomen, wat duidt op een probleem met de zichtbaarheid of presentatie."
        : `Met ${property.inquiryCount} aanvragen is de conversie lager dan verwacht.`
    }`,
    suggestions: suggestions.slice(0, 5),
  };
}

export async function getStaleListingAdvice(
  propertyId: string
): Promise<ActionResult<StaleListingAdvice>> {
  const parsed = propertyIdSchema.safeParse(propertyId);
  if (!parsed.success) return { success: false, error: "Ongeldig pand-ID" };

  const authCheck = await requirePermission("ai:description");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };

  try {
    const property = await fetchPropertyForAi(parsed.data, sessionData.userId, sessionData.role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    // Gather market stats for the same city & property type
    const marketStats = await prisma.property.aggregate({
      where: {
        city: property.city,
        propertyType: property.propertyType,
        status: "ACTIVE",
        id: { not: propertyId },
      },
      _avg: {
        viewCount: true,
        inquiryCount: true,
      },
    });

    const avgStats = {
      avgViews: Math.round(marketStats._avg.viewCount ?? 0),
      avgInquiries: Math.round(marketStats._avg.inquiryCount ?? 0),
    };

    let modelResult;
    try {
      const { model } = await getModel();
      modelResult = model;
    } catch {
      // No AI model available, use template
      return {
        success: true,
        data: generateStaleTemplate(property, avgStats),
      };
    }

    const daysOnline = property.publishedAt
      ? Math.floor(
          (Date.now() - new Date(property.publishedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    const prompt = `Je bent een ervaren horeca-makelaar. Analyseer waarom dit pand achterblijft en geef concrete aanbevelingen.

PAND:
- Titel: ${property.title}
- Type: ${property.propertyType}
- Locatie: ${property.city}
- Oppervlakte: ${property.surfaceTotal} m2
- Prijs huur: ${property.rentPrice ? `${(property.rentPrice / 100).toLocaleString("nl-NL")} euro/mnd` : "niet ingesteld"}
- Prijs koop: ${property.salePrice ? `${(property.salePrice / 100).toLocaleString("nl-NL")} euro` : "niet ingesteld"}
- Beschrijving: ${property.description ? `${property.description.length} tekens` : "GEEN"}
- Foto's: ${property._count.images}
- Kenmerken: ${property.features.length > 0 ? property.features.map((f) => f.key).join(", ") : "GEEN"}

PERFORMANCE:
- Dagen online: ${daysOnline}
- Views: ${property.viewCount} (gemiddeld in ${property.city}: ${avgStats.avgViews})
- Aanvragen: ${property.inquiryCount} (gemiddeld: ${avgStats.avgInquiries})
- Opgeslagen: ${property.savedCount}

REGELS:
- Schrijf alles in het Nederlands
- Wees eerlijk maar constructief
- Focus op de meest impactvolle verbeteringen eerst
- Denk als een horeca-ondernemer die zoekt naar een pand`;

    try {
      const { object } = await generateObject({
        model: modelResult,
        schema: staleAdviceSchema,
        prompt,
        temperature: 0.6,
        maxOutputTokens: 1000,
      });

      return { success: true, data: object };
    } catch (aiError) {
      console.error(
        "AI stale advice generation failed, using template:",
        aiError
      );
      return {
        success: true,
        data: generateStaleTemplate(property, avgStats),
      };
    }
  } catch (error) {
    console.error("getStaleListingAdvice error:", error);
    return { success: false, error: "Stale listing advies ophalen mislukt" };
  }
}
