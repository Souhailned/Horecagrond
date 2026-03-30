import type { PrismaClient } from "@/generated/prisma/client";
import { generateAndSaveMatchSummaries } from "@/lib/intelligence/scan-engine";

export interface RematchResult {
  scannedProfiles: number;
  savedMatches: number;
  failed: number;
}

export async function rematchIntelligenceProfiles(
  prisma: PrismaClient,
  options?: {
    profileIds?: string[];
    activeOnly?: boolean;
    limit?: number;
    onProgress?: (completed: number, total: number, current?: string) => void;
  },
): Promise<RematchResult> {
  const profiles = await prisma.intelligenceProfile.findMany({
    where: {
      ...(options?.profileIds && options.profileIds.length > 0
        ? { id: { in: options.profileIds } }
        : {}),
      ...(options?.activeOnly ? { active: true } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: options?.limit,
  });

  const result: RematchResult = {
    scannedProfiles: profiles.length,
    savedMatches: 0,
    failed: 0,
  };

  for (let index = 0; index < profiles.length; index++) {
    const profile = profiles[index];
    try {
      result.savedMatches += await generateAndSaveMatchSummaries(prisma, profile.id);
    } catch (error) {
      console.error("[intelligence-rematch] Failed:", profile.name, error);
      result.failed++;
    }

    options?.onProgress?.(index + 1, profiles.length, profile.name);
  }

  return result;
}
