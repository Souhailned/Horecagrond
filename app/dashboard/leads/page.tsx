import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getScoredLeads } from "@/app/actions/lead-scoring";
import { LeadsClient } from "./leads-client";
import {
  ContentCard,
  ContentCardHeader,
} from "@/components/dashboard/content-card";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";

export const metadata = { title: "Leads - Horecagrond" };

export default async function LeadsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/sign-in");

  const leads = await getScoredLeads();

  const counts = {
    total: leads.length,
    hot: leads.filter((l) => l.score.temperature === "hot").length,
    warm: leads.filter((l) => l.score.temperature === "warm").length,
    cold: leads.filter((l) => l.score.temperature === "cold").length,
    new: leads.filter((l) => l.status === "NEW").length,
  };

  if (leads.length === 0) {
    return (
      <ContentCard>
        <ContentCardHeader title="Leads" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="p-3 bg-muted rounded-md mb-4">
              <ChatCircleDots
                className="h-6 w-6 text-foreground"
                weight="regular"
              />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Nog geen aanvragen
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Wanneer ondernemers interesse tonen in je panden, verschijnen hun
              aanvragen hier met een automatische lead score.
            </p>
          </div>
        </div>
      </ContentCard>
    );
  }

  return (
    <ContentCard>
      {/* Row 1: Title */}
      <ContentCardHeader title="Leads" />

      {/* Row 2 (filters) + content rendered by client */}
      <LeadsClient leads={leads} counts={counts} />
    </ContentCard>
  );
}
