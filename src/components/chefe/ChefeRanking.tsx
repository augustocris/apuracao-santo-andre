"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Lock, LogOut, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CARGO_INDEFINIDO,
  CARGOS_CHEFE_FILTRO,
  CHEFE_UNLOCK_KEY,
  isFeaturedCandidato,
  labelCargoCurto,
  origemLabel,
  resolveChefePin,
} from "@/lib/cargos";
import { CHAPADA_HINT } from "@/lib/chapada";
import {
  chefeMiniaturaFallback,
  filterChefeRankingRows,
  isCandidatoFavorito,
  type ChefeFavoritoFilter,
  type ChefeSortKey,
} from "@/lib/chefe-ranking";
import { fetchDashboard, getConfig, setCandidatoFavorito, subscribeDashboard } from "@/lib/data";
import type { Candidato, DashboardSnapshot } from "@/lib/types";
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

type SortKey = ChefeSortKey;

const PCT_CARGO_HINT =
  "Participação nos votos deste cargo (quem já tem voto).";

function ChefeFoto({ candidato }: { candidato: Candidato }) {
  const [failed, setFailed] = useState(false);
  const src = candidato.foto_url?.trim() || "";
  const showImg = Boolean(src) && !failed;
  const fallback = chefeMiniaturaFallback(candidato.nome, candidato.numero);

  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-[10px] font-bold leading-none text-teal-900"
      title={candidato.nome}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{fallback}</span>
      )}
    </span>
  );
}

function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(CHEFE_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function ChefeRanking() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [expectedPin, setExpectedPin] = useState(resolveChefePin(null));
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [cargoFilter, setCargoFilter] = useState<string>("todos");
  const [sort, setSort] = useState<SortKey>("votos");
  const [query, setQuery] = useState("");
  const [favoritoFilter, setFavoritoFilter] =
    useState<ChefeFavoritoFilter>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setUnlocked(isUnlocked());
    void (async () => {
      try {
        const cfg = await getConfig();
        setExpectedPin(resolveChefePin(cfg.chefe_pin));
      } catch {
        setExpectedPin(resolveChefePin(null));
      }
    })();
  }, []);

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
    if (!unlocked) return;
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, 4000);
  }, [unlocked, reload]);

  const rows = useMemo(
    () =>
      filterChefeRankingRows(snapshot.rankingGeralByCargo, {
        cargoFilter,
        sort,
        query,
        favoritoFilter,
      }),
    [snapshot.rankingGeralByCargo, cargoFilter, sort, query, favoritoFilter]
  );

  const indefinidos = snapshot.rankingGeralByCargo.find(
    (g) => g.cargo === CARGO_INDEFINIDO
  )?.rankings.length ?? 0;

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (pin.trim() === expectedPin) {
      try {
        sessionStorage.setItem(CHEFE_UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
      setPinError(null);
      setPin("");
    } else {
      setPinError("PIN incorreto.");
    }
  }

  function handleLock() {
    try {
      sessionStorage.removeItem(CHEFE_UNLOCK_KEY);
    } catch {
      /* ignore */
    }
    setUnlocked(false);
  }

  function patchFavoritoInSnapshot(id: string, favorito: boolean) {
    setSnapshot((prev) => ({
      ...prev,
      rankingGeralByCargo: prev.rankingGeralByCargo.map((g) => ({
        ...g,
        rankings: g.rankings.map((row) =>
          row.candidato.id === id
            ? { ...row, candidato: { ...row.candidato, favorito } }
            : row
        ),
      })),
    }));
  }

  async function toggleFavorito(candidato: Candidato) {
    if (savingIds.has(candidato.id)) return;
    const next = !isCandidatoFavorito(candidato.favorito);
    const previous = isCandidatoFavorito(candidato.favorito);
    patchFavoritoInSnapshot(candidato.id, next);
    setSavingIds((prev) => new Set(prev).add(candidato.id));
    try {
      await setCandidatoFavorito(candidato.id, next);
      setError(null);
    } catch (err) {
      patchFavoritoInSnapshot(candidato.id, previous);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o favorito."
      );
    } finally {
      setSavingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(candidato.id);
        return copy;
      });
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">
            Santo André
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Acesso chefe</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ranking completo (incluindo Presidente). Não substitui o telão de 5
            cards.
          </p>
        </div>
        <form
          onSubmit={handleUnlock}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <label className="block text-sm font-medium text-slate-700">
            PIN
            <Input
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1"
              placeholder="PIN"
            />
          </label>
          {pinError && (
            <p role="alert" className="text-sm text-red-700">
              {pinError}
            </p>
          )}
          <Button type="submit" className="h-11 w-full bg-teal-700 text-white hover:bg-teal-800">
            <Lock className="size-4" />
            Entrar
          </Button>
        </form>
        <Link href="/" className="text-center text-sm text-slate-500 underline">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
            <Trophy className="size-3.5" />
            Chefe
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Ranking geral</h1>
          <p className="text-sm text-slate-600">
            {snapshot.urnasApuradas} urnas · modo {snapshot.mode}. Presidente
            entra aqui, não no telão de 5 cards.
          </p>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">{CHAPADA_HINT}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Telão
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-10 border-slate-300"
            onClick={handleLock}
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Cargo
          <select
            value={cargoFilter}
            onChange={(e) => setCargoFilter(e.target.value)}
            className="h-10 min-w-[12rem] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            {CARGOS_CHEFE_FILTRO.map((c) => (
              <option key={c} value={c}>
                {c === "todos" ? "Todos" : c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-500">
          <span>Favoritos</span>
          <div className="flex h-10 overflow-hidden rounded-lg border border-slate-300 bg-white text-sm text-slate-900">
            <button
              type="button"
              onClick={() => setFavoritoFilter("todos")}
              aria-pressed={favoritoFilter === "todos"}
              className={cn(
                "px-3",
                favoritoFilter === "todos"
                  ? "bg-teal-700 font-semibold text-white"
                  : "hover:bg-slate-50"
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFavoritoFilter("favoritos")}
              aria-pressed={favoritoFilter === "favoritos"}
              className={cn(
                "border-l border-slate-300 px-3",
                favoritoFilter === "favoritos"
                  ? "bg-teal-700 font-semibold text-white"
                  : "font-semibold hover:bg-slate-50"
              )}
            >
              Somente favoritos
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Ordenar
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 min-w-[10rem] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="votos">Votos desc</option>
            <option value="nome">Nome A–Z</option>
          </select>
        </label>
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome ou número"
            className="h-10 pl-9"
          />
        </label>
      </div>

      {indefinidos > 0 && cargoFilter === "todos" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {indefinidos} candidato(s) com cargo indefinido (2 dígitos sem
          PRESIDENTE/GOVERNADOR no BU). Aparecem em “Todos” se tiverem voto —
          não misturam Presidente e Governador.
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      {!loading && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          {favoritoFilter === "favoritos"
            ? "Nenhum favorito neste filtro."
            : "Nenhum candidato neste filtro."}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">
                  Favoritos
                </th>
                <th className="px-2 py-2 font-semibold">
                  <span className="sr-only">Foto</span>
                </th>
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Número</th>
                <th className="px-3 py-2 font-semibold">Cargo</th>
                <th className="px-3 py-2 text-right font-semibold">Votos</th>
                <th
                  className="px-3 py-2 text-right font-semibold"
                  title={PCT_CARGO_HINT}
                >
                  % no cargo
                </th>
                <th className="px-3 py-2 font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${row.candidato.id}-${row.cargo}`} className="bg-white">
                  <td className="px-3 py-2 tabular-nums text-slate-400">
                    {index + 1}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-amber-500"
                      checked={isCandidatoFavorito(row.candidato.favorito)}
                      disabled={savingIds.has(row.candidato.id)}
                      onChange={() => void toggleFavorito(row.candidato)}
                      title="Marcar como favorito"
                      aria-label={`Marcar como favorito: ${row.candidato.nome}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ChefeFoto candidato={row.candidato} />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {row.candidato.nome}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {row.candidato.numero}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {labelCargoCurto(row.cargo)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-teal-800">
                    {formatVotes(row.votos)}
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums text-slate-600"
                    title={PCT_CARGO_HINT}
                  >
                    {formatPercent(row.percentual)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        isFeaturedCandidato(row.candidato.origem)
                          ? "bg-teal-100 text-teal-800"
                          : row.candidato.origem === "catalogo"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {origemLabel(row.candidato.origem)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <p className="text-[11px] text-slate-500">{PCT_CARGO_HINT}</p>
      )}
    </div>
  );
}
