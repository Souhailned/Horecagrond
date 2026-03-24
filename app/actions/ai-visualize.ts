"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/session";
import { generateImage } from "ai";
import { getFalImageModel } from "@/lib/ai/image-model";
import {
  uploadImage,
  getExtensionFromContentType,
  generateImagePath,
} from "@/lib/storage";
import { recomputeImageProjectCounters } from "@/lib/image-project-state";

/*
 * Note: fal.ai generation can take 30-60s. This is fine on self-hosted
 * (output: "standalone") which has no hard server action timeout.
 * If deploying to Vercel, move the generateImage call to an API route
 * with `export const maxDuration = 300`.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Model used for virtual staging — matches the inpaint route's "add" mode */
const VIRTUAL_STAGING_MODEL = "fal-ai/nano-banana-pro/edit";

/** Maps visual style IDs to descriptive prompts for the AI model */
const stylePrompts: Record<string, string> = {
  specialty_coffee:
    "A specialty coffee bar interior with exposed brick, pour-over stations, wooden counters, pendant Edison bulbs, and minimalist Scandinavian seating",
  wine_tapas:
    "A warm wine and tapas bar interior with terracotta tones, rustic wooden shelving, ambient candlelight, leather seating, and Mediterranean tile accents",
  bakery_brunch:
    "A bright artisan bakery and brunch cafe with marble counters, pastel accents, open display cases, fresh flowers, and natural light streaming through large windows",
  healthy_bar:
    "A modern health food bar interior with light wood, living green walls, smoothie stations, clean white surfaces, and organic material touches",
  restaurant_modern:
    "A modern upscale restaurant interior with sleek furniture, warm ambient lighting, minimalist table settings, contemporary art, and an open kitchen concept",
  industrial_loft:
    "An industrial loft restaurant with exposed steel beams, concrete floors, Edison pendant lights, reclaimed wood tables, and raw metal bar stools",
};

const VALID_STYLES = Object.keys(stylePrompts);

/** Allowed image URL hosts — prevents SSRF via server-side fetch */
const ALLOWED_IMAGE_HOSTS = [
  "pub-4a8739a12755457e8a9e7439e0b386a3.r2.dev",
  "imagedelivery.net",
  "res.cloudinary.com",
  "images.unsplash.com",
  "d2vwwcvoksz7ty.cloudfront.net",
];

function isAllowedImageHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_IMAGE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Zod validation schema                                                      */
/* -------------------------------------------------------------------------- */

const virtualStagingSchema = z.object({
  propertyId: z.string().min(1, "Property ID is verplicht"),
  imageUrl: z
    .string()
    .url("Ongeldige afbeelding URL")
    .refine(isAllowedImageHost, {
      message: "Afbeelding URL is niet toegestaan",
    }),
  style: z.enum(VALID_STYLES as [string, ...string[]], {
    message: "Ongeldige stijl geselecteerd",
  }),
});

type VirtualStagingInput = z.infer<typeof virtualStagingSchema>;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Get active workspace for authenticated user */
async function getActiveWorkspaceForUser(userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  });
  return member?.workspaceId ?? null;
}

/** Mark an Image record as FAILED with an error message */
async function markImageFailed(imageId: string, errorMessage: string) {
  try {
    await prisma.image.update({
      where: { id: imageId },
      data: { status: "FAILED", errorMessage },
    });
  } catch {
    console.error("[markImageFailed] Could not update image:", imageId);
  }
}

/* -------------------------------------------------------------------------- */
/*  Server action                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Triggers virtual staging using AI SDK 6 + @ai-sdk/fal.
 *
 * Flow (direct — no polling needed):
 * 1. Validate input with Zod (incl. SSRF protection on imageUrl)
 * 2. Auth via requirePermission("ai:visualize") + rate limit
 * 3. Verify property exists (public property — seekers can also generate)
 * 4. Find or create ImageProject + source/placeholder Image records
 * 5. Call `generateImage()` with fal-ai/nano-banana-pro/edit
 * 6. Upload result to R2, update DB, return { resultUrl } directly
 */
export async function triggerVirtualStaging(
  input: VirtualStagingInput
): Promise<
  ActionResult<{ resultUrl: string; newImageId: string; remaining: number }>
> {
  try {
    // 1. Validate input (Zod validates URL host via SSRF allowlist)
    const validated = virtualStagingSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Ongeldige invoer",
      };
    }

    const { propertyId, imageUrl, style } = validated.data;

    // 2. Guard: FAL_API_KEY must be configured
    if (!process.env.FAL_API_KEY) {
      return {
        success: false,
        error:
          "AI beeldgeneratie is niet geconfigureerd. Configureer FAL_API_KEY.",
      };
    }

    // 3. Auth + RBAC permission check
    const authCheck = await requirePermission("ai:visualize");
    if (!authCheck.success) {
      return { success: false, error: authCheck.error ?? "Geen toegang" };
    }
    const { userId } = authCheck.data!;

    // 4. Rate limit
    const rateLimitResult = await checkRateLimit(userId, "ai");
    if (!rateLimitResult.success) {
      return {
        success: false,
        error: "Te veel verzoeken. Probeer het later opnieuw.",
      };
    }

    // 4b. Quota check (seekers have limited free edits)
    const { canUserGenerate, incrementAiEditCount } = await import(
      "@/app/actions/ai-quota"
    );
    const quotaCheck = await canUserGenerate(userId);
    if (!quotaCheck.allowed) {
      return {
        success: false,
        error:
          "Je hebt je gratis AI bewerkingen opgebruikt. Upgrade voor meer.",
      };
    }

    // 5. Verify property exists (public check — any authenticated user can visualize)
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      return { success: false, error: "Pand niet gevonden" };
    }

    // 6. Resolve workspace for storage organization
    const workspaceId = await getActiveWorkspaceForUser(userId);
    if (!workspaceId) {
      return { success: false, error: "Geen actieve workspace" };
    }

    // 7. Resolve prompt from validated style
    const prompt = stylePrompts[style]!;

    // 8. Find or create an ImageProject for this property
    let project = await prisma.imageProject.findFirst({
      where: {
        propertyId,
        workspaceId,
        name: "Virtual Staging",
      },
    });

    if (!project) {
      project = await prisma.imageProject.create({
        data: {
          workspaceId,
          userId,
          propertyId,
          name: "Virtual Staging",
          styleTemplateId: style,
          status: "PROCESSING",
        },
      });
    }

    // 9. Find or create the source image record
    let sourceImage = await prisma.image.findFirst({
      where: {
        projectId: project.id,
        originalImageUrl: imageUrl,
        parentId: null,
      },
    });

    if (!sourceImage) {
      sourceImage = await prisma.image.create({
        data: {
          workspaceId,
          userId,
          projectId: project.id,
          originalImageUrl: imageUrl,
          resultImageUrl: imageUrl,
          prompt: "Original property photo",
          version: 1,
          status: "COMPLETED",
        },
      });
    }

    // 10. Determine next version
    const latestVersion = await prisma.image.findFirst({
      where: {
        projectId: project.id,
        OR: [{ id: sourceImage.id }, { parentId: sourceImage.id }],
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (latestVersion?.version || 1) + 1;

    // 11. Create a placeholder for the result
    const placeholder = await prisma.image.create({
      data: {
        workspaceId,
        userId,
        projectId: project.id,
        originalImageUrl: imageUrl,
        resultImageUrl: null,
        prompt,
        version: nextVersion,
        parentId: sourceImage.id,
        status: "PROCESSING",
        metadata: {
          virtualStaging: true,
          style,
          queuedAt: new Date().toISOString(),
        },
      },
    });

    // 12. Generate image via AI SDK 6 + fal.ai
    //     nano-banana-pro/edit requires image_urls (URL array), not raw bytes
    const model = getFalImageModel(VIRTUAL_STAGING_MODEL);

    let result;
    try {
      result = await generateImage({
        model,
        prompt,
        providerOptions: {
          fal: {
            image_urls: [imageUrl],
            numImages: 1,
            outputFormat: "jpeg",
          },
        },
      });
    } catch (genError) {
      const errorMsg =
        genError instanceof Error ? genError.message : "Onbekende fout";
      console.error("[triggerVirtualStaging] generateImage error:", errorMsg);
      await markImageFailed(
        placeholder.id,
        `AI generatie mislukt: ${errorMsg}`
      );
      return {
        success: false,
        error: "AI generatie mislukt — probeer het later opnieuw",
      };
    }

    // 13. Upload result to R2
    const generatedImage = result.image;
    const contentType = generatedImage.mediaType || "image/jpeg";
    const extension = getExtensionFromContentType(contentType);

    const storagePath = generateImagePath(
      workspaceId,
      project.id,
      placeholder.id,
      "result",
      extension
    );

    const imageBuffer = Buffer.from(generatedImage.uint8Array);
    const publicUrl = await uploadImage(imageBuffer, storagePath, contentType);

    if (!publicUrl) {
      await markImageFailed(placeholder.id, "Upload naar storage mislukt");
      return { success: false, error: "Upload naar storage mislukt" };
    }

    // 14. Update DB record to COMPLETED
    await prisma.image.update({
      where: { id: placeholder.id },
      data: {
        resultImageUrl: publicUrl,
        status: "COMPLETED",
        errorMessage: null,
        metadata: {
          ...(placeholder.metadata && typeof placeholder.metadata === "object"
            && !Array.isArray(placeholder.metadata)
            ? placeholder.metadata
            : {}),
          runId: "ai-sdk-direct",
          completedAt: new Date().toISOString(),
          model: VIRTUAL_STAGING_MODEL,
        },
      },
    });

    // 15. Recompute project counters
    await recomputeImageProjectCounters(project.id);

    // 16. Log AI usage (fire and forget)
    prisma.aiUsageLog
      .create({
        data: {
          userId,
          workspaceId,
          service: "fal-ai",
          model: VIRTUAL_STAGING_MODEL,
          feature: "virtual-staging",
          costCents: 3,
          status: "success",
          metadata: { propertyId, style },
        },
      })
      .catch(() => {});

    // 17. Increment quota counter (fire and forget)
    incrementAiEditCount(userId).catch(() => {});

    revalidatePath("/aanbod");
    return {
      success: true,
      data: {
        resultUrl: publicUrl,
        newImageId: placeholder.id,
        remaining:
          quotaCheck.remaining === -1 ? -1 : quotaCheck.remaining - 1,
      },
    };
  } catch (error) {
    console.error("[triggerVirtualStaging] Error:", error);
    return { success: false, error: "Kon de visualisatie niet starten" };
  }
}
