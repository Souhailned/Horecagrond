import { requirePagePermission } from "@/lib/session";
import { getMyPropertiesForDashboard } from "@/app/actions/get-property";
import { getPortfolioSummary } from "@/app/actions/portfolio-summary";
import { PandenClient } from "./panden-client";

export const metadata = { title: "Mijn Panden - Horecagrond" };

export default async function PandenPage() {
  const { userId, role } = await requirePagePermission("properties:edit-own");

  const scope = role === "admin" ? "all" : "mine";

  const [propertiesResult, summaryResult] = await Promise.all([
    getMyPropertiesForDashboard(scope),
    getPortfolioSummary(scope),
  ]);

  const properties =
    propertiesResult.success && propertiesResult.data
      ? propertiesResult.data
      : [];

  const summary =
    summaryResult.success && summaryResult.data ? summaryResult.data : null;

  return (
    <PandenClient
      initialProperties={properties}
      initialSummary={summary}
      userId={userId}
      userRole={role}
    />
  );
}
