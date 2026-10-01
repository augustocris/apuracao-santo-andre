import { hasWhatsappSuporte, whatsappHref } from "@/lib/fiscal-feedback";

export function buShareText(whatsapp?: string | null): string {
  const href = whatsappHref(whatsapp);
  if (href) {
    return `Foto do BU — Apuração Santo André. Central: ${href}`;
  }
  return "Foto do BU — Apuração Santo André. Peça o WhatsApp à central.";
}

export function fileForShare(file: File): File {
  const type = file.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const name = file.name?.trim() || `bu-santo-andre.${ext}`;
  return new File([file], name, { type, lastModified: file.lastModified });
}

export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (files.length === 0) return false;
  if (typeof navigator.canShare !== "function") {
    return true;
  }
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export type ShareBuPhotoResult = "shared" | "aborted" | "fallback";

/**
 * Share a BU photo via the OS sheet (WhatsApp with the file attached).
 * Never decodes the image as a QR.
 */
export async function shareBuPhoto(
  file: File,
  whatsapp?: string | null
): Promise<ShareBuPhotoResult> {
  const named = fileForShare(file);
  const payload: ShareData = {
    files: [named],
    text: buShareText(whatsapp),
  };
  if (!canShareFiles([named]) || typeof navigator.share !== "function") {
    return "fallback";
  }
  try {
    await navigator.share(payload);
    return "shared";
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") return "aborted";
    return "fallback";
  }
}

export function whatsappFallbackHref(whatsapp?: string | null): string | null {
  if (!hasWhatsappSuporte(whatsapp)) return null;
  return whatsappHref(whatsapp);
}
