"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Lock, LogOut, Search, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHEFE_SESSION_ID_KEY, CHEFE_UNLOCK_KEY } from "@/lib/cargos";
import {
  cargoRowsForChefe,
  chefeGreeting,
  chefeMiniaturaFallback,
  isChefeFavoritoId,
  leftoverAfterPair,
  pickHighlightPair,
  sortChefeFavoritesFirst,
  type ChefeRankingFlatRow,
} from "@/lib/chefe-ranking";
import {
  fetchDashboard,
  listChefeFavoritoIds,
  listChefes,
  setChefeFavorito,
  subscribeDashboard,
  unlockChefeByPin,
} from "@/lib/data";
import type { Candidato, Chefe, DashboardSnapshot } from "@/lib/types";
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

const COLUNAS = [
  { cargo: "Deputado Estadual", titulo: "Deputado Estadual" },
  { cargo: "Deputado Federal", titulo: "Deputado Federal" },
  { cargo: "Senador", titulo: "Senador" },
] as const;

function ChefeFoto({
  candidato,
  size = "sm",
}: {
  candidato: Candidato;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const src = candidato.foto_url?.trim() || "";
  const showImg = Boolean(src) && !failed;
  const fallback = chefeMiniaturaFallback(candidato.nome, candidato.numero);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-teal-100 font-bold leading-none text-teal-900",
        size === "lg"
          ? "size-16 rounded-xl text-sm md:size-20 md:text-base"
          : "size-10 rounded-full text-[10px]"
      )}
      title={candidato.nome}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{fallback}</span>
      )}
    </span>
  );
}

function StarButton({
  candidato,
  favorito,
  busy,
  onToggle,
}: {
  candidato: Candidato;
  favorito: boolean;
  busy: boolean;
  onToggle: (candidato: Candidato) => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50 disabled:opacity-50 md:size-9"
      disabled={busy}
      onClick={() => onToggle(candidato)}
      aria-pressed={favorito}
      aria-label={
        favorito
          ? `Remover favorito: ${candidato.nome}`
          : `Marcar como favorito: ${candidato.nome}`
      }
      title="Favorito deste PIN"
    >
      <Star
        className={cn(
          "size-5 md:size-4",
          favorito ? "fill-amber-400 text-amber-500" : "text-slate-300"
        )}
      />
    </button>
  );
}

function HighlightCard({
  row,
  place,
  favorito,
  busy,
  onToggle,
}: {
  row: ChefeRankingFlatRow;
  place: 1 | 2;
  favorito: boolean;
  busy: boolean;
  onToggle: (candidato: Candidato) => void;
}) {
  return (
    <article className="flex min-w-0 items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:gap-4 md:p-4">
      <ChefeFoto candidato={row.candidato} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-800">
          {row.cargo} · {place}º
        </p>
        <p className="mt-0.5 line-clamp-2 font-bold leading-tight text-slate-900 md:text-lg">
          {row.candidato.nome}
        </p>
        <p className="text-xs tabular-nums text-slate-500">
          Nº {row.candidato.numero}
        </p>
        <p className="mt-1 font-bold tabular-nums text-teal-800 md:text-xl">
          {formatVotes(row.votos)}
          <span className="ml-1 text-xs font-medium text-slate-500 md:text-sm">
            votos
          </span>
          <span className="ml-2 text-xs font-semibold text-slate-400 md:text-sm">
            {formatPercent(row.percentual)}
          </span>
        </p>
      </div>
      <StarButton
        candidato={row.candidato}
        favorito={favorito}
        busy={busy}
        onToggle={onToggle}
      />
    </article>
  );
}

function CargoRow({
  row,
  index,
  favorito,
  busy,
  onToggle,
}: {
  row: ChefeRankingFlatRow;
  index: number;
  favorito: boolean;
  busy: boolean;
  onToggle: (candidato: Candidato) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 md:px-3",
        favorito && "bg-amber-50/80"
      )}
    >
      <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-slate-400">
        {index + 1}
      </span>
      <ChefeFoto candidato={row.candidato} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {row.candidato.nome}
        </p>
        <p className="text-[11px] tabular-nums text-slate-500">
          Nº {row.candidato.numero}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-teal-800">
          {formatVotes(row.votos)}
        </p>
        <p className="text-[11px] tabular-nums text-slate-400">
          {formatPercent(row.percentual)}
        </p>
      </div>
      <StarButton
        candidato={row.candidato}
        favorito={favorito}
        busy={busy}
        onToggle={onToggle}
      />
    </li>
  );
}

function CargoColumn({
  titulo,
  rows,
  favoritoIds,
  savingIds,
  onToggle,
}: {
  titulo: string;
  rows: ChefeRankingFlatRow[];
  favoritoIds: ReadonlySet<string>;
  savingIds: ReadonlySet<string>;
  onToggle: (candidato: Candidato) => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <h2 className="shrink-0 border-b border-slate-100 px-3 py-2 text-sm font-bold text-slate-900">
        {titulo}
      </h2>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-sm text-slate-500">Nenhum voto ainda</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <CargoRow
              key={`${row.candidato.id}-${row.cargo}`}
              row={row}
              index={index}
              favorito={isChefeFavoritoId(row.candidato.id, favoritoIds)}
              busy={savingIds.has(row.candidato.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function readChefeId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(CHEFE_SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function persistChefeSession(chefe: Chefe) {
  try {
    sessionStorage.setItem(CHEFE_UNLOCK_KEY, "1");
    sessionStorage.setItem(CHEFE_SESSION_ID_KEY, chefe.id);
  } catch {
    /* ignore */
  }
}

function clearChefeSession() {
  try {
    sessionStorage.removeItem(CHEFE_UNLOCK_KEY);
    sessionStorage.removeItem(CHEFE_SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function ChefeRanking() {
  const [chefe, setChefe] = useState<Chefe | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [query, setQuery] = useState("");
  const [favoritoIds, setFavoritoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [hour, setHour] = useState(() => new Date().getHours());

  const unlocked = chefe != null;

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  useEffect(() => {
    const storedId = readChefeId();
    if (!storedId) return;
    void (async () => {
      try {
        const list = await listChefes();
        const found =
          list.find((row) => row.id === storedId) ??
          (storedId === "config-fallback"
            ? {
                id: "config-fallback",
                nome: "Cristiano",
                pin: "",
                created_at: new Date().toISOString(),
              }
            : null);
        if (!found) {
          clearChefeSession();
          setChefe(null);
          return;
        }
        setChefe(found);
      } catch {
        setChefe(null);
      }
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!chefe) return;
    try {
      const [data, ids] = await Promise.all([
        fetchDashboard("todos"),
        listChefeFavoritoIds(chefe.id),
      ]);
      setSnapshot(data);
      setFavoritoIds(new Set(ids));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar o ranking."
      );
    } finally {
      setLoading(false);
    }
  }, [chefe]);

  useEffect(() => {
    if (!unlocked) return;
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, 4000);
  }, [unlocked, reload]);

  const groups = snapshot.rankingGeralByCargo;

  const governadores = useMemo(
    () => cargoRowsForChefe(groups, "Governador", query),
    [groups, query]
  );
  const presidentes = useMemo(
    () => cargoRowsForChefe(groups, "Presidente", query),
    [groups, query]
  );
  const govPair = useMemo(
    () => pickHighlightPair(governadores),
    [governadores]
  );
  const presPair = useMemo(
    () => pickHighlightPair(presidentes),
    [presidentes]
  );
  const govRest = useMemo(
    () => leftoverAfterPair(governadores, govPair, favoritoIds),
    [governadores, govPair, favoritoIds]
  );
  const presRest = useMemo(
    () => leftoverAfterPair(presidentes, presPair, favoritoIds),
    [presidentes, presPair, favoritoIds]
  );

  const colunas = useMemo(
    () =>
      COLUNAS.map((col) => ({
        ...col,
        rows: sortChefeFavoritesFirst(
          cargoRowsForChefe(groups, col.cargo, query),
          favoritoIds
        ),
      })),
    [groups, query, favoritoIds]
  );

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setPinBusy(true);
    setPinError(null);
    try {
      const session = await unlockChefeByPin(pin);
      if (!session) {
        setPinError("PIN incorreto.");
        return;
      }
      persistChefeSession(session);
      setChefe(session);
      setPin("");
      setLoading(true);
    } catch (err) {
      setPinError(
        err instanceof Error ? err.message : "Não foi possível entrar."
      );
    } finally {
      setPinBusy(false);
    }
  }

  function handleLock() {
    clearChefeSession();
    setChefe(null);
    setFavoritoIds(new Set());
    setSnapshot(EMPTY);
  }

  async function toggleFavorito(candidato: Candidato) {
    if (!chefe || savingIds.has(candidato.id)) return;
    const next = !isChefeFavoritoId(candidato.id, favoritoIds);
    const previous = new Set(favoritoIds);
    setFavoritoIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(candidato.id);
      else copy.delete(candidato.id);
      return copy;
    });
    setSavingIds((prev) => new Set(prev).add(candidato.id));
    try {
      await setChefeFavorito(chefe.id, candidato.id, next);
      setError(null);
    } catch (err) {
      setFavoritoIds(previous);
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
            Chefe
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Acesso chefe
          </h1>
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
              disabled={pinBusy}
            />
          </label>
          {pinError && (
            <p role="alert" className="text-sm text-red-700">
              {pinError}
            </p>
          )}
          <Button
            type="submit"
            disabled={pinBusy}
            className="h-11 w-full bg-teal-700 text-white hover:bg-teal-800"
          >
            {pinBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Lock className="size-4" />
            )}
            Entrar
          </Button>
        </form>
      </div>
    );
  }

  const saudacao = chefeGreeting(hour, chefe.nome);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
            <Trophy className="size-3.5" />
            Chefe
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Ranking geral</h1>
          <p className="mt-0.5 text-sm text-slate-600">{saudacao}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/telao"
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Telão
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-9 border-slate-300 px-3"
            onClick={handleLock}
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      <label className="relative max-w-md">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nome ou número"
          className="h-10 pl-9"
        />
      </label>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {govPair.length === 0 ? (
              <p className="col-span-2 rounded-2xl border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500">
                Nenhum voto ainda
              </p>
            ) : (
              govPair.map((row, i) => (
                <HighlightCard
                  key={row.candidato.id}
                  row={row}
                  place={i === 0 ? 1 : 2}
                  favorito={isChefeFavoritoId(row.candidato.id, favoritoIds)}
                  busy={savingIds.has(row.candidato.id)}
                  onToggle={toggleFavorito}
                />
              ))
            )}
          </div>
          {govRest.length > 0 && (
            <CargoColumn
              titulo="Outros governadores"
              rows={govRest}
              favoritoIds={favoritoIds}
              savingIds={savingIds}
              onToggle={toggleFavorito}
            />
          )}

          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {presPair.length === 0 ? (
              <p className="col-span-2 rounded-2xl border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500">
                Nenhum voto ainda
              </p>
            ) : (
              presPair.map((row, i) => (
                <HighlightCard
                  key={row.candidato.id}
                  row={row}
                  place={i === 0 ? 1 : 2}
                  favorito={isChefeFavoritoId(row.candidato.id, favoritoIds)}
                  busy={savingIds.has(row.candidato.id)}
                  onToggle={toggleFavorito}
                />
              ))
            )}
          </div>
          {presRest.length > 0 && (
            <CargoColumn
              titulo="Outros presidentes"
              rows={presRest}
              favoritoIds={favoritoIds}
              savingIds={savingIds}
              onToggle={toggleFavorito}
            />
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {colunas.map((col) => (
              <CargoColumn
                key={col.cargo}
                titulo={col.titulo}
                rows={col.rows}
                favoritoIds={favoritoIds}
                savingIds={savingIds}
                onToggle={toggleFavorito}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
