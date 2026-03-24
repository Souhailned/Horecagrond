import { task, metadata, logger } from "@trigger.dev/sdk/v3";
import { generateObject } from "ai";
import { z } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkAiGeneratePayload {
  propertyIds: string[];
  type: "description" | "social";
  userId: string;
  role: "admin" | "agent" | "seeker";
}

export interface BulkAiGenerateResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    propertyId: string;
    success: boolean;
    error?: string;
  }>;
}

interface BulkProgress {
  completed: number;
  total: number;
  status: "running" | "completed" | "failed";
}

// ---------------------------------------------------------------------------
// AI helpers (self-contained for Trigger.dev worker context)
// ---------------------------------------------------------------------------

const listingTurboSchema = z.object({
  description: z
    .string()
    .describe(
      "Professionele beschrijving, 150-200 woorden, wervend maar eerlijk. Nederlands."
    ),
  shortDescription: z
    .string()
    .describe("Korte hook, max 50 woorden, pakt direct de aandacht."),
  highlights: z
    .array(z.string())
    .describe("4-6 korte bullet points met de belangrijkste USPs"),
  socialMedia: z.object({
    instagram: z
      .string()
      .describe(
        "Instagram caption met emoji's, max 2200 chars, met relevante hashtags"
      ),
    linkedin: z
      .string()
      .describe(
        "Professionele LinkedIn post, zakelijk maar enthousiast, max 1300 chars"
      ),
    facebook: z
      .string()
      .describe(
        "Casual Facebook post, uitnodigend en direct, max 500 chars"
      ),
  }),
  seoTitle: z
    .string()
    .describe("SEO-geoptimaliseerde titel, max 60 chars"),
  seoDescription: z
    .string()
    .describe("Meta description, max 155 chars, met call-to-action"),
});

type ListingTurboOutput = z.infer<typeof listingTurboSchema>;

const TYPE_LABELS: Record<string, string> = {
  RESTAURANT: "restaurant",
  CAFE: "cafe",
  BAR: "bar",
  HOTEL: "hotel",
  EETCAFE: "eetcafe",
  LUNCHROOM: "lunchroom",
  KOFFIEBAR: "koffiebar",
  PIZZERIA: "pizzeria",
  BAKERY: "bakkerij",
  DARK_KITCHEN: "dark kitchen",
  SNACKBAR: "snackbar",
  GRAND_CAFE: "grand cafe",
  COCKTAILBAR: "cocktailbar",
  NIGHTCLUB: "nachtclub",
  BED_AND_BREAKFAST: "bed & breakfast",
};

function formatPrice(cents: number, type: "RENT" | "SALE" | "BOTH"): string {
  const amount = `\u20AC${(cents / 100).toLocaleString("nl-NL")}`;
  return type === "RENT" ? `${amount}/mnd` : amount;
}

interface PropertyInput {
  title: string;
  city: string;
  address?: string;
  propertyType: string;
  surfaceTotal: number;
  rentPrice: number | null;
  salePrice: number | null;
  priceType: string;
  buildYear: number | null;
  seatingCapacityInside: number | null;
}

function buildPrompt(input: PropertyInput): string {
  const type = TYPE_LABELS[input.propertyType] || input.propertyType.toLowerCase();
  const price = input.rentPrice
    ? formatPrice(input.rentPrice, "RENT")
    : input.salePrice
      ? formatPrice(input.salePrice, "SALE")
      : "";

  return `Je bent een ervaren horeca-makelaar en copywriter. Genereer ALLE teksten voor een horecapand listing.

PAND:
- Type: ${type}
- Titel: ${input.title}
- Locatie: ${input.city}${input.address ? `, ${input.address}` : ""}
- Oppervlakte: ${input.surfaceTotal} m\u00B2
${price ? `- Prijs: ${price}` : ""}
${input.buildYear ? `- Bouwjaar: ${input.buildYear}` : ""}
${input.seatingCapacityInside ? `- Zitplaatsen: ${input.seatingCapacityInside}` : ""}

REGELS:
- Schrijf ALLES in het Nederlands
- Verzin GEEN informatie die niet gegeven is
- Noem NOOIT "AI" of "automatisch gegenereerd"
- Wees professioneel maar niet saai
- Focus op wat het pand uniek maakt
- Gebruik relevante hashtags voor social media (#horecagrond #horeca #${input.city.toLowerCase()} etc.)`;
}

async function getAiModel() {
  if (process.env.GROQ_API_KEY) {
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq("llama-3.3-70b-versatile");
  }
  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4o-mini");
  }
  return null;
}

function generateTemplate(input: PropertyInput): ListingTurboOutput {
  const type = TYPE_LABELS[input.propertyType] || "horecapand";
  const price = input.rentPrice
    ? formatPrice(input.rentPrice, "RENT")
    : input.salePrice
      ? formatPrice(input.salePrice, "SALE")
      : "";
  const priceType = input.priceType as "RENT" | "SALE" | "BOTH";

  return {
    description: `Bent u op zoek naar een unieke ${type} in ${input.city}? Dit pand van ${input.surfaceTotal} m\u00B2 biedt een uitstekende mogelijkheid voor ondernemers die hun droom willen realiseren.\n\nGelegen in het hart van ${input.city}, beschikt dit ${type} over alle faciliteiten die u nodig heeft.\n\nDe ruime opzet biedt voldoende ruimte voor een succesvolle horecaonderneming. Interesse? Neem direct contact op voor meer informatie of een bezichtiging.`,
    shortDescription: `${type.charAt(0).toUpperCase() + type.slice(1)} van ${input.surfaceTotal} m\u00B2 in ${input.city}.${price ? ` ${price}.` : ""} Direct beschikbaar voor ondernemers met ambitie.`,
    highlights: [
      `${input.surfaceTotal} m\u00B2 vloeroppervlak`,
      `Locatie: ${input.city}`,
      ...(price ? [`Prijs: ${price}`] : []),
      ...(input.seatingCapacityInside
        ? [`${input.seatingCapacityInside} zitplaatsen`]
        : []),
    ],
    socialMedia: {
      instagram: `\uD83C\uDFE2 Nieuw op Horecagrond!\n\n${type.charAt(0).toUpperCase() + type.slice(1)} in ${input.city} | ${input.surfaceTotal} m\u00B2${price ? ` | ${price}` : ""}\n\n\uD83D\uDCCD ${input.city}\n\uD83D\uDD11 Direct beschikbaar\n\n#horecagrond #horeca #${input.city.toLowerCase().replace(/\s/g, "")} #ondernemen #horecapand`,
      linkedin: `\uD83C\uDFE2 Nieuw horecapand beschikbaar in ${input.city}\n\nWij presenteren een ${type} van ${input.surfaceTotal} m\u00B2 op een uitstekende locatie in ${input.city}.${price ? ` Vraagprijs: ${price}.` : ""}\n\nIdeaal voor ondernemers die op zoek zijn naar een kant-en-klare horecalocatie.\n\nMeer info: horecagrond.nl`,
      facebook: `\uD83D\uDD25 Nieuw! ${type.charAt(0).toUpperCase() + type.slice(1)} in ${input.city} (${input.surfaceTotal} m\u00B2)${price ? ` voor ${price}` : ""}. Ken jij iemand die een horecapand zoekt? Tag ze! \uD83D\uDC47`,
    },
    seoTitle: `${input.title} | ${type.charAt(0).toUpperCase() + type.slice(1)} ${input.city}`,
    seoDescription: `${type.charAt(0).toUpperCase() + type.slice(1)} te ${priceType === "SALE" ? "koop" : "huur"} in ${input.city}. ${input.surfaceTotal} m\u00B2.${price ? ` ${price}.` : ""} Bekijk nu op Horecagrond.`,
  };
}

async function generateListing(
  input: PropertyInput
): Promise<ListingTurboOutput> {
  const model = await getAiModel();
  if (!model) {
    return generateTemplate(input);
  }

  try {
    const { object } = await generateObject({
      model,
      schema: listingTurboSchema,
      prompt: buildPrompt(input),
      temperature: 0.7,
      maxOutputTokens: 2000,
    });
    return object;
  } catch (error) {
    logger.warn("AI generation failed, using template", {
      error: error instanceof Error ? error.message : String(error),
    });
    return generateTemplate(input);
  }
}

// ---------------------------------------------------------------------------
// Prisma (standalone instance for Trigger.dev worker)
// ---------------------------------------------------------------------------

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const bulkAiGenerateTask = task({
  id: "bulk-ai-generate",
  queue: { name: "ai-generation", concurrencyLimit: 2 },
  maxDuration: 600, // 10 minutes
  retry: { maxAttempts: 1 },
  run: async (payload: BulkAiGeneratePayload): Promise<BulkAiGenerateResult> => {
    const { propertyIds, type, userId, role } = payload;
    const total = propertyIds.length;

    logger.info("Starting bulk AI generation", {
      total,
      type,
      userId,
    });

    metadata.set("progress", {
      completed: 0,
      total,
      status: "running",
    } satisfies BulkProgress);

    const prisma = createPrisma();
    const results: BulkAiGenerateResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    try {
      for (let i = 0; i < propertyIds.length; i++) {
        const propertyId = propertyIds[i];

        try {
          // Fetch property data (admins can access all, agents only own)
          const property = await prisma.property.findFirst({
            where: {
              id: propertyId,
              ...(role !== "admin" ? { createdById: userId } : {}),
            },
            select: {
              id: true,
              title: true,
              city: true,
              address: true,
              propertyType: true,
              surfaceTotal: true,
              rentPrice: true,
              salePrice: true,
              priceType: true,
              buildYear: true,
              seatingCapacityInside: true,
            },
          });

          if (!property) {
            results.push({
              propertyId,
              success: false,
              error: "Pand niet gevonden",
            });
            failed++;
            continue;
          }

          // Build input and generate content
          const input: PropertyInput = {
            title: property.title,
            city: property.city,
            address: property.address ?? undefined,
            propertyType: property.propertyType,
            surfaceTotal: property.surfaceTotal,
            rentPrice: property.rentPrice,
            salePrice: property.salePrice,
            priceType: property.priceType,
            buildYear: property.buildYear,
            seatingCapacityInside: property.seatingCapacityInside,
          };

          const output = await generateListing(input);

          // Persist based on type
          if (type === "description") {
            await prisma.property.update({
              where: { id: propertyId },
              data: {
                description: output.description,
                shortDescription: output.shortDescription,
              },
            });

            logger.info("Updated property descriptions", {
              propertyId,
              descriptionLength: output.description.length,
            });
          } else {
            // Social posts are not persisted to property; just included in results
            logger.info("Generated social content", {
              propertyId,
              platforms: Object.keys(output.socialMedia),
            });
          }

          results.push({ propertyId, success: true });
          succeeded++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Onbekende fout";
          logger.error("Failed to generate for property", {
            propertyId,
            error: errorMessage,
          });
          results.push({
            propertyId,
            success: false,
            error: errorMessage,
          });
          failed++;
        }

        // Update progress
        metadata.set("progress", {
          completed: i + 1,
          total,
          status: "running",
        } satisfies BulkProgress);

        // Rate limit delay between calls (skip after last)
        if (i < propertyIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      metadata.set("progress", {
        completed: total,
        total,
        status: "completed",
      } satisfies BulkProgress);

      logger.info("Bulk AI generation completed", {
        total,
        succeeded,
        failed,
      });

      return { total, succeeded, failed, results };
    } finally {
      await prisma.$disconnect();
    }
  },
});
