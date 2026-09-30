import { CARGO_INDEFINIDO } from "@/lib/cargos";
import type { CargoRanking, RankingRow } from "@/lib/types";

export type ChefeSortKey = "votos" | "nome";
export type ChefeFavoritoFilter = "todos" | "favoritos";

export type ChefeRankingFlatRow = RankingRow & { cargo: string };

export function isCandidatoFavorito(favorito?: boolean | null): boolean {
  return favorito === true;
}

export function filterChefeRankingRows(
  groups: CargoRanking[],
  opts: {
    cargoFilter: string;
    sort: ChefeSortKey;
    query: string;
    favoritoFilter: ChefeFavoritoFilter;
  }
): ChefeRankingFlatRow[] {
  const selected =
    opts.cargoFilter === "todos"
      ? groups.filter((g) => g.cargo !== CARGO_INDEFINIDO)
      : groups.filter((g) => g.cargo === opts.cargoFilter);

  const flat: ChefeRankingFlatRow[] = selected.flatMap((g) =>
    g.rankings.map((row) => ({ ...row, cargo: g.cargo }))
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
    filtered = filtered.filter((r) => isCandidatoFavorito(r.candidato.favorito));
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
