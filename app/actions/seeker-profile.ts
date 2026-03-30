"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { updateSeekerProfileSchema } from "@/lib/validations/seeker-profile";
import type { AlertFrequency as PrismaAlertFrequency } from "@/generated/prisma/client";
import type { ActionResult } from "@/types/actions";
import type {
  PropertyListItem,
  SeekerRecommendations,
  SeekerPreferences,
  SeekerProfile,
} from "@/types/property";

/**
 * Helper to get current session
 */
async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

/**
 * Map a Prisma Property (with primary image + agency) to PropertyListItem
 */
function mapPropertyToListItem(
  property: {
    id: string;
    title: string;
    slug: string;
    shortDescription: string | null;
    propertyType: string;
    status: string;
    priceType: string;
    rentPrice: number | null;
    salePrice: number | null;
    city: string;
    province: string | null;
    neighborhood: string | null;
    surfaceTotal: number;
    seatingCapacityInside: number | null;
    seatingCapacityOutside: number | null;
    hasTerrace: boolean;
    hasBasement: boolean;
    hasStorage: boolean;
    hasParking: boolean;
    kitchenType: string | null;
    horecaScore: string | null;
    featured: boolean;
    publishedAt: Date | null;
    viewCount: number;
    savedCount: number;
    images: { thumbnailUrl: string | null; altText: string | null }[];
    agency: { id: string; name: string; slug: string } | null;
  }
): PropertyListItem {
  const primaryImage = property.images[0];
  return {
    id: property.id,
    title: property.title,
    slug: property.slug,
    shortDescription: property.shortDescription,
    propertyType: property.propertyType as PropertyListItem["propertyType"],
    status: property.status as PropertyListItem["status"],
    priceType: property.priceType as PropertyListItem["priceType"],
    rentPrice: property.rentPrice,
    salePrice: property.salePrice,
    city: property.city,
    province: property.province,
    neighborhood: property.neighborhood,
    surfaceTotal: property.surfaceTotal,
    seatingCapacityInside: property.seatingCapacityInside,
    seatingCapacityOutside: property.seatingCapacityOutside,
    hasTerrace: property.hasTerrace,
    hasKitchen: property.kitchenType != null && property.kitchenType !== "none",
    horecaScore: property.horecaScore,
    featured: property.featured,
    publishedAt: property.publishedAt,
    viewCount: property.viewCount,
    savedCount: property.savedCount,
    primaryImage: primaryImage?.thumbnailUrl
      ? { thumbnailUrl: primaryImage.thumbnailUrl, altText: primaryImage.altText ?? null }
      : null,
    agency: property.agency
      ? { id: property.agency.id, name: property.agency.name, slug: property.agency.slug }
      : null,
  };
}

/**
 * Shared include/select for property queries returning PropertyListItem data
 */
const propertyListSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  propertyType: true,
  status: true,
  priceType: true,
  rentPrice: true,
  salePrice: true,
  city: true,
  province: true,
  neighborhood: true,
  surfaceTotal: true,
  seatingCapacityInside: true,
  seatingCapacityOutside: true,
  hasTerrace: true,
  hasBasement: true,
  hasStorage: true,
  hasParking: true,
  kitchenType: true,
  horecaScore: true,
  featured: true,
  publishedAt: true,
  viewCount: true,
  savedCount: true,
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { thumbnailUrl: true, altText: true },
  },
  agency: {
    select: { id: true, name: true, slug: true },
  },
} as const;

/**
 * Get the current user's seeker profile.
 * Returns null if no profile exists (does NOT auto-create).
 */
export async function getSeekerProfile(
  userId?: string
): Promise<ActionResult<SeekerProfile | null>> {
  try {
    const user = await getCurrentUser();

    if (!user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    const targetUserId = userId || user.id;

    // Only allow users to view their own profile unless admin
    if (targetUserId !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const profile = await prisma.seekerProfile.findUnique({
      where: { userId: targetUserId },
    });

    if (!profile) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: profile.id,
        userId: profile.userId,
        businessType: profile.businessType ?? undefined,
        conceptDescription: profile.conceptDescription ?? undefined,
        experienceYears: profile.experienceYears ?? undefined,
        hasBusinessPlan: profile.hasBusinessPlan,
        budgetMin: profile.budgetMin ?? undefined,
        budgetMax: profile.budgetMax ?? undefined,
        preferredCities: profile.preferredCities,
        preferredProvinces: profile.preferredProvinces,
        preferredTypes: profile.preferredTypes,
        minSurface: profile.minSurface ?? undefined,
        maxSurface: profile.maxSurface ?? undefined,
        mustHaveFeatures: profile.mustHaveFeatures,
        niceToHaveFeatures: profile.niceToHaveFeatures,
        emailAlerts: profile.emailAlerts,
        pushAlerts: profile.pushAlerts,
        alertFrequency: profile.alertFrequency,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error) {
    console.error("Error getting seeker profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get profile",
    };
  }
}

/**
 * Update the seeker profile with Zod validation.
 * Upserts: creates if not exists, updates if exists.
 */
export async function updateSeekerProfile(
  data: Partial<SeekerProfile>
): Promise<ActionResult<SeekerProfile>> {
  try {
    const user = await getCurrentUser();

    if (!user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate input with Zod
    const validated = updateSeekerProfileSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const input = validated.data;

    const profile = await prisma.seekerProfile.upsert({
      where: { userId: user.id },
      update: {
        businessType: input.businessType,
        conceptDescription: input.conceptDescription,
        experienceYears: input.experienceYears,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        preferredCities: input.preferredCities,
        preferredTypes: input.preferredTypes,
        minSurface: input.minSurface,
        maxSurface: input.maxSurface,
        mustHaveFeatures: input.mustHaveFeatures,
        emailAlerts: input.emailAlerts,
        alertFrequency: input.alertFrequency as PrismaAlertFrequency | undefined,
      },
      create: {
        userId: user.id,
        businessType: input.businessType,
        conceptDescription: input.conceptDescription,
        experienceYears: input.experienceYears,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        preferredCities: input.preferredCities ?? [],
        preferredProvinces: [],
        preferredTypes: input.preferredTypes ?? [],
        minSurface: input.minSurface,
        maxSurface: input.maxSurface,
        mustHaveFeatures: input.mustHaveFeatures ?? [],
        niceToHaveFeatures: [],
        emailAlerts: input.emailAlerts ?? true,
        pushAlerts: false,
        alertFrequency: (input.alertFrequency ?? "DAILY") as PrismaAlertFrequency,
        hasBusinessPlan: false,
      },
    });

    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        id: profile.id,
        userId: profile.userId,
        businessType: profile.businessType ?? undefined,
        conceptDescription: profile.conceptDescription ?? undefined,
        experienceYears: profile.experienceYears ?? undefined,
        hasBusinessPlan: profile.hasBusinessPlan,
        budgetMin: profile.budgetMin ?? undefined,
        budgetMax: profile.budgetMax ?? undefined,
        preferredCities: profile.preferredCities,
        preferredProvinces: profile.preferredProvinces,
        preferredTypes: profile.preferredTypes,
        minSurface: profile.minSurface ?? undefined,
        maxSurface: profile.maxSurface ?? undefined,
        mustHaveFeatures: profile.mustHaveFeatures,
        niceToHaveFeatures: profile.niceToHaveFeatures,
        emailAlerts: profile.emailAlerts,
        pushAlerts: profile.pushAlerts,
        alertFrequency: profile.alertFrequency,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error) {
    console.error("Error updating seeker profile:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

/**
 * Complete seeker onboarding with initial profile data.
 * Uses a transaction to update User and create/update SeekerProfile atomically.
 */
export async function completeSeekerOnboarding(
  data: Partial<SeekerProfile>
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();

    if (!user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          onboardingCompleted: true,
        },
      }),
      prisma.seekerProfile.upsert({
        where: { userId: user.id },
        update: {
          businessType: data.businessType,
          conceptDescription: data.conceptDescription,
          experienceYears: data.experienceYears,
          hasBusinessPlan: data.hasBusinessPlan ?? false,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          preferredCities: data.preferredCities ?? [],
          preferredProvinces: data.preferredProvinces ?? [],
          preferredTypes: data.preferredTypes ?? [],
          minSurface: data.minSurface,
          maxSurface: data.maxSurface,
          mustHaveFeatures: data.mustHaveFeatures ?? [],
          niceToHaveFeatures: data.niceToHaveFeatures ?? [],
          emailAlerts: data.emailAlerts ?? true,
          pushAlerts: data.pushAlerts ?? false,
          alertFrequency: data.alertFrequency ?? "DAILY",
        },
        create: {
          userId: user.id,
          businessType: data.businessType,
          conceptDescription: data.conceptDescription,
          experienceYears: data.experienceYears,
          hasBusinessPlan: data.hasBusinessPlan ?? false,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          preferredCities: data.preferredCities ?? [],
          preferredProvinces: data.preferredProvinces ?? [],
          preferredTypes: data.preferredTypes ?? [],
          minSurface: data.minSurface,
          maxSurface: data.maxSurface,
          mustHaveFeatures: data.mustHaveFeatures ?? [],
          niceToHaveFeatures: data.niceToHaveFeatures ?? [],
          emailAlerts: data.emailAlerts ?? true,
          pushAlerts: data.pushAlerts ?? false,
          alertFrequency: data.alertFrequency ?? "DAILY",
        },
      }),
    ]);

    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error completing seeker onboarding:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding",
    };
  }
}

/**
 * Get seeker recommendations based on user preferences.
 * Returns recommended properties, recently viewed, and new matches.
 */
export async function getSeekerRecommendations(): Promise<
  ActionResult<SeekerRecommendations>
> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return {
        success: false,
        error: "Je moet ingelogd zijn om aanbevelingen te zien",
      };
    }

    // Fetch the seeker profile for preference-based filtering
    const seekerProfile = await prisma.seekerProfile.findUnique({
      where: { userId: user.id },
    });

    if (!seekerProfile) {
      return {
        success: true,
        data: {
          recommended: [],
          recentlyViewed: [],
          newMatches: [],
          hasPreferences: false,
        },
      };
    }

    // Build preference-based where clause for recommended properties
    const preferenceFilters: Record<string, unknown> = {
      status: "ACTIVE",
    };

    if (seekerProfile.preferredCities.length > 0) {
      preferenceFilters.city = { in: seekerProfile.preferredCities };
    }

    if (seekerProfile.preferredTypes.length > 0) {
      preferenceFilters.propertyType = { in: seekerProfile.preferredTypes };
    }

    // Budget filter: match rent or sale price within budget range
    if (seekerProfile.budgetMin != null || seekerProfile.budgetMax != null) {
      const priceConditions: Record<string, unknown>[] = [];

      // Rent price range
      const rentCondition: Record<string, unknown> = {};
      if (seekerProfile.budgetMin != null) rentCondition.gte = seekerProfile.budgetMin;
      if (seekerProfile.budgetMax != null) rentCondition.lte = seekerProfile.budgetMax;
      priceConditions.push({ rentPrice: rentCondition });

      // Sale price range
      const saleCondition: Record<string, unknown> = {};
      if (seekerProfile.budgetMin != null) saleCondition.gte = seekerProfile.budgetMin;
      if (seekerProfile.budgetMax != null) saleCondition.lte = seekerProfile.budgetMax;
      priceConditions.push({ salePrice: saleCondition });

      preferenceFilters.OR = priceConditions;
    }

    // Fetch recommended properties based on preferences
    const recommendedRaw = await prisma.property.findMany({
      where: preferenceFilters,
      select: propertyListSelect,
      orderBy: { publishedAt: "desc" },
      take: 6,
    });

    const recommended = recommendedRaw.map(mapPropertyToListItem);

    // Fetch recently viewed properties
    const recentViews = await prisma.propertyView.findMany({
      where: { userId: user.id },
      orderBy: { viewedAt: "desc" },
      take: 6,
      select: {
        property: {
          select: propertyListSelect,
        },
      },
    });

    const recentlyViewed = recentViews.map((view) =>
      mapPropertyToListItem(view.property)
    );

    // New matches: active properties matching preferences, published in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newMatchesRaw = await prisma.property.findMany({
      where: {
        ...preferenceFilters,
        publishedAt: { gte: sevenDaysAgo },
      },
      select: propertyListSelect,
      orderBy: { publishedAt: "desc" },
      take: 6,
    });

    const newMatches = newMatchesRaw.map(mapPropertyToListItem);

    return {
      success: true,
      data: {
        recommended,
        recentlyViewed,
        newMatches,
        hasPreferences: true,
      },
    };
  } catch (error) {
    console.error("Error fetching seeker recommendations:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het ophalen van aanbevelingen",
    };
  }
}

/**
 * Get seeker profile preferences.
 * Returns null if no profile exists.
 */
export async function getSeekerPreferences(): Promise<
  ActionResult<SeekerPreferences | null>
> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return {
        success: false,
        error: "Je moet ingelogd zijn",
      };
    }

    const profile = await prisma.seekerProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        budgetMin: profile.budgetMin,
        budgetMax: profile.budgetMax,
        preferredCities: profile.preferredCities,
        preferredProvinces: profile.preferredProvinces,
        preferredTypes: profile.preferredTypes,
        minSurface: profile.minSurface,
        maxSurface: profile.maxSurface,
        mustHaveFeatures: profile.mustHaveFeatures,
        niceToHaveFeatures: profile.niceToHaveFeatures,
      },
    };
  } catch (error) {
    console.error("Error fetching seeker preferences:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het ophalen van voorkeuren",
    };
  }
}

/**
 * Check if a property is saved by the current user.
 */
export async function isPropertySaved(
  propertyId: string
): Promise<ActionResult<boolean>> {
  try {
    const user = await getCurrentUser();

    if (!user?.id) {
      return { success: true, data: false };
    }

    const saved = await prisma.savedProperty.findUnique({
      where: {
        userId_propertyId: {
          userId: user.id,
          propertyId,
        },
      },
    });

    return { success: true, data: !!saved };
  } catch (error) {
    console.error("Error checking saved property:", error);
    return { success: true, data: false };
  }
}
