import {
  looksLikeTseBuQr,
  parseQrbuMeta,
  peekZonaSecao,
  sameQrPayload,
} from "@/lib/parser/bu-qr";

export type QrCropRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Two stacked BU QRs on the thermal print (01/02 on top, 02/02 below). */
export function stackedQrCropRects(
  width: number,
  height: number
): QrCropRect[] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const topH = Math.max(80, Math.floor(h * 0.55));
  const bottomY = Math.floor(h * 0.45);
  const half = Math.max(80, Math.floor(h * 0.5));
  const insetX = Math.floor(w * 0.08);
  const insetW = Math.max(80, Math.floor(w * 0.84));
  const insetH = Math.max(80, Math.floor(h * 0.42));
  return [
    { id: "full", x: 0, y: 0, width: w, height: h },
    { id: "top", x: 0, y: 0, width: w, height: topH },
    { id: "bottom", x: 0, y: bottomY, width: w, height: Math.max(80, h - bottomY) },
    { id: "topHalf", x: 0, y: 0, width: w, height: half },
    { id: "bottomHalf", x: 0, y: Math.floor(h * 0.5), width: w, height: Math.max(80, h - Math.floor(h * 0.5)) },
    { id: "topInset", x: insetX, y: Math.floor(h * 0.08), width: insetW, height: insetH },
    { id: "bottomInset", x: insetX, y: Math.floor(h * 0.5), width: insetW, height: insetH },
  ];
}

export function qrPartPreferenceScore(raw: string): number {
  const text = String(raw ?? "");
  if (!looksLikeTseBuQr(text)) return -100;
  const meta = parseQrbuMeta(text);
  const peek = peekZonaSecao(text);
  let score = 10;
  if (peek.zona) score += 100;
  if (peek.secao) score += 40;
  if (meta?.index === 1) score += 80;
  if (meta && meta.index > 1) score -= 25;
  return score;
}

export function hasFirstOrZonaQr(texts: string[]): boolean {
  return texts.some((raw) => {
    if (!looksLikeTseBuQr(raw)) return false;
    const peek = peekZonaSecao(raw);
    if (peek.zona) return true;
    const meta = parseQrbuMeta(raw);
    return meta?.index === 1;
  });
}

export function uniqueQrTexts(texts: string[]): string[] {
  const out: string[] = [];
  for (const raw of texts) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    if (out.some((prev) => sameQrPayload(prev, text))) continue;
    out.push(text);
  }
  return out;
}

/** Keep every BU QR; put SEQL 01 / zona first so ingest does not choke on 02/02. */
export function preferFirstOrZonaQr(texts: string[]): string[] {
  return uniqueQrTexts(texts)
    .filter((raw) => looksLikeTseBuQr(raw))
    .sort((a, b) => qrPartPreferenceScore(b) - qrPartPreferenceScore(a));
}
