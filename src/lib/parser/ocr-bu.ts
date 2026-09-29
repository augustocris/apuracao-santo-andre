/**
 * OCR / glued-word normalization for printed TSE Boletins de Urna.
 * Official dumps often lose spaces (`ZonaEleitoral`) and mangle ç/ã (`Sec¸˜ ao`).
 */

/** Strip combining marks and common scanner leftovers so `Seção` → `Secao`. */
export function foldOcrLatin(text: string): string {
  return String(text)
    .replace(/c[¸,]?\s*[˜~]?\s*oes/gi, "coes")
    .replace(/c[¸,]?\s*[˜~]?\s*ao/gi, "cao")
    .replace(/[˜~]\s*/g, "")
    .replace(/[´'`^¨¸]\s*/g, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

const GLUED_PHRASES: Array<[RegExp, string]> = [
  [/ZonaEleitoral/gi, "Zona Eleitoral"],
  [/LocaldeVotacao/gi, "Local de Votacao"],
  [/SecaoEleitoral/gi, "Secao Eleitoral"],
  [/DEPUTADOFEDERAL/gi, "DEPUTADO FEDERAL"],
  [/DEPUTADOESTADUAL/gi, "DEPUTADO ESTADUAL"],
  [/DEPUTADODISTRITAL/gi, "DEPUTADO DISTRITAL"],
  [/Votosdelegenda/gi, "Votos de legenda"],
  [/Totaldopartido/gi, "Total do partido"],
  [/Eleitoresaptos/gi, "Eleitores Aptos"],
  [/Eleitoresfaltosos/gi, "Eleitores faltosos"],
  [/TotaldevotosNominais/gi, "Total de votos Nominais"],
  [/TotaldevotosdeLegenda/gi, "Total de votos de Legenda"],
  [/TotalApurado/gi, "Total Apurado"],
  [/CodigoVerificador/gi, "Codigo Verificador"],
  [/Codigoidentificacao(?:da)?UE/gi, "Codigo identificacao UE"],
  [/Codigodeidentificacaodacarga/gi, "Codigo de identificacao da carga"],
  [/Naohavotosnominais/gi, "Nao ha votos nominais"],
  [/Nomedocandidato/gi, "Nome do candidato"],
  [/NumcandVotos/gi, "Num cand Votos"],
  [/Numcand/gi, "Num cand"],
  [/DatadeaberturadaUE/gi, "Data de abertura da UE"],
  [/Horariodeabertura/gi, "Horario de abertura"],
  [/DatadefechamentodaUE/gi, "Data de fechamento da UE"],
  [/Horariodefechamento/gi, "Horario de fechamento"],
  [/BoletimdeUrna/gi, "Boletim de Urna"],
  [/TribunalRegionalEleitoral/gi, "Tribunal Regional Eleitoral"],
  [/JusticaEleitoral/gi, "Justica Eleitoral"],
  [/EleicoesGeraisEstaduais/gi, "Eleicoes Gerais Estaduais"],
  [/EleicaoGeralFederal/gi, "Eleicao Geral Federal"],
  [/Eleitoresfaltosos/gi, "Eleitores faltosos"],
  [/Comparecimento/gi, "Comparecimento"],
  [/Habilitadosporanonascimento/gi, "Habilitados por ano nascimento"],
  [/RESUMODACORRESPONDENCIA/gi, "RESUMO DA CORRESPONDENCIA"],
];

/** Insert spaces in TSE glued labels and `1de2` QR banners. */
export function splitGluedBuWords(text: string): string {
  let out = text;
  for (const [re, replacement] of GLUED_PHRASES) {
    out = out.replace(re, replacement);
  }
  out = out.replace(/(\d)\s*de\s*(\d)/gi, "$1 de $2");
  out = out.replace(/(\d)de(\d)/gi, "$1 de $2");
  return out;
}

export function normalizePrintedBuText(text: string): string {
  return splitGluedBuWords(foldOcrLatin(text));
}

const CARGO_BANNER_WORD =
  /DEPUTADO\s*ESTADUAL|DEPUTADO\s*FEDERAL|DEPUTADO\s*DISTRITAL|PRESIDENTE|GOVERNADOR|SENADOR|PREFEITO|VEREADOR/i;

/** True when the line is a cargo section banner (not the mesário signature block). */
export function isCargoBannerLine(line: string): boolean {
  const folded = normalizePrintedBuText(line);
  if (/assinatura|mesario|fiscais?:/i.test(folded)) return false;
  if (!CARGO_BANNER_WORD.test(folded)) return false;
  if (/-{3,}|={3,}|SIMULADO/i.test(folded)) return true;
  const compact = folded.replace(/[\s_=-]+/g, "");
  return /^(DEPUTADOESTADUAL|DEPUTADOFEDERAL|DEPUTADODISTRITAL|PRESIDENTE|GOVERNADOR|SENADOR|PREFEITO|VEREADOR)$/i.test(
    compact
  );
}

const SKIP_PREFIX_RE =
  /^(partido|votos\s*de\s*legenda|total\s*do\s*partido|eleitores\s*aptos|total\s*de\s*votos|brancos|nulos|total\s*apurado|codigo\s*verificador|codigo\s*identificacao|codigo\s*de\s*identificacao|comparecimento|eleitores\s*faltosos|habilitados|municipio|local\s*de\s*votacao|nome\s*do\s*candidato|num\s*cand|assinatura|mesarios|fiscais|justica|tribunal|boletim|eleicao|eleicoes|turno|resumo|ver\s*:|www\.|a\s+partir|data\s+de|horario\s+de|integracao|simulado)/i;

export function isSkippableBuLine(line: string): boolean {
  const folded = normalizePrintedBuText(line).replace(/[-_=]+/g, " ").trim();
  if (!folded) return true;
  if (/nao\s*ha\s*votos\s*nominais/i.test(folded)) return true;
  if (SKIP_PREFIX_RE.test(folded)) return true;
  if (/^partido\s*:?\s*\d+/i.test(folded)) return true;
  return false;
}
