"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { StatsCards } from "@/components/admin/StatsCards";
import { Rankings } from "@/components/admin/Rankings";
import { VotesChart } from "@/components/admin/VotesChart";
import { LatestFeed } from "@/components/admin/LatestFeed";
import { Button } from "@/components/ui/button";
import { fetchDashboard, subscribeDashboard } from "@/lib/data";
import type { DashboardSnapshot } from "@/lib/types";

const EMPTY: DashboardSnapshot = {
  totalSecoes: 0,
  urnasApuradas: 0,
  totalVotosValidos: 0,
  rankings: [],
  feed: [],
  mode: "mock",
};

export function AdminDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("—");
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setPending(true);
    try {
      const data = await fetchDashboard("Prefeito");
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
            Ranking de prefeito · atualizado às {updatedAt} · modo{" "}
            <span className="font-semibold uppercase text-slate-200">
              {snapshot.mode}
            </span>
          </p>
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
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      <StatsCards
        urnasApuradas={snapshot.urnasApuradas}
        totalSecoes={snapshot.totalSecoes}
        totalVotosValidos={snapshot.totalVotosValidos}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            Ranking — Prefeito
          </h2>
          <Rankings rankings={snapshot.rankings} />
          <VotesChart rankings={snapshot.rankings} />
        </section>

        <aside className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            Últimos BUs
          </h2>
          <LatestFeed feed={snapshot.feed} />
        </aside>
      </div>
    </div>
  );
}
