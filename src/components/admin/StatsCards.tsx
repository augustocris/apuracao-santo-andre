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
    <div className="grid grid-cols-2 gap-1.5 md:gap-2">
      <article className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#002a5c]/90 px-2 py-1 shadow-md shadow-black/25 md:gap-3 md:rounded-xl md:px-3 md:py-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#00ADEF]/20 text-[#00ADEF] md:size-8 md:rounded-lg">
          <CheckCheck className="size-3.5 md:size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1.5">
            <h2 className="truncate text-[9px] font-semibold uppercase tracking-wide text-white/60 md:text-[11px]">
              Enviadas / Faltam
            </h2>
            <p className="shrink-0 text-[10px] tabular-nums text-white/45 md:text-xs">
              faltam {formatVotes(secoesFaltam)}
            </p>
          </div>
          <p className="text-base font-bold leading-none tabular-nums text-white md:text-2xl md:leading-tight">
            {formatVotes(urnasApuradas)}
            <span className="text-xs font-medium text-white/55 md:text-sm">
              {" "}
              / {formatVotes(totalSecoes)}
            </span>
          </p>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[#001a3a] md:mt-1 md:h-1.5">
            <div
              className="h-full rounded-full bg-[#00ADEF] transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </article>

      <article className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#002a5c]/90 px-2 py-1 shadow-md shadow-black/25 md:gap-3 md:rounded-xl md:px-3 md:py-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#FFDE00]/20 text-[#FFDE00] md:size-8 md:rounded-lg">
          <Percent className="size-3.5 md:size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[9px] font-semibold uppercase tracking-wide text-white/60 md:text-[11px]">
            % Progresso
          </h2>
          <p className="text-base font-bold leading-none tabular-nums text-[#FFDE00] md:text-2xl md:leading-tight">
            {formatPercent(pct, 1)}
          </p>
        </div>
      </article>
    </div>
  );
}
