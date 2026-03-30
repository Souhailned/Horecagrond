import Link from "next/link";
import { ClockCountdown, ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export function ReportExpired() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <ClockCountdown className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
          Rapport verlopen
        </h1>
        <p className="mb-8 text-muted-foreground">
          De geldigheid van dit rapport is verlopen. Neem contact op met uw
          makelaar om een nieuw rapport aan te vragen.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Naar Horecagrond.nl
          </Link>
        </Button>
      </div>
    </div>
  );
}
