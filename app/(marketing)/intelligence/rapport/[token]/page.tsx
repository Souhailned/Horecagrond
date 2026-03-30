import type { Metadata } from "next";
import { SharedReportContent } from "@/components/intelligence/report/shared-report-content";
import { ReportNotFound } from "@/components/intelligence/report/report-not-found";
import { ReportExpired } from "@/components/intelligence/report/report-expired";
import type {
  SharedReportData,
  SharedReportError,
} from "@/components/intelligence/report/types";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchReport(token);

  if (!data || "error" in data) {
    return {
      title: "Rapport niet gevonden | Horecagrond",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Intelligence Rapport — ${data.profileName} | Horecagrond`,
    description: `Overname Intelligence Rapport voor ${data.clientName ?? data.profileName}. ${data.matchCount} geselecteerde kans${data.matchCount === 1 ? "" : "en"}.`,
    robots: { index: false, follow: false },
  };
}

// ---------------------------------------------------------------------------
// Data fetching (server-side, no client fetch)
// ---------------------------------------------------------------------------

async function fetchReport(
  token: string,
): Promise<SharedReportData | SharedReportError | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/intelligence/shared/${token}`, {
      cache: "no-store",
    });

    if (res.status === 410) {
      return { error: "expired" };
    }

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as SharedReportData;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchReport(token);

  if (!data) {
    return <ReportNotFound />;
  }

  if ("error" in data) {
    if (data.error === "expired") {
      return <ReportExpired />;
    }
    return <ReportNotFound />;
  }

  return <SharedReportContent data={data} />;
}
