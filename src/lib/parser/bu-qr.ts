import type { ParsedBu, ParsedCandidateVote } from "@/lib/types";

const ZONA_RE = /ZONA\s*:\s*(\d+)/i;
const SECAO_RE = /SEC(?:A|AO|ÇÃO|CAO)\s*:\s*(\d+)/i;
const VOTE_RE =
  /CAND(?:IDATO)?\s*:\s*(\d+)\s+QT(?:VO|VOTOS)?\s*:\s*(\d+)/gi;
const VOTE_ALT_RE =
  /CANDIDATO\s*:\s*(\d+)\s+VOTOS\s*:\s*(\d+)/gi;

function normalizeDigits(value: string, pad = 0): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  return pad > 0 ? digits.padStart(pad, "0") : digits;
}

function collectVotes(text: string): ParsedCandidateVote[] {
  const map = new Map<string, number>();

  for (const re of [VOTE_RE, VOTE_ALT_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const numero = normalizeDigits(match[1]);
      const quantidade = Number.parseInt(match[2], 10);
      if (!numero || Number.isNaN(quantidade)) continue;
      map.set(numero, quantidade);
    }
  }

  return Array.from(map.entries()).map(([numero, quantidade]) => ({
    numero,
    quantidade,
  }));
}

/**
 * Parses TSE-style BU QR payload (`Chave:Valor` lines).
 * Supports ZONA, SECA/SECAO, and CAND/QTVO or CANDIDATO/VOTOS pairs.
 */
export function parseBuQrText(raw: string): ParsedBu {
  const text = raw.trim();
  if (!text) {
    throw new Error("Texto do BU vazio. Cole ou escaneie o QR novamente.");
  }

  const zonaMatch = text.match(ZONA_RE);
  const secaoMatch = text.match(SECAO_RE);

  if (!zonaMatch) {
    throw new Error("Zona não encontrada no QR. Verifique o texto do BU.");
  }
  if (!secaoMatch) {
    throw new Error("Seção não encontrada no QR. Verifique o texto do BU.");
  }

  const votes = collectVotes(text);
  if (votes.length === 0) {
    throw new Error(
      "Nenhum voto de candidato encontrado. Formato esperado: CAND:<n> QTVO:<n>."
    );
  }

  return {
    zona: normalizeDigits(zonaMatch[1], 3),
    secao: normalizeDigits(secaoMatch[1], 4),
    votes,
    rawText: text,
  };
}

/** Sample BU text for demos / paste fallback testing. */
export const SAMPLE_BU_TEXT = `ZONA:001
SECAO:0001
CAND:13 QTVO:142
CAND:45 QTVO:98
CAND:22 QTVO:41
CAND:13001 QTVO:55
CAND:45002 QTVO:33
CAND:22003 QTVO:21
CAND:15015 QTVO:18`;
