export type Cargo =
  | "Governador"
  | "Senador"
  | "Deputado Federal"
  | "Deputado Estadual"
  | "Prefeito"
  | "Vereador"
  | string;

export interface LocalVotacao {
  id: string;
  zona: string;
  secao: string;
  nome_escola: string;
  bairro: string | null;
}

export type CandidatoOrigem = "cadastro" | "catalogo" | "bu";

export interface Candidato {
  id: string;
  numero: string;
  nome: string;
  cargo: Cargo;
  foto_url: string | null;
  /** TSE SQ_CANDIDATO — opcional, para casar fotos de urna pelo filename. */
  sq_candidato?: string | null;
  /** cadastro = telão; catalogo = chapada da cidade; bu = descoberto no scan. */
  origem?: CandidatoOrigem | null;
  /** Marcado no ranking do /chefe. Não altera o telão. */
  favorito?: boolean | null;
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

export interface ZonaConfigRow {
  zona: string;
  secoes: number;
}

export interface ApuracaoConfig {
  id: number;
  secoes_esperadas: number;
  relatorio_cargos: string[];
  zonas_config: ZonaConfigRow[];
  updated_at: string;
  /** Light PIN for /chefe. Missing → default andre2026. */
  chefe_pin?: string | null;
  /** WhatsApp da central. Empty → “peça o WhatsApp à central”. */
  whatsapp_suporte?: string | null;
}

export interface ParsedCandidateVote {
  numero: string;
  quantidade: number;
  nome: string;
  cargo: string;
}

export interface ParsedBu {
  zona: string;
  secao: string;
  votes: ParsedCandidateVote[];
  rawText: string;
  /** TSE QRBU / SEQL / ORQR index when present. */
  qrIndex?: number;
  qrTotal?: number;
  /** TSE HASH — same urna across QR parts. */
  urnaHash?: string | null;
  /** TSE IDUE / IDCA when HASH is absent. */
  urnaId?: string | null;
  /** TSE COMP:n when present. */
  comparecimento?: number | null;
}

export type BuPendenteStatus = "pendente" | "reprocessado";

export interface BuPendente {
  id: string;
  raw_text: string;
  erro: string;
  status: BuPendenteStatus;
  zona: string | null;
  secao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfirmVoteRow {
  candidato: Candidato;
  quantidade: number;
}

/** Vote for a candidate not (yet) in the featured cadastro. */
export interface DiscoveredVote {
  numero: string;
  nome: string;
  cargo: string;
  quantidade: number;
}

export interface RankingRow {
  candidato: Candidato;
  votos: number;
  percentual: number;
}

export interface CargoRanking {
  cargo: string;
  rankings: RankingRow[];
  totalVotos: number;
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
  secoesEsperadas: number;
  urnasApuradas: number;
  secoesFaltam: number;
  totalVotosValidos: number;
  /** Flat rankings for the first/primary cargo (compat). */
  rankings: RankingRow[];
  rankingsByCargo: CargoRanking[];
  /** All candidates (cadastro + bu) grouped by cargo, votes desc. */
  rankingGeralByCargo: CargoRanking[];
  relatorioCargos: string[];
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

export interface TransmitBuCompletoVote {
  numero: string;
  nome: string;
  cargo: string;
  quantidade: number;
  candidatoId?: string;
}

export interface TransmitBuCompletoPayload {
  zona: string;
  secao: string;
  rawText: string;
  fiscalNome?: string;
  votes: TransmitBuCompletoVote[];
}
