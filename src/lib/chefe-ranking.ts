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
