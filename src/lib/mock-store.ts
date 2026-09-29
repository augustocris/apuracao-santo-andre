import type {
  ApuracaoConfig,
  BoletimUrna,
  Candidato,
  LocalVotacao,
  ZonaConfigRow,
} from "@/lib/types";
import { CARGOS_OFICIAIS, DEFAULT_RELATORIO_CARGOS } from "@/lib/cargos";

/**
 * Seed demo data only for local demos.
 * Production (Vercel) never ships ghost seed candidatos — empty mock + MOCK banner.
 * Opt-in anytime with NEXT_PUBLIC_ALLOW_MOCK_SEED=true; opt-out in dev with =false.
 */
export function allowMockSeed(): boolean {
  const flag = process.env.NEXT_PUBLIC_ALLOW_MOCK_SEED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export const MOCK_CANDIDATOS: Candidato[] = [
  {
    id: "22222222-2222-2222-2222-222222222201",
    numero: "13",
    nome: "Maria Silva",
    cargo: "Governador",
    foto_url: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222202",
    numero: "45",
    nome: "João Santos",
    cargo: "Governador",
    foto_url: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222211",
    numero: "131",
    nome: "Carlos Oliveira",
    cargo: "Senador",
    foto_url: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222212",
    numero: "456",
    nome: "Patricia Lima",
    cargo: "Senador",
    foto_url: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222221",
    numero: "1313",
    nome: "Ana Costa",
    cargo: "Deputado Federal",
    foto_url: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222231",
    numero: "13131",
    nome: "Roberto Alves",
    cargo: "Deputado Estadual",
    foto_url: null,
  },
];

export const MOCK_LOCAIS: LocalVotacao[] = [
  {
    id: "loc-001-0001",
    zona: "001",
    secao: "0001",
    nome_escola: "EMEF Professora Maria Alice",
    bairro: "Centro",
  },
  {
    id: "loc-001-0002",
    zona: "001",
    secao: "0002",
    nome_escola: "EMEF Professora Maria Alice",
    bairro: "Centro",
  },
  {
    id: "loc-001-0003",
    zona: "001",
    secao: "0003",
    nome_escola: "EE Professor Anísio Teixeira",
    bairro: "Vila Assunção",
  },
  {
    id: "loc-002-0010",
    zona: "002",
    secao: "0010",
    nome_escola: "EMEF Doutor Américo Brasiliense",
    bairro: "Campestre",
  },
  {
    id: "loc-002-0011",
    zona: "002",
    secao: "0011",
    nome_escola: "EMEF Doutor Américo Brasiliense",
    bairro: "Campestre",
  },
  {
    id: "loc-003-0020",
    zona: "003",
    secao: "0020",
    nome_escola: "EE Doutor Celso Gallo",
    bairro: "Jardim",
  },
  {
    id: "loc-003-0021",
    zona: "003",
    secao: "0021",
    nome_escola: "EMEF Padre Anchieta",
    bairro: "Utinga",
  },
  {
    id: "loc-004-0030",
    zona: "004",
    secao: "0030",
    nome_escola: "EMEF Joaquim Nabuco",
    bairro: "Parque das Nações",
  },
  {
    id: "loc-004-0031",
    zona: "004",
    secao: "0031",
    nome_escola: "EE Fundação Salvador Arena",
    bairro: "Parque das Nações",
  },
  {
    id: "loc-005-0040",
    zona: "005",
    secao: "0040",
    nome_escola: "EMEF Walt Disney",
    bairro: "Bangu",
  },
];

const SEED_BOLETINS: BoletimUrna[] = [
  {
    id: "bu-seed-1",
    zona: "002",
    secao: "0010",
    candidato_id: "22222222-2222-2222-2222-222222222201",
    quantidade_votos: 120,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "bu-seed-2",
    zona: "002",
    secao: "0010",
    candidato_id: "22222222-2222-2222-2222-222222222202",
    quantidade_votos: 95,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "bu-seed-3",
    zona: "002",
    secao: "0010",
    candidato_id: "22222222-2222-2222-2222-222222222211",
    quantidade_votos: 88,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "bu-seed-4",
    zona: "002",
    secao: "0010",
    candidato_id: "22222222-2222-2222-2222-222222222221",
    quantidade_votos: 70,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
];

const useSeed = allowMockSeed();

const mockBoletins: BoletimUrna[] = useSeed
  ? SEED_BOLETINS.map((b) => ({ ...b }))
  : [];
const mockLocais: LocalVotacao[] = useSeed
  ? MOCK_LOCAIS.map((l) => ({ ...l }))
  : [];
const mockCandidatos: Candidato[] = useSeed
  ? MOCK_CANDIDATOS.map((c) => ({ ...c }))
  : [];

let mockConfig: ApuracaoConfig = {
  id: 1,
  secoes_esperadas: useSeed ? MOCK_LOCAIS.length : 0,
  relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
  zonas_config: useSeed
    ? [
        { zona: "001", secoes: 3 },
        { zona: "002", secoes: 2 },
        { zona: "003", secoes: 2 },
        { zona: "004", secoes: 2 },
        { zona: "005", secoes: 1 },
      ]
    : [],
  updated_at: new Date().toISOString(),
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeMock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMockLocais(): LocalVotacao[] {
  return mockLocais;
}

export function getMockCandidatos(): Candidato[] {
  return mockCandidatos;
}

export function getMockBoletins(): BoletimUrna[] {
  return [...mockBoletins].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getMockConfig(): ApuracaoConfig {
  return { ...mockConfig, zonas_config: [...mockConfig.zonas_config] };
}

export function setMockConfig(
  patch: Partial<
    Pick<ApuracaoConfig, "secoes_esperadas" | "relatorio_cargos" | "zonas_config">
  >
): ApuracaoConfig {
  mockConfig = {
    ...mockConfig,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  notify();
  return getMockConfig();
}

export function findMockLocal(
  zona: string,
  secao: string
): LocalVotacao | undefined {
  return mockLocais.find((l) => l.zona === zona && l.secao === secao);
}

export function upsertMockLocais(rows: Omit<LocalVotacao, "id">[]): number {
  let count = 0;
  for (const row of rows) {
    const existing = mockLocais.find(
      (l) => l.zona === row.zona && l.secao === row.secao
    );
    if (existing) {
      existing.nome_escola = row.nome_escola;
      existing.bairro = row.bairro;
    } else {
      mockLocais.push({
        id: `loc-${row.zona}-${row.secao}`,
        ...row,
      });
    }
    count += 1;
  }
  notify();
  return count;
}

export function replaceMockLocaisForZonas(
  zonas: ZonaConfigRow[],
  replaceExisting: boolean
): number {
  if (replaceExisting) {
    const zonaSet = new Set(zonas.map((z) => z.zona));
    for (let i = mockLocais.length - 1; i >= 0; i -= 1) {
      if (zonaSet.has(mockLocais[i].zona)) {
        mockLocais.splice(i, 1);
      }
    }
  }

  const rows: Omit<LocalVotacao, "id">[] = [];
  for (const z of zonas) {
    for (let i = 1; i <= z.secoes; i += 1) {
      const secao = String(i).padStart(4, "0");
      rows.push({
        zona: z.zona,
        secao,
        nome_escola: `Zona ${z.zona} · Seção ${secao}`,
        bairro: null,
      });
    }
  }
  return upsertMockLocais(rows);
}

export function upsertMockCandidatos(
  rows: Omit<Candidato, "id">[]
): number {
  let count = 0;
  for (const row of rows) {
    const existing = mockCandidatos.find(
      (c) => c.numero === row.numero && c.cargo === row.cargo
    );
    if (existing) {
      existing.nome = row.nome;
      existing.foto_url = row.foto_url;
    } else {
      mockCandidatos.push({
        id: crypto.randomUUID(),
        ...row,
      });
    }
    count += 1;
  }
  notify();
  return count;
}

export function updateMockCandidato(
  id: string,
  patch: Partial<Pick<Candidato, "numero" | "nome" | "cargo" | "foto_url">>
): Candidato | null {
  const existing = mockCandidatos.find((c) => c.id === id);
  if (!existing) return null;
  Object.assign(existing, patch);
  notify();
  return existing;
}

export function deleteMockCandidato(id: string): boolean {
  const idx = mockCandidatos.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  mockCandidatos.splice(idx, 1);
  notify();
  return true;
}

export function insertMockBoletins(
  rows: Array<{
    zona: string;
    secao: string;
    candidato_id: string;
    quantidade_votos: number;
    raw_text: string | null;
    fiscal_nome: string | null;
  }>
): { ok: true } | { ok: false; duplicate: true } {
  const zona = rows[0]?.zona;
  const secao = rows[0]?.secao;
  if (
    zona &&
    secao &&
    mockBoletins.some((b) => b.zona === zona && b.secao === secao)
  ) {
    return { ok: false, duplicate: true };
  }

  const now = new Date().toISOString();
  for (const row of rows) {
    mockBoletins.push({
      id: crypto.randomUUID(),
      created_at: now,
      ...row,
    });
  }
  notify();
  return { ok: true };
}

export function mockActiveRaceCandidatos(): Candidato[] {
  return mockCandidatos.filter((c) =>
    (CARGOS_OFICIAIS as readonly string[]).includes(c.cargo)
  );
}
