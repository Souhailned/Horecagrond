"use client";

import * as React from "react";
import { submitContactForm } from "@/app/actions/contact";
import { CheckCircle, PaperPlaneTilt, CircleNotch } from "@phosphor-icons/react";

export function ContactForm() {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const formData = new FormData(formRef.current!);
    const result = await submitContactForm(formData);

    if (!result.success) {
      setStatus("error");
      setErrorMsg(result.error);
    } else {
      setStatus("success");
      formRef.current?.reset();
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" weight="fill" />
        </div>
        <h3 className="text-xl font-semibold">Bedankt voor je bericht!</h3>
        <p className="mt-2 text-muted-foreground">
          We reageren doorgaans binnen 24 uur.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm text-primary hover:underline"
        >
          Nieuw bericht sturen
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Naam</label>
          <input
            name="name"
            type="text"
            required
            placeholder="Je naam"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">E-mail</label>
          <input
            name="email"
            type="email"
            required
            placeholder="je@email.nl"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Onderwerp</label>
        <input
          name="subject"
          type="text"
          required
          placeholder="Waar gaat je vraag over?"
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Bericht</label>
        <textarea
          name="message"
          rows={5}
          required
          placeholder="Beschrijf je vraag..."
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-500">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {status === "loading" ? (
          <>
            <CircleNotch className="h-4 w-4 animate-spin" />
            Versturen...
          </>
        ) : (
          <>
            <PaperPlaneTilt className="h-4 w-4" />
            Verstuur bericht
          </>
        )}
      </button>
    </form>
  );
}
