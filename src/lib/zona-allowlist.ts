import type { ZonaConfigRow } from "@/lib/types";

/** Extra safety when `apuracao_config.zonas_config` is empty. */
export const SANTO_ANDRE_ZONAS_FALLBACK: ZonaConfigRow[] = [
  { zona: "383", secoes: 304 },
  { zona: "307", secoes: 280 },
  { zona: "306", secoes: 290 },
  { zona: "264", secoes: 240 },
  { zona: "263", secoes: 307 },
  { zona: "156", secoes: 323 },
];

export const ZONA_FORA_DA_CIDADE = "Zona não é de Santo André";

/** Digit run without leading zeros so `383` === `0383`. */
export function zonaAllowlistKey(zona: string | null | undefined): string {
  const digits = String(zona ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

/**
 * If cadastro has zones, those are the allowlist.
 * Empty/missing config → the 6 Santo André zones.
 */
export function allowlistZonaKeys(
  zonasConfig?: ZonaConfigRow[] | null
): string[] {
  const fromConfig = (Array.isArray(zonasConfig) ? zonasConfig : [])
    .map((row) => zonaAllowlistKey(row.zona))
    .filter(Boolean);
  const source =
    fromConfig.length > 0
      ? fromConfig
      : SANTO_ANDRE_ZONAS_FALLBACK.map((row) => zonaAllowlistKey(row.zona));
  return [...new Set(source)];
}

/**
 * Any seção is accepted when the zona is on the list.
 * Does not check sequential numbers or seção ≤ count (zona 383 has gaps / 401).
 */
export function isZonaAllowed(
  zona: string | null | undefined,
  zonasConfig?: ZonaConfigRow[] | null
): boolean {
  const key = zonaAllowlistKey(zona);
  if (!key) return false;
  return allowlistZonaKeys(zonasConfig).includes(key);
}

/** True when the QR already named a zona that is outside Santo André. */
export function isZonaForaDaCidade(
  zona: string | null | undefined,
  zonasConfig?: ZonaConfigRow[] | null
): boolean {
  const key = zonaAllowlistKey(zona);
  if (!key) return false;
  return !isZonaAllowed(zona, zonasConfig);
}
