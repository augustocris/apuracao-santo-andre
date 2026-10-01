import type { CargoRanking, RankingRow } from "@/lib/types";
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
  if (origem == null || origem === "" || origem === "cadastro") return 0;
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

/** Favoritos deste PIN no topo; depois o restante por votos. */
export function sortChefeFavoritesFirst(
  rows: ChefeRankingFlatRow[],
  favoritoIds?: ReadonlySet<string> | null
): ChefeRankingFlatRow[] {
  const ids = favoritoIds ?? new Set<string>();
  const visible = rows.filter(
    (r) => r.votos > 0 || isChefeFavoritoId(r.candidato.id, ids)
  );
  return [...visible].sort((a, b) => {
    const af = isChefeFavoritoId(a.candidato.id, ids) ? 0 : 1;
    const bf = isChefeFavoritoId(b.candidato.id, ids) ? 0 : 1;
    return (
      af - bf ||
      b.votos - a.votos ||
      a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR")
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
