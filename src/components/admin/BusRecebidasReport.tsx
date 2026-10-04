"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAdminLock } from "@/components/admin/PinGate";
import { Button } from "@/components/ui/button";
import { fetchBusRecebidas, subscribeDashboard } from "@/lib/data";
import type { BusRecebidasReport as Report } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: Report = {
  urnasRecebidas: 0,
  secoesEsperadas: 0,
  secoesFaltam: 0,
  rows: [],
  zonas: [],
  mode: "mock",
};

export function BusRecebidasReport() {
  const lockAdmin = useAdminLock();
  const [report, setReport] = useState<Report>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("—");

  const reload = useCallback(async () => {
    setPending(true);
    try {
      const data = await fetchBusRecebidas();
      setReport(data);
      setUpdatedAt(
        new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date())
      );
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar as BUs recebidas."
      );
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, 4000);
  }, [reload]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-5 px-4 py-5 text-slate-900 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">
            Santo André
          </p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            BUs recebidas
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Urnas já gravadas em zona + seção. Atualizado às {updatedAt} · modo{" "}
            <span
              className={cn(
                "font-semibold uppercase",
                report.mode === "supabase" ? "text-emerald-700" : "text-amber-700"
              )}
            >
              {report.mode}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => void reload()}
            disabled={pending}
          >
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            Imprimir
          </Button>
          <Link
            href="/admin"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar ao admin
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={lockAdmin}
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      ) : null}

      <section
        aria-label="Totais"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatCard label="Urnas recebidas" value={report.urnasRecebidas} />
        <StatCard label="Seções esperadas" value={report.secoesEsperadas} />
        <StatCard label="Faltam" value={report.secoesFaltam} />
      </section>

      {report.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
          Nenhuma BU recebida ainda.
        </p>
      ) : (
        <div className="space-y-6">
          {report.zonas.map((grupo) => (
            <section
              key={grupo.zona}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-base font-bold">
                Zona {grupo.zona}{" "}
                <span className="font-normal text-slate-600">
                  · {grupo.recebidas}{" "}
                  {grupo.recebidas === 1 ? "seção" : "seções"}
                </span>
              </h2>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-semibold">Zona</th>
                    <th className="px-4 py-2 font-semibold">Seção</th>
                    <th className="px-4 py-2 font-semibold">Local</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.rows.map((row) => (
                    <tr
                      key={`${row.zona}-${row.secao}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-2 font-mono tabular-nums">
                        {row.zona}
                      </td>
                      <td className="px-4 py-2 font-mono tabular-nums">
                        {row.secao}
                      </td>
                      <td className="px-4 py-2 text-slate-800">
                        {row.escola ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
