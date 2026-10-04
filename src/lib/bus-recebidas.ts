import { normalizeSecao, normalizeZona } from "@/lib/parser/bu-qr";
import type {
  ApuracaoConfig,
  BuRecebidaRow,
  BuRecebidaZonaGroup,
  BusRecebidasReport,
  LocalVotacao,
} from "@/lib/types";

export function compareZonaSecao(
  a: { zona: string; secao: string },
  b: { zona: string; secao: string }
): number {
  const za = Number(a.zona.replace(/\D/g, "")) || 0;
  const zb = Number(b.zona.replace(/\D/g, "")) || 0;
  if (za !== zb) return za - zb;
  const sa = Number(a.secao.replace(/\D/g, "")) || 0;
  const sb = Number(b.secao.replace(/\D/g, "")) || 0;
  return sa - sb;
}

function escolaFromLocal(nome?: string | null): string | null {
  const trimmed = nome?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Distintos (zona, seção) já gravados em boletins_urna.
 * Nome da escola só quando locais_votacao já mapeia o par.
 */
export function buildBusRecebidasReport(
  boletins: Array<{ zona: string; secao: string }>,
  locais: Array<Pick<LocalVotacao, "zona" | "secao" | "nome_escola">>,
  config: Pick<ApuracaoConfig, "secoes_esperadas">,
  mode: "supabase" | "mock"
): BusRecebidasReport {
  const localMap = new Map<string, string | null>();
  for (const local of locais) {
    const zona = normalizeZona(local.zona);
    const secao = normalizeSecao(local.secao);
    if (!zona || !secao) continue;
    localMap.set(`${zona}|${secao}`, escolaFromLocal(local.nome_escola));
  }

  const byKey = new Map<string, BuRecebidaRow>();
  for (const boletim of boletins) {
    const zona = normalizeZona(boletim.zona);
    const secao = normalizeSecao(boletim.secao);
    if (!zona || !secao) continue;
    const key = `${zona}|${secao}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      zona,
      secao,
      escola: localMap.get(key) ?? null,
    });
  }

  const rows = Array.from(byKey.values()).sort(compareZonaSecao);
  const grouped = new Map<string, BuRecebidaRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.zona) ?? [];
    list.push(row);
    grouped.set(row.zona, list);
  }

  const zonas: BuRecebidaZonaGroup[] = Array.from(grouped.entries()).map(
    ([zona, zrows]) => ({
      zona,
      recebidas: zrows.length,
      rows: zrows,
    })
  );

  const urnasRecebidas = rows.length;
  const secoesEsperadas = Math.max(0, Number(config.secoes_esperadas) || 0);
  return {
    urnasRecebidas,
    secoesEsperadas,
    secoesFaltam: Math.max(0, secoesEsperadas - urnasRecebidas),
    rows,
    zonas,
    mode,
  };
}
