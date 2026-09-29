import { CARGOS_CHAPADA, validarNumeroCargoChapada } from "@/lib/cargos";

export const CHAPADA_HINT =
  "Importe a lista oficial de Santo André (número, nome, cargo) para o ranking mostrar nomes. O QR costuma vir só com números.";

const CARGO_ALIASES: Record<string, (typeof CARGOS_CHAPADA)[number]> = {
  "deputado estadual": "Deputado Estadual",
  "dep estadual": "Deputado Estadual",
  "dep. estadual": "Deputado Estadual",
  "deputado federal": "Deputado Federal",
  "dep federal": "Deputado Federal",
  "dep. federal": "Deputado Federal",
  senador: "Senador",
  governador: "Governador",
  presidente: "Presidente",
};

export function normalizeCargoChapada(
  raw: string
): (typeof CARGOS_CHAPADA)[number] | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if ((CARGOS_CHAPADA as readonly string[]).includes(raw.trim())) {
    return raw.trim() as (typeof CARGOS_CHAPADA)[number];
  }
  return CARGO_ALIASES[key] ?? null;
}

export interface ChapadaRow {
  numero: string;
  nome: string;
  cargo: string;
}

export interface ParseChapadaResult {
  rows: ChapadaRow[];
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && /[,;|\t]/.test(ch)) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function rowFromParts(
  parts: string[],
  index: number,
  errors: string[]
): ChapadaRow | null {
  const numeroRaw = parts[0] ?? "";
  const nome = (parts[1] ?? "").trim();
  const cargoRaw = parts[2] ?? "";
  const cargo = normalizeCargoChapada(cargoRaw);
  if (!numeroRaw || !nome || !cargo) {
    errors.push(
      `Linha ${index}: informe numero, nome e cargo (${CARGOS_CHAPADA.join(", ")}).`
    );
    return null;
  }
  const validated = validarNumeroCargoChapada(cargo, numeroRaw);
  if (!validated.ok) {
    errors.push(`Linha ${index}: ${validated.message}`);
    return null;
  }
  return { numero: validated.numero, nome, cargo };
}

/** Parse CSV or JSON chapada (numero, nome, cargo). */
export function parseChapadaPayload(text: string): ParseChapadaResult {
  const trimmed = text.trim();
  const errors: string[] = [];
  if (!trimmed) {
    return { rows: [], errors: ["Arquivo vazio."] };
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const body = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(body)
        ? body
        : body && typeof body === "object" && Array.isArray((body as { candidatos?: unknown }).candidatos)
          ? (body as { candidatos: unknown[] }).candidatos
          : null;
      if (!list) {
        return {
          rows: [],
          errors: ["JSON inválido. Use um array ou { \"candidatos\": [...] }."],
        };
      }
      const rows: ChapadaRow[] = [];
      list.forEach((item, i) => {
        if (!item || typeof item !== "object") {
          errors.push(`Item ${i + 1}: objeto inválido.`);
          return;
        }
        const rec = item as Record<string, unknown>;
        const parsed = rowFromParts(
          [
            String(rec.numero ?? ""),
            String(rec.nome ?? ""),
            String(rec.cargo ?? ""),
          ],
          i + 1,
          errors
        );
        if (parsed) rows.push(parsed);
      });
      return { rows, errors };
    } catch {
      return { rows: [], errors: ["JSON inválido."] };
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines[0]?.toLowerCase() ?? "";
  const hasHeader =
    header.includes("numero") && (header.includes("nome") || header.includes("cargo"));
  const start = hasHeader ? 1 : 0;
  const rows: ChapadaRow[] = [];
  lines.slice(start).forEach((line, i) => {
    const parsed = rowFromParts(splitCsvLine(line), start + i + 1, errors);
    if (parsed) rows.push(parsed);
  });
  return { rows, errors };
}
