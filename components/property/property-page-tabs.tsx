import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overzicht", label: "Overzicht", path: "" },
  { id: "analytics", label: "Analytics", path: "/analytics" },
  { id: "bewerken", label: "Bewerken", path: "/bewerken" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PropertyPageTabs({
  propertyId,
  activeTab,
}: {
  propertyId: string;
  activeTab: TabId;
}) {
  return (
    <nav className="flex items-center gap-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/dashboard/panden/${propertyId}${tab.path}`}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            tab.id === activeTab
              ? "font-medium bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
