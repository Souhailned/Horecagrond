/**
 * Intelligence Scan API — AI Agent-powered market scanner.
 *
 * Replaces Trigger.dev with an AI SDK 6 agentic workflow.
 * The AI agent autonomously decides which tools to call and in what order.
 *
 * POST /api/intelligence/scan
 * Body: { profileId, jobId, city? }
 *
 * Streams progress via SSE. Updates DB for polling fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const maxDuration = 300; // 5 minutes max on Vercel Pro

export async function POST(request: NextRequest) {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { profileId, jobId } = body as { profileId: string; jobId: string };

  if (!profileId || !jobId) {
    return NextResponse.json({ error: "Missing profileId or jobId" }, { status: 400 });
  }

  // Verify ownership
  const profile = await prisma.intelligenceProfile.findFirst({
    where: { id: profileId, userId: session.user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Mark job as running
  await prisma.intelligenceScanJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date() },
  });

  // Helper to update job progress in DB (for polling UI)
  async function updateProgress(step: string, progress: number, label: string, extra?: Record<string, number>) {
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: {
        progress,
        ...(extra?.businessesFound != null && { businessesFound: extra.businessesFound }),
        ...(extra?.matchesFound != null && { matchesFound: extra.matchesFound }),
      },
    }).catch(() => {});
  }

  try {
    const { getModel } = await import("@/lib/ai/model");
    const { model } = await getModel();

    const citiesToScan = body.city ? [body.city] : profile.targetCities;
    let totalBusinessesFound = 0;
    let totalMatches = 0;

    // Build keyword set from profile
    const { planProfileScan } = await import("@/lib/intelligence/pipeline");
    const {
      runDeepCrawlForProfile,
      detectSignalsForCities,
      generateAndSaveMatchSummaries,
    } = await import("@/lib/intelligence/scan-engine");
    const keywordSet = planProfileScan(profile);

    // Define agent tools
    const scanCityTool = tool({
      description: "Scan een stad voor horecazaken via Google Places API. Gebruik dit voor elke stad in het profiel.",
      inputSchema: z.object({
        city: z.string().describe("Stadsnaam, bijv. 'Amsterdam'"),
        keywords: z.array(z.string()).describe("Zoekwoorden, bijv. ['poké', 'sushi']"),
      }),
      execute: async ({ city, keywords }) => {
        await updateProgress("scanning", 15, `Scanning ${city}...`);

        try {
          const { scanCity } = await import("@/lib/intelligence/scanner");
          const result = await scanCity(city, keywords, {
            includeGenericHoreca: false,
            profile,
          });
          totalBusinessesFound += result.businessesFound;
          await updateProgress("scanning", 30, `${city}: ${result.businessesFound} zaken gevonden`, { businessesFound: totalBusinessesFound });
          return `${city}: ${result.businessesFound} zaken gevonden (${result.newBusinesses} nieuw, ${result.updatedBusinesses} bijgewerkt). Duur: ${result.duration}ms.`;
        } catch (err) {
          return `Scan van ${city} mislukt: ${err instanceof Error ? err.message : "onbekende fout"}. Ga door met de volgende stap.`;
        }
      },
    });

    const crawlBusinessesTool = tool({
      description: "Deep crawl de top zaken via Firecrawl (websites, KvK, TripAdvisor, Thuisbezorgd, AlleCijfers, nieuws). Doe dit NA het scannen.",
      inputSchema: z.object({
        cities: z.array(z.string()).describe("Steden waarvan de zaken gecrawld moeten worden"),
        maxBusinesses: z.number().max(20).default(20).describe("Maximum aantal zaken om te crawlen"),
      }),
      execute: async ({ cities, maxBusinesses }) => {
        await updateProgress("crawling", 45, "Websites & bronnen crawlen...");

        try {
          const topBusinesses = await runDeepCrawlForProfile(prisma, profile, cities, {
            maxBusinesses,
            onProgress: (completed, total, current) => {
              updateProgress("crawling", Math.round(45 + (completed / total) * 20), `Crawlen: ${current} (${completed}/${total})`);
            },
          });

          if (topBusinesses.length === 0) {
            return "Geen relevante zaken gevonden om te crawlen. Mogelijk is de Google Places API key niet geconfigureerd.";
          }

          const results = await prisma.crawledBusinessIntel.findMany({
            where: { businessId: { in: topBusinesses.map((business) => business.id) } },
          });
          const succeeded = results.filter((record) => record.crawlStatus === "complete").length;
          const partial = results.filter((record) => record.crawlStatus === "partial").length;
          return `${results.length} zaken gecrawld: ${succeeded} volledig, ${partial} gedeeltelijk. Bronnen: KvK, TripAdvisor, Thuisbezorgd, AlleCijfers, nieuws.`;
        } catch (err) {
          return `Crawling mislukt: ${err instanceof Error ? err.message : "onbekende fout"}. Ga door met signaal detectie.`;
        }
      },
    });

    const detectSignalsTool = tool({
      description: "Detecteer overname-signalen voor alle gescande zaken (rating dalingen, sluitingen, te koop meldingen, etc).",
      inputSchema: z.object({
        cities: z.array(z.string()),
      }),
      execute: async ({ cities }) => {
        await updateProgress("detecting", 70, "Signalen detecteren...");

        try {
          const before = await prisma.monitoredBusiness.count({
            where: { city: { in: cities }, signalScore: { gt: 20 } },
          });
          await detectSignalsForCities(prisma, cities);
          const businesses = await prisma.monitoredBusiness.count({
            where: { city: { in: cities } },
          });
          const signalCount = await prisma.monitoredBusiness.count({
            where: { city: { in: cities }, signalScore: { gt: 20 } },
          });
          return `Signalen gedetecteerd voor ${businesses} zaken. ${signalCount} zaken hebben significante overname-signalen (score > 20, delta ${signalCount - before >= 0 ? "+" : ""}${signalCount - before}).`;
        } catch (err) {
          return `Signaal detectie mislukt: ${err instanceof Error ? err.message : "onbekende fout"}.`;
        }
      },
    });

    const matchProfileTool = tool({
      description: "Match alle gescande zaken tegen het zoekprofiel en genereer AI samenvattingen.",
      inputSchema: z.object({
        profileId: z.string(),
      }),
      execute: async ({ profileId: pId }) => {
        await updateProgress("matching", 85, "Matches berekenen...");

        try {
          const { matchBusinessesToProfile } =
            await import("@/lib/intelligence/matcher");

          const matchResults = await matchBusinessesToProfile(pId, { minScore: 30, limit: 100 });

          await updateProgress("summarizing", 92, `AI analyse voor ${Math.min(matchResults.length, 20)} matches...`);
          totalMatches = await generateAndSaveMatchSummaries(prisma, pId);

          await updateProgress("matching", 95, `${totalMatches} matches opgeslagen`, { matchesFound: totalMatches });

          return `${totalMatches} matches gevonden en opgeslagen. Top match score: ${matchResults[0]?.matchScore ?? 0}/100. AI samenvattingen gegenereerd voor de top ${Math.min(matchResults.length, 20)}.`;
        } catch (err) {
          return `Matching mislukt: ${err instanceof Error ? err.message : "onbekende fout"}.`;
        }
      },
    });

    // Run the AI agent
    await updateProgress("loading", 5, "Intelligence agent gestart...");

    let text = "";
    try {
      const result = await generateText({
        model,
        system: `Je bent een horeca intelligence scanner agent voor Horecagrond.nl.

Je taak: scan de markt voor overname-kansen op basis van een zoekprofiel.

PROFIEL:
- Naam: ${profile.name}
- Concept: ${profile.concept}
- Steden: ${citiesToScan.join(", ")}
- Profiel keywords: ${keywordSet.primary.join(", ")}${keywordSet.secondary.length > 0 ? `\n- Generieke horeca termen: ${keywordSet.secondary.join(", ")}` : ""}
${profile.clientName ? `- Klant: ${profile.clientName}` : ""}

WERKWIJZE (voer deze stappen UIT in volgorde):
1. Scan elke stad met searchCity (gebruik de profiel keywords: ${keywordSet.primary.join(", ")})
2. Crawl de gevonden zaken met crawlBusinesses
3. Detecteer overname-signalen met detectSignals
4. Match alles tegen het profiel met matchProfile

Begin DIRECT met stap 1. Gebruik de tools. Geef na elke stap een korte status update.
Als een stap mislukt, ga door met de volgende.`,
        prompt: `Start de intelligence scan voor "${profile.name}" in ${citiesToScan.join(", ")}. Voer alle 4 stappen uit.`,
        tools: {
          searchCity: scanCityTool,
          crawlBusinesses: crawlBusinessesTool,
          detectSignals: detectSignalsTool,
          matchProfile: matchProfileTool,
        },
        stopWhen: stepCountIs(15),
      });
      text = result.text;
    } catch (agentError) {
      console.warn("[intelligence-scan] Agent orchestration failed, falling back:", agentError);

      if (totalBusinessesFound === 0) {
        await updateProgress("scanning", 15, "Fallback scan start...");
        const { scanCity } = await import("@/lib/intelligence/scanner");
        for (const city of citiesToScan) {
          const result = await scanCity(city, keywordSet.primary, {
            includeGenericHoreca: false,
            profile,
          });
          totalBusinessesFound += result.businessesFound;
          await updateProgress("scanning", 35, `${city}: ${result.businessesFound} zaken gevonden`, {
            businessesFound: totalBusinessesFound,
          });
        }
      }

      await updateProgress("crawling", 45, "Fallback: deep crawl...");
      try {
        await runDeepCrawlForProfile(prisma, profile, citiesToScan, {
          maxBusinesses: 20,
          onProgress: (completed, total, current) => {
            updateProgress(
              "crawling",
              Math.max(45, Math.round(45 + (completed / total) * 20)),
              `Fallback crawl: ${current} (${completed}/${total})`,
            );
          },
        });
      } catch (crawlError) {
        console.warn("[intelligence-scan] Fallback deep crawl failed:", crawlError);
      }

      await updateProgress("detecting", 70, "Fallback: signalen detecteren...");
      await detectSignalsForCities(prisma, citiesToScan);

      await updateProgress("matching", 85, "Fallback: matches berekenen...");
      totalMatches = await generateAndSaveMatchSummaries(prisma, profileId);
      text = `Fallback scan afgerond na agentfout. ${totalBusinessesFound} zaken gescand, ${totalMatches} matches opgeslagen.`;
    }

    if (totalBusinessesFound > 0 && totalMatches === 0) {
      await updateProgress("matching", 97, "Match-reconciliatie uitvoeren...");
      try {
        const recoveredMatches = await generateAndSaveMatchSummaries(prisma, profileId);
        if (recoveredMatches > 0) {
          totalMatches = recoveredMatches;
          await updateProgress("matching", 98, `${totalMatches} matches gereconcilieerd`, {
            matchesFound: totalMatches,
          });
        }
      } catch (recoveryError) {
        console.warn("[intelligence-scan] Match reconciliation failed:", recoveryError);
      }
    }

    // Complete
    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        businessesFound: totalBusinessesFound,
        matchesFound: totalMatches,
        completedAt: new Date(),
      },
    });

    await prisma.intelligenceProfile.update({
      where: { id: profileId },
      data: {
        lastScanAt: new Date(),
        totalScanned: { increment: totalBusinessesFound },
        totalMatches: totalMatches,
      },
    });

    return NextResponse.json({
      success: true,
      summary: text,
      businessesFound: totalBusinessesFound,
      matchesFound: totalMatches,
    });
  } catch (error) {
    console.error("[intelligence-scan] Agent failed:", error);

    await prisma.intelligenceScanJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Intelligence agent mislukt",
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Scan mislukt", details: error instanceof Error ? error.message : "Onbekende fout" },
      { status: 500 },
    );
  }
}
