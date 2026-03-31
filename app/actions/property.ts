"use server";

import type { ActionResult } from "@/types/actions";
import type { Property, PropertyFeature as PropertyFeatureEnum } from "@/types/property";
import type {
  PropertyImage,
  PropertyFeature as PropertyFeatureDetail,
  UpdatePropertyInput,
  PropertyInquiryInput,
  PropertyViewInput,
} from "@/lib/validations/property";
import { updatePropertySchema, propertyInquirySchema, propertyViewSchema } from "@/lib/validations/property";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

// Property with relations type
export type PropertyWithRelations = Extract<
  Awaited<ReturnType<typeof getPropertyBySlug>>,
  { success: true }
>["data"];

/**
 * Build the shared include for property queries returning full Property data.
 * Using a function avoids `as const` readonly tuple issues with Prisma types.
 */
function getPropertyFullInclude() {
  return {
    images: {
      orderBy: [
        { isPrimary: "desc" as const },
        { order: "asc" as const },
      ],
      select: {
        id: true,
        propertyId: true,
        originalUrl: true,
        thumbnailUrl: true,
        mediumUrl: true,
        largeUrl: true,
        enhancedUrl: true,
        type: true,
        caption: true,
        altText: true,
        order: true,
        isPrimary: true,
        aiProcessed: true,
        width: true,
        height: true,
      },
    },
    features: {
      orderBy: [
        { highlighted: "desc" as const },
        { displayOrder: "asc" as const },
      ],
      select: {
        id: true,
        propertyId: true,
        category: true,
        key: true,
        value: true,
        numericValue: true,
        booleanValue: true,
        verified: true,
        highlighted: true,
        displayOrder: true,
      },
    },
    agency: {
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  };
}

/**
 * Map a Prisma property result (with includes) to the Property type
 */
function mapPrismaToProperty(p: Record<string, unknown>): Property {
  const raw = p as Record<string, unknown>;
  return {
    id: raw.id as string,
    agencyId: raw.agencyId as string,
    createdById: raw.createdById as string,

    title: raw.title as string,
    slug: raw.slug as string,
    description: raw.description as string | undefined,
    shortDescription: raw.shortDescription as string | undefined,

    address: raw.address as string,
    addressLine2: raw.addressLine2 as string | undefined,
    city: raw.city as string,
    postalCode: raw.postalCode as string,
    province: raw.province as string | undefined,
    country: raw.country as string,
    latitude: raw.latitude as number | undefined,
    longitude: raw.longitude as number | undefined,
    neighborhood: raw.neighborhood as string | undefined,

    priceType: raw.priceType as Property["priceType"],
    rentPrice: raw.rentPrice as number | undefined,
    rentPriceMin: raw.rentPriceMin as number | undefined,
    salePrice: raw.salePrice as number | undefined,
    salePriceMin: raw.salePriceMin as number | undefined,
    priceNegotiable: raw.priceNegotiable as boolean,
    servicesCosts: raw.servicesCosts as number | undefined,
    depositMonths: raw.depositMonths as number | undefined,

    surfaceTotal: raw.surfaceTotal as number,
    surfaceCommercial: raw.surfaceCommercial as number | undefined,
    surfaceKitchen: raw.surfaceKitchen as number | undefined,
    surfaceStorage: raw.surfaceStorage as number | undefined,
    surfaceTerrace: raw.surfaceTerrace as number | undefined,
    surfaceBasement: raw.surfaceBasement as number | undefined,
    floors: raw.floors as number,
    ceilingHeight: raw.ceilingHeight as number | undefined,

    propertyType: raw.propertyType as Property["propertyType"],
    type: raw.propertyType as Property["propertyType"],
    status: raw.status as Property["status"],

    seatingCapacityInside: raw.seatingCapacityInside as number | undefined,
    seatingCapacityOutside: raw.seatingCapacityOutside as number | undefined,
    standingCapacity: raw.standingCapacity as number | undefined,
    kitchenType: raw.kitchenType as string | undefined,
    hasBasement: raw.hasBasement as boolean,
    hasStorage: raw.hasStorage as boolean,
    hasTerrace: raw.hasTerrace as boolean,
    hasParking: raw.hasParking as boolean,
    parkingSpaces: raw.parkingSpaces as number | undefined,

    previousUse: raw.previousUse as string | undefined,
    wasHoreca: raw.wasHoreca as boolean | undefined,
    previousHorecaType: raw.previousHorecaType as Property["propertyType"] | undefined,
    yearsHoreca: raw.yearsHoreca as number | undefined,

    buildYear: raw.buildYear as number | undefined,
    lastRenovation: raw.lastRenovation as number | undefined,
    monumentStatus: raw.monumentStatus as boolean | undefined,
    energyLabel: raw.energyLabel as string | undefined,

    horecaScore: raw.horecaScore as string | undefined,
    horecaScoreDetails: raw.horecaScoreDetails as Record<string, unknown> | undefined,
    locationScore: raw.locationScore as number | undefined,
    footfallEstimate: raw.footfallEstimate as number | undefined,

    metaTitle: raw.metaTitle as string | undefined,
    metaDescription: raw.metaDescription as string | undefined,
    featured: raw.featured as boolean,
    featuredUntil: raw.featuredUntil as Date | undefined,
    boostUntil: raw.boostUntil as Date | undefined,

    availableFrom: raw.availableFrom as Date | undefined,
    availableUntil: raw.availableUntil as Date | undefined,
    minimumLeaseTerm: raw.minimumLeaseTerm as number | undefined,

    publishedAt: raw.publishedAt as Date | undefined,
    expiresAt: raw.expiresAt as Date | undefined,
    viewCount: raw.viewCount as number,
    inquiryCount: raw.inquiryCount as number,
    savedCount: raw.savedCount as number,

    createdAt: raw.createdAt as Date,
    updatedAt: raw.updatedAt as Date,

    images: (raw.images as PropertyImage[]) ?? [],
    features: ((raw.features as Array<{ key: string }>) ?? []).map(
      (f) => f.key as PropertyFeatureEnum
    ),
    agency: raw.agency as Property["agency"],
    creator: raw.createdBy as Property["creator"],
  } as Property;
}

/**
 * Get a property by ID with all relations
 */
export async function getProperty(id: string): Promise<ActionResult<Property>> {
  try {
    const property = await prisma.property.findUnique({
      where: { id },
      include: getPropertyFullInclude(),
    });

    if (!property) {
      return {
        success: false,
        error: "Pand niet gevonden",
      };
    }

    return {
      success: true,
      data: mapPrismaToProperty(property as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Error fetching property:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het ophalen van het pand",
    };
  }
}

/**
 * Get a property by its slug with all related data (database)
 */
export async function getPropertyBySlug(slug: string): Promise<ActionResult<{
  id: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  address: string;
  addressLine2: string | null;
  city: string;
  postalCode: string;
  province: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  priceType: "RENT" | "SALE" | "RENT_OR_SALE";
  rentPrice: number | null;
  rentPriceMin: number | null;
  salePrice: number | null;
  salePriceMin: number | null;
  priceNegotiable: boolean;
  servicesCosts: number | null;
  depositMonths: number | null;
  surfaceTotal: number;
  surfaceCommercial: number | null;
  surfaceKitchen: number | null;
  surfaceStorage: number | null;
  surfaceTerrace: number | null;
  surfaceBasement: number | null;
  floors: number;
  ceilingHeight: number | null;
  propertyType: string;
  status: string;
  seatingCapacityInside: number | null;
  seatingCapacityOutside: number | null;
  standingCapacity: number | null;
  kitchenType: string | null;
  hasBasement: boolean;
  hasStorage: boolean;
  hasTerrace: boolean;
  hasParking: boolean;
  parkingSpaces: number | null;
  previousUse: string | null;
  wasHoreca: boolean;
  previousHorecaType: string | null;
  yearsHoreca: number | null;
  buildYear: number | null;
  lastRenovation: number | null;
  monumentStatus: boolean;
  energyLabel: string | null;
  horecaScore: string | null;
  horecaScoreDetails: unknown;
  locationScore: number | null;
  footfallEstimate: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  featured: boolean;
  availableFrom: Date | null;
  availableUntil: Date | null;
  minimumLeaseTerm: number | null;
  publishedAt: Date | null;
  viewCount: number;
  inquiryCount: number;
  savedCount: number;
  createdAt: Date;
  updatedAt: Date;
  images: Array<{
    id: string;
    originalUrl: string;
    thumbnailUrl: string | null;
    mediumUrl: string | null;
    largeUrl: string | null;
    enhancedUrl: string | null;
    type: string;
    caption: string | null;
    altText: string | null;
    order: number;
    isPrimary: boolean;
  }>;
  features: Array<{
    id: string;
    category: string;
    key: string;
    value: string | null;
    numericValue: number | null;
    booleanValue: boolean | null;
    verified: boolean;
    highlighted: boolean;
    displayOrder: number;
  }>;
  agency: {
    id: string;
    name: string;
    slug: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    logo: string | null;
    description: string | null;
    city: string | null;
    province: string | null;
  };
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    phone: string | null;
  };
} | null>> {
  try {
    const property = await prisma.property.findUnique({
      where: {
        slug,
        status: "ACTIVE",
      },
      include: {
        images: {
          orderBy: [
            { isPrimary: "desc" },
            { order: "asc" },
          ],
          select: {
            id: true,
            originalUrl: true,
            thumbnailUrl: true,
            mediumUrl: true,
            largeUrl: true,
            enhancedUrl: true,
            type: true,
            caption: true,
            altText: true,
            order: true,
            isPrimary: true,
          },
        },
        features: {
          orderBy: [
            { highlighted: "desc" },
            { displayOrder: "asc" },
          ],
          select: {
            id: true,
            category: true,
            key: true,
            value: true,
            numericValue: true,
            booleanValue: true,
            verified: true,
            highlighted: true,
            displayOrder: true,
          },
        },
        agency: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            phone: true,
            website: true,
            logo: true,
            description: true,
            city: true,
            province: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            phone: true,
          },
        },
      },
    });

    return { success: true, data: property };
  } catch (error) {
    console.error("Error fetching property:", error);
    return { success: false, error: "Er is een fout opgetreden bij het ophalen van het pand" };
  }
}

/**
 * Update a property
 */
export async function updateProperty(
  input: UpdatePropertyInput
): Promise<ActionResult<Property>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    // Validate input
    const validated = updatePropertySchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || "Validatie mislukt",
      };
    }

    const { id, ...updates } = validated.data;

    // Check the property exists and the user owns it
    const existing = await prisma.property.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    // Update the property
    // Cast to satisfy Prisma's Json input type for horecaScoreDetails
    const updated = await prisma.property.update({
      where: { id },
      data: updates as Parameters<typeof prisma.property.update>[0]["data"],
      include: getPropertyFullInclude(),
    });

    revalidatePath("/dashboard/panden");
    revalidatePath(`/dashboard/panden/${id}`);

    return {
      success: true,
      data: mapPrismaToProperty(updated as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Error updating property:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het bijwerken van het pand",
    };
  }
}

/**
 * Publish a property (set status to ACTIVE)
 */
export async function publishProperty(id: string): Promise<ActionResult<Property>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const existing = await prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        createdById: true,
        title: true,
        address: true,
        city: true,
        surfaceTotal: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    // Check required fields for publishing
    if (!existing.title || !existing.address || !existing.city || !existing.surfaceTotal) {
      return {
        success: false,
        error: "Niet alle verplichte velden zijn ingevuld",
      };
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        status: "ACTIVE",
        publishedAt: new Date(),
      },
      include: getPropertyFullInclude(),
    });

    revalidatePath("/dashboard/panden");
    revalidatePath(`/dashboard/panden/${id}`);

    return {
      success: true,
      data: mapPrismaToProperty(updated as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Error publishing property:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het publiceren",
    };
  }
}

/**
 * Unpublish a property (set status to DRAFT)
 */
export async function unpublishProperty(id: string): Promise<ActionResult<Property>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const existing = await prisma.property.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        status: "DRAFT",
        publishedAt: null,
      },
      include: getPropertyFullInclude(),
    });

    revalidatePath("/dashboard/panden");
    revalidatePath(`/dashboard/panden/${id}`);

    return {
      success: true,
      data: mapPrismaToProperty(updated as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Error unpublishing property:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het depubliceren",
    };
  }
}

/**
 * Delete a property (set status to ARCHIVED)
 */
export async function deleteProperty(id: string): Promise<ActionResult<void>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const existing = await prisma.property.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    await prisma.property.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    revalidatePath("/dashboard/panden");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error deleting property:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het verwijderen",
    };
  }
}

/**
 * Get property statistics for charts
 */
export async function getPropertyStats(
  id: string
): Promise<ActionResult<{
  viewsByDay: Array<{ date: string; views: number; inquiries: number }>;
  totalViews: number;
  totalInquiries: number;
  totalSaves: number;
  conversionRate: number;
}>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const property = await prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        createdById: true,
        viewCount: true,
        inquiryCount: true,
        savedCount: true,
      },
    });

    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (property.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    // Get views and inquiries per day for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [views, inquiries] = await Promise.all([
      prisma.propertyView.findMany({
        where: {
          propertyId: id,
          viewedAt: { gte: thirtyDaysAgo },
        },
        select: { viewedAt: true },
      }),
      prisma.propertyInquiry.findMany({
        where: {
          propertyId: id,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { createdAt: true },
      }),
    ]);

    // Aggregate by day
    const viewsByDayMap = new Map<string, { views: number; inquiries: number }>();

    // Initialize all 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const key = date.toISOString().split("T")[0];
      viewsByDayMap.set(key, { views: 0, inquiries: 0 });
    }

    // Count views per day
    for (const view of views) {
      const key = view.viewedAt.toISOString().split("T")[0];
      const entry = viewsByDayMap.get(key);
      if (entry) entry.views++;
    }

    // Count inquiries per day
    for (const inquiry of inquiries) {
      const key = inquiry.createdAt.toISOString().split("T")[0];
      const entry = viewsByDayMap.get(key);
      if (entry) entry.inquiries++;
    }

    const viewsByDay = Array.from(viewsByDayMap.entries()).map(([date, data]) => ({
      date,
      views: data.views,
      inquiries: data.inquiries,
    }));

    const conversionRate = property.viewCount > 0
      ? Math.round((property.inquiryCount / property.viewCount) * 10000) / 100
      : 0;

    return {
      success: true,
      data: {
        viewsByDay,
        totalViews: property.viewCount,
        totalInquiries: property.inquiryCount,
        totalSaves: property.savedCount,
        conversionRate,
      },
    };
  } catch (error) {
    console.error("Error fetching property stats:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het ophalen van statistieken",
    };
  }
}

/**
 * Get similar properties based on type, city, and price range
 */
export async function getSimilarProperties(
  propertyId: string,
  propertyType: string,
  city: string,
  priceType: string,
  limit: number = 3
): Promise<ActionResult<Array<{
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  city: string;
  priceType: string;
  rentPrice: number | null;
  salePrice: number | null;
  surfaceTotal: number;
  propertyType: string;
  images: Array<{
    id: string;
    thumbnailUrl: string | null;
    mediumUrl: string | null;
    isPrimary: boolean;
  }>;
}>>> {
  try {
    const properties = await prisma.property.findMany({
      where: {
        id: { not: propertyId },
        status: "ACTIVE",
        OR: [
          { propertyType: { equals: propertyType as any } },
          { city },
        ],
      },
      take: limit,
      orderBy: [
        { featured: "desc" },
        { publishedAt: "desc" },
      ],
      select: {
        id: true,
        slug: true,
        title: true,
        shortDescription: true,
        city: true,
        priceType: true,
        rentPrice: true,
        salePrice: true,
        surfaceTotal: true,
        propertyType: true,
        images: {
          where: { isPrimary: true },
          take: 1,
          select: {
            id: true,
            thumbnailUrl: true,
            mediumUrl: true,
            isPrimary: true,
          },
        },
      },
    });

    return { success: true, data: properties };
  } catch (error) {
    console.error("Error fetching similar properties:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

/**
 * Update property images
 */
export async function updatePropertyImages(
  propertyId: string,
  images: PropertyImage[]
): Promise<ActionResult<PropertyImage[]>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const existing = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    // Transaction: delete existing images, create new ones
    await prisma.$transaction([
      prisma.propertyImage.deleteMany({
        where: { propertyId },
      }),
      ...images.map((img, index) =>
        prisma.propertyImage.create({
          data: {
            propertyId,
            originalUrl: img.originalUrl,
            thumbnailUrl: img.thumbnailUrl ?? null,
            mediumUrl: img.mediumUrl ?? null,
            largeUrl: img.largeUrl ?? null,
            enhancedUrl: img.enhancedUrl ?? null,
            type: img.type as any,
            caption: img.caption ?? null,
            altText: img.altText ?? null,
            order: img.order ?? index,
            isPrimary: img.isPrimary ?? (index === 0),
            aiProcessed: img.aiProcessed ?? false,
          },
        })
      ),
    ]);

    // Fetch the created images to return
    const createdImages = await prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: "asc" },
    });

    revalidatePath(`/dashboard/panden/${propertyId}`);

    return {
      success: true,
      data: createdImages.map((img) => ({
        id: img.id,
        propertyId: img.propertyId,
        originalUrl: img.originalUrl,
        thumbnailUrl: img.thumbnailUrl ?? undefined,
        type: img.type as PropertyImage["type"],
        caption: img.caption ?? undefined,
        altText: img.altText ?? undefined,
        order: img.order,
        isPrimary: img.isPrimary,
        aiProcessed: img.aiProcessed,
      })),
    };
  } catch (error) {
    console.error("Error updating property images:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het bijwerken van afbeeldingen",
    };
  }
}

/**
 * Update property features
 */
export async function updatePropertyFeatures(
  propertyId: string,
  features: PropertyFeatureDetail[]
): Promise<ActionResult<PropertyFeatureDetail[]>> {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Niet ingelogd" };
    }

    const existing = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return { success: false, error: "Pand niet gevonden" };
    }

    if (existing.createdById !== session.user.id && session.user.role !== "admin") {
      return { success: false, error: "Geen toegang tot dit pand" };
    }

    // Transaction: delete existing features, create new ones
    await prisma.$transaction([
      prisma.propertyFeature.deleteMany({
        where: { propertyId },
      }),
      ...features.map((feat, index) =>
        prisma.propertyFeature.create({
          data: {
            propertyId,
            category: feat.category as any,
            key: feat.key,
            value: feat.value ?? null,
            numericValue: feat.numericValue ?? null,
            booleanValue: feat.booleanValue ?? null,
            verified: feat.verified ?? false,
            displayOrder: feat.displayOrder ?? index,
            highlighted: feat.highlighted ?? false,
          },
        })
      ),
    ]);

    // Fetch the created features to return
    const createdFeatures = await prisma.propertyFeature.findMany({
      where: { propertyId },
      orderBy: { displayOrder: "asc" },
    });

    revalidatePath(`/dashboard/panden/${propertyId}`);

    return {
      success: true,
      data: createdFeatures.map((feat): PropertyFeatureDetail => ({
        id: feat.id,
        propertyId: feat.propertyId,
        category: feat.category as PropertyFeatureDetail["category"],
        key: feat.key,
        value: feat.value ?? undefined,
        numericValue: feat.numericValue ?? undefined,
        booleanValue: feat.booleanValue ?? undefined,
        verified: feat.verified,
        displayOrder: feat.displayOrder,
        highlighted: feat.highlighted,
      })),
    };
  } catch (error) {
    console.error("Error updating property features:", error);
    return {
      success: false,
      error: "Er ging iets mis bij het bijwerken van kenmerken",
    };
  }
}

/**
 * Record a property view
 */
export async function recordPropertyView(input: PropertyViewInput): Promise<ActionResult<{ viewId: string }>> {
  try {
    const validated = propertyViewSchema.parse(input);

    // Get IP hash for unique view tracking
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0] || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16);

    // Check if this is a unique view (same IP in last 24 hours)
    const existingView = await prisma.propertyView.findFirst({
      where: {
        propertyId: validated.propertyId,
        ipHash,
        viewedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (existingView) {
      return { success: true, data: { viewId: existingView.id } };
    }

    // Create new view record
    const view = await prisma.propertyView.create({
      data: {
        propertyId: validated.propertyId,
        sessionId: validated.sessionId,
        ipHash,
        source: validated.source,
        deviceType: validated.deviceType,
      },
    });

    // Increment view count on property (cached counter)
    await prisma.property.update({
      where: { id: validated.propertyId },
      data: { viewCount: { increment: 1 } },
    });

    return { success: true, data: { viewId: view.id } };
  } catch (error) {
    console.error("Error recording property view:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

/**
 * Create a property inquiry
 */
export async function createPropertyInquiry(input: PropertyInquiryInput): Promise<ActionResult<{ inquiryId: string }>> {
  try {
    const validated = propertyInquirySchema.parse(input);

    // Create the inquiry
    const inquiry = await prisma.propertyInquiry.create({
      data: {
        propertyId: validated.propertyId,
        name: validated.name,
        email: validated.email,
        phone: validated.phone || null,
        message: validated.message,
        conceptDescription: validated.conceptDescription || null,
        budget: validated.budget || null,
        intendedUse: validated.intendedUse || null,
        source: "WEBSITE",
      },
    });

    // Increment inquiry count on property
    await prisma.property.update({
      where: { id: validated.propertyId },
      data: { inquiryCount: { increment: 1 } },
    });

    // TODO: Send email notification to agency

    return { success: true, data: { inquiryId: inquiry.id } };
  } catch (error) {
    console.error("Error creating property inquiry:", error);
    if (error instanceof Error && error.message.includes("validation")) {
      return { success: false, error: "Ongeldige invoer. Controleer alle velden." };
    }
    return { success: false, error: "Er is een fout opgetreden bij het versturen van uw bericht" };
  }
}
