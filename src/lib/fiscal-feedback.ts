import { ZONA_FORA_DA_CIDADE } from "@/lib/zona-allowlist";

export type FiscalErrorKind =
  | "duplicate"
  | "zona"
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
  /** Compact part1 vs part2 line — never a wall of text. */
  debug?: string;
}

export const DUPLICATE_URNA_TITLE = "BU já enviada";

export function duplicateUrnaMessage(
  zona: string,
  secao: string,
  urnaId?: string | null
): string {
  const idue = urnaId?.trim();
  return idue
    ? `BU já enviada — zona ${zona} seção ${secao} · urna ${idue}.`
    : `BU já enviada — zona ${zona} seção ${secao}.`;
}

export function fiscalSuccessMessage(zona: string, secao: string): string {
  return `Zona ${zona} seção ${secao} enviada com sucesso. Vá para a próxima.`;
}

/** Idle screen returns after this delay on the success card. */
export const SUCCESS_CLEAR_MS = 4000;

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

export function waitingNextQrLabel(
  zona: string,
  secao: string,
  nextIndex = 2
): string {
  const z = zona?.trim() || "—";
  const s = secao?.trim() || "—";
  const n = Math.max(1, Math.floor(nextIndex) || 1);
  return `Falta o ${n}º QR · zona ${z} seção ${s}`;
}

export function waitingFirstQrLabel(): FiscalFeedback {
  return heldContinuationFeedback(2, 2);
}

/** QR 2+ arrived first (no zona on that part). Never say allowlist / Zona não encontrada. */
export function heldContinuationFeedback(index = 2, total = 2): FiscalFeedback {
  const i = Math.max(2, Math.floor(index) || 2);
  const t = Math.max(i, Math.floor(total) || i);
  return {
    kind: "incomplete_qr",
    title: `QR ${i} lido — filme o QR 1`,
    cause: "",
    nextStep: `O ${i}º QR de ${t} ficou guardado. Filme o QR de cima (zona e seção).`,
  };
}

/** Instant confirmation that the camera actually decoded a QR. */
export function qr1HeldNoZonaFeedback(index = 1, total = 2): FiscalFeedback {
  const i = Math.max(1, Math.floor(index) || 1);
  const t = Math.max(i, Math.floor(total) || i);
  return {
    kind: "incomplete_qr",
    title: t > 1 ? `QR ${i} lido — filme o outro QR` : "QR lido",
    cause: "",
    nextStep:
      "A zona não veio neste código. Filme o próximo QR. Se ainda faltar, escolha a zona no fim.",
  };
}

export function qrReadFeedback(index: number, total = 0): FiscalFeedback {
  const i = Math.max(1, Math.floor(index) || 1);
  const t = Math.max(i, Math.floor(total) || i);
  const next = i < t ? i + 1 : null;
  return {
    kind: "incomplete_qr",
    title: t > 1 ? `QR lido ${i}/${t}` : "QR lido",
    cause: "",
    nextStep: next
      ? `Filme ou escolha a foto do ${next}º QR desta urna.`
      : "QR aceito. Confira zona e seção se pedir.",
  };
}

export function leftoverUrnaFeedback(
  urnaId: string,
  qrLabel: string
): FiscalFeedback {
  const idue = urnaId.trim() || "sem IDUE";
  const qr = qrLabel.trim() || "QR";
  return {
    kind: "parse",
    title: "Sobrou outra urna",
    cause: "",
    nextStep: `IDUE ${idue} · ${qr} ficou de fora. Tire a foto que falta desta BU, ou comece a outra.`,
    debug: `IDUE ${idue} ${qr}`,
  };
}

export function unreadWhatsappPhotosFeedback(failed: number): FiscalFeedback {
  const n = Math.max(1, Math.floor(failed) || 1);
  return {
    kind: "parse",
    title: n === 1 ? "Foto sem QR" : `${n} fotos sem QR`,
    cause: "",
    nextStep: "Escolha de novo as fotos do WhatsApp, mais perto do QR.",
  };
}

export function waitingSecondQrLabel(zona: string, secao: string): string {
  return waitingNextQrLabel(zona, secao, 2);
}

export function incompleteQrFeedback(index: number, total: number): FiscalFeedback {
  const shownIndex = Math.max(1, index);
  const shownTotal = Math.max(shownIndex, total);
  const next = Math.min(shownIndex + 1, shownTotal);
  return {
    kind: "incomplete_qr",
    title: `Falta o ${next}º QR`,
    cause: "",
    nextStep: `Filme o ${next}º QR desta urna.`,
  };
}

export function duplicateFeedback(
  zona: string,
  secao: string,
  urnaId?: string | null
): FiscalFeedback {
  const idue = urnaId?.trim();
  return {
    kind: "duplicate",
    title: DUPLICATE_URNA_TITLE,
    cause: "",
    nextStep: idue
      ? `Zona ${zona} seção ${secao} · urna ${idue} já foi gravada. A outra urna desta seção pode entrar.`
      : `Zona ${zona} seção ${secao} já foi gravada. Próxima urna.`,
  };
}

export function zonaForaFeedback(zona?: string): FiscalFeedback {
  const z = zona?.trim();
  return {
    kind: "zona",
    title: ZONA_FORA_DA_CIDADE,
    cause: "",
    nextStep: z
      ? `Zona ${z} não entra. Filme uma urna de Santo André.`
      : "Filme uma urna de Santo André.",
  };
}

export function parseFeedback(cause: string, debug?: string): FiscalFeedback {
  return {
    kind: "parse",
    title: "QR não entrou",
    cause: "",
    nextStep: cause.trim() || "Leia de novo ou mande foto no WhatsApp da central.",
    debug: debug?.trim() || undefined,
  };
}

export function qrMismatchFeedback(debug: string): FiscalFeedback {
  return {
    kind: "parse",
    title: "QR não combina",
    cause: "",
    nextStep: "Filme o próximo QR desta mesma urna.",
    debug: debug.trim() || undefined,
  };
}

/** Only when IDUE / NR_UE of the new QR differs from the open set. */
export function wrongBuFeedback(debug: string): FiscalFeedback {
  return {
    kind: "parse",
    title: "BU errada",
    cause: "",
    nextStep: "Este QR é de outra urna (IDUE diferente). Filme o QR desta mesma BU.",
    debug: debug.trim() || undefined,
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
    nextStep: "Tente de novo ou mande foto no WhatsApp da central.",
  };
}

export function feedbackFromError(
  err: unknown,
  opts?: { zona?: string; secao?: string }
): FiscalFeedback {
  const message = err instanceof Error ? err.message : String(err ?? "Falha desconhecida.");
  if (/não é de Santo André/i.test(message)) {
    return zonaForaFeedback(opts?.zona);
  }
  if (/já enviada/i.test(message) && opts?.zona && opts?.secao) {
    return duplicateFeedback(opts.zona, opts.secao);
  }
  if (/já enviada|já cadastrada/i.test(message)) {
    return duplicateFeedback(opts?.zona ?? "—", opts?.secao ?? "—");
  }
  if (/outra urna/i.test(message)) {
    const debug =
      (err instanceof Error && "debug" in err
        ? String((err as { debug?: string }).debug ?? "")
        : "") || undefined;
    return wrongBuFeedback(debug ?? "");
  }
  if (/não combina/i.test(message)) {
    const debug =
      (err instanceof Error && "debug" in err
        ? String((err as { debug?: string }).debug ?? "")
        : "") || undefined;
    return qrMismatchFeedback(debug ?? "");
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
