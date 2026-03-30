import { task, metadata, logger } from "@trigger.dev/sdk/v3";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export interface IntelligenceRematchPayload {
  profileIds?: string[];
  activeOnly?: boolean;
  limit?: number;
}

export interface IntelligenceRematchStatus {
  step: "starting" | "running" | "completed" | "failed";
  label: string;
  progress?: number;
  completed?: number;
  total?: number;
  current?: string;
}

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

export const intelligenceRematchTask = task({
  id: "intelligence-rematch",
  queue: {
    name: "intelligence-rematch",
    concurrencyLimit: 1,
  },
  maxDuration: 1800,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: IntelligenceRematchPayload) => {
    const prisma = createPrisma();
    try {
      metadata.set("status", {
        step: "starting",
        label: "Intelligence rematch starten...",
        progress: 5,
      } satisfies IntelligenceRematchStatus);

      const { rematchIntelligenceProfiles } = await import("@/lib/intelligence/rematch");

      const result = await rematchIntelligenceProfiles(prisma, {
        profileIds: payload.profileIds,
        activeOnly: payload.activeOnly,
        limit: payload.limit,
        onProgress: (completed, total, current) => {
          metadata.set("status", {
            step: "running",
            label: `Rematch ${completed}/${total}`,
            progress: Math.round((completed / Math.max(total, 1)) * 100),
            completed,
            total,
            current,
          } as any);
        },
      });

      metadata.set("status", {
        step: "completed",
        label: `Rematch voltooid: ${result.scannedProfiles} profielen`,
        progress: 100,
        completed: result.scannedProfiles,
        total: result.scannedProfiles,
      } satisfies IntelligenceRematchStatus);

      logger.info("Intelligence rematch completed", { ...result });
      return result;
    } catch (error) {
      metadata.set("status", {
        step: "failed",
        label: "Rematch mislukt",
        progress: 0,
      } satisfies IntelligenceRematchStatus);
      logger.error("Intelligence rematch failed", { error });
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  },
});
