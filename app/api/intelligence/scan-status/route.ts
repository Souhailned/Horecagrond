import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * GET /api/intelligence/scan-status?jobId=xxx
 * Returns the current status of a scan job by reading Trigger.dev metadata.
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // Fetch job from DB
    const job = await prisma.intelligenceScanJob.findUnique({
      where: { id: jobId },
      include: {
        profile: { select: { userId: true } },
      },
    });

    if (!job || job.profile.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // If we have a Trigger.dev run ID, try to get real-time metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let triggerMetadata: any = null;
    if (job.triggerRunId) {
      try {
        const { runs } = await import("@trigger.dev/sdk/v3");
        const run = await runs.retrieve(job.triggerRunId);
        triggerMetadata = run.metadata;
      } catch {
        // Trigger.dev might not be available in dev
      }
    }

    // Check if job has been pending too long (Trigger.dev might not be running)
    const jobAge = Date.now() - new Date(job.createdAt).getTime();
    const pendingTooLong = job.status === "pending" && jobAge > 30_000; // 30 seconds

    // Check if a "running" job is stale (no progress for > 10 min = likely crashed)
    const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
    const timeSinceStart = startedAt ? Date.now() - startedAt : 0;
    const runningTooLong = job.status === "running" && !triggerMetadata && timeSinceStart > 8 * 60 * 1000; // 8 min without Trigger.dev = stale

    // If stale, mark as failed in DB so it doesn't keep showing
    if (runningTooLong && !triggerMetadata) {
      await prisma.intelligenceScanJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: "Scan is vastgelopen (geen voortgang in 10 minuten). Start een nieuwe scan.",
        },
      });
    }

    // Build response from either Trigger metadata or DB status
    const status = triggerMetadata?.status ?? {
      step: job.status === "completed" ? "completed"
        : job.status === "failed" ? "failed"
        : pendingTooLong ? "failed"
        : runningTooLong ? "failed"
        : job.status === "running" ? "scanning"
        : "loading",
      label: job.status === "completed"
        ? `Scan voltooid: ${job.businessesFound} zaken, ${job.matchesFound} matches`
        : job.status === "failed"
          ? job.error ?? "Scan mislukt"
          : pendingTooLong
            ? "Scan kon niet starten. Controleer of Trigger.dev draait (bun run trigger)"
            : runningTooLong
              ? "Scan is vastgelopen. Start een nieuwe scan."
              : job.status === "running"
                ? "Scan is bezig..."
                : "Scan wordt gestart...",
      progress: (pendingTooLong || runningTooLong) ? 0 : job.progress,
      businessesFound: job.businessesFound,
      matchesFound: job.matchesFound,
    };

    return NextResponse.json({ status, job: { id: job.id, status: job.status } });
  } catch (error) {
    console.error("[scan-status] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
