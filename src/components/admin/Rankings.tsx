"use client";

import type { RankingRow } from "@/lib/types";
import { cn, formatPercent, formatVotes } from "@/lib/utils";

interface RankingsProps {
  rankings: RankingRow[];
}

export function Rankings({ rankings }: RankingsProps) {
  if (rankings.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-slate-400">
        Aguardando os primeiros boletins...
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {rankings.map((row, index) => {
        const leader = index === 0 && row.votos > 0;
        return (
          <li
            key={row.candidato.id}
            className={cn(
              "flex items-center gap-4 rounded-2xl border px-4 py-3 transition",
              leader
                ? "border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-transparent shadow-[0_0_24px_rgba(245,158,11,0.15)]"
                : "border-white/10 bg-slate-900/70"
            )}
          >
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold",
                leader
                  ? "bg-amber-400 text-slate-950"
                  : "bg-slate-700 text-white"
              )}
            >
              {row.candidato.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.candidato.foto_url}
                  alt={row.candidato.nome}
                  className="size-full object-cover"
                />
              ) : (
                row.candidato.numero
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "truncate font-semibold",
                    leader ? "text-xl text-amber-200" : "text-lg text-white"
                  )}
                >
                  {row.candidato.nome}
                </p>
                <p className="shrink-0 text-xl font-bold tabular-nums text-white">
                  {formatVotes(row.votos)}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      leader ? "bg-amber-400" : "bg-teal-400"
                    )}
                    style={{ width: `${Math.max(row.percentual, 1)}%` }}
                  />
                </div>
                <span className="w-14 text-right text-sm font-semibold tabular-nums text-slate-300">
                  {formatPercent(row.percentual)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
