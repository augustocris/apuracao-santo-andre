import type { Candidato, CargoRanking, RankingRow } from "@/lib/types";
import { percentualNoCargo } from "@/lib/utils";

export type ChefeSortKey = "votos" | "nome";
export type ChefeFavoritoFilter = "todos" | "favoritos";

export type ChefeRankingFlatRow = RankingRow & { cargo: string };

export function isCandidatoFavorito(favorito?: boolean | null): boolean {
  return favorito === true;
}

export function isChefeFavoritoId(
  candidatoId: string,
  favoritoIds?: ReadonlySet<string> | null
): boolean {
  return favoritoIds?.has(candidatoId) === true;
}

export function overlayChefeFavoritos(
  groups: CargoRanking[],
  favoritoIds: ReadonlySet<string>
): CargoRanking[] {
  return groups.map((g) => ({
    ...g,
    rankings: g.rankings.map((row) => ({
      ...row,
      candidato: {
        ...row.candidato,
        favorito: favoritoIds.has(row.candidato.id),
      },
    })),
  }));
}

export function filterChefeRankingRows(
  groups: CargoRanking[],
  opts: {
    cargoFilter: string;
    sort: ChefeSortKey;
    query: string;
    favoritoFilter: ChefeFavoritoFilter;
    /** Se informado, ignora candidatos.favorito e usa só os IDs deste PIN. */
    favoritoIds?: ReadonlySet<string> | null;
  }
): ChefeRankingFlatRow[] {
  const selected =
    opts.cargoFilter === "todos"
      ? groups
      : groups.filter((g) => g.cargo === opts.cargoFilter);

  // % vem sempre de g.totalVotos (dataset completo do cargo: todas as origens,
  // inclusive não-favoritos e catálogo com voto). Nunca recalcular sobre as
  // linhas já filtradas — "Somente favoritos" não pode virar 100%.
  const flat: ChefeRankingFlatRow[] = selected.flatMap((g) =>
    g.rankings.map((row) => ({
      ...row,
      cargo: g.cargo,
      percentual: percentualNoCargo(row.votos, g.totalVotos),
    }))
  );

  const q = opts.query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  let filtered = q
    ? flat.filter(
        (r) =>
          r.candidato.nome.toLowerCase().includes(q) ||
          r.candidato.numero.includes(digits || q)
      )
    : flat;

  if (opts.favoritoFilter === "favoritos") {
    filtered = filtered.filter((r) =>
      opts.favoritoIds
        ? isChefeFavoritoId(r.candidato.id, opts.favoritoIds)
        : isCandidatoFavorito(r.candidato.favorito)
    );
  }

  filtered.sort((a, b) => {
    if (opts.sort === "nome") {
      return a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR");
    }
    return (
      b.votos - a.votos ||
      a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
    );
  });

  return filtered.filter((r) => r.votos > 0);
}

export function chefeGreeting(hour: number, nome: string): string {
  const who = nome.trim() || "chefe";
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 12) return `Bom dia, ${who}`;
  if (h >= 12 && h < 18) return `Boa tarde, ${who}`;
  return `Boa noite, ${who}`;
}

function matchesChefeQuery(row: ChefeRankingFlatRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return (
    row.candidato.nome.toLowerCase().includes(q) ||
    row.candidato.numero.includes(digits || q)
  );
}

function origemFillRank(row: ChefeRankingFlatRow): number {
  const origem = row.candidato.origem;
  if (origem == null || origem === "cadastro") return 0;
  if (origem === "catalogo") return 1;
  return 2;
}

/** Todas as linhas do cargo (inclui 0 voto), com % no cargo. */
export function cargoRowsForChefe(
  groups: CargoRanking[],
  cargo: string,
  query = ""
): ChefeRankingFlatRow[] {
  const group = groups.find((g) => g.cargo === cargo);
  if (!group) return [];
  return group.rankings
    .map((row) => ({
      ...row,
      cargo,
      percentual: percentualNoCargo(row.votos, group.totalVotos),
    }))
    .filter((row) => matchesChefeQuery(row, query));
}

export function foldChefeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sameChefeCargo(a: string, b: string): boolean {
  return foldChefeName(a) === foldChefeName(b);
}

function sameChefeNumero(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "";
  const db = b.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "";
  return Boolean(da) && da === db;
}

function nameMatchesHints(nome: string, hints: readonly string[]): boolean {
  const folded = foldChefeName(nome);
  return hints.some((hint) => folded.includes(hint));
}

export type ChefePinSpec = {
  cargo: string;
  label: string;
  /** Governador: casa cargo+número primeiro. */
  numero?: string;
  nameHints: readonly string[];
};

export const CHEFE_PINNED_GOVERNADORES: readonly ChefePinSpec[] = [
  {
    cargo: "Governador",
    label: "Tarcísio",
    numero: "10",
    nameHints: ["tarcisio"],
  },
  {
    cargo: "Governador",
    label: "Fernando Haddad",
    numero: "13",
    nameHints: ["haddad", "fernando haddad"],
  },
];

export const CHEFE_PINNED_PRESIDENTES: readonly ChefePinSpec[] = [
  {
    cargo: "Presidente",
    label: "Lula",
    nameHints: ["lula"],
  },
  {
    cargo: "Presidente",
    label: "Flávio",
    nameHints: ["flavio"],
  },
];

function pickBestPinned(rows: ChefeRankingFlatRow[]): ChefeRankingFlatRow {
  return [...rows].sort(
    (a, b) =>
      b.votos - a.votos ||
      origemFillRank(a) - origemFillRank(b) ||
      a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
  )[0];
}

function rowsInCargo(
  rows: ChefeRankingFlatRow[],
  cargo: string
): ChefeRankingFlatRow[] {
  return rows.filter(
    (r) =>
      sameChefeCargo(r.cargo, cargo) || sameChefeCargo(r.candidato.cargo, cargo)
  );
}

/** Casa um pin no catálogo: cargo+número, depois nome da urna (acentos flexíveis). */
export function findPinnedRow(
  rows: ChefeRankingFlatRow[],
  spec: ChefePinSpec
): ChefeRankingFlatRow | null {
  const inCargo = rowsInCargo(rows, spec.cargo);
  if (inCargo.length === 0) return null;

  if (spec.numero) {
    const byNum = inCargo.filter((r) =>
      sameChefeNumero(r.candidato.numero, spec.numero!)
    );
    if (byNum.length > 0) return pickBestPinned(byNum);
  }

  const byName = inCargo.filter((r) =>
    nameMatchesHints(r.candidato.nome, spec.nameHints)
  );
  if (byName.length === 0) return null;

  const named = pickBestPinned(byName);
  if (named.candidato.numero) {
    const byNum = inCargo.filter((r) =>
      sameChefeNumero(r.candidato.numero, named.candidato.numero)
    );
    if (byNum.length > 0) return pickBestPinned(byNum);
  }
  return named;
}

export function syntheticPinnedRow(spec: ChefePinSpec): ChefeRankingFlatRow {
  const numero = spec.numero ?? "";
  return {
    votos: 0,
    percentual: 0,
    cargo: spec.cargo,
    candidato: {
      id: `pin:${spec.cargo}:${numero || spec.label}`,
      numero,
      nome: spec.label,
      cargo: spec.cargo,
      foto_url: null,
      origem: "catalogo",
    },
  };
}

export function isSyntheticPinnedId(id: string): boolean {
  return id.startsWith("pin:");
}

/** Exatamente os pins, na ordem de votos (líder primeiro). Sem o resto do cargo. */
export function pinChefeHighlights(
  rows: ChefeRankingFlatRow[],
  specs: readonly ChefePinSpec[]
): ChefeRankingFlatRow[] {
  const picked = specs.map(
    (spec) => findPinnedRow(rows, spec) ?? syntheticPinnedRow(spec)
  );
  return [...picked].sort(
    (a, b) =>
      b.votos - a.votos ||
      a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
  );
}

/**
 * Os dois com mais votos. Sem votos (ou empate em zero), preenche com
 * cadastro/catálogo — sem nomes fixos, para o 1º acompanhar a apuração.
 */
export function pickHighlightPair(
  rows: ChefeRankingFlatRow[],
  limit = 2
): ChefeRankingFlatRow[] {
  if (rows.length === 0 || limit <= 0) return [];
  const ranked = [...rows].sort(
    (a, b) =>
      b.votos - a.votos ||
      origemFillRank(a) - origemFillRank(b) ||
      a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
  );
  const withVotes = ranked.filter((r) => r.votos > 0);
  if (withVotes.length >= limit) return withVotes.slice(0, limit);
  return ranked.slice(0, limit);
}

export type ChefeColumnSort = {
  key: ChefeSortKey;
  dir: "asc" | "desc";
};

export const CHEFE_COLUMN_SORT_DEFAULT: ChefeColumnSort = {
  key: "votos",
  dir: "desc",
};

/** Catálogo/cadastro entra mesmo com 0 voto. BU só se já tiver voto (ou favorito). */
export function isChefeCatalogRow(row: ChefeRankingFlatRow): boolean {
  return row.candidato.origem !== "bu";
}

export function toggleChefeColumnSort(
  current: ChefeColumnSort,
  key: ChefeSortKey
): ChefeColumnSort {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: key === "nome" ? "asc" : "desc" };
}

/**
 * Favoritos deste PIN no topo; depois o sort da coluna.
 * Catálogo/cadastro aparece com 0 voto — busca e estrela funcionam antes do BU.
 */
export function sortChefeFavoritesFirst(
  rows: ChefeRankingFlatRow[],
  favoritoIds?: ReadonlySet<string> | null,
  sort: ChefeColumnSort = CHEFE_COLUMN_SORT_DEFAULT
): ChefeRankingFlatRow[] {
  const ids = favoritoIds ?? new Set<string>();
  const visible = rows.filter(
    (r) =>
      r.votos > 0 ||
      isChefeFavoritoId(r.candidato.id, ids) ||
      isChefeCatalogRow(r)
  );
  return [...visible].sort((a, b) => {
    const af = isChefeFavoritoId(a.candidato.id, ids) ? 0 : 1;
    const bf = isChefeFavoritoId(b.candidato.id, ids) ? 0 : 1;
    if (af !== bf) return af - bf;
    if (sort.key === "nome") {
      const byName = a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR");
      return sort.dir === "asc" ? byName : -byName;
    }
    const byVotes = sort.dir === "desc" ? b.votos - a.votos : a.votos - b.votos;
    return (
      byVotes || a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
    );
  });
}

export function leftoverAfterPair(
  rows: ChefeRankingFlatRow[],
  pair: ChefeRankingFlatRow[],
  favoritoIds?: ReadonlySet<string> | null
): ChefeRankingFlatRow[] {
  const used = new Set(pair.map((r) => r.candidato.id));
  return sortChefeFavoritesFirst(
    rows.filter((r) => !used.has(r.candidato.id)),
    favoritoIds
  );
}

export type ChefePinFotoStatus = {
  specLabel: string;
  cargo: string;
  numero: string;
  nome: string;
  id: string | null;
  foto_url: string | null;
  sq_candidato: string | null;
  found: boolean;
  synthetic: boolean;
};

function pinStatusFromRow(
  spec: ChefePinSpec,
  row: ChefeRankingFlatRow
): ChefePinFotoStatus {
  const synthetic = isSyntheticPinnedId(row.candidato.id);
  return {
    specLabel: spec.label,
    cargo: spec.cargo,
    numero: row.candidato.numero,
    nome: row.candidato.nome,
    id: synthetic ? null : row.candidato.id,
    foto_url: row.candidato.foto_url?.trim() || null,
    sq_candidato: row.candidato.sq_candidato?.replace(/\D/g, "") || null,
    found: !synthetic,
    synthetic,
  };
}

/** Situação de foto dos 4 pins (Tarcísio, Haddad, Lula, Flávio). */
export function chefePinFotoStatus(
  groups: CargoRanking[]
): ChefePinFotoStatus[] {
  const specs = [...CHEFE_PINNED_GOVERNADORES, ...CHEFE_PINNED_PRESIDENTES];
  return specs.map((spec) => {
    const row =
      findPinnedRow(cargoRowsForChefe(groups, spec.cargo), spec) ??
      syntheticPinnedRow(spec);
    return pinStatusFromRow(spec, row);
  });
}

export function chefePinFotoStatusFromCandidatos(
  candidatos: Candidato[]
): ChefePinFotoStatus[] {
  const byCargo = new Map<string, CargoRanking>();
  for (const c of candidatos) {
    const cargo = c.cargo;
    const g = byCargo.get(cargo) ?? { cargo, totalVotos: 0, rankings: [] };
    g.rankings.push({
      votos: 0,
      percentual: 0,
      candidato: c,
    });
    byCargo.set(cargo, g);
  }
  return chefePinFotoStatus(Array.from(byCargo.values()));
}

/** Iniciais do nome, ou o número se o nome for placeholder / vazio. */
export function chefeMiniaturaFallback(nome: string, numero: string): string {
  const trimmed = nome.trim();
  const digits = numero.replace(/\D/g, "").slice(0, 4) || "?";
  if (!trimmed || /^candidato\s/i.test(trimmed)) return digits;
  const words = trimmed.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]/.test(w));
  if (words.length === 0) return digits;
  const letter = (word: string) =>
    word.replace(/[^A-Za-zÀ-ÿ]/g, "").charAt(0);
  if (words.length === 1) {
    const letters = words[0].replace(/[^A-Za-zÀ-ÿ]/g, "");
    return (letters.slice(0, 2) || digits).toLocaleUpperCase("pt-BR");
  }
  const first = letter(words[0]);
  const last = letter(words[words.length - 1]);
  if (!first && !last) return digits;
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}
