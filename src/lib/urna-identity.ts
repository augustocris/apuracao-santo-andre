import { normalizeSecao, normalizeZona } from "@/lib/parser/bu-qr";

/** True only when the same urna (zona + seção + IDUE) was already ingested. */
export function sameUrnaAlreadyIngested(
  rows: Array<{ zona: string; secao: string; urna_id?: string | null }>,
  zona: string,
  secao: string,
  urnaId?: string | null
): boolean {
  const z = normalizeZona(zona);
  const s = normalizeSecao(secao);
  const id = (urnaId ?? "").trim();
  const sameSecao = rows.filter((b) => b.zona === z && b.secao === s);
  if (sameSecao.length === 0) return false;
  if (id) return sameSecao.some((b) => (b.urna_id ?? "").trim() === id);
  return sameSecao.some((b) => !(b.urna_id ?? "").trim());
}

export function extractUrnaIdFromRaw(raw: string | null | undefined): string | null {
  const text = String(raw ?? "");
  const idue = text.match(/\bIDUE\s*:\s*(\d+)/i)?.[1];
  const nrue = text.match(/\bNR_?UE\s*:\s*(\d+)/i)?.[1];
  return idue || nrue || null;
}
