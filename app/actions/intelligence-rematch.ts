"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/session";
import type { ActionResult } from "@/types/actions";

const rematchProgressSchema = z.object({
  step: z.enum(["starting", "running", "completed", "failed"]),
  label: z.string(),
  progress: z.number().optional(),
  completed: z.number().optional(),
  total: z.number().optional(),
  current: z.string().optional(),
});

export async function triggerIntelligenceRematch(
  input?: {
    profileIds?: string[];
    activeOnly?: boolean;
    limit?: number;
  },
): Promise<ActionResult<{ runId: string }>> {
  const authCheck = await requirePermission("intelligence:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const { intelligenceRematchTask } = await import(
      "@/trigger/intelligence-rematch"
    );

    const handle = await intelligenceRematchTask.trigger({
      profileIds: input?.profileIds,
      activeOnly: input?.activeOnly,
      limit: input?.limit,
    });

    return { success: true, data: { runId: handle.id } };
  } catch (error) {
    console.error("[intelligence-rematch] Trigger failed:", error);
    return {
      success: false,
      error: "Kon de intelligence rematch niet starten.",
    };
  }
}

export async function getIntelligenceRematchProgress(
  runId: string,
): Promise<ActionResult<z.infer<typeof rematchProgressSchema>>> {
  const authCheck = await requirePermission("intelligence:view");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const { runs } = await import("@trigger.dev/sdk/v3");
    const run = await runs.retrieve(runId);

    const parsed = rematchProgressSchema.safeParse(run.metadata?.status);
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }

    return {
      success: true,
      data: {
        step: run.status === "COMPLETED" ? "completed" : "running",
        label: "Rematch actief",
        progress: undefined,
      },
    };
  } catch (error) {
    console.error("[intelligence-rematch] Progress failed:", error);
    return { success: false, error: "Rematch status ophalen mislukt." };
  }
}
