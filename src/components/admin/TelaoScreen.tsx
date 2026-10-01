"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { useMilestoneCelebrations } from "@/components/admin/MilestoneCelebration";
import { StatsCards } from "@/components/admin/StatsCards";
import { TelaoSlots } from "@/components/admin/TelaoSlots";
import { fetchDashboard, subscribeDashboard } from "@/lib/data";
import type { DashboardSnapshot } from "@/lib/types";

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

export function TelaoScreen() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchDashboard();
      setSnapshot(data);
      setDataReady(true);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar o telão."
      );
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, 4000);
  }, [reload]);

  const celebration = useMilestoneCelebrations({
    rankingsByCargo: snapshot.rankingsByCargo,
    enabled: true,
    ready: dataReady,
  });

  return (
    <div className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[1600px] flex-col gap-1.5 overflow-hidden px-3 py-2 md:gap-3 md:px-5 md:py-3">
      <header className="flex shrink-0 items-end justify-between gap-2 border-b border-white/10 pb-1.5 md:pb-2">
        <div className="min-w-0">
          <p className="mb-0 inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#00ADEF] md:text-[10px]">
            <Radio className="size-2.5 animate-pulse md:size-3" />
            Ao vivo
          </p>
          <h1 className="truncate text-base font-bold leading-tight tracking-tight text-white md:text-2xl lg:text-3xl">
            Apuração Antecipada - Santo André
          </h1>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="shrink-0 rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-2 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      <div className="shrink-0">
        <StatsCards
          urnasApuradas={snapshot.urnasApuradas}
          totalSecoes={snapshot.secoesEsperadas || snapshot.totalSecoes}
          secoesFaltam={snapshot.secoesFaltam}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <TelaoSlots
          groups={snapshot.rankingsByCargo}
          celebration={celebration}
        />
      </div>
    </div>
  );
}
