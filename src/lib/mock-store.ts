import type { BoletimUrna, Candidato, LocalVotacao } from "@/lib/types";

export const MOCK_CANDIDATOS: Candidato[] = [
  {
    id: "11111111-1111-1111-1111-111111111101",
    numero: "13",
    nome: "Maria Silva",
    cargo: "Prefeito",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111102",
    numero: "45",
    nome: "João Santos",
    cargo: "Prefeito",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111103",
    numero: "22",
    nome: "Ana Costa",
    cargo: "Prefeito",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111201",
    numero: "13001",
    nome: "Carlos Oliveira",
    cargo: "Vereador",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111202",
    numero: "45002",
    nome: "Patricia Lima",
    cargo: "Vereador",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111203",
    numero: "22003",
    nome: "Roberto Alves",
    cargo: "Vereador",
    foto_url: null,
  },
  {
    id: "11111111-1111-1111-1111-111111111204",
    numero: "15015",
    nome: "Fernanda Souza",
    cargo: "Vereador",
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

/** In-memory bulletin store for demos without Supabase credentials. */
const mockBoletins: BoletimUrna[] = [
  {
    id: "bu-seed-1",
    zona: "002",
    secao: "0010",
    candidato_id: "11111111-1111-1111-1111-111111111101",
    quantidade_votos: 120,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "bu-seed-2",
    zona: "002",
    secao: "0010",
    candidato_id: "11111111-1111-1111-1111-111111111102",
    quantidade_votos: 95,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "bu-seed-3",
    zona: "002",
    secao: "0010",
    candidato_id: "11111111-1111-1111-1111-111111111103",
    quantidade_votos: 40,
    raw_text: "SEED",
    fiscal_nome: "Demo",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
];

const mockLocais = [...MOCK_LOCAIS];
const mockCandidatos = [...MOCK_CANDIDATOS];
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
