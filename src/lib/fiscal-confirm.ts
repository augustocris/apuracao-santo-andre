import { CARGOS_FISCAL_ORDEM } from "@/lib/cargos";
import type { ConfirmVoteRow, DiscoveredVote } from "@/lib/types";

export interface ConfirmPreview {
  nome: string;
  numero: string;
  cargo: string;
  quantidade: number;
}

function byVotesDesc<T extends { quantidade: number }>(a: T, b: T): number {
  return b.quantidade - a.quantidade;
}

/**
 * One line for the fiscal confirm: a campaign official on this BU,
 * otherwise one parsed candidate that has votes.
 */
export function pickConfirmPreview(
  featured: ConfirmVoteRow[],
  discovered: DiscoveredVote[] = []
): ConfirmPreview | null {
  const oficiais = featured.filter((row) =>
    (CARGOS_FISCAL_ORDEM as readonly string[]).includes(String(row.candidato.cargo))
  );
  const oficiaisComVoto = oficiais.filter((row) => row.quantidade > 0);
  const fromOficial = (oficiaisComVoto.length > 0 ? oficiaisComVoto : []).sort(
    byVotesDesc
  )[0];
  if (fromOficial) {
    return {
      nome: fromOficial.candidato.nome,
      numero: fromOficial.candidato.numero,
      cargo: String(fromOficial.candidato.cargo),
      quantidade: fromOficial.quantidade,
    };
  }

  const parsed = [
    ...featured.map((row) => ({
      nome: row.candidato.nome,
      numero: row.candidato.numero,
      cargo: String(row.candidato.cargo),
      quantidade: row.quantidade,
    })),
    ...discovered,
  ].filter((row) => row.quantidade > 0);
  const top = parsed.sort(byVotesDesc)[0];
  if (!top) return null;
  return {
    nome: top.nome,
    numero: top.numero,
    cargo: top.cargo,
    quantidade: top.quantidade,
  };
}
