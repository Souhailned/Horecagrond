import Link from "next/link";
import { FileX, ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export function ReportNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <FileX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
          Rapport niet gevonden
        </h1>
        <p className="mb-8 text-muted-foreground">
          Dit rapport bestaat niet of de link is niet geldig. Neem contact op
          met uw makelaar voor een nieuwe link.
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
