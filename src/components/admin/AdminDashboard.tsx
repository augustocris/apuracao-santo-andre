"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio, RefreshCw, Settings2, Tv } from "lucide-react";
import { AdminCadastro } from "@/components/admin/AdminCadastro";
import { StatsCards } from "@/components/admin/StatsCards";
import { Rankings } from "@/components/admin/Rankings";
import { VotesChart } from "@/components/admin/VotesChart";
import { LatestFeed } from "@/components/admin/LatestFeed";
import { Button } from "@/components/ui/button";
import { labelCargoCurto } from "@/lib/cargos";
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
  relatorioCargos: [],
  feed: [],
  mode: "mock",
};

type AdminView = "telao" | "cadastro";

export function AdminDashboard() {
  const [view, setView] = useState<AdminView>("telao");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("—");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setPending(true);
    try {
      const data = await fetchDashboard();
      setSnapshot(data);
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
        err instanceof Error ? err.message : "Falha ao carregar o painel."
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

  const cargoLabel =
    snapshot.relatorioCargos.length === 0
      ? "—"
      : snapshot.relatorioCargos.length >= 4
        ? "todos os cargos"
        : snapshot.relatorioCargos.map(labelCargoCurto).join(" · ");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            <Radio className="size-3.5 animate-pulse" />
            Ao vivo
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-4xl">
            Apuração Eleitoral em Tempo Real - Santo André
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Relatório: {cargoLabel} · atualizado às {updatedAt} · modo{" "}
            <span className="font-semibold uppercase text-slate-200">
              {snapshot.mode}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            className="flex gap-1 rounded-xl bg-slate-900/80 p-1"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={view === "telao"}
              variant="ghost"
              className={cn(
                "h-10 rounded-lg text-sm font-semibold",
                view === "telao"
                  ? "bg-teal-600 text-white hover:bg-teal-600"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setView("telao")}
            >
              <Tv className="size-4" />
              Telão
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={view === "cadastro"}
              variant="ghost"
              className={cn(
                "h-10 rounded-lg text-sm font-semibold",
                view === "cadastro"
                  ? "bg-teal-600 text-white hover:bg-teal-600"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setView("cadastro")}
            >
              <Settings2 className="size-4" />
              Cadastro
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => void reload()}
            disabled={pending}
          >
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      {view === "cadastro" ? (
        <AdminCadastro onConfigSaved={() => void reload()} />
      ) : (
        <>
          <StatsCards
            urnasApuradas={snapshot.urnasApuradas}
            totalSecoes={snapshot.secoesEsperadas || snapshot.totalSecoes}
            secoesFaltam={snapshot.secoesFaltam}
            totalVotosValidos={snapshot.totalVotosValidos}
          />

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <section className="space-y-6">
              {snapshot.rankingsByCargo.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-slate-400">
                  Nenhum cargo selecionado no relatório. Abra a aba Cadastro.
                </p>
              ) : (
                snapshot.rankingsByCargo.map((group) => (
                  <div key={group.cargo} className="space-y-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
                      Ranking — {group.cargo}
                    </h2>
                    <Rankings rankings={group.rankings} />
                    <VotesChart rankings={group.rankings} />
                  </div>
                ))
              )}
            </section>

            <aside className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 lg:sticky lg:top-4 lg:self-start">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
                Últimos BUs
              </h2>
              <LatestFeed feed={snapshot.feed} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
