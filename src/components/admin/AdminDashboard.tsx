"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  ExternalLink,
  ListChecks,
  LogOut,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { AdminCadastro } from "@/components/admin/AdminCadastro";
import { AdminDigitarBu } from "@/components/admin/AdminDigitarBu";
import { AdminPendentes } from "@/components/admin/AdminPendentes";
import { useAdminLock } from "@/components/admin/PinGate";
import { Button } from "@/components/ui/button";
import { fetchDashboard, subscribeDashboard } from "@/lib/data";
import type { DashboardSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: DashboardSnapshot = {
  totalSecoes: 0,
  secoesEsperadas: 0,
  urnasApuradas: 0,
  secoesFaltam: 0,
  totalVotosValidos: 0,
  rankings: [],
  rankingsByCargo: [],
  rankingGeralByCargo: [],
  relatorioCargos: [],
  feed: [],
  mode: "mock",
};

type AdminView = "cadastro" | "pendentes" | "digitar";

export function AdminDashboard() {
  const lockAdmin = useAdminLock();
  const [view, setView] = useState<AdminView>("cadastro");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchDashboard();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar o painel."
      );
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, 4000);
  }, [reload]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#00ADEF]">
            Central
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-4xl">
            Painel admin
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Cadastro, BUs pendentes e Digitar BU. O telão da TV é{" "}
            <Link href="/telao" className="text-[#00ADEF] underline">
              /telao
            </Link>
            {" · "}
            modo{" "}
            <span
              className={cn(
                "font-semibold uppercase",
                snapshot.mode === "supabase"
                  ? "text-emerald-300"
                  : "text-[#FFDE00]"
              )}
            >
              {snapshot.mode}
            </span>
          </p>
          {snapshot.mode === "mock" && view === "cadastro" && (
            <p className="mt-2 max-w-2xl text-xs text-[#FFDE00]/90">
              Sem Supabase neste deploy: cadastros ficam só no navegador.
              Configure{" "}
              <code className="text-[#FFDE00]">NEXT_PUBLIC_SUPABASE_*</code> na
              Vercel + Redeploy.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/telao"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#FFDE00]/40 bg-[#FFDE00]/10 px-3 text-sm font-semibold text-[#FFDE00] hover:bg-[#FFDE00]/20"
          >
            <ExternalLink className="size-4" />
            Abrir telão
          </Link>
          <a
            href="/admin/bus-recebidas"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/25 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            <ListChecks className="size-4" />
            BUs recebidas
          </a>
          <div
            role="tablist"
            className="flex gap-1 rounded-xl bg-[#001a3a]/80 p-1"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={view === "cadastro"}
              variant="ghost"
              className={cn(
                "h-10 rounded-lg text-sm font-semibold",
                view === "cadastro"
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setView("cadastro")}
            >
              <Settings2 className="size-4" />
              Cadastro
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={view === "pendentes"}
              variant="ghost"
              className={cn(
                "h-10 rounded-lg text-sm font-semibold",
                view === "pendentes"
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setView("pendentes")}
            >
              <TriangleAlert className="size-4" />
              BUs pendentes
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={view === "digitar"}
              variant="ghost"
              className={cn(
                "h-10 rounded-lg text-sm font-semibold",
                view === "digitar"
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setView("digitar")}
            >
              <ClipboardList className="size-4" />
              Digitar BU
            </Button>
          </div>
          <Link
            href="/chefe"
            className="text-[11px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            Acesso chefe
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-10 border-white/25 bg-white/5 text-white hover:bg-white/10"
            onClick={lockAdmin}
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-2 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      {view === "cadastro" ? (
        <AdminCadastro onConfigSaved={() => void reload()} />
      ) : view === "pendentes" ? (
        <AdminPendentes />
      ) : (
        <AdminDigitarBu />
      )}
    </div>
  );
}
