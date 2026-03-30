"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const saveFloorPlanSchema = z.object({
  propertyId: z.string().cuid(),
  floor: z.number().int().min(-5).max(100),
  name: z.string().min(1, "Naam is verplicht").max(100).trim(),
  sceneData: z.object({
    nodes: z.record(z.string(), z.unknown()),
    rootNodeIds: z.array(z.string()),
  }),
  totalArea: z.number().min(0).max(100_000).optional(),
  zones: z.record(z.string(), z.unknown()).optional(),
});

const getFloorPlanSchema = z.object({
  propertyId: z.string().cuid(),
  floor: z.number().int(),
});

const getFloorPlansSchema = z.object({
  propertyId: z.string().cuid(),
});

const deleteFloorPlanSchema = z.object({
  id: z.string().cuid(),
});

const updateThumbnailSchema = z.object({
  id: z.string().cuid(),
  thumbnailUrl: z.string().url("Ongeldige URL"),
});

const saveFloorPlansBatchSchema = z.object({
  propertyId: z.string().cuid(),
  plans: z.array(
    z.object({
      floorPlanId: z.string().cuid().optional(),
      floor: z.number().int().min(-5).max(100),
      name: z.string().min(1).max(100).trim(),
      sceneData: z.object({
        nodes: z.record(z.string(), z.unknown()),
        rootNodeIds: z.array(z.string()),
      }),
      totalArea: z.number().min(0).max(100_000).optional(),
      zones: z.record(z.string(), z.unknown()).optional(),
    })
  ).min(1),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FloorPlanData = {
  id: string;
  propertyId: string;
  name: string;
  floor: number;
  sceneData: Prisma.JsonValue;
  totalArea: number | null;
  zones: Prisma.JsonValue | null;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FloorPlanBatchInput = z.infer<typeof saveFloorPlansBatchSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify the current user can manage the given property.
 * Admins can manage any property; agents can only manage their own.
 */
async function verifyPropertyAccess(
  propertyId: string,
  userId: string,
  role: string
) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
    select: { id: true },
  });
  return property;
}

// ---------------------------------------------------------------------------
// 1. saveFloorPlan — Create or update a floor plan
// ---------------------------------------------------------------------------

export async function saveFloorPlan(
  input: z.infer<typeof saveFloorPlanSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    // Auth + permission
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    // Validate input
    const validated = saveFloorPlanSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    const { propertyId, floor, name, sceneData, totalArea, zones } =
      validated.data;

    // Authorization: verify property belongs to user (or user is admin)
    const property = await verifyPropertyAccess(propertyId, userId, role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    // Upsert on unique [propertyId, floor]
    const floorPlan = await prisma.propertyFloorPlan.upsert({
      where: {
        propertyId_floor: { propertyId, floor },
      },
      update: {
        name,
        sceneData: sceneData as Prisma.InputJsonValue,
        totalArea: totalArea ?? null,
        zones: zones ? (zones as Prisma.InputJsonValue) : undefined,
      },
      create: {
        propertyId,
        floor,
        name,
        sceneData: sceneData as Prisma.InputJsonValue,
        totalArea: totalArea ?? null,
        zones: zones ? (zones as Prisma.InputJsonValue) : Prisma.DbNull,
      },
      select: { id: true },
    });

    revalidatePath(`/dashboard/properties/${propertyId}`);

    return { success: true, data: { id: floorPlan.id } };
  } catch (error) {
    console.error("saveFloorPlan error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

export async function saveFloorPlansBatch(
  input: FloorPlanBatchInput
): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    const validated = saveFloorPlansBatchSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    const { propertyId, plans } = validated.data;
    const property = await verifyPropertyAccess(propertyId, userId, role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    const floorsToKeep = plans.map((plan) => plan.floor);

    const records = await prisma.$transaction(
      async (tx) => {
        const upserts = await Promise.all(
          plans.map((plan) =>
            tx.propertyFloorPlan.upsert({
              where: {
                propertyId_floor: { propertyId, floor: plan.floor },
              },
              update: {
                name: plan.name,
                sceneData: plan.sceneData as Prisma.InputJsonValue,
                totalArea: plan.totalArea ?? null,
                zones: plan.zones
                  ? (plan.zones as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              },
              create: {
                propertyId,
                floor: plan.floor,
                name: plan.name,
                sceneData: plan.sceneData as Prisma.InputJsonValue,
                totalArea: plan.totalArea ?? null,
                zones: plan.zones
                  ? (plan.zones as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              },
              select: { id: true },
            })
          )
        );

        await tx.propertyFloorPlan.deleteMany({
          where: {
            propertyId,
            floor: { notIn: floorsToKeep },
          },
        });

        return upserts;
      }
    );

    revalidatePath(`/dashboard/properties/${propertyId}`);
    return { success: true, data: { ids: records.map((record) => record.id) } };
  } catch (error) {
    console.error("saveFloorPlansBatch error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

// ---------------------------------------------------------------------------
// 2. getFloorPlan — Get a single floor plan by propertyId + floor
// ---------------------------------------------------------------------------

export async function getFloorPlan(
  input: z.infer<typeof getFloorPlanSchema>
): Promise<ActionResult<FloorPlanData>> {
  try {
    // Auth + permission
    const authCheck = await requirePermission("floorplans:view");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    // Validate input
    const validated = getFloorPlanSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    const { propertyId, floor } = validated.data;

    // Verify property access
    const property = await verifyPropertyAccess(propertyId, userId, role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    const floorPlan = await prisma.propertyFloorPlan.findUnique({
      where: {
        propertyId_floor: { propertyId, floor },
      },
    });

    if (!floorPlan) {
      return { success: false, error: "Plattegrond niet gevonden" };
    }

    return { success: true, data: floorPlan };
  } catch (error) {
    console.error("getFloorPlan error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

// ---------------------------------------------------------------------------
// 3. getFloorPlans — Get all floor plans for a property
// ---------------------------------------------------------------------------

export async function getFloorPlans(
  input: z.infer<typeof getFloorPlansSchema>
): Promise<ActionResult<FloorPlanData[]>> {
  try {
    // Auth + permission
    const authCheck = await requirePermission("floorplans:view");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    // Validate input
    const validated = getFloorPlansSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    const { propertyId } = validated.data;

    // Verify property access
    const property = await verifyPropertyAccess(propertyId, userId, role);
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    const floorPlans = await prisma.propertyFloorPlan.findMany({
      where: { propertyId },
      orderBy: { floor: "asc" },
    });

    return { success: true, data: floorPlans };
  } catch (error) {
    console.error("getFloorPlans error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

// ---------------------------------------------------------------------------
// 4. deleteFloorPlan — Delete a floor plan by id
// ---------------------------------------------------------------------------

export async function deleteFloorPlan(
  input: z.infer<typeof deleteFloorPlanSchema>
): Promise<ActionResult> {
  try {
    // Auth + permission
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    // Validate input
    const validated = deleteFloorPlanSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    // Find the floor plan and verify ownership through the property
    const floorPlan = await prisma.propertyFloorPlan.findUnique({
      where: { id: validated.data.id },
      select: { id: true, propertyId: true },
    });
    if (!floorPlan) {
      return { success: false, error: "Plattegrond niet gevonden" };
    }

    const property = await verifyPropertyAccess(
      floorPlan.propertyId,
      userId,
      role
    );
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    await prisma.propertyFloorPlan.delete({
      where: { id: validated.data.id },
    });

    revalidatePath(`/dashboard/properties/${floorPlan.propertyId}`);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteFloorPlan error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}

// ---------------------------------------------------------------------------
// 5. updateFloorPlanThumbnail — Update thumbnail URL for a floor plan
// ---------------------------------------------------------------------------

export async function updateFloorPlanThumbnail(
  input: z.infer<typeof updateThumbnailSchema>
): Promise<ActionResult> {
  try {
    // Auth + permission
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) return { success: false, error: authCheck.error };
    const { userId, role } = authCheck.data!;

    // Validate input
    const validated = updateThumbnailSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    // Find the floor plan and verify ownership through the property
    const floorPlan = await prisma.propertyFloorPlan.findUnique({
      where: { id: validated.data.id },
      select: { id: true, propertyId: true },
    });
    if (!floorPlan) {
      return { success: false, error: "Plattegrond niet gevonden" };
    }

    const property = await verifyPropertyAccess(
      floorPlan.propertyId,
      userId,
      role
    );
    if (!property) {
      return { success: false, error: "Pand niet gevonden of geen toegang" };
    }

    await prisma.propertyFloorPlan.update({
      where: { id: validated.data.id },
      data: { thumbnailUrl: validated.data.thumbnailUrl },
    });

    revalidatePath(`/dashboard/properties/${floorPlan.propertyId}`);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateFloorPlanThumbnail error:", error);
    return { success: false, error: "Er is een fout opgetreden" };
  }
}
