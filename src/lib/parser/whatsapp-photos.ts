import type { ParsedBu } from "@/lib/types";
import {
  MAX_QR_PARTS,
  backfillQrSet,
  isQrSetComplete,
  markHeaderOnlyAsOpenSet,
  parseBuQrText,
  sameQrPayload,
} from "@/lib/parser/bu-qr";

/** One BU is 2–4 QRs; allow extras when two urnas landed in the same pick. */
export const MAX_WHATSAPP_PHOTOS = 12;

export function urnaGroupKey(part: ParsedBu): string {
  if (part.urnaId?.trim()) return `id:${part.urnaId.trim()}`;
  if (part.zona && part.secao) return `zs:${part.zona}:${part.secao}`;
  return "unknown";
}

export function parseWhatsappPhotoQr(raw: string): ParsedBu {
  const parsed = parseBuQrText(raw, {
    allowMissingZonaSecao: true,
    allowEmptyVotes: true,
  });
  const hasBu =
    Boolean(parsed.urnaId) ||
    Boolean(parsed.zona && parsed.secao) ||
    Boolean(parsed.qrIndex) ||
    parsed.votes.length > 0;
  if (!hasBu) {
    throw new Error("QR sem dados de BU.");
  }
  return markHeaderOnlyAsOpenSet(parsed);
}

export type WhatsappPhotoBatch = {
  primary: ParsedBu[];
  leftover: ParsedBu[];
  failed: number;
  read: number;
};

function dedupeParts(parts: ParsedBu[]): ParsedBu[] {
  const out: ParsedBu[] = [];
  for (const part of parts) {
    if (out.some((p) => sameQrPayload(p.rawText, part.rawText))) continue;
    if (part.qrIndex) {
      const idx = out.findIndex((p) => p.qrIndex === part.qrIndex);
      if (idx >= 0) {
        out[idx] = part;
        continue;
      }
    }
    out.push(part);
  }
  return backfillQrSet(out);
}

function scoreGroup(parts: ParsedBu[]): number {
  let score = parts.length * 10;
  if (isQrSetComplete(parts)) score += 100;
  if (parts.some((p) => p.zona && p.secao)) score += 40;
  if (parts.some((p) => p.urnaId)) score += 10;
  return score;
}

function attachUnknowns(
  groups: Map<string, ParsedBu[]>,
  unknowns: ParsedBu[]
): void {
  for (const part of unknowns) {
    if (groups.size === 1) {
      const only = [...groups.keys()][0];
      groups.get(only)!.push(part);
      continue;
    }
    let attached = false;
    if (part.qrIndex) {
      for (const list of groups.values()) {
        if (!list.some((p) => p.qrIndex === part.qrIndex)) {
          list.push(part);
          attached = true;
          break;
        }
      }
    }
    if (!attached) {
      const list = groups.get("unknown") ?? [];
      list.push(part);
      groups.set("unknown", list);
    }
  }
}

export function assembleWhatsappPhotos(
  texts: string[],
  openParts: ParsedBu[] = []
): WhatsappPhotoBatch {
  const parsed: ParsedBu[] = [];
  let failed = 0;
  for (const raw of texts.slice(0, MAX_WHATSAPP_PHOTOS)) {
    if (!String(raw ?? "").trim()) {
      failed += 1;
      continue;
    }
    try {
      parsed.push(parseWhatsappPhotoQr(raw));
    } catch {
      failed += 1;
    }
  }

  const groups = new Map<string, ParsedBu[]>();
  const unknowns: ParsedBu[] = [];
  for (const part of parsed) {
    const key = urnaGroupKey(part);
    if (key === "unknown") {
      unknowns.push(part);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(part);
    groups.set(key, list);
  }
  attachUnknowns(groups, unknowns);

  const filled = [...groups.entries()].map(([key, parts]) => ({
    key,
    parts: dedupeParts(parts),
  }));

  if (filled.length === 0) {
    return {
      primary: dedupeParts(openParts),
      leftover: [],
      failed,
      read: 0,
    };
  }

  const openKey = openParts.length
    ? urnaGroupKey(
        openParts.find((p) => p.urnaId) ??
          openParts.find((p) => p.zona && p.secao) ??
          openParts[0]
      )
    : "";

  if (openParts.length > 0 && openKey && openKey !== "unknown") {
    const match = filled.find((g) => g.key === openKey);
    if (match) {
      return {
        primary: dedupeParts([...openParts, ...match.parts]).slice(0, MAX_QR_PARTS),
        leftover: filled.filter((g) => g !== match).flatMap((g) => g.parts),
        failed,
        read: parsed.length,
      };
    }
    return {
      primary: dedupeParts(openParts).slice(0, MAX_QR_PARTS),
      leftover: filled.flatMap((g) => g.parts),
      failed,
      read: parsed.length,
    };
  }

  const ranked = filled
    .slice()
    .sort((a, b) => scoreGroup(b.parts) - scoreGroup(a.parts));
  const primaryEntry = ranked[0];
  return {
    primary: primaryEntry.parts.slice(0, MAX_QR_PARTS),
    leftover: ranked.slice(1).flatMap((g) => g.parts),
    failed,
    read: parsed.length,
  };
}

export function leftoverUrnaSummary(parts: ParsedBu[]): {
  urnaId: string;
  qrLabel: string;
} {
  const urnaId = parts.find((p) => p.urnaId)?.urnaId?.trim() || "sem IDUE";
  const indexes = parts
    .map((p) => p.qrIndex)
    .filter((n): n is number => typeof n === "number" && n >= 1)
    .sort((a, b) => a - b);
  const total = parts.reduce((max, p) => Math.max(max, p.qrTotal ?? 0), 0);
  const qrLabel =
    indexes.length === 0
      ? "QR"
      : total
        ? `QR ${indexes.join("+")}/${total}`
        : `QR ${indexes.join("+")}`;
  return { urnaId, qrLabel };
}
