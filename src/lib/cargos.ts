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

/** Confirmação do scan: inclui Presidente (não entra no Digitar/telão). */
export const CARGOS_CONFIRM_ORDEM = [
  ...CARGOS_FISCAL_ORDEM,
  "Presidente",
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

/** 2-digit numbers without a section header / CARG tag (Presidente vs Governador). */
export const CARGO_INDEFINIDO = "Indefinido";

/** Filters on /chefe (telão 5 cards stay CARGOS_OFICIAIS only). */
export const CARGOS_CHEFE_FILTRO = [
  "todos",
  "Deputado Estadual",
  "Deputado Federal",
  "Senador",
  "Governador",
  "Presidente",
  CARGO_INDEFINIDO,
] as const;

export const CARGOS_RANKING_ORDEM = [
  ...CARGOS_OFICIAIS,
  "Presidente",
] as const;

export const CARGOS_TAG_OPTIONS = [
  "Presidente",
  "Governador",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
] as const;

export const DEFAULT_CHEFE_PIN = "andre2026";
export const CHEFE_UNLOCK_KEY = "apuracao-sa-chefe-unlock";

export function resolveChefePin(configPin?: string | null): string {
  const env = process.env.NEXT_PUBLIC_CHEFE_PIN?.trim();
  if (env) return env;
  if (configPin?.trim()) return configPin.trim();
  return DEFAULT_CHEFE_PIN;
}

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
  { re: /DEPUTADO\s*ESTADUAL/i, cargo: "Deputado Estadual" },
  { re: /DEPUTADO\s*FEDERAL/i, cargo: "Deputado Federal" },
  { re: /DEPUTADO\s*DISTRITAL/i, cargo: "Deputado Distrital" },
  { re: /PRESIDENTE/i, cargo: "Presidente" },
  { re: /GOVERNADOR/i, cargo: "Governador" },
  { re: /SENADOR/i, cargo: "Senador" },
  { re: /PREFEITO/i, cargo: "Prefeito" },
  { re: /VEREADOR/i, cargo: "Vereador" },
];

export function cargoFromPrintedHeader(header: string): string | null {
  let best: { cargo: string; index: number } | null = null;
  for (const { re, cargo } of HEADER_CARGO_MAP) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = global.exec(header)) !== null) {
      if (!best || m.index >= best.index) {
        best = { cargo, index: m.index };
      }
    }
  }
  return best?.cargo ?? null;
}

export function cargoFromTseCarg(code: string): string | null {
  const digits = code.replace(/\D/g, "");
  return TSE_CARG_LABEL[digits] ?? null;
}

/**
 * TSE digit-length hint only — never used to assign cargo.
 * Presidente and Governador both use 2 digits; without a banner the cargo is Indefinido.
 */
export function inferCargoFromNumero(numero: string): string {
  const len = numero.replace(/\D/g, "").length;
  switch (len) {
    case 2:
      return CARGO_INDEFINIDO;
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

/** Cargo comes from section banners / CARG tags only — never from digit length. */
export function resolveVoteCargo(
  _numero: string,
  knownCargo?: string | null
): string {
  const known = knownCargo?.trim();
  if (known) return known;
  return CARGO_INDEFINIDO;
}

export function placeholderCandidateName(numero: string): string {
  return `Candidato ${numero}`;
}

export const CARGOS_CHAPADA = [
  "Deputado Estadual",
  "Deputado Federal",
  "Senador",
  "Governador",
  "Presidente",
] as const;

export type CargoChapada = (typeof CARGOS_CHAPADA)[number];

export const CARGO_DIGITOS_CHAPADA: Record<CargoChapada, number> = {
  ...CARGO_DIGITOS,
  Presidente: 2,
};

/** Strip non-digits and leading zeros (keep at least one digit). Unique key with cargo. */
export function normalizeChapadaNumero(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

export function validarNumeroCargoChapada(
  cargo: string,
  numero: string
): { ok: true; numero: string } | { ok: false; message: string } {
  const digits = normalizeChapadaNumero(numero);
  const expected =
    (CARGO_DIGITOS_CHAPADA as Record<string, number>)[cargo] ?? null;
  if (expected == null) {
    return {
      ok: false,
      message: `Cargo inválido. Use: ${CARGOS_CHAPADA.join(", ")}.`,
    };
  }
  if (!digits || digits.length !== expected) {
    return {
      ok: false,
      message: `${cargo} exige número com ${expected} dígitos (recebido: ${digits.length || 0}).`,
    };
  }
  return { ok: true, numero: digits };
}

/** Telão 5 cards: só origem=cadastro (ausência pre-004 conta como cadastro). */
export function isFeaturedCandidato(origem?: string | null): boolean {
  return origem == null || origem === "" || origem === "cadastro";
}

export function origemLabel(origem?: string | null): string {
  if (origem === "catalogo") return "catálogo";
  if (origem === "bu") return "BU";
  return "oficial";
}

export const CONFIG_STORAGE_KEY = "apuracao-sa-relatorio-cargos";
