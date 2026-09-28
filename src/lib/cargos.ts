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

export const CONFIG_STORAGE_KEY = "apuracao-sa-relatorio-cargos";
