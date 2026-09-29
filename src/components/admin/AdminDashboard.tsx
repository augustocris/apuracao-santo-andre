"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio, RefreshCw, Settings2, Tv } from "lucide-react";
import { AdminCadastro } from "@/components/admin/AdminCadastro";
import { useMilestoneCelebrations } from "@/components/admin/MilestoneCelebration";
import { StatsCards } from "@/components/admin/StatsCards";
import { TelaoSlots } from "@/components/admin/TelaoSlots";
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
  rankingGeralByCargo: [],
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
  const [dataReady, setDataReady] = useState(false);

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
      setDataReady(true);
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

  const celebration = useMilestoneCelebrations({
    rankingsByCargo: snapshot.rankingsByCargo,
    enabled: view === "telao",
    ready: dataReady,
  });

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1600px] flex-col px-3 py-2 md:px-5 md:py-4",
        view === "telao"
          ? "h-[100dvh] min-h-0 gap-1.5 overflow-hidden md:gap-3"
          : "min-h-full gap-5 px-4 py-5 md:px-6 lg:px-8"
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 md:gap-2",
          view === "telao" ? "shrink-0 pb-1.5 md:pb-2" : "items-end gap-3 pb-4"
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              "inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.2em] text-[#00ADEF] md:gap-2",
              view === "telao" ? "mb-0 text-[9px] md:mb-0.5 md:text-[10px]" : "mb-1 text-xs"
            )}
          >
            <Radio
              className={cn(
                "animate-pulse",
                view === "telao" ? "size-2.5 md:size-3" : "size-3.5"
              )}
            />
            Ao vivo
          </p>
          <h1
            className={cn(
              "font-bold tracking-tight text-white",
              view === "telao"
                ? "text-base leading-tight md:text-2xl lg:text-3xl"
                : "text-2xl md:text-4xl"
            )}
          >
            Apuração Antecipada - Santo André
          </h1>
          <p
            className={cn(
              "text-slate-400",
              view === "telao"
                ? "mt-0 truncate text-[10px] md:mt-0.5 md:text-xs"
                : "mt-1 text-sm"
            )}
          >
            Relatório: {cargoLabel} · atualizado às {updatedAt} · modo{" "}
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
          <div
            role="tablist"
            className="flex gap-1 rounded-xl bg-[#001a3a]/80 p-1"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={view === "telao"}
              variant="ghost"
              className={cn(
                "rounded-lg text-sm font-semibold",
                view === "telao" ? "h-8 px-3" : "h-10",
                view === "telao"
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
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
                "rounded-lg text-sm font-semibold",
                view === "telao" ? "h-8 px-3" : "h-10",
                view === "cadastro"
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
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
            className={cn(
              "border-white/25 bg-white/5 text-white hover:bg-white/10",
              view === "telao" && "h-8 px-3"
            )}
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
          className="shrink-0 rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-2 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      {view === "cadastro" ? (
        <AdminCadastro onConfigSaved={() => void reload()} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
