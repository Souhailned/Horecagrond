import { task, metadata, logger } from "@trigger.dev/sdk/v3";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export interface IntelligenceBackfillPayload {
  city?: string;
  limit?: number;
  businessIds?: string[];
}

export interface IntelligenceBackfillStatus {
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

export const intelligenceBackfillTask = task({
  id: "intelligence-backfill",
  queue: {
    name: "intelligence-backfill",
    concurrencyLimit: 1,
  },
  maxDuration: 1800,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: IntelligenceBackfillPayload) => {
    const prisma = createPrisma();
    try {
      metadata.set("status", {
        step: "starting",
        label: "Intelligence backfill starten...",
        progress: 5,
      } satisfies IntelligenceBackfillStatus);

      const { backfillIntelligenceEvidence } = await import("@/lib/intelligence/backfill");

      const result = await backfillIntelligenceEvidence(prisma, {
        city: payload.city,
        limit: payload.limit,
        businessIds: payload.businessIds,
        onProgress: (completed, total, current) => {
          metadata.set("status", {
            step: "running",
            label: `Backfill ${completed}/${total}`,
            progress: Math.round((completed / Math.max(total, 1)) * 100),
            completed,
            total,
            current,
          } as any);
        },
      });

      metadata.set("status", {
        step: "completed",
        label: `Backfill voltooid: ${result.scanned} zaken`,
        progress: 100,
        completed: result.scanned,
        total: result.scanned,
      } satisfies IntelligenceBackfillStatus);

      logger.info("Intelligence backfill completed", { ...result });
      return result;
    } catch (error) {
      metadata.set("status", {
        step: "failed",
        label: "Backfill mislukt",
        progress: 0,
      } satisfies IntelligenceBackfillStatus);
      logger.error("Intelligence backfill failed", { error });
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  },
});
