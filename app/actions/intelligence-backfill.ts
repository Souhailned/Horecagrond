"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/session";
import type { ActionResult } from "@/types/actions";

const backfillProgressSchema = z.object({
  step: z.enum(["starting", "running", "completed", "failed"]),
  label: z.string(),
  progress: z.number().optional(),
  completed: z.number().optional(),
  total: z.number().optional(),
  current: z.string().optional(),
});

export async function triggerIntelligenceBackfill(
  input?: {
    city?: string;
    limit?: number;
    businessIds?: string[];
  },
): Promise<ActionResult<{ runId: string }>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const { intelligenceBackfillTask } = await import(
      "@/trigger/intelligence-backfill"
    );

    const handle = await intelligenceBackfillTask.trigger({
      city: input?.city,
      limit: input?.limit,
      businessIds: input?.businessIds,
    });

    return { success: true, data: { runId: handle.id } };
  } catch (error) {
    console.error("[intelligence-backfill] Trigger failed:", error);
    return {
      success: false,
      error: "Kon de intelligence backfill niet starten.",
    };
  }
}

export async function getIntelligenceBackfillProgress(
  runId: string,
): Promise<ActionResult<z.infer<typeof backfillProgressSchema>>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const { runs } = await import("@trigger.dev/sdk/v3");
    const run = await runs.retrieve(runId);

    const parsed = backfillProgressSchema.safeParse(run.metadata?.status);
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }

    return {
      success: true,
      data: {
        step: run.status === "COMPLETED" ? "completed" : "running",
        label: "Backfill actief",
        progress: undefined,
      },
    };
  } catch (error) {
    console.error("[intelligence-backfill] Progress failed:", error);
    return { success: false, error: "Backfill status ophalen mislukt." };
  }
}
