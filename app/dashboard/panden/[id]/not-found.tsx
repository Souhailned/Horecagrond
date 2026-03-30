import Link from "next/link";
import { ContentCard, ContentCardHeader, ContentCardBody } from "@/components/dashboard/content-card";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

export default function PropertyNotFound() {
  return (
    <ContentCard>
      <ContentCardHeader title="Pand niet gevonden" />
      <ContentCardBody className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted">
            <WarningCircle className="h-6 w-6 text-muted-foreground" weight="regular" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">Pand niet gevonden</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Dit pand bestaat niet of je hebt geen toegang. Mogelijk is het verwijderd of heb je niet de juiste rechten.
            </p>
          </div>
          <Link
            href="/dashboard/panden"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
          >
            Terug naar Mijn Panden
          </Link>
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}
