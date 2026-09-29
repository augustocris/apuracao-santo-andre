"use client";

import { CheckCheck, Percent } from "lucide-react";
import { formatPercent, formatVotes } from "@/lib/utils";

interface StatsCardsProps {
  urnasApuradas: number;
  totalSecoes: number;
  secoesFaltam: number;
}

export function StatsCards({
  urnasApuradas,
  totalSecoes,
  secoesFaltam,
}: StatsCardsProps) {
  const pct =
    totalSecoes > 0 ? Math.min(100, (urnasApuradas / totalSecoes) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <article className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-md shadow-black/20">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
          <CheckCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Enviadas / Faltam
            </h2>
            <p className="text-xs tabular-nums text-slate-500">
              faltam {formatVotes(secoesFaltam)}
            </p>
          </div>
          <p className="text-xl font-bold leading-tight tabular-nums text-white md:text-2xl">
            {formatVotes(urnasApuradas)}
            <span className="text-sm font-medium text-slate-400">
              {" "}
              / {formatVotes(totalSecoes)}
            </span>
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </article>

      <article className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-md shadow-black/20">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
          <Percent className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            % Progresso
          </h2>
          <p className="text-xl font-bold leading-tight tabular-nums text-amber-300 md:text-2xl">
            {formatPercent(pct, 1)}
          </p>
        </div>
      </article>
    </div>
  );
}
