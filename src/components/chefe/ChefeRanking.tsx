"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Lock,
  LogOut,
  Search,
  Star,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHEFE_SESSION_ID_KEY, CHEFE_UNLOCK_KEY } from "@/lib/cargos";
import {
  CHEFE_COLUMN_SORT_DEFAULT,
  CHEFE_PINNED_GOVERNADORES,
  CHEFE_PINNED_PRESIDENTES,
  cargoRowsForChefe,
  chefeGreeting,
  chefeMiniaturaFallback,
  isChefeFavoritoId,
  isSyntheticPinnedId,
  mobileChefeCargoRows,
  orderChefeMobileCargos,
  pinChefeHighlights,
  sortChefeFavoritesFirst,
  toggleChefeColumnSort,
  type ChefeColumnSort,
  type ChefeMobileCargoFilter,
  type ChefeRankingFlatRow,
  type ChefeSortKey,
} from "@/lib/chefe-ranking";
import {
  fetchDashboard,
  listChefeFavoritoIds,
  listChefes,
  setChefeFavorito,
  subscribeDashboard,
  unlockChefeByPin,
} from "@/lib/data";
import { linkStoredUrnaFotos } from "@/lib/urna-fotos";
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
  { cargo: "Deputado Estadual", titulo: "Dep. Estadual" },
  { cargo: "Deputado Federal", titulo: "Dep. Federal" },
  { cargo: "Senador", titulo: "Senador" },
] as const;

type ColunaQuery = Record<(typeof COLUNAS)[number]["cargo"], string>;
type ColunaSort = Record<(typeof COLUNAS)[number]["cargo"], ChefeColumnSort>;

const EMPTY_COL_QUERY: ColunaQuery = {
  "Deputado Estadual": "",
  "Deputado Federal": "",
  Senador: "",
};

const DEFAULT_COL_SORT: ColunaSort = {
  "Deputado Estadual": CHEFE_COLUMN_SORT_DEFAULT,
  "Deputado Federal": CHEFE_COLUMN_SORT_DEFAULT,
  Senador: CHEFE_COLUMN_SORT_DEFAULT,
};

function ChefeFoto({
  candidato,
  size = "sm",
}: {
  candidato: Candidato;
  size?: "xs" | "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const src = candidato.foto_url?.trim() || "";
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showImg = Boolean(src) && !failed;
  const fallback = chefeMiniaturaFallback(candidato.nome, candidato.numero);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-teal-100 font-bold leading-none text-teal-900",
        size === "lg"
          ? "size-12 rounded-lg text-xs md:size-6 md:rounded-md md:text-[9px]"
          : size === "xs"
            ? "size-6 rounded-md text-[9px]"
            : "size-10 rounded-full text-[11px] md:size-8 md:text-[10px]"
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
  compact = false,
}: {
  candidato: Candidato;
  favorito: boolean;
  busy: boolean;
  onToggle: (candidato: Candidato) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-amber-500 hover:bg-amber-50 disabled:opacity-50",
        compact ? "size-7" : "size-11 md:size-8"
      )}
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
          compact ? "size-3.5" : "size-5 md:size-4",
          favorito ? "fill-amber-400 text-amber-500" : "text-slate-300"
        )}
      />
    </button>
  );
}

function HighlightChip({
  row,
  favorito,
  busy,
  onToggle,
}: {
  row: ChefeRankingFlatRow;
  favorito: boolean;
  busy: boolean;
  onToggle: (candidato: Candidato) => void;
}) {
  const synthetic = isSyntheticPinnedId(row.candidato.id);
  return (
    <article className="flex min-h-[4.5rem] min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-2 md:h-9 md:min-h-0 md:gap-2 md:rounded-md md:px-2 md:py-0">
      <ChefeFoto candidato={row.candidato} size="lg" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[15px] font-semibold text-slate-900 md:text-[11px]">
          {row.candidato.nome}
        </p>
        <p className="truncate text-xs tabular-nums text-slate-500 md:text-[10px]">
          {row.candidato.numero ? `Nº ${row.candidato.numero} · ` : ""}
          {formatVotes(row.votos)}
          <span className="ml-1 text-slate-400">
            {formatPercent(row.percentual)}
          </span>
        </p>
      </div>
      {!synthetic && (
        <StarButton
          candidato={row.candidato}
          favorito={favorito}
          busy={busy}
          onToggle={onToggle}
          compact
        />
      )}
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
        "flex items-center gap-2 px-3 py-2.5 md:gap-1.5 md:px-2.5 md:py-1",
        favorito && "bg-amber-50/80"
      )}
    >
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-slate-400 md:w-4 md:text-[10px]">
        {index + 1}
      </span>
      <ChefeFoto candidato={row.candidato} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight text-slate-900 md:text-[13px]">
          {row.candidato.nome}
        </p>
        <p className="text-xs tabular-nums text-slate-500 md:text-[10px]">
          Nº {row.candidato.numero}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-bold tabular-nums leading-tight text-teal-800 md:text-[13px]">
          {formatVotes(row.votos)}
        </p>
        <p className="text-xs tabular-nums text-slate-400 md:text-[10px]">
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

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  const Icon = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide",
        align === "right" && "ml-auto",
        active ? "text-teal-800" : "text-slate-400 hover:text-slate-600"
      )}
      aria-pressed={active}
    >
      {label}
      {active && <Icon className="size-2.5" aria-hidden />}
    </button>
  );
}

function CargoColumn({
  titulo,
  rows,
  query,
  onQuery,
  sort,
  onSortKey,
  favoritoIds,
  savingIds,
  onToggle,
}: {
  titulo: string;
  rows: ChefeRankingFlatRow[];
  query: string;
  onQuery: (value: string) => void;
  sort: ChefeColumnSort;
  onSortKey: (key: ChefeSortKey) => void;
  favoritoIds: ReadonlySet<string>;
  savingIds: ReadonlySet<string>;
  onToggle: (candidato: Candidato) => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2 className="shrink-0 px-2 pt-1.5 text-[13px] font-bold text-slate-900">
        {titulo}
      </h2>
      <label className="relative shrink-0 px-2 pb-1 pt-1">
        <span className="sr-only">Buscar em {titulo}</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Nome ou número"
          className="h-7 pl-7 text-xs"
        />
      </label>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-2 pb-1">
        <SortHeader
          label="Nome"
          active={sort.key === "nome"}
          dir={sort.dir}
          onClick={() => onSortKey("nome")}
        />
        <SortHeader
          label="Votos"
          active={sort.key === "votos"}
          dir={sort.dir}
          onClick={() => onSortKey("votos")}
          align="right"
        />
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-4 text-xs text-slate-500">
          {query.trim() ? "Nenhum resultado" : "Catálogo vazio neste cargo"}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
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

function MobileCargoBlock({
  titulo,
  rows,
  query,
  onQuery,
  favoritoIds,
  savingIds,
  onToggle,
}: {
  titulo: string;
  rows: ChefeRankingFlatRow[];
  query: string;
  onQuery: (value: string) => void;
  favoritoIds: ReadonlySet<string>;
  savingIds: ReadonlySet<string>;
  onToggle: (candidato: Candidato) => void;
}) {
  const searching = Boolean(query.trim());
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h2 className="px-3 pt-2.5 text-base font-bold text-slate-900">
        {titulo}
      </h2>
      <p className="px-3 text-xs text-slate-500">
        {searching
          ? "Resultados no catálogo deste cargo"
          : "Favoritos deste PIN + 10 mais votados"}
      </p>
      <label className="relative block px-3 pb-2 pt-1.5">
        <span className="sr-only">Buscar em {titulo}</span>
        <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Nome ou número"
          className="h-11 pl-9 text-base"
          inputMode="search"
          autoComplete="off"
        />
      </label>
      {rows.length === 0 ? (
        <p className="px-3 py-5 text-sm text-slate-500">
          {searching ? "Nenhum resultado" : "Catálogo vazio neste cargo"}
        </p>
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
  const [colQueries, setColQueries] = useState<ColunaQuery>(EMPTY_COL_QUERY);
  const [mobileQueries, setMobileQueries] =
    useState<ColunaQuery>(EMPTY_COL_QUERY);
  const [colSorts, setColSorts] = useState<ColunaSort>(DEFAULT_COL_SORT);
  const [favoritoIds, setFavoritoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [hour, setHour] = useState(() => new Date().getHours());
  const [mobileCargo, setMobileCargo] =
    useState<ChefeMobileCargoFilter>("todos");

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
      const pinsNeedFoto = data.rankingGeralByCargo.some((g) =>
        g.rankings.some(
          (r) =>
            !r.candidato.foto_url?.trim() &&
            ((g.cargo === "Governador" &&
              ["10", "13"].includes(r.candidato.numero)) ||
              (g.cargo === "Presidente" &&
                /lula|flavio/i.test(
                  r.candidato.nome.normalize("NFD").replace(/\p{M}/gu, "")
                )))
        )
      );
      if (pinsNeedFoto) {
        try {
          const linked = await linkStoredUrnaFotos();
          if (linked.linked > 0) {
            const refreshed = await fetchDashboard("todos");
            setSnapshot(refreshed);
          } else {
            setSnapshot(data);
          }
        } catch {
          setSnapshot(data);
        }
      } else {
        setSnapshot(data);
      }
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

  const govPins = useMemo(
    () =>
      pinChefeHighlights(
        cargoRowsForChefe(groups, "Governador"),
        CHEFE_PINNED_GOVERNADORES
      ),
    [groups]
  );
  const presPins = useMemo(
    () =>
      pinChefeHighlights(
        cargoRowsForChefe(groups, "Presidente"),
        CHEFE_PINNED_PRESIDENTES
      ),
    [groups]
  );

  const colunas = useMemo(
    () =>
      COLUNAS.map((col) => ({
        ...col,
        rows: sortChefeFavoritesFirst(
          cargoRowsForChefe(groups, col.cargo, colQueries[col.cargo]),
          favoritoIds,
          colSorts[col.cargo]
        ),
      })),
    [groups, colQueries, colSorts, favoritoIds]
  );

  const mobileColunas = useMemo(() => {
    const tituloByCargo = Object.fromEntries(
      COLUNAS.map((c) => [c.cargo, c.titulo])
    ) as Record<(typeof COLUNAS)[number]["cargo"], string>;
    return orderChefeMobileCargos(mobileCargo).map((cargo) => ({
      cargo,
      titulo: tituloByCargo[cargo],
      rows: mobileChefeCargoRows(
        cargoRowsForChefe(groups, cargo),
        favoritoIds,
        undefined,
        mobileQueries[cargo]
      ),
    }));
  }, [groups, favoritoIds, mobileCargo, mobileQueries]);

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
    setColQueries(EMPTY_COL_QUERY);
    setMobileQueries(EMPTY_COL_QUERY);
    setColSorts(DEFAULT_COL_SORT);
  }

  async function toggleFavorito(candidato: Candidato) {
    if (!chefe || savingIds.has(candidato.id)) return;
    if (isSyntheticPinnedId(candidato.id)) return;
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
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 py-2 md:h-full md:overflow-hidden md:px-4 md:py-2">
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px] leading-tight md:h-8 md:min-h-0 md:flex-nowrap md:overflow-hidden md:whitespace-nowrap md:text-[13px] md:leading-none">
        <Trophy className="size-3.5 shrink-0 text-teal-800" aria-hidden />
        <span className="font-semibold text-teal-800">Chefe</span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <h1 className="font-bold text-slate-900">Ranking geral</h1>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <p className="min-w-0 truncate text-slate-600">{saudacao}</p>
        {loading && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-slate-400"
            aria-label="Carregando"
          />
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/telao"
            className="hidden text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline sm:inline"
          >
            Telão
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900"
            onClick={handleLock}
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </span>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-1 shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900"
        >
          {error}
        </p>
      )}

      <section
        aria-label="Governador e Presidente"
        className="mt-1.5 grid shrink-0 grid-cols-2 gap-2 md:mt-0 md:grid-cols-4 md:gap-1.5"
      >
        {govPins.map((row) => (
          <HighlightChip
            key={`gov-${row.candidato.id}`}
            row={row}
            favorito={isChefeFavoritoId(row.candidato.id, favoritoIds)}
            busy={savingIds.has(row.candidato.id)}
            onToggle={toggleFavorito}
          />
        ))}
        {presPins.map((row) => (
          <HighlightChip
            key={`pres-${row.candidato.id}`}
            row={row}
            favorito={isChefeFavoritoId(row.candidato.id, favoritoIds)}
            busy={savingIds.has(row.candidato.id)}
            onToggle={toggleFavorito}
          />
        ))}
      </section>

      <div
        className="mt-2 flex flex-wrap gap-1.5 md:hidden"
        role="tablist"
        aria-label="Ordem dos cargos"
      >
        {(
          [
            { id: "todos" as const, label: "Todos" },
            ...COLUNAS.map((c) => ({
              id: c.cargo as ChefeMobileCargoFilter,
              label: c.titulo,
            })),
          ]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={mobileCargo === opt.id}
            className={cn(
              "h-10 rounded-lg px-3 text-sm font-semibold",
              mobileCargo === opt.id
                ? "bg-teal-700 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            )}
            onClick={() => setMobileCargo(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-3 md:hidden">
        {mobileColunas.map((col) => (
          <MobileCargoBlock
            key={col.cargo}
            titulo={col.titulo}
            rows={col.rows}
            query={mobileQueries[col.cargo]}
            onQuery={(value) =>
              setMobileQueries((prev) => ({ ...prev, [col.cargo]: value }))
            }
            favoritoIds={favoritoIds}
            savingIds={savingIds}
            onToggle={toggleFavorito}
          />
        ))}
      </div>

      <div className="mt-1.5 hidden min-h-0 flex-1 grid-cols-3 gap-2 overflow-hidden md:grid">
        {colunas.map((col) => (
          <CargoColumn
            key={col.cargo}
            titulo={col.titulo}
            rows={col.rows}
            query={colQueries[col.cargo]}
            onQuery={(value) =>
              setColQueries((prev) => ({ ...prev, [col.cargo]: value }))
            }
            sort={colSorts[col.cargo]}
            onSortKey={(key) =>
              setColSorts((prev) => ({
                ...prev,
                [col.cargo]: toggleChefeColumnSort(prev[col.cargo], key),
              }))
            }
            favoritoIds={favoritoIds}
            savingIds={savingIds}
            onToggle={toggleFavorito}
          />
        ))}
      </div>
    </div>
  );
}
