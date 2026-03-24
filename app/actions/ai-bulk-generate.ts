"use server";

import { requirePermission } from "@/lib/session";
import { z } from "zod";
import type { ActionResult } from "@/types/actions";

const bulkProgressSchema = z.object({
  completed: z.number(),
  total: z.number(),
  status: z.enum(["running", "completed", "failed"]),
});

/**
 * Trigger a bulk AI content generation job via Trigger.dev.
 * Maximum 25 properties per batch.
 */
export async function triggerBulkAiGenerate(
  propertyIds: string[],
  type: "description" | "social"
): Promise<ActionResult<{ runId: string }>> {
  const authCheck = await requirePermission("ai:listing-package");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const sessionData = authCheck.data;
  if (!sessionData) return { success: false, error: "Sessie ongeldig" };
  const { userId, role } = sessionData;

  // Validate batch size
  if (!propertyIds.length) {
    return { success: false, error: "Selecteer minimaal 1 pand" };
  }
  if (propertyIds.length > 25) {
    return {
      success: false,
      error: "Maximaal 25 panden per batch. Selecteer minder panden.",
    };
  }

  try {
    const { bulkAiGenerateTask } = await import(
      "@/trigger/bulk-ai-generate"
    );

    const handle = await bulkAiGenerateTask.trigger({
      propertyIds,
      type,
      userId,
      role,
    });

    return { success: true, data: { runId: handle.id } };
  } catch (error) {
    console.error("Failed to trigger bulk AI generation:", error);
    return {
      success: false,
      error: "Kon de bulk-generatie niet starten. Probeer het later opnieuw.",
    };
  }
}

/**
 * Retrieve progress of a bulk AI generation run.
 */
export async function getBulkAiProgress(
  runId: string
): Promise<
  ActionResult<{
    status: "running" | "completed" | "failed";
    completed: number;
    total: number;
  }>
> {
  const authCheck = await requirePermission("ai:listing-package");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const { runs } = await import("@trigger.dev/sdk/v3");
    const run = await runs.retrieve(runId);

    // Extract and validate progress from metadata
    const progressParsed = bulkProgressSchema.safeParse(
      run.metadata?.progress
    );

    if (progressParsed.success) {
      return {
        success: true,
        data: progressParsed.data,
      };
    }

    // Determine status from run state
    const terminalStatuses = [
      "COMPLETED",
      "CANCELED",
      "FAILED",
      "CRASHED",
      "SYSTEM_FAILURE",
      "EXPIRED",
      "TIMED_OUT",
    ];

    if (terminalStatuses.includes(run.status)) {
      const isSuccess = run.status === "COMPLETED";
      return {
        success: true,
        data: {
          status: isSuccess ? "completed" : "failed",
          completed: 0,
          total: 0,
        },
      };
    }

    // Still running but no metadata yet
    return {
      success: true,
      data: {
        status: "running",
        completed: 0,
        total: 0,
      },
    };
  } catch (error) {
    console.error("Failed to retrieve bulk AI progress:", error);
    return {
      success: false,
      error: "Kon de voortgang niet ophalen.",
    };
  }
}
