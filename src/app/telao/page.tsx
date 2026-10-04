import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Telão desligado — Santo André",
  description: "O telão está desligado. Use o /chefe.",
};

/**
 * Sunday load: this route must not import TelaoScreen, fetchDashboard,
 * subscribeDashboard, or any Supabase/live helper.
 */
export default function TelaoOffPage() {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center bg-slate-950 px-6 py-10 text-center text-slate-100">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Apuração Santo André
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Telão desligado
      </h1>
      <p className="mt-3 max-w-md text-base text-slate-300">
        A tela grande não atualiza mais. Acompanhe a apuração no chefe.
      </p>
      <Link
        href="/chefe"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-teal-600 px-6 text-base font-bold text-white hover:bg-teal-500"
      >
        Abrir /chefe
      </Link>
    </main>
  );
}
