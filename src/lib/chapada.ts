import {
  CARGOS_CHAPADA,
  normalizeChapadaNumero,
  validarNumeroCargoChapada,
  type CargoChapada,
} from "@/lib/cargos";

export const CHAPADA_HINT =
  "Importe o CSV do TSE de São Paulo (SP) e também o de Brasil/Presidente (SG_UF=BR, DS_CARGO=PRESIDENTE). Dois arquivos são aceitos (upsert). Ou use numero,nome,cargo.";

const CARGO_ALIASES: Record<string, CargoChapada> = {
  "deputado estadual": "Deputado Estadual",
  "dep estadual": "Deputado Estadual",
  "dep. estadual": "Deputado Estadual",
  "deputado federal": "Deputado Federal",
  "dep federal": "Deputado Federal",
  "dep. federal": "Deputado Federal",
  senador: "Senador",
  governador: "Governador",
  presidente: "Presidente",
};

/** Exact TSE DS_CARGO keys (after accent/space normalize). */
const TSE_CARGO_MAP: Record<string, CargoChapada> = {
  "DEPUTADO ESTADUAL": "Deputado Estadual",
  "DEPUTADO FEDERAL": "Deputado Federal",
  SENADOR: "Senador",
  GOVERNADOR: "Governador",
  PRESIDENTE: "Presidente",
};

/** Fallback when DS_CARGO is empty — TSE CD_CARGO. */
const TSE_CD_CARGO_MAP: Record<string, CargoChapada> = {
  "1": "Presidente",
  "3": "Governador",
  "5": "Senador",
  "6": "Deputado Federal",
  "7": "Deputado Estadual",
};

const MAX_ROW_ERRORS = 20;

export function normalizeCargoChapada(
  raw: string
): CargoChapada | null {
  const trimmed = raw.trim();
  if ((CARGOS_CHAPADA as readonly string[]).includes(trimmed)) {
    return trimmed as CargoChapada;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return CARGO_ALIASES[key] ?? mapTseCargo(trimmed);
}

export interface ChapadaRow {
  numero: string;
  nome: string;
  cargo: string;
  /** TSE SQ_CANDIDATO — used to match urna photo filenames. */
  sq_candidato?: string;
  foto_url?: string | null;
  /** Internal: true when situacao is clearly APTO/DEFERIDO. */
  apto?: boolean;
}

export interface ChapadaSkipCounts {
  cargo: number;
  uf: number;
  situacao: number;
  invalid: number;
  duplicates: number;
}

export type ChapadaFormat = "simplificado" | "tse" | "json";

export interface ParseChapadaResult {
  rows: ChapadaRow[];
  errors: string[];
  format: ChapadaFormat;
  skipped: ChapadaSkipCounts;
}

export function emptySkipCounts(): ChapadaSkipCounts {
  return { cargo: 0, uf: 0, situacao: 0, invalid: 0, duplicates: 0 };
}

export function skippedTotal(s: ChapadaSkipCounts): number {
  return s.cargo + s.uf + s.situacao + s.invalid + s.duplicates;
}

export function chapadaRowKey(cargo: string, numero: string): string {
  return `${cargo.trim()}::${normalizeChapadaNumero(numero)}`;
}

/** Decode TSE/simple CSV bytes: UTF-8, then latin1 if mojibake or header only makes sense as latin1. */
export function decodeChapadaBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const latin1 = new TextDecoder("iso-8859-1").decode(bytes).replace(/^\uFEFF/, "");
  if (utf8.includes("\uFFFD")) return latin1;
  const utf8Tse = looksLikeTseHeaderLine(firstNonEmptyLine(utf8));
  const latin1Tse = looksLikeTseHeaderLine(firstNonEmptyLine(latin1));
  if (!utf8Tse && latin1Tse) return latin1;
  return utf8;
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
}

export function looksLikeTseHeaderLine(line: string): boolean {
  const keys = splitCsvLine(line).map(normalizeHeaderKey);
  return (
    keys.includes("NR_CANDIDATO") ||
    keys.includes("SQ_CANDIDATO") ||
    keys.includes("NM_URNA_CANDIDATO") ||
    (keys.includes("DS_CARGO") && keys.includes("SG_UF"))
  );
}

export function normalizeHeaderKey(raw: string): string {
  return tseCell(raw)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function tseCell(value: string): string {
  const t = value.trim().replace(/^["']|["']$/g, "").trim();
  if (!t) return "";
  const upper = t.toUpperCase();
  if (upper === "#NULO#" || upper === "#NE#" || upper === "#NI#") return "";
  return t;
}

/**
 * SQ_CANDIDATO from TSE / Excel: text, number, 250000252653.0, or 2.50000252653E+11.
 * Never keep leftover letters (E+) concatenated onto the digits.
 */
export function normalizeSqCandidato(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return String(Math.round(raw));
  }
  if (typeof raw === "bigint") {
    const n = raw.toString().replace(/^-/, "");
    return n || null;
  }
  const text = tseCell(String(raw));
  if (!text) return null;
  const sci = text.match(/^([+-]?\d+(?:[.,]\d+)?)[eE]([+-]?\d+)$/);
  if (sci) {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n) && n > 0) return String(Math.round(n));
  }
  const dotted = text.replace(",", ".");
  if (/^\d+\.0+$/.test(dotted)) return dotted.replace(/\.0+$/, "");
  const digits = text.replace(/\D/g, "");
  return digits || null;
}

function sqFromRecord(rec: Record<string, string>): string | null {
  return normalizeSqCandidato(
    rec.SQ_CANDIDATO || rec.SQCANDIDATO || rec.SQ || ""
  );
}

function stripAccentsUpper(value: string): string {
  return tseCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function mapTseCargo(raw: string): CargoChapada | null {
  const key = stripAccentsUpper(raw);
  if (!key) return null;
  if (
    key.startsWith("VICE") ||
    key.includes("SUPLENTE") ||
    key.includes("PREFEITO") ||
    key.includes("VEREADOR") ||
    key.includes("DISTRITAL")
  ) {
    return null;
  }
  return TSE_CARGO_MAP[key] ?? null;
}

function mapTseCdCargo(raw: string): CargoChapada | null {
  const digits = tseCell(raw).replace(/\D/g, "");
  return TSE_CD_CARGO_MAP[digits] ?? null;
}

/**
 * SG_UF filter:
 * - State offices (Dep/Sen/Gov): only SP.
 * - Presidente is national (`consulta_cand_*_BR`, SG_UF=BR). The SP file has
 *   no PRESIDENTE rows. Keep Presidente when UF is BR, empty, BRASIL, or SP
 *   (combined file / upsert). Missing column → do not filter.
 */
export function keepByUf(ufRaw: string | undefined, cargo: CargoChapada): boolean {
  if (ufRaw == null) return true;
  const uf = stripAccentsUpper(ufRaw).replace(/\s+/g, "");
  if (cargo === "Presidente") {
    return uf === "" || uf === "BR" || uf === "BRASIL" || uf === "SP";
  }
  return uf === "SP";
}

/**
 * Prefer apto/deferido when those columns exist.
 * INDEFERIDO/INAPTO/RENÚNCIA… are skipped. Unknown/messy values are imported.
 */
export function situacaoKeep(sitRaw: string, detRaw: string): "keep" | "skip" | "unknown" {
  const text = `${stripAccentsUpper(sitRaw)} ${stripAccentsUpper(detRaw)}`.trim();
  if (!text) return "unknown";
  if (
    /\bINAPTO\b/.test(text) ||
    /\bINDEFERID/.test(text) ||
    /\bRENUNCIA\b/.test(text) ||
    /\bCANCELAD/.test(text) ||
    /\bCASSAD/.test(text) ||
    /\bFALECID/.test(text)
  ) {
    return "skip";
  }
  if (/\bAPTO\b/.test(text) || /\bDEFERID/.test(text)) return "keep";
  return "unknown";
}

function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && /[,;|\t]/.test(ch)) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function pushError(errors: string[], message: string) {
  if (errors.length < MAX_ROW_ERRORS) errors.push(message);
}

function rowFromParts(
  parts: string[],
  index: number,
  errors: string[],
  skipped: ChapadaSkipCounts
): ChapadaRow | null {
  const numeroRaw = parts[0] ?? "";
  const nome = (parts[1] ?? "").trim();
  const cargoRaw = parts[2] ?? "";
  const cargo = normalizeCargoChapada(cargoRaw);
  if (!numeroRaw || !nome || !cargo) {
    skipped.invalid += 1;
    pushError(
      errors,
      `Linha ${index}: informe numero, nome e cargo (${CARGOS_CHAPADA.join(", ")}).`
    );
    return null;
  }
  const validated = validarNumeroCargoChapada(cargo, numeroRaw);
  if (!validated.ok) {
    skipped.invalid += 1;
    pushError(errors, `Linha ${index}: ${validated.message}`);
    return null;
  }
  return { numero: validated.numero, nome, cargo };
}

function recordFromHeader(header: string[], parts: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  header.forEach((key, i) => {
    if (!key) return;
    rec[key] = parts[i] ?? "";
  });
  return rec;
}

function parseNamedRow(
  rec: Record<string, string>,
  index: number,
  format: "tse" | "simplificado",
  errors: string[],
  skipped: ChapadaSkipCounts,
  hasSituacaoCols: boolean
): ChapadaRow | null {
  const numeroRaw = tseCell(rec.NR_CANDIDATO || rec.NUMERO || "");
  const nome = tseCell(
    rec.NM_URNA_CANDIDATO || rec.NM_CANDIDATO || rec.NOME || ""
  );
  const cargoRaw = tseCell(rec.DS_CARGO || rec.CARGO || "");
  const cargo =
    format === "tse"
      ? mapTseCargo(cargoRaw) ?? mapTseCdCargo(rec.CD_CARGO || "")
      : normalizeCargoChapada(cargoRaw);

  if (format === "tse" && !cargo) {
    skipped.cargo += 1;
    return null;
  }

  if (!cargo) {
    skipped.invalid += 1;
    pushError(
      errors,
      `Linha ${index}: informe numero, nome e cargo (${CARGOS_CHAPADA.join(", ")}).`
    );
    return null;
  }

  let apto: boolean | undefined;
  if (format === "tse") {
    const hasUf = Object.prototype.hasOwnProperty.call(rec, "SG_UF");
    if (hasUf && !keepByUf(rec.SG_UF, cargo)) {
      skipped.uf += 1;
      return null;
    }
    if (hasSituacaoCols) {
      const sit = situacaoKeep(
        rec.DS_SITUACAO_CANDIDATURA || "",
        rec.DS_DETALHE_SITUACAO_CAND || rec.DS_DETALHE_SITUACAO_CANDIDATURA || ""
      );
      if (sit === "skip") {
        skipped.situacao += 1;
        return null;
      }
      if (sit === "keep") apto = true;
    }
  }

  if (!numeroRaw || !nome) {
    skipped.invalid += 1;
    pushError(errors, `Linha ${index}: número ou nome vazio.`);
    return null;
  }

  const validated = validarNumeroCargoChapada(cargo, numeroRaw);
  if (!validated.ok) {
    skipped.invalid += 1;
    pushError(errors, `Linha ${index}: ${validated.message}`);
    return null;
  }

  const sq = sqFromRecord(rec);
  const row: ChapadaRow = { numero: validated.numero, nome, cargo };
  if (sq) row.sq_candidato = sq;
  if (apto) row.apto = true;
  return row;
}

/**
 * Collapse (numero, cargo) to one row before upsert.
 * Prefer APTO/DEFERIDO; otherwise keep the last occurrence (partido novo / linha mais recente).
 */
export function dedupeChapadaRows(rows: ChapadaRow[]): {
  rows: ChapadaRow[];
  duplicates: number;
} {
  const seen = new Map<string, ChapadaRow>();
  let duplicates = 0;
  for (const row of rows) {
    const key = chapadaRowKey(row.cargo, row.numero);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, row);
      continue;
    }
    duplicates += 1;
    if (prev.apto && !row.apto) continue;
    seen.set(key, row);
  }
  return { rows: Array.from(seen.values()), duplicates };
}

function finalizeRows(
  rows: ChapadaRow[],
  skipped: ChapadaSkipCounts
): ChapadaRow[] {
  const deduped = dedupeChapadaRows(rows);
  skipped.duplicates += deduped.duplicates;
  return deduped.rows.map((row) => {
    const { apto: _apto, ...rest } = row;
    return rest;
  });
}

/** Parse CSV (simple or TSE consulta_cand) or JSON chapada. */
export function parseChapadaPayload(text: string): ParseChapadaResult {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const skipped = emptySkipCounts();
  const errors: string[] = [];
  if (!trimmed) {
    return { rows: [], errors: ["Arquivo vazio."], format: "simplificado", skipped };
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const body = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(body)
        ? body
        : body &&
            typeof body === "object" &&
            Array.isArray((body as { candidatos?: unknown }).candidatos)
          ? (body as { candidatos: unknown[] }).candidatos
          : null;
      if (!list) {
        return {
          rows: [],
          errors: ['JSON inválido. Use um array ou { "candidatos": [...] }.'],
          format: "json",
          skipped,
        };
      }
      const rows: ChapadaRow[] = [];
      list.forEach((item, i) => {
        if (!item || typeof item !== "object") {
          skipped.invalid += 1;
          pushError(errors, `Item ${i + 1}: objeto inválido.`);
          return;
        }
        const rec = item as Record<string, unknown>;
        const parsed = rowFromParts(
          [
            String(rec.numero ?? rec.NR_CANDIDATO ?? ""),
            String(rec.nome ?? rec.NM_URNA_CANDIDATO ?? rec.NM_CANDIDATO ?? ""),
            String(rec.cargo ?? rec.DS_CARGO ?? ""),
          ],
          i + 1,
          errors,
          skipped
        );
        if (parsed) {
          const sq = normalizeSqCandidato(
            rec.sq_candidato ?? rec.SQ_CANDIDATO ?? rec.SQ ?? rec.SQCANDIDATO
          );
          if (sq) parsed.sq_candidato = sq;
          rows.push(parsed);
        }
      });
      return { rows: finalizeRows(rows, skipped), errors, format: "json", skipped };
    } catch {
      return {
        rows: [],
        errors: ["JSON inválido."],
        format: "json",
        skipped,
      };
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const firstParts = splitCsvLine(first);
  const headerKeys = firstParts.map(normalizeHeaderKey);
  const isTse = looksLikeTseHeaderLine(first);
  const isSimpleHeader =
    !isTse &&
    headerKeys.includes("NUMERO") &&
    (headerKeys.includes("NOME") || headerKeys.includes("CARGO"));
  const hasHeader = isTse || isSimpleHeader;
  const format: ChapadaFormat = isTse ? "tse" : "simplificado";

  if (!hasHeader) {
    const rows: ChapadaRow[] = [];
    lines.forEach((line, i) => {
      const parsed = rowFromParts(splitCsvLine(line), i + 1, errors, skipped);
      if (parsed) rows.push(parsed);
    });
    return { rows: finalizeRows(rows, skipped), errors, format, skipped };
  }

  const hasSituacaoCols =
    headerKeys.includes("DS_SITUACAO_CANDIDATURA") ||
    headerKeys.includes("DS_DETALHE_SITUACAO_CAND") ||
    headerKeys.includes("DS_DETALHE_SITUACAO_CANDIDATURA");

  const rows: ChapadaRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const rec = recordFromHeader(headerKeys, splitCsvLine(line));
    const parsed = parseNamedRow(
      rec,
      i + 2,
      isTse ? "tse" : "simplificado",
      errors,
      skipped,
      hasSituacaoCols
    );
    if (parsed) rows.push(parsed);
  });
  return { rows: finalizeRows(rows, skipped), errors, format, skipped };
}

export function summarizeChapadaParse(parsed: ParseChapadaResult): string {
  const fmt =
    parsed.format === "tse"
      ? "CSV TSE"
      : parsed.format === "json"
        ? "JSON"
        : "CSV simplificado";
  const imported = parsed.rows.length;
  const skip = skippedTotal(parsed.skipped);
  const bits: string[] = [`${imported} importado(s) (${fmt})`];
  if (skip > 0) {
    const detail: string[] = [];
    if (parsed.skipped.cargo) {
      detail.push(`${parsed.skipped.cargo} cargo(s) fora da chapada`);
    }
    if (parsed.skipped.uf) detail.push(`${parsed.skipped.uf} outra(s) UF`);
    if (parsed.skipped.situacao) {
      detail.push(`${parsed.skipped.situacao} inapto/indeferido`);
    }
    if (parsed.skipped.invalid) {
      detail.push(`${parsed.skipped.invalid} linha(s) inválida(s)`);
    }
    if (parsed.skipped.duplicates) {
      detail.push(`${parsed.skipped.duplicates} duplicata(s) número+cargo`);
    }
    bits.push(`${skip} ignorado(s)` + (detail.length ? ` (${detail.join(", ")})` : ""));
  }
  return bits.join(" · ");
}
