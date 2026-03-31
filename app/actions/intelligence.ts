"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/types/actions";
import type { IntelligenceProfile } from "@/generated/prisma/client";
import { deriveScanCategories } from "@/lib/intelligence/profile-intent";

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const createProfileSchema = z.object({
  name: z.string().min(2, "Naam moet minimaal 2 tekens zijn").max(100),
  concept: z.string().min(2, "Concept is verplicht"),
  conceptDescription: z.string().max(500).optional(),
  targetCities: z
    .array(z.string())
    .min(1, "Selecteer minimaal 1 stad")
    .max(20),
  minSurface: z.number().int().positive().optional(),
  maxSurface: z.number().int().positive().optional(),
  locationTypes: z.array(z.string()).optional().default([]),
  targetAge: z.enum(["jong", "werkleeftijd", "any"]).optional(),
  minIncome: z.number().positive().optional(),
  minPassanten: z.number().int().positive().optional(),
  competitorKeywords: z
    .array(z.string())
    .min(1, "Voeg minimaal 1 keyword toe")
    .max(30),
  includeChains: z.boolean().optional().default(true),
  minChainSize: z.number().int().positive().optional(),
  maxChainSize: z.number().int().positive().optional(),
  // Visibility preferences
  visibilityPrefs: z.array(z.string()).optional().default([]),
  // Operating model
  operatingModel: z.array(z.string()).optional().default([]),
  // Exclusions
  excludeIndustrial: z.boolean().optional().default(true),
  excludeResidential: z.boolean().optional().default(true),
  minCityPopulation: z.number().int().positive().optional(),
  // Competition context
  positiveEnvironment: z.array(z.string()).optional().default([]),
  negativeEnvironment: z.array(z.string()).optional().default([]),
  // Client info (when makelaar creates profile for a client)
  clientName: z.string().max(100).optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
});

const updateProfileSchema = createProfileSchema.partial();

// ---------------------------------------------------------------------------
// CRUD Actions
// ---------------------------------------------------------------------------

/**
 * Create a new intelligence search profile
 */
export async function createIntelligenceProfile(
  data: z.infer<typeof createProfileSchema>,
): Promise<ActionResult<IntelligenceProfile>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  // Rate limit: max 5 profiles per day
  const rl = await checkRateLimit(`intelligence:create:${userId}`, "api");
  if (!rl.success)
    return {
      success: false,
      error: "Te veel verzoeken. Probeer later opnieuw.",
    };

  // Validate
  const parsed = createProfileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ongeldige invoer",
    };
  }

  // Surface validation
  if (parsed.data.minSurface && parsed.data.maxSurface) {
    if (parsed.data.minSurface > parsed.data.maxSurface) {
      return {
        success: false,
        error: "Minimum oppervlakte kan niet groter zijn dan maximum",
      };
    }
  }

  try {
    const scanCategories = deriveScanCategories(parsed.data);

    const profile = await prisma.intelligenceProfile.create({
      data: {
        userId,
        name: parsed.data.name,
        concept: parsed.data.concept,
        conceptDescription: parsed.data.conceptDescription,
        targetCities: parsed.data.targetCities,
        minSurface: parsed.data.minSurface,
        maxSurface: parsed.data.maxSurface,
        locationTypes: parsed.data.locationTypes ?? [],
        targetAge: parsed.data.targetAge,
        minIncome: parsed.data.minIncome,
        minPassanten: parsed.data.minPassanten,
        scanCategories,
        competitorKeywords: parsed.data.competitorKeywords,
        includeChains: parsed.data.includeChains ?? true,
        minChainSize: parsed.data.minChainSize,
        maxChainSize: parsed.data.maxChainSize,
        visibilityPrefs: parsed.data.visibilityPrefs ?? [],
        operatingModel: parsed.data.operatingModel ?? [],
        excludeIndustrial: parsed.data.excludeIndustrial ?? true,
        excludeResidential: parsed.data.excludeResidential ?? true,
        minCityPopulation: parsed.data.minCityPopulation,
        positiveEnvironment: parsed.data.positiveEnvironment ?? [],
        negativeEnvironment: parsed.data.negativeEnvironment ?? [],
        clientName: parsed.data.clientName || null,
        clientEmail: parsed.data.clientEmail || null,
      },
    });

    return { success: true, data: profile };
  } catch (error) {
    console.error("[intelligence] Create profile failed:", error);
    return { success: false, error: "Profiel aanmaken mislukt" };
  }
}

/**
 * Update an existing intelligence profile
 */
export async function updateIntelligenceProfile(
  id: string,
  data: z.infer<typeof updateProfileSchema>,
): Promise<ActionResult<IntelligenceProfile>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ongeldige invoer",
    };
  }

  try {
    // Verify ownership
    const existing = await prisma.intelligenceProfile.findFirst({
      where: { id, userId },
    });
    if (!existing)
      return { success: false, error: "Profiel niet gevonden" };

    const mergedProfileData = {
      ...existing,
      ...parsed.data,
      competitorKeywords:
        parsed.data.competitorKeywords ?? existing.competitorKeywords,
      operatingModel: parsed.data.operatingModel ?? existing.operatingModel,
      conceptDescription:
        parsed.data.conceptDescription ?? existing.conceptDescription,
    };

    const profile = await prisma.intelligenceProfile.update({
      where: { id },
      data: {
        ...parsed.data,
        scanCategories: deriveScanCategories(mergedProfileData),
      },
    });

    return { success: true, data: profile };
  } catch (error) {
    console.error("[intelligence] Update profile failed:", error);
    return { success: false, error: "Profiel bijwerken mislukt" };
  }
}

/**
 * List all intelligence profiles for the current user
 */
export async function getIntelligenceProfiles(): Promise<
  ActionResult<
    (IntelligenceProfile & {
      _count: { matches: number; scanJobs: number };
    })[]
  >
> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const profiles = await prisma.intelligenceProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            matches: true,
            scanJobs: true,
          },
        },
      },
    });

    return { success: true, data: profiles };
  } catch (error) {
    console.error("[intelligence] List profiles failed:", error);
    return { success: false, error: "Profielen ophalen mislukt" };
  }
}

/**
 * Get a single intelligence profile with stats
 */
export async function getIntelligenceProfile(
  id: string,
): Promise<
  ActionResult<
    IntelligenceProfile & {
      _count: { matches: number; scanJobs: number };
      recentMatches: number;
    }
  >
> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    const profile = await prisma.intelligenceProfile.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            matches: true,
            scanJobs: true,
          },
        },
      },
    });

    if (!profile)
      return { success: false, error: "Profiel niet gevonden" };

    // Count recent matches (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentMatches = await prisma.intelligenceMatch.count({
      where: {
        profileId: id,
        createdAt: { gte: weekAgo },
      },
    });

    return {
      success: true,
      data: { ...profile, recentMatches },
    };
  } catch (error) {
    console.error("[intelligence] Get profile failed:", error);
    return { success: false, error: "Profiel ophalen mislukt" };
  }
}

/**
 * Delete an intelligence profile and all its matches
 */
export async function deleteIntelligenceProfile(
  id: string,
): Promise<ActionResult<void>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId } = authCheck.data;

  try {
    // Verify ownership
    const existing = await prisma.intelligenceProfile.findFirst({
      where: { id, userId },
    });
    if (!existing)
      return { success: false, error: "Profiel niet gevonden" };

    // Cascade delete handles matches and scan jobs
    await prisma.intelligenceProfile.delete({ where: { id } });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("[intelligence] Delete profile failed:", error);
    return { success: false, error: "Profiel verwijderen mislukt" };
  }
}
