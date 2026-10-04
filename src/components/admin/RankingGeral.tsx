"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARGOS_OFICIAIS, CARGOS_RANKING_ORDEM, isFeaturedCandidato, labelCargoCurto, origemLabel } from "@/lib/cargos";
import { fetchDashboard, subscribeDashboard } from "@/lib/data";
import { ADMIN_POLL_MS } from "@/lib/live-load";
import type { Candidato, CargoRanking, DashboardSnapshot } from "@/lib/types";
import { cn, formatPercent, formatVotes } from "@/lib/utils";

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

export function RankingGeral() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [cargoFilter, setCargoFilter] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchDashboard("todos");
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar o ranking."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, ADMIN_POLL_MS);
  }, [reload]);

  const groups = snapshot.rankingGeralByCargo;
  const cargoOptions = useMemo(() => {
    const extras = groups
      .map((g) => g.cargo)
      .filter((c) => !(CARGOS_OFICIAIS as readonly string[]).includes(c));
    return ["todos", ...CARGOS_RANKING_ORDEM, ...extras.filter((c) => !(CARGOS_RANKING_ORDEM as readonly string[]).includes(c))];
  }, [groups]);

  const visibleGroups: CargoRanking[] =
    cargoFilter === "todos"
      ? groups
      : groups.filter((g) => g.cargo === cargoFilter);

  const flatRows = visibleGroups
    .flatMap((g) =>
      g.rankings.map((row) => ({
        ...row,
        cargo: g.cargo,
        totalCargo: g.totalVotos,
      }))
    )
    .filter((row) => row.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR"));

  const candidatosBanco: Candidato[] = useMemo(() => {
    const map = new Map<string, Candidato>();
    for (const g of snapshot.rankingGeralByCargo) {
      for (const row of g.rankings) {
        map.set(row.candidato.id, row.candidato);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const rank = (o?: string | null) =>
        o === "cadastro" || !o ? 0 : o === "catalogo" ? 1 : 2;
      const oa = rank(a.origem);
      const ob = rank(b.origem);
      if (oa !== ob) return oa - ob;
      if (a.cargo !== b.cargo) return a.cargo.localeCompare(b.cargo, "pt-BR");
      return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    });
  }, [snapshot.rankingGeralByCargo]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
            <Trophy className="size-4 text-[#FFDE00]" />
            Ranking geral
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Todos os candidatos com votos (oficiais, catálogo e BU). O telão de
            5 cards continua só com os cadastrados.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Cargo
          <select
            value={cargoFilter}
            onChange={(e) => setCargoFilter(e.target.value)}
            className="h-10 min-w-[12rem] rounded-lg border border-white/15 bg-slate-950 px-3 text-sm text-white"
          >
            {cargoOptions.map((c) => (
              <option key={c} value={c}>
                {c === "todos" ? "Todos os cargos" : c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Carregando ranking…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      {!loading && flatRows.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/20 px-4 py-8 text-center text-sm text-slate-400">
          Nenhum voto apurado ainda. Escaneie um BU no fiscal para popular o
          ranking.
        </p>
      )}

      {!loading && flatRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Número</th>
                <th className="px-3 py-2 font-semibold">Cargo</th>
                <th className="px-3 py-2 text-right font-semibold">Votos</th>
                <th className="px-3 py-2 text-right font-semibold">% no cargo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {flatRows.map((row, index) => (
                <tr
                  key={`${row.candidato.id}-${row.cargo}`}
                  className="bg-slate-950/40"
                >
                  <td className="px-3 py-2 tabular-nums text-slate-500">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2 font-medium text-white">
                    <span className="mr-2">{row.candidato.nome}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        isFeaturedCandidato(row.candidato.origem)
                          ? "bg-[#00ADEF]/20 text-[#00ADEF]"
                          : row.candidato.origem === "catalogo"
                            ? "bg-amber-400/20 text-amber-200"
                            : "bg-white/10 text-slate-400"
                      )}
                    >
                      {origemLabel(row.candidato.origem)}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">
                    {row.candidato.numero}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {labelCargoCurto(row.cargo)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-[#FFDE00]">
                    {formatVotes(row.votos)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#00ADEF]">
                    {formatPercent(row.percentual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
          <Users className="size-4 text-[#00ADEF]" />
          Candidatos no banco
        </h3>
        {candidatosBanco.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 px-4 py-6 text-center text-sm text-slate-400">
            Nenhum candidato no banco ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Número</th>
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Cargo</th>
                  <th className="px-3 py-2 font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {candidatosBanco.map((c) => (
                  <tr key={c.id} className="bg-slate-950/40">
                    <td className="px-3 py-2 tabular-nums text-slate-300">
                      {c.numero}
                    </td>
                    <td className="px-3 py-2 text-white">{c.nome}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {labelCargoCurto(c.cargo)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          isFeaturedCandidato(c.origem)
                            ? "bg-[#00ADEF]/20 text-[#00ADEF]"
                            : c.origem === "catalogo"
                              ? "bg-amber-400/20 text-amber-200"
                              : "bg-white/10 text-slate-400"
                        )}
                      >
                        {origemLabel(c.origem)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="border-white/20 text-white"
        onClick={() => {
          setLoading(true);
          void reload();
        }}
      >
        Atualizar ranking
      </Button>
    </div>
  );
}
