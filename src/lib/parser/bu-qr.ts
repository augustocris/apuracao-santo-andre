import {
  cargoFromPrintedHeader,
  cargoFromTseCarg,
  placeholderCandidateName,
  resolveVoteCargo,
} from "@/lib/cargos";
import type { ParsedBu, ParsedCandidateVote } from "@/lib/types";
import {
  isCargoBannerLine,
  isSkippableBuLine,
  normalizePrintedBuText,
} from "@/lib/parser/ocr-bu";

/** Known TSE QR metadata keys (never treat as candidate numbers). */
const METADATA_KEYS = new Set(
  [
    "QRBU",
    "VRQR",
    "VRCH",
    "ORIG",
    "ORLC",
    "PROC",
    "DTPL",
    "PLEI",
    "TURN",
    "FASE",
    "UNFE",
    "MUNI",
    "ZONA",
    "SECA",
    "SECAO",
    "SEÇÃO",
    "AGRE",
    "IDUE",
    "IDCA",
    "HIQT",
    "HICA",
    "VERS",
    "LOCA",
    "APTO",
    "APTS",
    "APTT",
    "COMP",
    "FALT",
    "HBMA",
    "HBBM",
    "HBBG",
    "HBSB",
    "DTAB",
    "HRAB",
    "DTFC",
    "HRFC",
    "IDEL",
    "CARG",
    "TIPO",
    "VERC",
    "PART",
    "LEGP",
    "TOTP",
    "NOMI",
    "LEGC",
    "BRAN",
    "NULO",
    "TOTC",
    "HASH",
    "SEQL",
    "ORQR",
    "NRUE",
    "NR_UE",
    "ASSI",
    "MAJO",
    "PROP",
    "APTA",
    "CSEC",
    "CAND",
    "CANDIDATO",
    "QTVO",
    "VOTOS",
    "MANUAL",
  ].map((k) => k.toUpperCase())
);

const ZONA_PATTERNS = [
  /ZONA\s*:\s*(\d+)/i,
  /Zona\s+Eleitoral\s*:?\s*(\d+)/i,
  /ZONA\s+ELEITORAL\s*:?\s*(\d+)/i,
];

const SECAO_PATTERNS = [
  /SEC(?:A|AO|ÇÃO|CAO)\s*:\s*(\d+)/i,
  /Secao\s+Eleitoral\s*:?\s*(\d+)/i,
  /Se[cç][aã]o\s+Eleitoral\s*:?\s*(\d+)/i,
  /SE[CÇ][AÃ]O\s+ELEITORAL\s*:?\s*(\d+)/i,
];

/** Demo / paste: CAND:13 QTVO:142 */
const VOTE_CAND_QTVO_RE =
  /CAND(?:IDATO)?\s*:\s*(\d+)\s+QT(?:VO|VOTOS)?\s*:\s*(\d+)/gi;

/** Alt demo: CANDIDATO:13 VOTOS:142 */
const VOTE_CANDIDATO_VOTOS_RE =
  /CANDIDATO\s*:\s*(\d+)\s+VOTOS\s*:\s*(\d+)/gi;

/**
 * TSE official QR: space-separated tokens `ccccc:nnnn` (candidate number : votes).
 * See TSE "QR Code no Boletim de Urna" manual.
 */
const TSE_TOKEN_RE = /^(\d{1,5}):(\d+)$/;

/**
 * Printed BU / OCR dump lines:
 * `JAIR BOLSONARO  17  0103` or tabular `17  0103` after cargo headers.
 * Capture optional name before the candidate number.
 */
const LINE_NUM_VOTOS_RE =
  /^(?:(.+?)\s+)?(\d{2,5})\s+(\d{1,7})\s*$/;

export interface ParseBuOptions {
  /** When set, only return votes for these registered candidate numbers. */
  registeredNumeros?: string[];
  /**
   * Continuation QR (TSE part 2+) often has only votes — no ZONA/SECAO.
   * Caller must inherit from part 1. Single-QR still requires both.
   */
  allowMissingZonaSecao?: boolean;
  /**
   * TSE part 2 (SEQL:02/02 / ORQR:2) may have no isolatable vote pairs.
   * Votes are recovered from the concatenated set — never require them here.
   */
  allowEmptyVotes?: boolean;
}

export function normalizeCandidateNumero(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  // Strip leading zeros but keep a single zero if all zeros.
  const stripped = digits.replace(/^0+(?=\d)/, "");
  return stripped || "0";
}

function normalizeDigits(value: string, pad = 0): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  // Strip leading zeros before padding so "0001" → "001" (zona 3) / "0001" (seção 4).
  const stripped = digits.replace(/^0+(?=\d)/, "") || "0";
  return pad > 0 ? stripped.padStart(pad, "0") : stripped;
}

/** Zona 1–3 dígitos. 5+ dígitos = token TSE colado (ZONA:00117:103 → 001). */
export function normalizeZona(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const capped = digits.length > 4 ? digits.slice(0, 3) : digits;
  return normalizeDigits(capped, 3);
}

/** Seção 1–4 dígitos. 5+ (ex. 04777) é glitch/cola do próximo token — não inventa 5 dígitos. */
export function normalizeSecao(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const capped = digits.length > 4 ? digits.slice(0, 4) : digits;
  return normalizeDigits(capped, 4);
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

interface VoteAcc {
  numero: string;
  quantidade: number;
  nome?: string;
  cargo?: string;
}

function voteKey(numero: string, cargo?: string): string {
  return `${cargo ?? ""}::${numero}`;
}

function setVote(
  map: Map<string, VoteAcc>,
  numeroRaw: string,
  quantidadeRaw: string | number,
  extra?: { nome?: string; cargo?: string }
) {
  const numero = normalizeCandidateNumero(numeroRaw);
  const quantidade =
    typeof quantidadeRaw === "number"
      ? quantidadeRaw
      : Number.parseInt(String(quantidadeRaw).replace(/\D/g, ""), 10);
  if (!numero || !Number.isFinite(quantidade) || quantidade <= 0) return;

  const cargo = extra?.cargo?.trim() || undefined;
  const nome = extra?.nome?.trim() || undefined;

  // Promote an uncarged slice to a banner/CARG cargo — never the reverse
  // (Presidente 10 must not collapse into Governador 10).
  if (cargo) {
    const bareKey = voteKey(numero, undefined);
    if (map.has(bareKey)) {
      const prev = map.get(bareKey)!;
      map.delete(bareKey);
      map.set(voteKey(numero, cargo), {
        numero,
        quantidade,
        nome: nome || prev.nome,
        cargo,
      });
      return;
    }
  }

  const key = voteKey(numero, cargo);
  const prev = map.get(key);
  map.set(key, {
    numero,
    quantidade,
    nome: nome || prev?.nome,
    cargo: cargo || prev?.cargo,
  });
}

function collectCandQtvo(text: string, map: Map<string, VoteAcc>) {
  let currentCargo: string | undefined;
  const lines = text.split(/\r?\n/);
  const chunks = lines.length > 1 ? lines : text.split(/\s+/);

  for (const chunk of chunks) {
    const carg = chunk.match(/CARG\s*:\s*(\d+)/i);
    if (carg) {
      currentCargo = cargoFromTseCarg(carg[1]) ?? currentCargo;
    }
    if (isCargoBannerLine(chunk)) {
      currentCargo = cargoFromPrintedHeader(chunk) ?? currentCargo;
    }
    for (const re of [VOTE_CAND_QTVO_RE, VOTE_CANDIDATO_VOTOS_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(chunk)) !== null) {
        setVote(map, match[1], match[2], { cargo: currentCargo });
      }
    }
  }
}

/** Parse TSE `chave:valor` tokens; numeric keys are candidate votes. */
function collectTseNumericPairs(text: string, map: Map<string, VoteAcc>) {
  const tokens = text.split(/[\s;|]+/);
  let currentCargo: string | undefined;

  for (const token of tokens) {
    const cleaned = token.trim();
    if (!cleaned.includes(":")) continue;

    const colon = cleaned.indexOf(":");
    const key = cleaned.slice(0, colon);
    const value = cleaned.slice(colon + 1);
    if (!key || value === "") continue;

    if (/^[A-Za-z]/.test(key)) {
      const upper = key.toUpperCase();
      if (upper === "CARG") {
        currentCargo = cargoFromTseCarg(value) ?? currentCargo;
      } else if (!METADATA_KEYS.has(upper)) {
        // Unknown alphabetic key — still not a candidate number.
      }
      continue;
    }

    const m = cleaned.match(TSE_TOKEN_RE);
    if (!m) continue;
    setVote(map, m[1], m[2], { cargo: currentCargo });
  }
}

/**
 * Denser TSE part 2: pairs glued to the next field (`45455:11HASH:…`)
 * or packed without spaces. Never treat `QRBU:1:2` as a vote.
 */
function collectGluedNumericPairs(text: string, map: Map<string, VoteAcc>) {
  const re = /(?:^|[\s;|])(\d{1,5}):(\d+)(?=[\s;|]|$|[A-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const numero = normalizeCandidateNumero(match[1]);
    if (!numero) continue;
    if (Array.from(map.values()).some((acc) => acc.numero === numero)) continue;
    setVote(map, match[1], match[2]);
  }
}

/**
 * Line-based dumps mimicking the printed BU columns Nome | Num cand | Votos.
 * Cargo comes ONLY from section banners (DEPUTADO FEDERAL, PRESIDENTE, …).
 * Skips party totals, aptos, brancos/nulos, verificador, “Não há votos nominais”.
 */
function collectLineBasedPairs(text: string, map: Map<string, VoteAcc>) {
  const lines = text.split(/\r?\n/);
  let currentCargo: string | undefined;
  let inSignature = false;
  const pendingNames: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/[-_=]{2,}/g, " ").trim();
    if (!line) continue;

    if (/assinatura/i.test(line)) {
      inSignature = true;
      continue;
    }
    if (inSignature) continue;

    if (isCargoBannerLine(rawLine) || isCargoBannerLine(line)) {
      currentCargo = cargoFromPrintedHeader(rawLine) ?? cargoFromPrintedHeader(line) ?? currentCargo;
      pendingNames.length = 0;
      continue;
    }

    if (isSkippableBuLine(line)) {
      pendingNames.length = 0;
      continue;
    }

    const m = line.match(LINE_NUM_VOTOS_RE);
    if (m && currentCargo) {
      const numero = m[2];
      const votos = m[3];
      if (numero.length < 2 || numero.length > 5) continue;
      const nomeRaw = m[1]?.trim();
      const fromLine =
        nomeRaw && !/^\d+$/.test(nomeRaw)
          ? nomeRaw.replace(/\s+/g, " ")
          : pendingNames.shift();
      setVote(map, numero, votos, { nome: fromLine, cargo: currentCargo });
      continue;
    }

    if (
      currentCargo &&
      /^[A-Za-z .'-]+$/.test(line) &&
      line.length >= 3 &&
      !/^\d/.test(line)
    ) {
      pendingNames.push(line.replace(/\s+/g, " "));
    }
  }
}

/**
 * Look up each registered number inside the raw payload with flexible padding.
 * Patterns: `17:103`, `0017:0103`, `CAND:17 QTVO:103`, tabular `… 17  0103`.
 */
function collectRegisteredLookups(
  text: string,
  registeredNumeros: string[],
  map: Map<string, VoteAcc>
) {
  for (const raw of registeredNumeros) {
    const canon = normalizeCandidateNumero(raw);
    if (!canon) continue;
    if (Array.from(map.values()).some((acc) => acc.numero === canon)) continue;

    const esc = canon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // TSE / key:value — allow leading zeros on both sides.
    const tseRe = new RegExp(
      `(?:^|\\s)0*${esc}\\s*:\\s*(\\d+)(?=\\s|$)`,
      "i"
    );
    const tseMatch = text.match(tseRe);
    if (tseMatch) {
      setVote(map, canon, tseMatch[1]);
      continue;
    }

    const candRe = new RegExp(
      `CAND(?:IDATO)?\\s*:\\s*0*${esc}\\s+(?:QT(?:VO|VOTOS)?|VOTOS)\\s*:\\s*(\\d+)`,
      "i"
    );
    const candMatch = text.match(candRe);
    if (candMatch) {
      setVote(map, canon, candMatch[1]);
      continue;
    }

    // Tabular / printed: number then votes at end of line (word boundaries).
    const lineRe = new RegExp(
      `(?:^|\\s)0*${esc}(?!\\d)\\s+(\\d{1,7})\\s*$`,
      "im"
    );
    const lineMatch = text.match(lineRe);
    if (lineMatch) {
      setVote(map, canon, lineMatch[1]);
    }
  }
}

function finalizeVotes(map: Map<string, VoteAcc>): ParsedCandidateVote[] {
  const merged = new Map<string, ParsedCandidateVote>();
  for (const acc of map.values()) {
    const cargo = resolveVoteCargo(acc.numero, acc.cargo);
    const nome = acc.nome?.trim() || placeholderCandidateName(acc.numero);
    const key = voteKey(acc.numero, cargo);
    merged.set(key, {
      numero: acc.numero,
      quantidade: acc.quantidade,
      nome,
      cargo,
    });
  }
  return Array.from(merged.values());
}

function collectVotes(
  text: string,
  registeredNumeros?: string[]
): ParsedCandidateVote[] {
  const map = new Map<string, VoteAcc>();

  collectCandQtvo(text, map);
  collectTseNumericPairs(text, map);
  collectGluedNumericPairs(text, map);
  collectLineBasedPairs(text, map);

  if (registeredNumeros && registeredNumeros.length > 0) {
    collectRegisteredLookups(text, registeredNumeros, map);
    const allowed = new Set(
      registeredNumeros.map(normalizeCandidateNumero).filter(Boolean)
    );
    for (const [key, acc] of Array.from(map.entries())) {
      if (!allowed.has(acc.numero)) map.delete(key);
    }
  }

  return finalizeVotes(map);
}

/** Votes from raw QR text (after decode/normalize). Used on concatenated parts. */
export function extractBuVotes(
  raw: string,
  registeredNumeros?: string[]
): ParsedCandidateVote[] {
  if (!raw) return [];
  const text = normalizePrintedBuText(decodeBuPayloadStrategies(String(raw)));
  return collectVotes(text, registeredNumeros);
}

/** Same urna QR filmed twice — ignore leftover html5-qrcode success. */
export function sameQrPayload(a: string, b: string): boolean {
  const fold = (value: string) =>
    normalizePrintedBuText(decodeBuPayloadStrategies(String(value)))
      .replace(/\s+/g, " ")
      .trim();
  const left = fold(a);
  const right = fold(b);
  return left.length > 0 && left === right;
}

/** True when decoded payload looks binary / non-text. */
export function looksBinaryPayload(raw: string): boolean {
  if (!raw) return false;
  let weird = 0;
  const sample = raw.slice(0, Math.min(raw.length, 400));
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0) return true;
    // Allow common whitespace; count other C0 controls + high binary.
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0xfffd) {
      weird++;
    }
  }
  return weird / sample.length > 0.15;
}

/**
 * Try to recover a text BU payload from a QR decode that arrived as binary-ish
 * or UTF-16 / latin1 mojibake. Returns the best printable candidate.
 */
export function decodeBuPayloadStrategies(raw: string): string {
  if (!raw) return raw;
  if (!looksBinaryPayload(raw) && /[A-Za-z0-9]/.test(raw)) {
    return raw.trim();
  }

  const candidates: string[] = [raw];

  try {
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff);
    candidates.push(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    candidates.push(new TextDecoder("latin1").decode(bytes));
    // UTF-16LE when every other byte is null (common scanner artefact).
    if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) {
      candidates.push(new TextDecoder("utf-16le").decode(bytes));
    }
  } catch {
    /* keep raw */
  }

  // Strip NULs
  candidates.push(raw.replace(/\u0000/g, ""));

  let best = raw;
  let bestScore = -1;
  for (const c of candidates) {
    const score =
      (c.match(/ZONA/gi)?.length ?? 0) * 10 +
      (c.match(/SEC/gi)?.length ?? 0) * 8 +
      (c.match(/\d+:\d+/g)?.length ?? 0) * 2 +
      (c.match(/CAND/gi)?.length ?? 0) * 3 +
      (c.match(/[A-Za-z0-9:\s]/g)?.length ?? 0) / Math.max(c.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best.trim();
}

function formatRegisteredList(numeros: string[]): string {
  const uniq = Array.from(
    new Set(numeros.map(normalizeCandidateNumero).filter(Boolean))
  );
  if (uniq.length === 0) return "(nenhum número no cadastro)";
  return uniq.join(", ");
}

export class BuParseError extends Error {
  debug?: string;
  constructor(message: string, debug?: string) {
    super(message);
    this.name = "BuParseError";
    this.debug = debug;
  }
}

/** Leftover camera frame / same QR 1 filmed again while waiting for QR 2. */
export class SameQrRepeatError extends BuParseError {
  constructor() {
    super(
      "Este é o mesmo QR de antes. Aponte a câmera para o outro código desta urna."
    );
    this.name = "SameQrRepeatError";
  }
}

export function parseComparecimento(text: string): number | null {
  const m = String(text).match(/\bCOMP\s*:\s*(\d+)/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function peekZonaSecao(raw: string): { zona?: string; secao?: string } {
  try {
    const text = normalizePrintedBuText(decodeBuPayloadStrategies(String(raw)));
    const zonaRaw = firstMatch(text, ZONA_PATTERNS);
    const secaoRaw = firstMatch(text, SECAO_PATTERNS);
    return {
      zona: zonaRaw ? normalizeZona(zonaRaw) : undefined,
      secao: secaoRaw ? normalizeSecao(secaoRaw) : undefined,
    };
  } catch {
    return {};
  }
}

export const MAX_QR_PARTS = 8;

export function isQrSetComplete(parts: ParsedBu[]): boolean {
  if (parts.length === 0) return false;
  const total = parts.reduce((max, p) => Math.max(max, p.qrTotal ?? 0), 0);
  if (total <= 1) return true;
  const indexes = new Set(
    parts
      .map((p) => p.qrIndex)
      .filter((n): n is number => typeof n === "number" && n >= 1)
  );
  for (let i = 1; i <= total; i += 1) {
    if (!indexes.has(i)) return false;
  }
  return true;
}

/** Next QR the fiscal should film (1-based). */
export function nextMissingQrIndex(parts: ParsedBu[]): number {
  const total = parts.reduce((max, p) => Math.max(max, p.qrTotal ?? 0), 0);
  const have = new Set(
    parts
      .map((p) => p.qrIndex)
      .filter((n): n is number => typeof n === "number" && n >= 1)
  );
  const goal = Math.max(total, 2);
  for (let i = 1; i <= goal; i += 1) {
    if (!have.has(i)) return i;
  }
  return parts.length + 1;
}

export function describeQrProgress(parts: ParsedBu[]): {
  index: number;
  total: number;
  complete: boolean;
} {
  const total = parts.reduce((max, p) => Math.max(max, p.qrTotal ?? 0), 0);
  const index = Math.max(
    parts.length,
    ...parts.map((p) => p.qrIndex ?? 0),
    0
  );
  return {
    index,
    total: total || Math.max(parts.length, 1),
    complete: isQrSetComplete(parts),
  };
}

/** Merge only when every QR of the urna is present. Incomplete sets must not ingest. */
export function assertQrSetReadyToIngest(parts: ParsedBu[]): ParsedBu {
  if (!isQrSetComplete(parts)) {
    const { index, total } = describeQrProgress(parts);
    throw new BuParseError(
      `QR ${index} de ${total} — filme o próximo QR desta urna. Não envie ainda.`
    );
  }
  const merged = mergeParsedBus(parts);
  if (merged.votes.length === 0) {
    throw new BuParseError(
      "Nenhum voto de candidato encontrado neste conjunto de QRs."
    );
  }
  return merged;
}

export function parseUrnaFingerprint(text: string): {
  hash: string | null;
  urnaId: string | null;
} {
  const folded = normalizePrintedBuText(String(text));
  const hash = folded.match(/HASH\s*:\s*([A-Za-z0-9]+)/i)?.[1] ?? null;
  const idue = folded.match(/\bIDUE\s*:\s*(\d+)/i)?.[1] ?? null;
  const nrue = folded.match(/\bNR_?UE\s*:\s*(\d+)/i)?.[1] ?? null;
  return { hash, urnaId: idue || nrue };
}

export function formatQrPartDebug(part: {
  qrIndex?: number;
  qrTotal?: number;
  urnaId?: string | null;
  urnaHash?: string | null;
}): string {
  const seql =
    part.qrIndex && part.qrTotal
      ? `${String(part.qrIndex).padStart(2, "0")}/${String(part.qrTotal).padStart(2, "0")}`
      : "—";
  const idue = part.urnaId?.trim() || "—";
  const hash = part.urnaHash?.trim() ? part.urnaHash.trim().slice(0, 8) : "—";
  return `SEQL ${seql} IDUE ${idue} HASH ${hash}`;
}

export function formatQrPairDebug(
  part1: Parameters<typeof formatQrPartDebug>[0],
  part2: Parameters<typeof formatQrPartDebug>[0]
): string {
  return `1: ${formatQrPartDebug(part1)} · 2: ${formatQrPartDebug(part2)}`;
}

export function isContinuationSequence(meta: { index: number; total: number } | null): boolean {
  return Boolean(meta && meta.total > 1 && meta.index > 1);
}

export function parseQrbuMeta(
  text: string
): { index: number; total: number } | null {
  const folded = normalizePrintedBuText(String(text));
  const seql = folded.match(/SEQL\s*:\s*0*(\d+)\s*\/\s*0*(\d+)/i);
  if (seql) {
    const index = Number.parseInt(seql[1], 10);
    const total = Number.parseInt(seql[2], 10);
    if (Number.isFinite(index) && Number.isFinite(total) && index >= 1 && total >= 1) {
      return { index, total };
    }
  }

  const qrbu = folded.match(/QRBU\s*:\s*(\d+)\s*:\s*(\d+)/i);
  if (qrbu) {
    const index = Number.parseInt(qrbu[1], 10);
    const total = Number.parseInt(qrbu[2], 10);
    if (Number.isFinite(index) && Number.isFinite(total) && index >= 1 && total >= 1) {
      return { index, total };
    }
  }

  const dashedSlash = folded.match(
    /-{2,}[^\n]*?0*(\d{1,2})\s*\/\s*0*(\d{1,2})/
  );
  if (dashedSlash) {
    const index = Number.parseInt(dashedSlash[1], 10);
    const total = Number.parseInt(dashedSlash[2], 10);
    if (
      Number.isFinite(index) &&
      Number.isFinite(total) &&
      index >= 1 &&
      total >= 2 &&
      total <= MAX_QR_PARTS &&
      index <= total
    ) {
      return { index, total };
    }
  }

  const bareSlash = folded.match(/\b0*(\d{1,2})\s*\/\s*0*(\d{1,2})\b/);
  if (bareSlash) {
    const index = Number.parseInt(bareSlash[1], 10);
    const total = Number.parseInt(bareSlash[2], 10);
    if (
      Number.isFinite(index) &&
      Number.isFinite(total) &&
      index >= 1 &&
      total >= 2 &&
      total <= MAX_QR_PARTS &&
      index <= total
    ) {
      return { index, total };
    }
  }

  const orqr = folded.match(/ORQR\s*:\s*0*(\d+)/i);
  if (orqr) {
    const index = Number.parseInt(orqr[1], 10);
    if (Number.isFinite(index) && index >= 1) {
      return index > 1 ? { index, total: Math.max(index, 2) } : { index: 1, total: 1 };
    }
  }

  const bannerHits = [
    ...folded.matchAll(/-{2,}[^\n]*?(\d{1,2})\s+de\s+(\d{1,2})/gi),
  ];
  for (const m of bannerHits) {
    const index = Number.parseInt(m[1], 10);
    const total = Number.parseInt(m[2], 10);
    if (
      Number.isFinite(index) &&
      Number.isFinite(total) &&
      index >= 1 &&
      total >= 1 &&
      total <= 20 &&
      index <= total
    ) {
      return { index, total };
    }
  }

  const looseDe = folded.match(/\b(\d{1,2})\s+de\s+(\d{1,2})\b/i);
  if (looseDe) {
    const index = Number.parseInt(looseDe[1], 10);
    const total = Number.parseInt(looseDe[2], 10);
    if (
      Number.isFinite(index) &&
      Number.isFinite(total) &&
      index >= 1 &&
      total >= 1 &&
      total <= 20 &&
      index <= total
    ) {
      return { index, total };
    }
  }
  return null;
}

/**
 * Merge complementary QR slices of the same urna.
 * zona+seção must match. Same numero+cargo → last fragment wins.
 */
export function inheritQrZonaSecao(part: ParsedBu, from: ParsedBu): ParsedBu {
  return {
    ...part,
    zona: part.zona || from.zona,
    secao: part.secao || from.secao,
  };
}

/** Later QRs often only have ORQR:n — keep the set size from SEQL / 01/04. */
export function inheritQrSetMeta(
  part: ParsedBu,
  previousParts: ParsedBu[]
): ParsedBu {
  const prevTotal = previousParts.reduce(
    (max, p) => Math.max(max, p.qrTotal ?? 0),
    0
  );
  const qrTotal = Math.max(part.qrTotal ?? 0, prevTotal) || part.qrTotal;
  const qrIndex =
    part.qrIndex ??
    (previousParts.length > 0 ? previousParts.length + 1 : undefined);
  return { ...part, qrTotal, qrIndex };
}

export function mergeParsedBus(parts: ParsedBu[]): ParsedBu {
  if (parts.length === 0) {
    throw new BuParseError("Nenhum QR para unir.");
  }
  const donor = parts.find((p) => p.zona && p.secao);
  if (!donor) {
    throw new BuParseError(
      "Zona/seção ausentes no conjunto de QRs. Filme primeiro o QR que traz zona e seção."
    );
  }
  const zona = donor.zona;
  const secao = donor.secao;
  const urnaId = parts.find((p) => p.urnaId)?.urnaId ?? null;
  for (const part of parts) {
    if (urnaId && part.urnaId && part.urnaId !== urnaId) {
      throw new BuParseError(
        "Este QR é de outra urna.",
        formatQrPairDebug(donor, part)
      );
    }
    if (part.zona && part.secao && (part.zona !== zona || part.secao !== secao)) {
      throw new BuParseError(
        "Este QR é de outra urna.",
        formatQrPairDebug(donor, part)
      );
    }
  }

  const concatPlain = parts.map((p) => p.rawText).join("");
  const concatNl = parts.map((p) => p.rawText).join("\n");
  const fromPlain = extractBuVotes(concatPlain);
  const fromNl = extractBuVotes(concatNl);
  const combinedVotes =
    fromPlain.length >= fromNl.length ? fromPlain : fromNl;

  const map = new Map<string, ParsedCandidateVote>();
  const voteSource =
    combinedVotes.length > 0
      ? combinedVotes
      : parts.flatMap((part) => part.votes);
  for (const vote of voteSource) {
    const cargo = resolveVoteCargo(vote.numero, vote.cargo);
    const numero = normalizeCandidateNumero(vote.numero);
    map.set(`${cargo}::${numero}`, {
      ...vote,
      numero,
      cargo,
    });
  }

  const qrTotal = parts.reduce(
    (max, p) => Math.max(max, p.qrTotal ?? 0, p.qrIndex ?? 0),
    0
  );
  const comparecimento =
    [...parts].reverse().find((p) => p.comparecimento != null)?.comparecimento ??
    null;

  return {
    zona,
    secao,
    votes: Array.from(map.values()),
    rawText: parts
      .map((p, i) => `--- QR ${p.qrIndex ?? i + 1} ---\n${p.rawText}`)
      .join("\n"),
    qrIndex: parts.length,
    qrTotal: qrTotal || parts.length,
    urnaHash: parts.find((p) => p.urnaHash)?.urnaHash ?? null,
    urnaId,
    comparecimento,
  };
}

/**
 * Parses TSE BU QR payloads and common text dumps.
 *
 * Supported formats:
 * - Official TSE QR: `ZONA:9 SECA:31 … 4545:11 45045:3`
 * - Demo/paste: `CAND:13 QTVO:142` / `CANDIDATO:13 VOTOS:142`
 * - Printed BU lines: `NOME  17  0103` under cargo headers
 * - Labels: `Zona Eleitoral: 0001` / `Seção Eleitoral: 0483`
 *
 * Always returns every candidate `numero` + votos under a cargo banner / CARG.
 * Cargo is never inferred from digit length (2-digit = Presidente or Governador).
 * When `registeredNumeros` is provided, filters to those numbers
 * (flexible zero-padding / word-boundary match) — used by tests / Digitar checks.
 */
export function parseBuQrText(
  raw: string,
  options: ParseBuOptions = {}
): ParsedBu {
  if (raw == null || !String(raw).trim()) {
    throw new BuParseError("Texto do BU vazio. Escaneie de novo.");
  }

  if (looksBinaryPayload(raw)) {
    const recovered = decodeBuPayloadStrategies(raw);
    if (looksBinaryPayload(recovered) || recovered.length < 8) {
      throw new BuParseError(
        "QR lido, mas o conteúdo parece binário/ilegível como texto. Tente outra foto do QR com boa luz."
      );
    }
    return parseBuQrText(recovered, options);
  }

  const decoded = decodeBuPayloadStrategies(raw);
  const text = normalizePrintedBuText(decoded);
  const registered = options.registeredNumeros;
  const qrbuEarly = parseQrbuMeta(text);
  const continuation =
    options.allowMissingZonaSecao === true ||
    isContinuationSequence(qrbuEarly);

  const zonaRaw = firstMatch(text, ZONA_PATTERNS);
  const secaoRaw = firstMatch(text, SECAO_PATTERNS);

  if (!zonaRaw && !continuation) {
    throw new BuParseError(
      "Zona não encontrada no QR. Formatos aceitos: ZONA:001, Zona Eleitoral: 0001 ou ZonaEleitoral 0001."
    );
  }
  if (!secaoRaw && !continuation) {
    throw new BuParseError(
      "Seção não encontrada no QR. Formatos aceitos: SECA:0483, Seção Eleitoral: 0483 ou SecaoEleitoral 0477."
    );
  }

  // First pass: extract everything (or filter if registered provided).
  const allVotes = collectVotes(text, undefined);
  let votes: ParsedCandidateVote[];

  if (registered && registered.length > 0) {
    // Prefer votes already found that match cadastro; also run targeted lookup.
    votes = collectVotes(text, registered);

    if (votes.length === 0) {
      const list = formatRegisteredList(registered);
      if (allVotes.length > 0) {
        throw new BuParseError(
          `QR lido, mas nenhum número cadastrado encontrado no boletim. Números cadastrados: ${list}.`
        );
      }
      throw new BuParseError(
        `QR lido, mas nenhum número cadastrado encontrado no boletim. Números cadastrados: ${list}. Formatos aceitos: 4545:11 (TSE), CAND:4545 QTVO:11, ou linha Nome 4545 0011.`
      );
    }

    // Ensure returned numeros are the canonical registered form when possible.
    votes = votes.map((v) => {
      const match = registered.find(
        (r) => normalizeCandidateNumero(r) === v.numero
      );
      return match
        ? {
            ...v,
            numero: normalizeCandidateNumero(match),
            quantidade: v.quantidade,
          }
        : v;
    });
  } else {
    votes = allVotes;
  }

  const qrbu = qrbuEarly;
  const incomplete = qrbu != null && qrbu.index < qrbu.total;
  const allowEmpty =
    incomplete ||
    options.allowEmptyVotes === true ||
    isContinuationSequence(qrbu);

  if (votes.length === 0 && !allowEmpty) {
    throw new BuParseError("Nenhum voto de candidato encontrado no QR.");
  }

  const fingerprint = parseUrnaFingerprint(text);
  return {
    zona: zonaRaw ? normalizeZona(zonaRaw) : "",
    secao: secaoRaw ? normalizeSecao(secaoRaw) : "",
    votes,
    rawText: text,
    qrIndex: qrbu?.index,
    qrTotal: qrbu?.total,
    urnaHash: fingerprint.hash,
    urnaId: fingerprint.urnaId,
    comparecimento: parseComparecimento(text),
  };
}

/**
 * Live fiscal path: first QR requires zona+seção; later parts (SEQL/ORQR/N de M) do not.
 * Bind on IDUE / NR_UE / zona+seção. HASH is per-QR — never required to match.
 */
export function parseFiscalQrChunk(raw: string, previousParts: ParsedBu[]): ParsedBu {
  const awaitingMore =
    previousParts.length > 0 && !isQrSetComplete(previousParts);

  if (awaitingMore) {
    const repeat = previousParts.find((part) => sameQrPayload(part.rawText, raw));
    if (repeat) {
      throw new SameQrRepeatError();
    }
  }

  const meta = parseQrbuMeta(decodeBuPayloadStrategies(raw));
  const continuation = awaitingMore || isContinuationSequence(meta);
  const parsed = parseBuQrText(raw, {
    allowMissingZonaSecao: continuation,
    allowEmptyVotes: continuation,
  });

  if (awaitingMore) {
    const first = previousParts[0];
    const debug = formatQrPairDebug(first, parsed);
    if (first.urnaId && parsed.urnaId && first.urnaId !== parsed.urnaId) {
      throw new BuParseError("Este QR é de outra urna.", debug);
    }
    if (
      parsed.zona &&
      parsed.secao &&
      (parsed.zona !== first.zona || parsed.secao !== first.secao)
    ) {
      throw new BuParseError("Este QR é de outra urna.", debug);
    }
    return inheritQrSetMeta(inheritQrZonaSecao(parsed, first), previousParts);
  }

  if (!parsed.zona || !parsed.secao) {
    throw new BuParseError(
      "Zona ou seção ausente neste QR. Filme o QR que traz zona e seção."
    );
  }
  return parsed;
}

/** Sample BU text for demos / paste fallback testing (cargos estaduais). */
export const SAMPLE_BU_TEXT = `ZONA:001
SECAO:0001
CARG:3
CAND:13 QTVO:142
CAND:45 QTVO:98
CARG:5
CAND:131 QTVO:110
CAND:456 QTVO:87
CARG:6
CAND:1313 QTVO:64
CARG:7
CAND:13131 QTVO:51
CAND:99999 QTVO:3`;

/** Official-style TSE QR sample (space-separated, numeric pairs). */
export const SAMPLE_TSE_QR_TEXT = `QRBU:1:1 ORIG:VOTA PROC:2000 DTPL:20181007 PLEI:2100 TURN:1 FASE:S UNFE:SP MUNI:71072 ZONA:247 SECA:123 IDUE:1760649 IDCA:529951844372447180336660 VERS:5.22.0.1 VRQR:4.0 LOCA:4 APTO:400 COMP:250 FALT:150 IDEL:2101 CARG:1 TIPO:0 VERC:20180901 17:103 13:89 NOMI:192 BRAN:3 NULO:5 TOTC:200 CARG:6 TIPO:1 VERC:20180901 PART:45 4545:11 45045:7 LEGP:0 TOTP:18 PART:11 111:4 222:2 LEGP:0 TOTP:6 NOMI:24 LEGC:0 BRAN:1 NULO:0 TOTC:25 CARG:3 TIPO:0 VERC:20180901 10:55 45:40 NOMI:95 BRAN:2 NULO:1 TOTC:98`;

/** Complementary TSE QR slices of the same urna (QRBU 1/2 and 2/2). */
export const SAMPLE_TSE_QR_PART1 = `QRBU:1:2 ORIG:VOTA ZONA:247 SECA:123 CARG:1 TIPO:0 17:103 13:89 NOMI:192 BRAN:3 NULO:5 TOTC:200`;

export const SAMPLE_TSE_QR_PART2 = `QRBU:2:2 ORIG:VOTA ZONA:247 SECA:123 CARG:6 TIPO:1 4545:11 45045:7 CARG:3 TIPO:0 10:55 45:40`;
