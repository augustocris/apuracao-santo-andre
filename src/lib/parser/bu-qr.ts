import type { ParsedBu, ParsedCandidateVote } from "@/lib/types";

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
  /Zona\s+Eleitoral\s*:\s*(\d+)/i,
  /ZONA\s+ELEITORAL\s*:\s*(\d+)/i,
];

const SECAO_PATTERNS = [
  /SEC(?:A|AO|ÇÃO|CAO)\s*:\s*(\d+)/i,
  /Se[cç][aã]o\s+Eleitoral\s*:\s*(\d+)/i,
  /SE[CÇ][AÃ]O\s+ELEITORAL\s*:\s*(\d+)/i,
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
 */
const LINE_NUM_VOTOS_RE =
  /(?:^|\s)(\d{2,5})\s+(\d{1,7})\s*$/;

/** Cargo section markers on printed BUs (ignored structurally; help line parsing). */
const CARGO_HEADER_RE =
  /^-{3,}.*(PRESIDENTE|GOVERNADOR|SENADOR|DEPUTADO\s+FEDERAL|DEPUTADO\s+ESTADUAL|PREFEITO|VEREADOR).*-{3,}$/i;

export interface ParseBuOptions {
  /** When set, only return votes for these registered candidate numbers. */
  registeredNumeros?: string[];
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

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function setVote(
  map: Map<string, number>,
  numeroRaw: string,
  quantidadeRaw: string | number
) {
  const numero = normalizeCandidateNumero(numeroRaw);
  const quantidade =
    typeof quantidadeRaw === "number"
      ? quantidadeRaw
      : Number.parseInt(String(quantidadeRaw).replace(/\D/g, ""), 10);
  if (!numero || !Number.isFinite(quantidade) || quantidade < 0) return;
  // Later occurrences win (multi-QR fragments / duplicates).
  map.set(numero, quantidade);
}

function collectCandQtvo(text: string, map: Map<string, number>) {
  for (const re of [VOTE_CAND_QTVO_RE, VOTE_CANDIDATO_VOTOS_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      setVote(map, match[1], match[2]);
    }
  }
}

/** Parse TSE `chave:valor` tokens; numeric keys are candidate votes. */
function collectTseNumericPairs(text: string, map: Map<string, number>) {
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.trim();
    if (!cleaned.includes(":")) continue;

    // Skip known metadata KEY:value (non-numeric keys).
    const colon = cleaned.indexOf(":");
    const key = cleaned.slice(0, colon);
    const value = cleaned.slice(colon + 1);
    if (!key || value === "") continue;

    if (/^[A-Za-z]/.test(key)) {
      // e.g. ZONA:9, PART:91, HASH:...
      if (METADATA_KEYS.has(key.toUpperCase())) continue;
      continue;
    }

    const m = cleaned.match(TSE_TOKEN_RE);
    if (!m) continue;
    setVote(map, m[1], m[2]);
  }
}

/**
 * Line-based dumps mimicking the printed BU columns Nome | Num cand | Votos.
 * Skips header lines and cargo separators.
 */
function collectLineBasedPairs(text: string, map: Map<string, number>) {
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CARGO_HEADER_RE.test(line)) continue;
    if (/^(nome|num|votos|candidato)/i.test(line)) continue;
    if (/CAND(?:IDATO)?\s*:/i.test(line)) continue; // handled elsewhere

    const m = line.match(LINE_NUM_VOTOS_RE);
    if (!m) continue;
    const numero = m[1];
    const votos = m[2];
    // Heuristic: candidate numbers are 2–5 digits; vote totals rarely share
    // that exact pattern alone without a name — accept when both present.
    if (numero.length < 2 || numero.length > 5) continue;
    setVote(map, numero, votos);
  }
}

/**
 * Look up each registered number inside the raw payload with flexible padding.
 * Patterns: `17:103`, `0017:0103`, `CAND:17 QTVO:103`, tabular `… 17  0103`.
 */
function collectRegisteredLookups(
  text: string,
  registeredNumeros: string[],
  map: Map<string, number>
) {
  for (const raw of registeredNumeros) {
    const canon = normalizeCandidateNumero(raw);
    if (!canon) continue;
    if (map.has(canon)) continue;

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

function collectVotes(
  text: string,
  registeredNumeros?: string[]
): ParsedCandidateVote[] {
  const map = new Map<string, number>();

  collectCandQtvo(text, map);
  collectTseNumericPairs(text, map);
  collectLineBasedPairs(text, map);

  if (registeredNumeros && registeredNumeros.length > 0) {
    collectRegisteredLookups(text, registeredNumeros, map);
    // Keep only registered numbers.
    const allowed = new Set(
      registeredNumeros.map(normalizeCandidateNumero).filter(Boolean)
    );
    for (const key of Array.from(map.keys())) {
      if (!allowed.has(key)) map.delete(key);
    }
  }

  return Array.from(map.entries()).map(([numero, quantidade]) => ({
    numero,
    quantidade,
  }));
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
  constructor(message: string) {
    super(message);
    this.name = "BuParseError";
  }
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
 * When `registeredNumeros` is provided, only those candidates are returned
 * (flexible zero-padding / word-boundary match).
 */
export function parseBuQrText(
  raw: string,
  options: ParseBuOptions = {}
): ParsedBu {
  if (raw == null || !String(raw).trim()) {
    throw new BuParseError(
      "Texto do BU vazio. Escaneie de novo, envie uma foto do QR ou use a aba Digitar."
    );
  }

  if (looksBinaryPayload(raw)) {
    const recovered = decodeBuPayloadStrategies(raw);
    if (looksBinaryPayload(recovered) || recovered.length < 8) {
      throw new BuParseError(
        "QR lido, mas o conteúdo parece binário/ilegível como texto. Tente Enviar foto do QR com boa luz ou use a aba Digitar (zona, seção e votos)."
      );
    }
    return parseBuQrText(recovered, options);
  }

  const text = decodeBuPayloadStrategies(raw);
  const registered = options.registeredNumeros;

  const zonaRaw = firstMatch(text, ZONA_PATTERNS);
  const secaoRaw = firstMatch(text, SECAO_PATTERNS);

  if (!zonaRaw) {
    throw new BuParseError(
      "Zona não encontrada no QR. Formatos aceitos: ZONA:001 ou Zona Eleitoral: 0001. Se falhar, use Digitar."
    );
  }
  if (!secaoRaw) {
    throw new BuParseError(
      "Seção não encontrada no QR. Formatos aceitos: SECA:0483, SECAO:0483 ou Seção Eleitoral: 0483. Se falhar, use Digitar."
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
          `QR lido, mas nenhum número cadastrado encontrado no boletim. Números cadastrados: ${list}. Use Digitar se o BU não listar esses candidatos.`
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
        ? { numero: normalizeCandidateNumero(match), quantidade: v.quantidade }
        : v;
    });
  } else {
    votes = allVotes;
    if (votes.length === 0) {
      throw new BuParseError(
        "Nenhum voto de candidato encontrado no QR. Formatos aceitos: 4545:11 (TSE), CAND:4545 QTVO:11, CANDIDATO:4545 VOTOS:11, ou linhas Nome 4545 0011. Se o QR for ilegível, use Digitar."
      );
    }
  }

  return {
    zona: normalizeDigits(zonaRaw, 3),
    secao: normalizeDigits(secaoRaw, 4),
    votes,
    rawText: text,
  };
}

/** Sample BU text for demos / paste fallback testing (cargos estaduais). */
export const SAMPLE_BU_TEXT = `ZONA:001
SECAO:0001
CAND:13 QTVO:142
CAND:45 QTVO:98
CAND:131 QTVO:110
CAND:456 QTVO:87
CAND:1313 QTVO:64
CAND:13131 QTVO:51
CAND:99999 QTVO:3`;

/** Official-style TSE QR sample (space-separated, numeric pairs). */
export const SAMPLE_TSE_QR_TEXT = `QRBU:1:1 ORIG:VOTA PROC:2000 DTPL:20181007 PLEI:2100 TURN:1 FASE:S UNFE:SP MUNI:71072 ZONA:247 SECA:123 IDUE:1760649 IDCA:529951844372447180336660 VERS:5.22.0.1 VRQR:4.0 LOCA:4 APTO:400 COMP:250 FALT:150 IDEL:2101 CARG:1 TIPO:0 VERC:20180901 17:103 13:89 NOMI:192 BRAN:3 NULO:5 TOTC:200 CARG:6 TIPO:1 VERC:20180901 PART:45 4545:11 45045:7 LEGP:0 TOTP:18 PART:11 111:4 222:2 LEGP:0 TOTP:6 NOMI:24 LEGC:0 BRAN:1 NULO:0 TOTC:25 CARG:3 TIPO:0 VERC:20180901 10:55 45:40 NOMI:95 BRAN:2 NULO:1 TOTC:98`;
