/** Cargos oficiais da apuração estadual (admin = fonte da verdade). */
export const CARGOS_OFICIAIS = [
  "Deputado Estadual",
  "Deputado Federal",
  "Senador",
  "Governador",
] as const;

/** Ordem de exibição no formulário manual do fiscal. */
export const CARGOS_FISCAL_ORDEM = [
  "Deputado Federal",
  "Deputado Estadual",
  "Senador",
  "Governador",
] as const;

export type CargoOficial = (typeof CARGOS_OFICIAIS)[number];

/** Quantidade esperada de candidatos por cargo no cadastro admin. */
export const CARGO_SLOTS: Record<CargoOficial, number> = {
  "Deputado Estadual": 1,
  "Deputado Federal": 1,
  Senador: 2,
  Governador: 1,
};

/** Regras de dígitos do número de urna por cargo. */
export const CARGO_DIGITOS: Record<CargoOficial, number> = {
  "Deputado Estadual": 5,
  "Deputado Federal": 4,
  Senador: 3,
  Governador: 2,
};

export const RELATORIO_OPCOES = [
  ...CARGOS_OFICIAIS,
  "todos",
] as const;

export type RelatorioOpcao = (typeof RELATORIO_OPCOES)[number];

export function isCargoOficial(cargo: string): cargo is CargoOficial {
  return (CARGOS_OFICIAIS as readonly string[]).includes(cargo);
}

export function digitosEsperados(cargo: string): number | null {
  if (!isCargoOficial(cargo)) return null;
  return CARGO_DIGITOS[cargo];
}

export function validarNumeroCargo(
  cargo: string,
  numero: string
): { ok: true; numero: string } | { ok: false; message: string } {
  const digits = numero.replace(/\D/g, "");
  const expected = digitosEsperados(cargo);
  if (expected == null) {
    return {
      ok: false,
      message: `Cargo inválido. Use: ${CARGOS_OFICIAIS.join(", ")}.`,
    };
  }
  if (digits.length !== expected) {
    return {
      ok: false,
      message: `${cargo} exige número com ${expected} dígitos (recebido: ${digits.length || 0}).`,
    };
  }
  return { ok: true, numero: digits };
}

export function labelCargoCurto(cargo: string): string {
  switch (cargo) {
    case "Deputado Estadual":
      return "Dep. Estadual";
    case "Deputado Federal":
      return "Dep. Federal";
    default:
      return cargo;
  }
}

export const DEFAULT_RELATORIO_CARGOS: CargoOficial[] = [...CARGOS_OFICIAIS];

/** TSE QR `CARG:n` codes (urna eletrônica). */
export const TSE_CARG_LABEL: Record<string, string> = {
  "1": "Presidente",
  "3": "Governador",
  "5": "Senador",
  "6": "Deputado Federal",
  "7": "Deputado Estadual",
  "8": "Deputado Distrital",
  "11": "Prefeito",
  "13": "Vereador",
};

const HEADER_CARGO_MAP: Array<{ re: RegExp; cargo: string }> = [
  { re: /DEPUTADO\s+ESTADUAL/i, cargo: "Deputado Estadual" },
  { re: /DEPUTADO\s+FEDERAL/i, cargo: "Deputado Federal" },
  { re: /DEPUTADO\s+DISTRITAL/i, cargo: "Deputado Distrital" },
  { re: /PRESIDENTE/i, cargo: "Presidente" },
  { re: /GOVERNADOR/i, cargo: "Governador" },
  { re: /SENADOR/i, cargo: "Senador" },
  { re: /PREFEITO/i, cargo: "Prefeito" },
  { re: /VEREADOR/i, cargo: "Vereador" },
];

export function cargoFromPrintedHeader(header: string): string | null {
  for (const { re, cargo } of HEADER_CARGO_MAP) {
    if (re.test(header)) return cargo;
  }
  return null;
}

export function cargoFromTseCarg(code: string): string | null {
  const digits = code.replace(/\D/g, "");
  return TSE_CARG_LABEL[digits] ?? null;
}

/**
 * Infer cargo from candidate number length when the BU section is unknown.
 * 2 = Governador, 3 = Senador, 4 = Deputado Federal, 5 = Deputado Estadual.
 */
export function inferCargoFromNumero(numero: string): string {
  const len = numero.replace(/\D/g, "").length;
  switch (len) {
    case 2:
      return "Governador";
    case 3:
      return "Senador";
    case 4:
      return "Deputado Federal";
    case 5:
      return "Deputado Estadual";
    default:
      return "Outro";
  }
}

export function resolveVoteCargo(
  numero: string,
  knownCargo?: string | null
): string {
  const known = knownCargo?.trim();
  if (known) return known;
  return inferCargoFromNumero(numero);
}

export function placeholderCandidateName(numero: string): string {
  return `Candidato ${numero}`;
}

/** Featured telão/CRUD rows. Missing origem (pre-004) counts as cadastro. */
export function isFeaturedCandidato(origem?: string | null): boolean {
  return origem !== "bu";
}

export const CONFIG_STORAGE_KEY = "apuracao-sa-relatorio-cargos";
