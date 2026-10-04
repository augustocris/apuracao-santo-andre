import type { Metadata } from "next";
import { AdminPendentes } from "@/components/admin/AdminPendentes";
import { PinGate } from "@/components/admin/PinGate";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BUs pendentes — Admin",
  description: "Fila de BUs que o parser recusou — Santo André.",
};

export default function AdminPendentesPage() {
  return (
    <main className="theme-admin dark flex min-h-full flex-1 flex-col">
      <PinGate title="Acesso admin" description="Digite o PIN.">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 py-5 md:px-6">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ADEF]">
                Santo André
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                BUs pendentes
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                QR que o parser recusou. A fila entra depois — esta tela sempre
                abre.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg border border-white/25 px-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Voltar ao admin
            </Link>
          </header>
          <AdminPendentes standalone />
        </div>
      </PinGate>
    </main>
  );
}
