"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/types/actions";

// ===== VALIDATION SCHEMAS =====

const userRoleEnum = z.enum(["seeker", "agent", "admin"]);

const propertyStatusEnum = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "UNDER_OFFER",
  "RENTED",
  "SOLD",
  "ARCHIVED",
  "REJECTED",
]);

const updateUserRoleSchema = z.object({
  userId: z.string().min(1, "User ID is verplicht"),
  newRole: userRoleEnum,
});

const banUserSchema = z.object({
  userId: z.string().min(1, "User ID is verplicht"),
  banned: z.boolean(),
});

const deleteUserSchema = z.object({
  userId: z.string().min(1, "User ID is verplicht"),
});

const updatePropertyStatusSchema = z.object({
  propertyId: z.string().min(1, "Property ID is verplicht"),
  status: propertyStatusEnum,
});

const deletePropertySchema = z.object({
  propertyId: z.string().min(1, "Property ID is verplicht"),
});

const featurePropertySchema = z.object({
  propertyId: z.string().min(1, "Property ID is verplicht"),
  featured: z.boolean(),
});

// ===== HELPERS =====

async function requireAdmin(): Promise<ActionResult<string>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { success: false, error: "Niet ingelogd" };
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "admin") {
      return { success: false, error: "Geen admin rechten" };
    }
    return { success: true, data: session.user.id };
  } catch {
    return { success: false, error: "Kon rechten niet verifiëren" };
  }
}

// ===== USER MANAGEMENT =====

export async function adminUpdateUserRole(
  userId: string,
  newRole: string
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = updateUserRoleSchema.safeParse({ userId, newRole });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    await prisma.user.update({
      where: { id: validated.data.userId },
      data: { role: validated.data.newRole },
    });
    revalidatePath("/dashboard/admin/users");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon rol niet wijzigen" };
  }
}

export async function adminBanUser(
  userId: string,
  banned: boolean
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = banUserSchema.safeParse({ userId, banned });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    await prisma.user.update({
      where: { id: validated.data.userId },
      data: { banned: validated.data.banned },
    });
    revalidatePath("/dashboard/admin/users");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon gebruiker niet blokkeren" };
  }
}

export async function adminDeleteUser(userId: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = deleteUserSchema.safeParse({ userId });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    // Prevent self-deletion
    if (adminCheck.data === validated.data.userId) {
      return { success: false, error: "Je kunt je eigen account niet verwijderen" };
    }

    await prisma.user.delete({ where: { id: validated.data.userId } });
    revalidatePath("/dashboard/admin/users");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon gebruiker niet verwijderen" };
  }
}

// ===== PROPERTY MANAGEMENT =====

export async function adminUpdatePropertyStatus(
  propertyId: string,
  status: string
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = updatePropertyStatusSchema.safeParse({ propertyId, status });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    await prisma.property.update({
      where: { id: validated.data.propertyId },
      data: { status: validated.data.status },
    });
    revalidatePath("/dashboard/admin/properties");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon status niet wijzigen" };
  }
}

export async function adminDeleteProperty(
  propertyId: string
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = deletePropertySchema.safeParse({ propertyId });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    await prisma.property.delete({ where: { id: validated.data.propertyId } });
    revalidatePath("/dashboard/admin/properties");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon pand niet verwijderen" };
  }
}

export async function adminFeatureProperty(
  propertyId: string,
  featured: boolean
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const validated = featurePropertySchema.safeParse({ propertyId, featured });
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }

    await prisma.property.update({
      where: { id: validated.data.propertyId },
      data: {
        featured: validated.data.featured,
        featuredUntil: validated.data.featured
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : null,
      },
    });
    revalidatePath("/dashboard/admin/properties");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon pand niet uitlichten" };
  }
}

// ===== AGENCY MANAGEMENT =====
// Note: Detailed agency CRUD operations are in app/actions/admin/agencies.ts

export async function adminGetAgencies(): Promise<
  ActionResult<{
    agencies: Array<{
      id: string;
      name: string;
      slug: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      _count: { properties: number; members: number };
      createdAt: Date;
    }>;
  }>
> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const agencies = await prisma.agency.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        city: true,
        _count: { select: { properties: true, members: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { success: true, data: { agencies } };
  } catch {
    return { success: false, error: "Kon kantoren niet ophalen" };
  }
}

export async function adminDeleteAgency(
  agencyId: string
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    if (!agencyId || typeof agencyId !== "string") {
      return { success: false, error: "Ongeldig kantoor ID" };
    }

    await prisma.agency.delete({ where: { id: agencyId } });
    revalidatePath("/dashboard/admin/agencies");
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Kon makelaarskantoor niet verwijderen" };
  }
}

// ===== PLATFORM STATS =====

export async function adminGetPlatformStats(): Promise<
  ActionResult<{
    stats: {
      users: number;
      properties: number;
      agencies: number;
      inquiries: number;
      views: number;
      newUsers7d: number;
      newProperties7d: number;
      newInquiries7d: number;
    };
  }>
> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.success) return { success: false, error: adminCheck.error };

  try {
    const [users, properties, agencies, inquiries, views] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.agency.count(),
      prisma.propertyInquiry.count(),
      prisma.propertyView.count(),
    ]);

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [newUsers7d, newProperties7d, newInquiries7d] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: last7Days } } }),
      prisma.property.count({ where: { createdAt: { gte: last7Days } } }),
      prisma.propertyInquiry.count({ where: { createdAt: { gte: last7Days } } }),
    ]);

    return {
      success: true,
      data: {
        stats: {
          users,
          properties,
          agencies,
          inquiries,
          views,
          newUsers7d,
          newProperties7d,
          newInquiries7d,
        },
      },
    };
  } catch {
    return { success: false, error: "Kon statistieken niet ophalen" };
  }
}
