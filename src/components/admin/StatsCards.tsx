"use client";

import { CheckCheck, Percent, Vote } from "lucide-react";
import { formatPercent, formatVotes } from "@/lib/utils";

interface StatsCardsProps {
  urnasApuradas: number;
  totalSecoes: number;
  secoesFaltam: number;
  totalVotosValidos: number;
}

export function StatsCards({
  urnasApuradas,
  totalSecoes,
  secoesFaltam,
  totalVotosValidos,
}: StatsCardsProps) {
  const pct =
    totalSecoes > 0 ? Math.min(100, (urnasApuradas / totalSecoes) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg shadow-black/30">
        <div className="mb-2 flex items-center gap-2 text-teal-300">
          <CheckCheck className="size-5" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Enviadas / faltam
          </h2>
        </div>
        <p className="text-3xl font-bold tabular-nums text-white md:text-4xl">
          {formatVotes(urnasApuradas)}
          <span className="text-lg font-medium text-slate-400">
            {" "}
            / {formatVotes(totalSecoes)}
          </span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-teal-400 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {formatVotes(secoesFaltam)} seções faltando
        </p>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg shadow-black/30">
        <div className="mb-2 flex items-center gap-2 text-amber-300">
          <Percent className="size-5" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Progresso
          </h2>
        </div>
        <p className="text-3xl font-bold tabular-nums text-amber-300 md:text-4xl">
          {formatPercent(pct, 1)}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Com base nas seções esperadas do cadastro
        </p>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg shadow-black/30">
        <div className="mb-2 flex items-center gap-2 text-sky-300">
          <Vote className="size-5" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Votos válidos
          </h2>
        </div>
        <p className="text-3xl font-bold tabular-nums text-white md:text-4xl">
          {formatVotes(totalVotosValidos)}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Soma dos cargos do relatório selecionado
        </p>
      </article>
    </div>
  );
}
