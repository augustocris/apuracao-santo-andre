export type FiscalErrorKind =
  | "duplicate"
  | "incomplete_qr"
  | "parse"
  | "network"
  | "camera"
  | "server";

export interface FiscalFeedback {
  kind: FiscalErrorKind;
  title: string;
  cause: string;
  nextStep: string;
}

export const DUPLICATE_URNA_TITLE = "BU já enviada";

export function duplicateUrnaMessage(zona: string, secao: string): string {
  return `BU já enviada — zona ${zona} seção ${secao}.`;
}

export function fiscalSuccessMessage(zona: string, secao: string): string {
  return `BU zona ${zona} seção ${secao} enviada.`;
}

export function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|networkerror|network request|offline|err_internet|load failed|fetch failed|the internet connection|sem rede|timeout/i.test(
    message
  );
}

export function whatsappDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function whatsappHref(value: string | null | undefined): string | null {
  const digits = whatsappDigits(value);
  if (digits.length < 10) return null;
  const withDdi = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withDdi}`;
}

export function whatsappLabel(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || whatsappDigits(raw).length < 10) {
    return "peça o WhatsApp à central";
  }
  return raw;
}

export function hasWhatsappSuporte(value: string | null | undefined): boolean {
  return whatsappDigits(value).length >= 10;
}

export function incompleteQrFeedback(index: number, total: number): FiscalFeedback {
  const shownIndex = Math.max(1, index);
  const shownTotal = Math.max(shownIndex, total);
  return {
    kind: "incomplete_qr",
    title: `QR ${shownIndex} de ${shownTotal}`,
    cause: `Este boletim tem ${shownTotal} QRs. Ainda falta filmar o restante.`,
    nextStep: "Filme o próximo QR desta urna (mesma zona e seção). Não envie ainda.",
  };
}

export function duplicateFeedback(zona: string, secao: string): FiscalFeedback {
  return {
    kind: "duplicate",
    title: DUPLICATE_URNA_TITLE,
    cause: `A zona ${zona} seção ${secao} já foi gravada na central.`,
    nextStep: "Pode ir à próxima urna. Não é falha de câmera.",
  };
}

export function parseFeedback(cause: string): FiscalFeedback {
  return {
    kind: "parse",
    title: "QR não entrou",
    cause,
    nextStep: "Leia de novo. Se persistir, foto nítida do BU no WhatsApp da central.",
  };
}

export function networkFeedback(cause?: string): FiscalFeedback {
  return {
    kind: "network",
    title: "Sem rede",
    cause: cause?.trim() || "O servidor não confirmou o envio. A urna não foi marcada como enviada.",
    nextStep: "Espere a conexão e leia de novo. Se não voltar, mande foto do BU no WhatsApp.",
  };
}

export function serverFeedback(cause: string): FiscalFeedback {
  return {
    kind: "server",
    title: "Envio não confirmado",
    cause,
    nextStep: "Leia de novo. Se o erro continuar, WhatsApp da central.",
  };
}

export function cameraFeedback(cause: string): FiscalFeedback {
  return {
    kind: "camera",
    title: "Câmera",
    cause,
    nextStep: "Tente de novo, envie uma foto do QR, ou peça ajuda no WhatsApp da central.",
  };
}

export function feedbackFromError(
  err: unknown,
  opts?: { zona?: string; secao?: string }
): FiscalFeedback {
  const message = err instanceof Error ? err.message : String(err ?? "Falha desconhecida.");
  if (/já enviada/i.test(message) && opts?.zona && opts?.secao) {
    return duplicateFeedback(opts.zona, opts.secao);
  }
  if (/já enviada|já cadastrada/i.test(message)) {
    return duplicateFeedback(opts?.zona ?? "—", opts?.secao ?? "—");
  }
  if (/de \d+|incompleto|filme o próximo/i.test(message) && /QR/i.test(message)) {
    const m = message.match(/(\d+)\s+de\s+(\d+)/i);
    if (m) return incompleteQrFeedback(Number(m[1]), Number(m[2]));
  }
  if (isNetworkError(err)) {
    return networkFeedback(message);
  }
  return serverFeedback(message);
}
