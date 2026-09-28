export type Cargo = "Prefeito" | "Vereador" | string;

export interface LocalVotacao {
  id: string;
  zona: string;
  secao: string;
  nome_escola: string;
  bairro: string | null;
}

export interface Candidato {
  id: string;
  numero: string;
  nome: string;
  cargo: Cargo;
  foto_url: string | null;
}

export interface BoletimUrna {
  id: string;
  zona: string;
  secao: string;
  candidato_id: string;
  quantidade_votos: number;
  raw_text: string | null;
  fiscal_nome: string | null;
  created_at: string;
}

export interface ParsedCandidateVote {
  numero: string;
  quantidade: number;
}

export interface ParsedBu {
  zona: string;
  secao: string;
  votes: ParsedCandidateVote[];
  rawText: string;
}

export interface ConfirmVoteRow {
  candidato: Candidato;
  quantidade: number;
}

export interface RankingRow {
  candidato: Candidato;
  votos: number;
  percentual: number;
}

export interface FeedItem {
  id: string;
  created_at: string;
  zona: string;
  secao: string;
  escola: string;
  totalVotos: number;
  fiscal_nome: string | null;
}

export interface DashboardSnapshot {
  totalSecoes: number;
  urnasApuradas: number;
  totalVotosValidos: number;
  rankings: RankingRow[];
  feed: FeedItem[];
  mode: "supabase" | "mock";
}

export interface TransmitPayload {
  zona: string;
  secao: string;
  rawText: string;
  fiscalNome?: string;
  votes: Array<{ candidatoId: string; quantidade: number }>;
}
