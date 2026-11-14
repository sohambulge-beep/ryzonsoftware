import type { ReactNode } from "react";
import { PROVIDER_PHONE } from "@/lib/providerConfig";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const digits = PROVIDER_PHONE.replace(/\D/g, "");
  const wa = digits.length >= 10 ? `https://wa.me/${digits}` : "";
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-200">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <a href="/" className="text-sm text-amber-400 underline underline-offset-2">
            Back to the app
          </a>
          <div className="space-x-4 text-xs text-zinc-500">
            <a href="/terms" className="underline hover:text-zinc-300">
              Terms
            </a>
            <a href="/privacy" className="underline hover:text-zinc-300">
              Privacy
            </a>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-xs text-zinc-500">Last updated: {updated}</p>
        <div className="space-y-5 text-sm leading-relaxed text-zinc-300">{children}</div>
        <div className="border-t border-zinc-800 pt-4 text-sm text-zinc-400">
          Questions?{" "}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">
              Message us on WhatsApp
            </a>
          ) : (
            "Ask the person who gave you this app."
          )}
        </div>
      </div>
    </div>
  );
}
