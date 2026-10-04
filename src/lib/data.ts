import {
  deleteMockCandidato,
  deleteMockChefe,
  findMockLocal,
  getMockBoletins,
  getMockCandidatos,
  getMockChefeFavoritoIds,
  getMockChefes,
  getMockConfig,
  getMockLocais,
  getMockPendentes,
  insertMockBoletins,
  insertMockChefe,
  insertMockPendente,
  markMockPendenteReprocessado,
  replaceMockLocaisForZonas,
  setMockChefeFavorito,
  setMockConfig,
  subscribeMock,
  updateMockCandidato,
  updateMockPendenteErro,
  upsertMockCandidatos,
  upsertMockLocais,
} from "@/lib/mock-store";
import { duplicateUrnaMessage } from "@/lib/fiscal-feedback";
import { ZONA_FORA_DA_CIDADE, isZonaAllowed } from "@/lib/zona-allowlist";
import {
  CARGO_INDEFINIDO,
  CARGOS_OFICIAIS,
  CARGOS_RANKING_ORDEM,
  DEFAULT_CHEFE_NOME,
  DEFAULT_CHEFE_PIN,
  DEFAULT_RELATORIO_CARGOS,
  resolveChefePin,
  canonicalCargoLabel,
  isFeaturedCandidato,
  placeholderCandidateName,
  resolveVoteCargo,
  validarNumeroCargo,
  validarNumeroCargoChapada,
  normalizeChapadaNumero,
} from "@/lib/cargos";
import {
  normalizeCandidateNumero,
  normalizeSecao,
  normalizeZona,
} from "@/lib/parser/bu-qr";
import { normalizeSqCandidato } from "@/lib/chapada";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";
import { pinMatchesAdmin } from "@/lib/admin-pin";
import { buildBusRecebidasReport } from "@/lib/bus-recebidas";
import {
  CATALOG_MAX_ROWS,
  CATALOG_PAGE_SIZE,
  CATALOG_TTL_MS,
  CONFIG_FETCH_TIMEOUT_MS,
  CONFIG_TTL_MS,
  createTtlCache,
  FEATURED_FETCH_LIMIT,
  FEATURED_TTL_MS,
  LIVE_FETCH_TIMEOUT_MS,
  liveSingleFlight,
  LOCAIS_TTL_MS,
  subscribeLive,
  TELAO_POLL_MS,
  UNLOCK_TIMEOUT_MS,
  withTimeout,
  type LiveRealtimeClient,
} from "@/lib/live-load";
import { percentualNoCargo } from "@/lib/utils";
import type {
  ApuracaoConfig,
  BuPendente,
  BusRecebidasReport,
  Candidato,
  CargoRanking,
  Chefe,
  ConfirmVoteRow,
  DashboardSnapshot,
  DiscoveredVote,
  FeedItem,
  LocalVotacao,
  RankingRow,
  TransmitBuCompletoPayload,
  TransmitPayload,
  ZonaConfigRow,
} from "@/lib/types";

/** Surface PostgREST/RLS failures in Portuguese for the admin UI. */
function supabaseWriteError(action: string, message: string): Error {
  const lower = message.toLowerCase();
  const rlsHint =
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("permission denied") ||
    lower.includes("42501")
      ? " Possível bloqueio RLS: rode a migration 002 (policy candidatos_delete_anon / insert/update) no SQL Editor."
      : "";
  return new Error(`${action}: ${message}.${rlsHint}`);
}

function padZona(zona: string): string {
  return normalizeZona(zona);
}

function padSecao(secao: string): string {
  return normalizeSecao(secao);
}

function normalizeZonasConfig(raw: unknown): ZonaConfigRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const zona = padZona(String(r.zona ?? ""));
      const secoes = Number(r.secoes ?? 0);
      if (!zona || !Number.isFinite(secoes) || secoes < 1) return null;
      return { zona, secoes: Math.floor(secoes) };
    })
    .filter((x): x is ZonaConfigRow => x != null);
}

function normalizeConfig(raw: Partial<ApuracaoConfig> | null): ApuracaoConfig {
  const cargos =
    Array.isArray(raw?.relatorio_cargos) && raw!.relatorio_cargos!.length > 0
      ? raw!.relatorio_cargos!.map(String)
      : [...DEFAULT_RELATORIO_CARGOS];

  return {
    id: 1,
    secoes_esperadas: Math.max(0, Number(raw?.secoes_esperadas ?? 0)),
    relatorio_cargos: cargos,
    zonas_config: normalizeZonasConfig(raw?.zonas_config),
    updated_at: raw?.updated_at ?? new Date().toISOString(),
    chefe_pin:
      typeof raw?.chefe_pin === "string" && raw.chefe_pin.trim()
        ? raw.chefe_pin.trim()
        : DEFAULT_CHEFE_PIN,
    whatsapp_suporte:
      typeof raw?.whatsapp_suporte === "string" ? raw.whatsapp_suporte.trim() : "",
  };
}

function uniqueCargosForRanking(candidatos: Candidato[]): string[] {
  const labels = candidatos.map((c) => canonicalCargoLabel(c.cargo));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const cargo of CARGOS_RANKING_ORDEM) {
    if (labels.some((c) => c === cargo)) {
      ordered.push(cargo);
      seen.add(cargo);
    }
  }
  const extras = Array.from(
    new Set(labels.filter((c) => c && !seen.has(c)))
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...ordered, ...extras];
}

let origemColumnCache: boolean | null = null;
let favoritoColumnCache: boolean | null = null;
let sqCandidatoColumnCache: boolean | null = null;

const configTtl = createTtlCache<ApuracaoConfig>();
const featuredTtl = createTtlCache<Candidato[]>();
const catalogTtl = createTtlCache<Candidato[]>();
const locaisTtl = createTtlCache<LocalVotacao[]>();

export function invalidateLiveReadCaches() {
  configTtl.clear();
  featuredTtl.clear();
  catalogTtl.clear();
  locaisTtl.clear();
}

function normalizeCandidato(raw: Candidato): Candidato {
  return {
    ...raw,
    favorito: raw.favorito === true,
    cargo: canonicalCargoLabel(raw.cargo),
  };
}

type SnapshotBoletim = {
  id: string;
  zona: string;
  secao: string;
  candidato_id: string;
  quantidade_votos: number;
  fiscal_nome: string | null;
  created_at: string;
};

function boletimVoteCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function mergeCandidatosForRanking(
  listed: Candidato[],
  extras: Candidato[]
): Candidato[] {
  const map = new Map<string, Candidato>();
  for (const raw of [...listed, ...extras]) {
    const cand = normalizeCandidato(raw);
    if (!cand.id) continue;
    map.set(String(cand.id), cand);
  }
  return Array.from(map.values());
}

const CANDIDATO_LIVE_COLUMNS =
  "id, numero, nome, cargo, foto_url, origem, favorito, sq_candidato";

async function fetchAllSupabaseRows<T>(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  table: string,
  columns: string,
  opts?: {
    orFilter?: string;
    eq?: { column: string; value: string };
    pageSize?: number;
    maxRows?: number;
    timeoutMs?: number;
    allowPartial?: boolean;
  }
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxRows = opts?.maxRows ?? 200_000;
  const timeoutMs = opts?.timeoutMs ?? LIVE_FETCH_TIMEOUT_MS;
  const started = Date.now();
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const left = timeoutMs - (Date.now() - started);
    if (left <= 0) {
      if (opts?.allowPartial && all.length > 0) return all;
      throw new Error(`Tempo esgotado ao ler ${table}.`);
    }
    let query = supabase.from(table).select(columns);
    if (opts?.eq) query = query.eq(opts.eq.column, opts.eq.value);
    if (opts?.orFilter) query = query.or(opts.orFilter);
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    try {
      const { data, error } = await withTimeout(
        query.range(from, to),
        Math.max(800, left),
        table
      );
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < pageSize) break;
    } catch (err) {
      if (opts?.allowPartial && all.length > 0) return all;
      throw err;
    }
  }
  return all;
}

async function fetchCandidatosRows(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  featuredOnly: boolean
): Promise<Candidato[]> {
  if (featuredOnly) {
    const hasOrigem = await withTimeout(
      candidatosHasOrigemColumn(),
      2_500,
      "origem"
    ).catch(() => true);
    if (hasOrigem) {
      const { data, error } = await withTimeout(
        supabase
          .from("candidatos")
          .select(CANDIDATO_LIVE_COLUMNS)
          .eq("origem", "cadastro")
          .limit(FEATURED_FETCH_LIMIT),
        LIVE_FETCH_TIMEOUT_MS,
        "oficiais"
      );
      if (error) throw new Error(error.message);
      return ((data ?? []) as Candidato[])
        .map(normalizeCandidato)
        .filter((c) => isFeaturedCandidato(c.origem));
    }
    const { data, error } = await withTimeout(
      supabase
        .from("candidatos")
        .select(CANDIDATO_LIVE_COLUMNS)
        .limit(FEATURED_FETCH_LIMIT),
      LIVE_FETCH_TIMEOUT_MS,
      "oficiais"
    );
    if (error) throw new Error(error.message);
    return ((data ?? []) as Candidato[])
      .map(normalizeCandidato)
      .filter((c) => isFeaturedCandidato(c.origem));
  }

  const rows = await fetchAllSupabaseRows<Candidato>(
    supabase,
    "candidatos",
    CANDIDATO_LIVE_COLUMNS,
    {
      pageSize: CATALOG_PAGE_SIZE,
      maxRows: CATALOG_MAX_ROWS,
      timeoutMs: LIVE_FETCH_TIMEOUT_MS,
      allowPartial: true,
    }
  );
  return rows.map(normalizeCandidato);
}

async function cachedFeaturedCandidatos(
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Candidato[]> {
  const hit = featuredTtl.get(FEATURED_TTL_MS);
  if (hit) return hit;
  return liveSingleFlight("candidatos:featured", async () => {
    const again = featuredTtl.get(FEATURED_TTL_MS);
    if (again) return again;
    const list = await fetchCandidatosRows(supabase, true);
    featuredTtl.set(list);
    return list;
  });
}

async function cachedCatalogCandidatos(
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Candidato[]> {
  const hit = catalogTtl.get(CATALOG_TTL_MS);
  if (hit) return hit;
  return liveSingleFlight("candidatos:all", async () => {
    const again = catalogTtl.get(CATALOG_TTL_MS);
    if (again) return again;
    const list = await fetchCandidatosRows(supabase, false);
    catalogTtl.set(list);
    return list;
  });
}

async function cachedLocais(
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<LocalVotacao[]> {
  const hit = locaisTtl.get(LOCAIS_TTL_MS);
  if (hit) return hit;
  return liveSingleFlight("locais", async () => {
    const again = locaisTtl.get(LOCAIS_TTL_MS);
    if (again) return again;
    const list = await fetchAllSupabaseRows<LocalVotacao>(
      supabase,
      "locais_votacao",
      "*"
    );
    locaisTtl.set(list);
    return list;
  });
}

async function fetchCandidatosByIds(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  ids: string[]
): Promise<Candidato[]> {
  const uniq = Array.from(new Set(ids.map(String).filter(Boolean)));
  const out: Candidato[] = [];
  const chunk = 200;
  for (let i = 0; i < uniq.length; i += chunk) {
    const slice = uniq.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("candidatos")
      .select("*")
      .in("id", slice);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Candidato[]));
  }
  return out;
}

async function candidatosHasOrigemColumn(): Promise<boolean> {
  if (origemColumnCache != null) return origemColumnCache;
  const supabase = getSupabase();
  if (!supabase) {
    origemColumnCache = true;
    return true;
  }
  const { error } = await supabase.from("candidatos").select("origem").limit(1);
  origemColumnCache = !error;
  return origemColumnCache;
}

async function candidatosHasFavoritoColumn(): Promise<boolean> {
  if (favoritoColumnCache != null) return favoritoColumnCache;
  const supabase = getSupabase();
  if (!supabase) {
    favoritoColumnCache = true;
    return true;
  }
  const { error } = await supabase.from("candidatos").select("favorito").limit(1);
  favoritoColumnCache = !error;
  return favoritoColumnCache;
}

async function candidatosHasSqColumn(): Promise<boolean> {
  if (sqCandidatoColumnCache != null) return sqCandidatoColumnCache;
  const supabase = getSupabase();
  if (!supabase) {
    sqCandidatoColumnCache = true;
    return true;
  }
  const { error } = await supabase
    .from("candidatos")
    .select("sq_candidato")
    .limit(1);
  sqCandidatoColumnCache = !error;
  return sqCandidatoColumnCache;
}

const UPSERT_CHUNK = 200;

function resolveCargoFilters(
  configCargos: string[],
  override?: string | string[]
): string[] {
  if (override != null) {
    const list = Array.isArray(override) ? override : [override];
    if (list.includes("todos") || list.length === 0) {
      return [...CARGOS_OFICIAIS];
    }
    return list;
  }
  if (configCargos.includes("todos") || configCargos.length === 0) {
    return [...CARGOS_OFICIAIS];
  }
  return configCargos;
}

function buildRankingsForCargo(
  candidatos: Candidato[],
  byCand: Map<string, number>,
  cargo: string
): CargoRanking {
  const filtered = candidatos.filter(
    (c) => canonicalCargoLabel(c.cargo) === cargo
  );
  const totalVotos = filtered.reduce(
    (sum, c) => sum + (byCand.get(String(c.id)) ?? 0),
    0
  );
  const rankings: RankingRow[] = filtered
    .map((candidato) => {
      const votos = byCand.get(String(candidato.id)) ?? 0;
      return {
        candidato,
        votos,
        percentual: percentualNoCargo(votos, totalVotos),
      };
    })
    .sort((a, b) => b.votos - a.votos);

  return { cargo, rankings, totalVotos };
}

export function buildDashboardSnapshot(
  locais: LocalVotacao[],
  candidatos: Candidato[],
  boletins: Array<{
    id: string;
    zona: string;
    secao: string;
    candidato_id: string;
    quantidade_votos: number;
    fiscal_nome: string | null;
    created_at: string;
  }>,
  config: ApuracaoConfig,
  mode: "supabase" | "mock",
  cargoOverride?: string | string[]
): DashboardSnapshot {
  candidatos = mergeCandidatosForRanking(candidatos, []);
  const byCand = new Map<string, number>();
  for (const b of boletins) {
    const id = String(b.candidato_id ?? "");
    const qtd = boletimVoteCount(b.quantidade_votos);
    if (!id || qtd <= 0) continue;
    byCand.set(id, (byCand.get(id) ?? 0) + qtd);
  }

  const cargoFilters = resolveCargoFilters(
    config.relatorio_cargos,
    cargoOverride
  );
  const featured = candidatos.filter((c) => isFeaturedCandidato(c.origem));
  const rankingsByCargo = cargoFilters.map((cargo) =>
    buildRankingsForCargo(featured, byCand, cargo)
  );
  const geralCargos = uniqueCargosForRanking(candidatos);
  const rankingGeralByCargo = geralCargos.map((cargo) =>
    buildRankingsForCargo(candidatos, byCand, cargo)
  );
  const totalVotosValidos = rankingsByCargo.reduce(
    (sum, g) => sum + g.totalVotos,
    0
  );

  const urnasKeys = new Set(boletins.map((b) => `${b.zona}|${b.secao}`));
  const localMap = new Map(
    locais.map((l) => [`${l.zona}|${l.secao}`, l.nome_escola] as const)
  );

  const feedGroups = new Map<
    string,
    {
      id: string;
      created_at: string;
      zona: string;
      secao: string;
      totalVotos: number;
      fiscal_nome: string | null;
    }
  >();

  for (const b of boletins) {
    const key = `${b.zona}|${b.secao}`;
    const existing = feedGroups.get(key);
    if (!existing) {
      feedGroups.set(key, {
        id: b.id,
        created_at: b.created_at,
        zona: b.zona,
        secao: b.secao,
        totalVotos: b.quantidade_votos,
        fiscal_nome: b.fiscal_nome,
      });
    } else {
      existing.totalVotos += b.quantidade_votos;
      if (new Date(b.created_at) > new Date(existing.created_at)) {
        existing.created_at = b.created_at;
        existing.id = b.id;
        existing.fiscal_nome = b.fiscal_nome;
      }
    }
  }

  const feed: FeedItem[] = Array.from(feedGroups.values())
    .map((g) => ({
      ...g,
      escola: localMap.get(`${g.zona}|${g.secao}`) ?? `Zona ${g.zona} · Seção ${g.secao}`,
    }))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 20);

  const secoesEsperadas = Math.max(
    config.secoes_esperadas,
    locais.length,
    0
  );
  const urnasApuradas = urnasKeys.size;

  return {
    totalSecoes: locais.length,
    secoesEsperadas,
    urnasApuradas,
    secoesFaltam: Math.max(0, secoesEsperadas - urnasApuradas),
    totalVotosValidos,
    rankings: rankingsByCargo[0]?.rankings ?? [],
    rankingsByCargo,
    rankingGeralByCargo,
    relatorioCargos: cargoFilters,
    feed,
    mode,
  };
}

async function getConfigUncached(): Promise<ApuracaoConfig> {
  const supabase = getSupabase();
  if (!supabase) return getMockConfig();

  const { data, error } = await supabase
    .from("apuracao_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    // Table may not exist until migration 002 — fall back gracefully
    console.warn("[apuracao] apuracao_config:", error.message);
    return normalizeConfig({
      secoes_esperadas: 1744,
      relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
      zonas_config: [],
    });
  }

  if (!data) {
    const seed = normalizeConfig({
      secoes_esperadas: 1744,
      relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
      zonas_config: [],
    });
    await supabase.from("apuracao_config").upsert(seed);
    return seed;
  }

  return normalizeConfig(data as ApuracaoConfig);
}

function fallbackLiveConfig(): ApuracaoConfig {
  return (
    configTtl.peek() ??
    normalizeConfig({
      secoes_esperadas: 1744,
      relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
      zonas_config: [],
    })
  );
}

export async function getConfig(): Promise<ApuracaoConfig> {
  if (!getSupabase()) return getMockConfig();
  const hit = configTtl.get(CONFIG_TTL_MS);
  if (hit) return hit;
  try {
    return await withTimeout(
      liveSingleFlight("config", async () => {
        const again = configTtl.get(CONFIG_TTL_MS);
        if (again) return again;
        const value = await getConfigUncached();
        configTtl.set(value);
        return value;
      }),
      CONFIG_FETCH_TIMEOUT_MS,
      "config"
    );
  } catch {
    return fallbackLiveConfig();
  }
}

export async function saveConfig(
  patch: Partial<
    Pick<
      ApuracaoConfig,
      | "secoes_esperadas"
      | "relatorio_cargos"
      | "zonas_config"
      | "chefe_pin"
      | "whatsapp_suporte"
    >
  >
): Promise<ApuracaoConfig> {
  const supabase = getSupabase();
  if (!supabase) {
    return setMockConfig(patch);
  }

  const current = await getConfig();
  const next = normalizeConfig({
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });

  const payload: Record<string, unknown> = {
    id: 1,
    secoes_esperadas: next.secoes_esperadas,
    relatorio_cargos: next.relatorio_cargos,
    zonas_config: next.zonas_config,
    updated_at: next.updated_at,
    chefe_pin: next.chefe_pin,
    whatsapp_suporte: next.whatsapp_suporte ?? "",
  };

  const { data, error } = await supabase
    .from("apuracao_config")
    .upsert(payload)
    .select("*")
    .single();

  if (error) {
    if (/whatsapp_suporte/i.test(error.message)) {
      delete payload.whatsapp_suporte;
    }
    if (/chefe_pin/i.test(error.message)) {
      delete payload.chefe_pin;
    }
    if (/whatsapp_suporte|chefe_pin/i.test(error.message)) {
      const retry = await supabase
        .from("apuracao_config")
        .upsert(payload)
        .select("*")
        .single();
      if (retry.error) throw new Error(retry.error.message);
      const saved = normalizeConfig(retry.data as ApuracaoConfig);
      configTtl.set(saved);
      return saved;
    }
    throw new Error(error.message);
  }
  const saved = normalizeConfig(data as ApuracaoConfig);
  configTtl.set(saved);
  return saved;
}

export async function saveChefePin(pin: string): Promise<ApuracaoConfig> {
  const cleaned = pin.trim();
  if (cleaned.length < 4) {
    throw new Error("O PIN do chefe precisa ter ao menos 4 caracteres.");
  }
  return saveConfig({ chefe_pin: cleaned });
}

function isMissingChefesTable(message: string, code?: string): boolean {
  if (code === "42P01") return true;
  if (code === "23505") return false;
  return /42P01|relation .*(chefes|chefe_favoritos)|could not find the table.*(chefes|chefe_favoritos)/i.test(
    message
  );
}

function normalizeChefe(raw: Partial<Chefe> | null): Chefe | null {
  if (!raw?.id || !raw.pin) return null;
  return {
    id: String(raw.id),
    nome: String(raw.nome ?? "").trim() || "Chefe",
    pin: String(raw.pin).trim(),
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

export async function listChefes(): Promise<Chefe[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return getMockChefes();
  }

  const { data, error } = await supabase
    .from("chefes")
    .select("id, nome, pin, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingChefesTable(error.message, error.code)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => normalizeChefe(row as Chefe))
    .filter((row): row is Chefe => row != null);
}

export async function createChefe(input: {
  nome: string;
  pin: string;
}): Promise<Chefe> {
  const nome = input.nome.trim();
  const pin = input.pin.trim();
  if (!nome) throw new Error("Informe o nome do chefe.");
  if (pin.length < 4) {
    throw new Error("O PIN precisa ter ao menos 4 caracteres.");
  }

  const supabase = getSupabase();
  if (!supabase) {
    return insertMockChefe({ nome, pin });
  }

  const { data, error } = await supabase
    .from("chefes")
    .insert({ nome, pin })
    .select("id, nome, pin, created_at")
    .single();

  if (error) {
    if (
      error.code === "23505" ||
      /duplicate|unique|chefes_pin/i.test(error.message)
    ) {
      throw new Error("Já existe um acesso com este PIN.");
    }
    if (isMissingChefesTable(error.message, error.code)) {
      throw new Error(
        "Tabela chefes ausente. Cole a migration 011_chefes_favoritos.sql no SQL Editor do Supabase."
      );
    }
    throw new Error(error.message);
  }

  const row = normalizeChefe(data as Chefe);
  if (!row) throw new Error("Não foi possível criar o acesso chefe.");

  if (pin === DEFAULT_CHEFE_PIN) {
    try {
      await saveConfig({ chefe_pin: pin });
    } catch {
      /* config legado é opcional */
    }
  }

  return row;
}

export async function deleteChefe(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!deleteMockChefe(id)) {
      throw new Error("Acesso chefe não encontrado.");
    }
    return;
  }

  const { error } = await supabase.from("chefes").delete().eq("id", id);
  if (error) {
    if (isMissingChefesTable(error.message, error.code)) {
      throw new Error(
        "Tabela chefes ausente. Cole a migration 011_chefes_favoritos.sql no SQL Editor do Supabase."
      );
    }
    throw new Error(error.message);
  }
}

function fallbackChefeSession(pin: string): Chefe {
  return {
    id: "config-fallback",
    nome: DEFAULT_CHEFE_NOME,
    pin,
    created_at: new Date().toISOString(),
  };
}

export async function unlockChefeByPin(pin: string): Promise<Chefe | null> {
  const cleaned = pin.trim();
  if (!cleaned) return null;

  try {
    const chefes = await withTimeout(
      listChefes(),
      UNLOCK_TIMEOUT_MS,
      "acessos chefe"
    );
    const match = chefes.find((c) => c.pin === cleaned);
    if (match) return match;
    if (chefes.length > 0) return null;
  } catch {
    if (cleaned === DEFAULT_CHEFE_PIN) return fallbackChefeSession(cleaned);
    throw new Error("Servidor lento. Tente o PIN de novo.");
  }

  const cfg = await getConfig();
  const fallback = resolveChefePin(cfg.chefe_pin);
  if (cleaned !== fallback) return null;

  if (cleaned === DEFAULT_CHEFE_PIN) {
    try {
      return await createChefe({
        nome: DEFAULT_CHEFE_NOME,
        pin: DEFAULT_CHEFE_PIN,
      });
    } catch {
      /* tabela ausente → sessão só com o PIN legado */
    }
  }

  return fallbackChefeSession(fallback);
}

/** Só o PIN do Cristiano (`apuracao_config.chefe_pin` ou andre2026). Sem tabela chefes. */
export async function unlockAdminByPin(pin: string): Promise<boolean> {
  const cfg = await getConfig();
  return pinMatchesAdmin(pin, cfg.chefe_pin);
}

export async function listValidChefePins(): Promise<string[]> {
  const chefes = await listChefes();
  if (chefes.length > 0) {
    return chefes.map((c) => c.pin);
  }
  const cfg = await getConfig();
  return [resolveChefePin(cfg.chefe_pin)];
}

export async function listChefeFavoritoIds(chefeId: string): Promise<string[]> {
  if (!chefeId || chefeId === "config-fallback") return [];

  const supabase = getSupabase();
  if (!supabase) {
    return getMockChefeFavoritoIds(chefeId);
  }

  const { data, error } = await supabase
    .from("chefe_favoritos")
    .select("candidato_id")
    .eq("chefe_id", chefeId);

  if (error) {
    if (isMissingChefesTable(error.message, error.code)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => String((row as { candidato_id?: string }).candidato_id ?? ""))
    .filter(Boolean);
}

export async function setChefeFavorito(
  chefeId: string,
  candidatoId: string,
  favorito: boolean
): Promise<void> {
  if (!chefeId || chefeId === "config-fallback") {
    throw new Error(
      "Tabela chefes ausente. Cole a migration 011_chefes_favoritos.sql no SQL Editor do Supabase."
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    setMockChefeFavorito(chefeId, candidatoId, favorito);
    return;
  }

  if (favorito) {
    const { error } = await supabase.from("chefe_favoritos").insert({
      chefe_id: chefeId,
      candidato_id: candidatoId,
    });
    if (error) {
      if (isMissingChefesTable(error.message, error.code)) {
        throw new Error(
          "Tabela chefe_favoritos ausente. Cole a migration 011_chefes_favoritos.sql no SQL Editor do Supabase."
        );
      }
      if (
        error.code === "23505" ||
        /duplicate|unique|chefe_favoritos_pkey/i.test(error.message)
      ) {
        return;
      }
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase
    .from("chefe_favoritos")
    .delete()
    .eq("chefe_id", chefeId)
    .eq("candidato_id", candidatoId);

  if (error) {
    if (isMissingChefesTable(error.message, error.code)) {
      throw new Error(
        "Tabela chefe_favoritos ausente. Cole a migration 011_chefes_favoritos.sql no SQL Editor do Supabase."
      );
    }
    throw new Error(error.message);
  }
}

export async function saveWhatsappSuporte(
  value: string
): Promise<ApuracaoConfig> {
  return saveConfig({ whatsapp_suporte: value.trim() });
}

export async function listBusPendentes(): Promise<BuPendente[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return getMockPendentes().filter((p) => p.status === "pendente");
  }

  const { data, error } = await supabase
    .from("bus_pendentes")
    .select("*")
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (/bus_pendentes|42P01|42703/i.test(error.message) || error.code === "42P01") {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as BuPendente[];
}

export async function saveBuPendente(input: {
  rawText: string;
  erro: string;
  zona?: string | null;
  secao?: string | null;
}): Promise<BuPendente | null> {
  const raw = input.rawText.trim();
  if (!raw) return null;

  const supabase = getSupabase();
  if (!supabase) {
    return insertMockPendente({
      raw_text: raw,
      erro: input.erro,
      zona: input.zona ?? null,
      secao: input.secao ?? null,
    });
  }

  const { data, error } = await supabase
    .from("bus_pendentes")
    .insert({
      raw_text: raw,
      erro: input.erro,
      zona: input.zona ?? null,
      secao: input.secao ?? null,
      status: "pendente",
    })
    .select("*")
    .single();

  if (error) {
    if (/bus_pendentes|42P01/i.test(error.message) || error.code === "42P01") {
      console.warn("[apuracao] bus_pendentes ausente — rode a migration 009.");
      return null;
    }
    throw new Error(error.message);
  }
  return data as BuPendente;
}

export async function markBuPendenteReprocessado(
  id: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!markMockPendenteReprocessado(id)) {
      throw new Error("BU pendente não encontrado.");
    }
    return;
  }

  const { error } = await supabase
    .from("bus_pendentes")
    .update({ status: "reprocessado", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function updateBuPendenteErro(
  id: string,
  erro: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!updateMockPendenteErro(id, erro)) {
      throw new Error("BU pendente não encontrado.");
    }
    return;
  }

  const { error } = await supabase
    .from("bus_pendentes")
    .update({ erro, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setCandidatoFavorito(
  id: string,
  favorito: boolean
): Promise<Candidato> {
  const supabase = getSupabase();
  if (!supabase) {
    const updated = updateMockCandidato(id, { favorito });
    if (!updated) throw new Error("Candidato não encontrado.");
    return normalizeCandidato(updated);
  }

  if (!(await candidatosHasFavoritoColumn())) {
    throw new Error(
      "Coluna favorito ausente. Cole a migration 007_favorito.sql no SQL Editor do Supabase."
    );
  }

  const { data, error } = await supabase
    .from("candidatos")
    .update({ favorito })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (/favorito/i.test(error.message) || error.code === "42703") {
      favoritoColumnCache = false;
      throw new Error(
        "Coluna favorito ausente. Cole a migration 007_favorito.sql no SQL Editor do Supabase."
      );
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Candidato não encontrado.");
  return normalizeCandidato(data as Candidato);
}

export async function listCandidatos(opts?: {
  activeRaceOnly?: boolean;
  featuredOnly?: boolean;
}): Promise<Candidato[]> {
  const supabase = getSupabase();
  const featuredOnly = opts?.featuredOnly !== false;
  let list: Candidato[];

  if (!supabase) {
    list = getMockCandidatos().map(normalizeCandidato);
    if (featuredOnly) {
      list = list.filter((c) => isFeaturedCandidato(c.origem));
    }
  } else {
    list = featuredOnly
      ? await cachedFeaturedCandidatos(supabase)
      : await cachedCatalogCandidatos(supabase);
  }

  if (opts?.activeRaceOnly !== false) {
    const official = list.filter((c) =>
      (CARGOS_OFICIAIS as readonly string[]).includes(c.cargo)
    );
    // If admin already cadastrado oficiais, hide Prefeito/Vereador seed
    if (official.length > 0) return official;
  }
  return list;
}

export async function upsertCandidato(input: {
  id?: string;
  numero: string;
  nome: string;
  cargo: string;
  foto_url?: string | null;
}): Promise<Candidato> {
  const validated = validarNumeroCargo(input.cargo, input.numero);
  if (!validated.ok) throw new Error(validated.message);

  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do candidato.");

  const row: {
    numero: string;
    nome: string;
    cargo: string;
    foto_url: string | null;
    origem?: "cadastro";
  } = {
    numero: validated.numero,
    nome,
    cargo: input.cargo.trim(),
    foto_url: input.foto_url?.trim() || null,
  };

  if (await candidatosHasOrigemColumn()) {
    row.origem = "cadastro";
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (input.id) {
      const updated = updateMockCandidato(input.id, row);
      if (!updated) throw new Error("Candidato não encontrado.");
      return updated;
    }
    upsertMockCandidatos([row]);
    const found = getMockCandidatos().find(
      (c) => c.numero === row.numero && c.cargo === row.cargo
    );
    if (!found) throw new Error("Falha ao salvar candidato (mock).");
    return found;
  }

  if (input.id) {
    const { data, error } = await supabase
      .from("candidatos")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw supabaseWriteError("Falha ao atualizar candidato", error.message);
    invalidateLiveReadCaches();
    return data as Candidato;
  }

  const { data, error } = await supabase
    .from("candidatos")
    .upsert(row, { onConflict: "numero,cargo" })
    .select("*")
    .single();
  if (error) throw supabaseWriteError("Falha ao cadastrar candidato", error.message);
  invalidateLiveReadCaches();
  return data as Candidato;
}

export async function removeCandidato(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!deleteMockCandidato(id)) throw new Error("Candidato não encontrado.");
    return;
  }
  const { error } = await supabase.from("candidatos").delete().eq("id", id);
  if (error) throw supabaseWriteError("Falha ao remover candidato", error.message);
  invalidateLiveReadCaches();
}

export async function findLocal(
  zona: string,
  secao: string
): Promise<LocalVotacao | null> {
  const z = padZona(zona);
  const s = padSecao(secao);
  const supabase = getSupabase();
  if (!supabase) return findMockLocal(z, s) ?? null;

  const { data, error } = await supabase
    .from("locais_votacao")
    .select("*")
    .eq("zona", z)
    .eq("secao", s)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as LocalVotacao | null;
}

/** Pre-check: already transmitted for this zona+seção. */
export async function urnaJaCadastrada(
  zona: string,
  secao: string
): Promise<boolean> {
  const z = padZona(zona);
  const s = padSecao(secao);
  const supabase = getSupabase();

  if (!supabase) {
    return getMockBoletins().some((b) => b.zona === z && b.secao === s);
  }

  const { data, error } = await supabase
    .from("boletins_urna")
    .select("id")
    .eq("zona", z)
    .eq("secao", s)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function assertZonaPermitida(zona: string): Promise<void> {
  const cfg = await getConfig();
  if (!isZonaAllowed(zona, cfg.zonas_config)) {
    throw new Error(ZONA_FORA_DA_CIDADE);
  }
}

export async function resolveConfirmRows(
  votes: Array<{ numero: string; quantidade: number; cargo?: string }>
): Promise<{ rows: ConfirmVoteRow[]; unknown: string[] }> {
  const candidatos = await listCandidatos({ activeRaceOnly: true });
  const byKey = new Map<string, (typeof candidatos)[number]>();
  for (const c of candidatos) {
    byKey.set(
      `${c.cargo}::${normalizeCandidateNumero(c.numero)}`,
      c
    );
  }
  const rows: ConfirmVoteRow[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const vote of votes) {
    const canon = normalizeCandidateNumero(vote.numero);
    const cargo = vote.cargo?.trim();
    if (!canon || !cargo || cargo === CARGO_INDEFINIDO || cargo === "Outro") {
      unknown.push(vote.numero);
      continue;
    }
    const candidato = byKey.get(`${cargo}::${canon}`);
    if (!candidato) {
      unknown.push(vote.numero);
      continue;
    }
    if (seen.has(candidato.id)) continue;
    seen.add(candidato.id);
    rows.push({ candidato, quantidade: vote.quantidade });
  }

  return { rows, unknown };
}

/** Featured match is (numero, cargo) only — never numero alone. */
export function matchFeaturedCandidato(
  featured: Candidato[],
  numero: string,
  cargo: string
): Candidato | undefined {
  const canon = normalizeCandidateNumero(numero);
  const resolved = resolveVoteCargo(numero, cargo);
  if (!canon || resolved === CARGO_INDEFINIDO || resolved === "Outro") {
    return undefined;
  }
  return featured.find(
    (c) =>
      normalizeCandidateNumero(c.numero) === canon && c.cargo === resolved
  );
}

export async function resolveBuVotes(
  votes: Array<{
    numero: string;
    quantidade: number;
    nome?: string;
    cargo?: string;
  }>
): Promise<{ featured: ConfirmVoteRow[]; discovered: DiscoveredVote[] }> {
  const featuredList = await listCandidatos({
    activeRaceOnly: true,
    featuredOnly: true,
  });
  const featured: ConfirmVoteRow[] = [];
  const discovered: DiscoveredVote[] = [];
  const seenFeatured = new Set<string>();
  const seenDisc = new Set<string>();

  for (const vote of votes) {
    const numero = normalizeCandidateNumero(vote.numero);
    if (!numero) continue;
    const cargo = resolveVoteCargo(vote.numero, vote.cargo);
    const nome = vote.nome?.trim() || placeholderCandidateName(numero);
    const featuredCand = matchFeaturedCandidato(featuredList, numero, cargo);
    if (featuredCand && cargo !== CARGO_INDEFINIDO && cargo !== "Outro") {
      if (seenFeatured.has(featuredCand.id)) continue;
      seenFeatured.add(featuredCand.id);
      featured.push({ candidato: featuredCand, quantidade: vote.quantidade });
      continue;
    }
    const dkey = `${cargo}::${numero}`;
    if (seenDisc.has(dkey)) continue;
    seenDisc.add(dkey);
    discovered.push({ numero, nome, cargo, quantidade: vote.quantidade });
  }

  return { featured, discovered };
}

function dedupeTransmitVotes(payload: TransmitBuCompletoPayload["votes"]) {
  const map = new Map<string, TransmitBuCompletoPayload["votes"][number]>();
  for (const v of payload) {
    const numero = normalizeCandidateNumero(v.numero);
    const cargo = resolveVoteCargo(v.numero, v.cargo);
    if (!numero) continue;
    map.set(`${cargo}::${numero}`, {
      ...v,
      numero,
      cargo,
      nome: v.nome?.trim() || placeholderCandidateName(numero),
    });
  }
  return Array.from(map.values());
}

async function ingestBuCompletoClient(
  zona: string,
  secao: string,
  payload: TransmitBuCompletoPayload,
  votes: TransmitBuCompletoPayload["votes"]
): Promise<{ ok: true } | { ok: false; duplicate: true; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase indisponível.");
  }

  await assertZonaPermitida(zona);

  if (await urnaJaCadastrada(zona, secao)) {
    return {
      ok: false,
      duplicate: true,
      message: duplicateUrnaMessage(zona, secao),
    };
  }

  const hasOrigem = await candidatosHasOrigemColumn();
  const { data: existingCands, error: listError } = await supabase
    .from("candidatos")
    .select("*");
  if (listError) throw new Error(listError.message);
  const current = (existingCands ?? []) as Candidato[];
  const byKey = new Map(
    current.map((c) => [`${c.cargo}::${normalizeCandidateNumero(c.numero)}`, c])
  );

  const toInsert: Array<{
    numero: string;
    nome: string;
    cargo: string;
    origem?: "bu";
  }> = [];

  for (const v of votes) {
    const key = `${v.cargo}::${v.numero}`;
    if (byKey.has(key)) continue;
    if (!hasOrigem) continue;
    toInsert.push({
      numero: v.numero,
      nome: v.nome,
      cargo: v.cargo,
      origem: "bu",
    });
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("candidatos")
      .upsert(toInsert, { onConflict: "numero,cargo" })
      .select("*");
    if (insErr) throw new Error(insErr.message);
    for (const c of (inserted ?? []) as Candidato[]) {
      byKey.set(`${c.cargo}::${normalizeCandidateNumero(c.numero)}`, c);
    }
  }

  const boletimRows = [];
  for (const v of votes) {
    const cand = byKey.get(`${v.cargo}::${v.numero}`);
    if (!cand) continue;
    boletimRows.push({
      zona,
      secao,
      candidato_id: cand.id,
      quantidade_votos: v.quantidade,
      raw_text: payload.rawText,
      fiscal_nome: payload.fiscalNome ?? null,
    });
  }

  if (boletimRows.length === 0) {
    throw new Error(
      "Nenhum candidato para gravar. Rode a migration 004 no SQL Editor ou cadastre os oficiais no admin."
    );
  }

  const { error } = await supabase.from("boletins_urna").insert(boletimRows);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        duplicate: true,
        message: duplicateUrnaMessage(zona, secao),
      };
    }
    throw new Error(error.message);
  }
  return { ok: true };
}

export async function transmitBuCompleto(
  payload: TransmitBuCompletoPayload
): Promise<{ ok: true } | { ok: false; duplicate: true; message: string }> {
  const zona = padZona(payload.zona);
  const secao = padSecao(payload.secao);
  const votes = dedupeTransmitVotes(payload.votes);
  if (votes.length === 0) {
    throw new Error("Nenhum voto para gravar.");
  }
  await assertZonaPermitida(zona);

  const supabase = getSupabase();
  if (!supabase) {
    if (
      getMockBoletins().some((b) => b.zona === zona && b.secao === secao)
    ) {
      return {
        ok: false,
        duplicate: true,
        message: duplicateUrnaMessage(zona, secao),
      };
    }
    const boletimRows: Array<{
      zona: string;
      secao: string;
      candidato_id: string;
      quantidade_votos: number;
      raw_text: string | null;
      fiscal_nome: string | null;
    }> = [];
    for (const v of votes) {
      let id = v.candidatoId;
      const existing = getMockCandidatos().find(
        (c) =>
          normalizeCandidateNumero(c.numero) === v.numero && c.cargo === v.cargo
      );
      if (existing) {
        id = existing.id;
      } else {
        upsertMockCandidatos([
          {
            numero: v.numero,
            nome: v.nome,
            cargo: v.cargo,
            foto_url: null,
            origem: "bu",
          },
        ]);
        id = getMockCandidatos().find(
          (c) =>
            normalizeCandidateNumero(c.numero) === v.numero &&
            c.cargo === v.cargo
        )?.id;
      }
      if (!id) continue;
      boletimRows.push({
        zona,
        secao,
        candidato_id: id,
        quantidade_votos: v.quantidade,
        raw_text: payload.rawText,
        fiscal_nome: payload.fiscalNome ?? null,
      });
    }
    const result = insertMockBoletins(boletimRows);
    if (!result.ok) {
      return {
        ok: false,
        duplicate: true,
        message: duplicateUrnaMessage(zona, secao),
      };
    }
    return { ok: true };
  }

  if (await candidatosHasOrigemColumn()) {
    const { data, error } = await supabase.rpc("ingest_bu_completo", {
      p_zona: zona,
      p_secao: secao,
      p_raw_text: payload.rawText,
      p_fiscal_nome: payload.fiscalNome ?? null,
      p_votes: votes.map((v) => ({
        numero: v.numero,
        nome: v.nome,
        cargo: v.cargo,
        quantidade: v.quantidade,
      })),
    });
    if (!error && data && typeof data === "object") {
      const parsed = data as {
        ok?: boolean;
        duplicate?: boolean;
        message?: string;
        error?: string;
      };
      if (parsed.duplicate) {
        return {
          ok: false,
          duplicate: true,
          message: duplicateUrnaMessage(zona, secao),
        };
      }
      if (parsed.ok) return { ok: true };
      if (parsed.error) throw new Error(parsed.error);
    }
    const missingFn =
      error &&
      (/ingest_bu_completo/i.test(error.message) ||
        error.code === "PGRST202" ||
        error.code === "42883");
    if (error && !missingFn) {
      throw new Error(error.message);
    }
  }

  return ingestBuCompletoClient(zona, secao, payload, votes);
}

export async function transmitVotes(
  payload: TransmitPayload
): Promise<{ ok: true } | { ok: false; duplicate: true; message: string }> {
  const zona = padZona(payload.zona);
  const secao = padSecao(payload.secao);
  await assertZonaPermitida(zona);
  const supabase = getSupabase();

  if (!supabase) {
    const result = insertMockBoletins(
      payload.votes.map((v) => ({
        zona,
        secao,
        candidato_id: v.candidatoId,
        quantidade_votos: v.quantidade,
        raw_text: payload.rawText,
        fiscal_nome: payload.fiscalNome ?? null,
      }))
    );
    if (!result.ok) {
      return {
        ok: false,
        duplicate: true,
        message: duplicateUrnaMessage(zona, secao),
      };
    }
    return { ok: true };
  }

  const { data: existing, error: existingError } = await supabase
    .from("boletins_urna")
    .select("id")
    .eq("zona", zona)
    .eq("secao", secao)
    .limit(1);

  if (existingError) throw new Error(existingError.message);
  if (existing && existing.length > 0) {
    return {
      ok: false,
      duplicate: true,
      message: duplicateUrnaMessage(zona, secao),
    };
  }

  const rows = payload.votes.map((v) => ({
    zona,
    secao,
    candidato_id: v.candidatoId,
    quantidade_votos: v.quantidade,
    raw_text: payload.rawText,
    fiscal_nome: payload.fiscalNome ?? null,
  }));

  const { error } = await supabase.from("boletins_urna").insert(rows);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        duplicate: true,
        message: duplicateUrnaMessage(zona, secao),
      };
    }
    throw new Error(error.message);
  }

  return { ok: true };
}

function wantsFullCatalog(cargoOverride?: string | string[]): boolean {
  if (cargoOverride == null) return false;
  const list = Array.isArray(cargoOverride) ? cargoOverride : [cargoOverride];
  return list.includes("todos");
}

export async function fetchDashboard(
  cargoOverride?: string | string[]
): Promise<DashboardSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return buildDashboardSnapshot(
      getMockLocais(),
      getMockCandidatos(),
      getMockBoletins(),
      getMockConfig(),
      "mock",
      cargoOverride
    );
  }

  const fullCatalog = wantsFullCatalog(cargoOverride);
  const cacheKey = `dashboard:${fullCatalog ? "todos" : "featured"}`;
  return withTimeout(
    liveSingleFlight(cacheKey, async () => {
      const config = await getConfig();
      const needLocais = !(config.secoes_esperadas > 0);

      const [locais, listedCandidatos, boletins] = await Promise.all([
        needLocais
          ? cachedLocais(supabase)
          : Promise.resolve([] as LocalVotacao[]),
        fullCatalog
          ? cachedCatalogCandidatos(supabase)
          : cachedFeaturedCandidatos(supabase),
        fetchAllSupabaseRows<SnapshotBoletim>(
          supabase,
          "boletins_urna",
          "id, zona, secao, candidato_id, quantidade_votos, fiscal_nome, created_at",
          {
            pageSize: 1_000,
            maxRows: 20_000,
            timeoutMs: LIVE_FETCH_TIMEOUT_MS,
            allowPartial: true,
          }
        ),
      ]);

      const have = new Set(listedCandidatos.map((c) => String(c.id)));
      const missingIds = fullCatalog
        ? boletins
            .map((b) => String(b.candidato_id ?? ""))
            .filter((id) => id && !have.has(id))
        : [];
      const extras =
        missingIds.length > 0
          ? await withTimeout(
              fetchCandidatosByIds(supabase, missingIds),
              4_000,
              "candidatos"
            ).catch(() => [] as Candidato[])
          : [];

      return buildDashboardSnapshot(
        locais,
        mergeCandidatosForRanking(listedCandidatos, extras),
        boletins,
        config,
        "supabase",
        cargoOverride
      );
    }),
    LIVE_FETCH_TIMEOUT_MS,
    fullCatalog ? "ranking" : "telão"
  );
}

export async function fetchBusRecebidas(): Promise<BusRecebidasReport> {
  const supabase = getSupabase();
  if (!supabase) {
    return buildBusRecebidasReport(
      getMockBoletins(),
      getMockLocais(),
      getMockConfig(),
      "mock"
    );
  }

  return liveSingleFlight("bus-recebidas", async () => {
    const [locais, boletins, config] = await Promise.all([
      cachedLocais(supabase).then((rows) =>
        rows.map((l) => ({
          zona: l.zona,
          secao: l.secao,
          nome_escola: l.nome_escola,
        }))
      ),
      fetchAllSupabaseRows<{ zona: string; secao: string }>(
        supabase,
        "boletins_urna",
        "zona, secao"
      ),
      getConfig(),
    ]);

    return buildBusRecebidasReport(boletins, locais, config, "supabase");
  });
}

export function subscribeDashboard(
  onChange: () => void,
  pollMs = TELAO_POLL_MS
): () => void {
  const supabase = getSupabase();

  if (!supabase) {
    return subscribeLive(onChange, {
      pollMs,
      mockUnsub: subscribeMock(onChange),
    });
  }

  return subscribeLive(onChange, {
    pollMs,
    realtime: supabase as unknown as LiveRealtimeClient,
  });
}

export async function importLocais(
  rows: Array<{
    zona: string;
    secao: string;
    nome_escola: string;
    bairro?: string | null;
  }>
): Promise<number> {
  const normalized = rows.map((r) => ({
    zona: padZona(r.zona),
    secao: padSecao(r.secao),
    nome_escola: r.nome_escola.trim(),
    bairro: r.bairro?.trim() || null,
  }));

  const supabase = getSupabase();
  if (!supabase) return upsertMockLocais(normalized);

  const { error, count } = await supabase.from("locais_votacao").upsert(
    normalized,
    { onConflict: "zona,secao", count: "exact" }
  );
  if (error) throw new Error(error.message);
  invalidateLiveReadCaches();
  return count ?? normalized.length;
}

/**
 * Gera seções a partir de “Zona X tem N seções”, atualiza locais_votacao
 * e persiste expectativa em apuracao_config.
 */
export async function applyZonasExpectativa(
  zonas: ZonaConfigRow[],
  opts?: { replaceExisting?: boolean; totalOverride?: number }
): Promise<{ locais: number; secoesEsperadas: number; config: ApuracaoConfig }> {
  const normalized = zonas
    .map((z) => ({
      zona: padZona(z.zona),
      secoes: Math.floor(Number(z.secoes)),
    }))
    .filter((z) => z.zona && z.secoes > 0);

  if (normalized.length === 0) {
    throw new Error("Informe ao menos uma zona com quantidade de seções.");
  }

  const replace = opts?.replaceExisting ?? true;
  const rows: Array<{
    zona: string;
    secao: string;
    nome_escola: string;
    bairro: string | null;
  }> = [];

  for (const z of normalized) {
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

  const supabase = getSupabase();
  let locaisCount: number;

  if (!supabase) {
    locaisCount = replaceMockLocaisForZonas(normalized, replace);
  } else {
    if (replace) {
      const zonaList = normalized.map((z) => z.zona);
      const { error: delError } = await supabase
        .from("locais_votacao")
        .delete()
        .in("zona", zonaList);
      if (delError) throw new Error(delError.message);
    }
    const { error, count } = await supabase.from("locais_votacao").upsert(
      rows,
      { onConflict: "zona,secao", count: "exact" }
    );
    if (error) throw new Error(error.message);
    locaisCount = count ?? rows.length;
  }

  const totalFromZonas = normalized.reduce((s, z) => s + z.secoes, 0);
  const secoesEsperadas =
    opts?.totalOverride != null && opts.totalOverride > 0
      ? Math.floor(opts.totalOverride)
      : totalFromZonas;

  const config = await saveConfig({
    secoes_esperadas: secoesEsperadas,
    zonas_config: normalized,
  });

  invalidateLiveReadCaches();
  return { locais: locaisCount, secoesEsperadas, config };
}

export async function saveSecoesEsperadas(
  total: number
): Promise<ApuracaoConfig> {
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Total de seções esperadas inválido.");
  }
  return saveConfig({ secoes_esperadas: Math.floor(total) });
}

export async function saveRelatorioCargos(
  cargos: string[]
): Promise<ApuracaoConfig> {
  const cleaned =
    cargos.includes("todos") || cargos.length === 0
      ? ["todos"]
      : cargos.filter((c) =>
          (CARGOS_OFICIAIS as readonly string[]).includes(c)
        );

  if (cleaned.length === 0) {
    throw new Error("Selecione ao menos um cargo para o relatório do telão.");
  }

  return saveConfig({ relatorio_cargos: cleaned });
}

type ImportRow = {
  numero: string;
  nome: string;
  cargo: string;
  foto_url: string | null;
  sq_candidato: string | null;
  origem: "catalogo" | "cadastro";
};

function cadastroKey(cargo: string, numero: string): string {
  return `${cargo.trim()}::${normalizeChapadaNumero(numero)}`;
}

function uniqueImportRows(rows: ImportRow[]): {
  rows: ImportRow[];
  duplicates: number;
} {
  const seen = new Map<string, ImportRow>();
  let duplicates = 0;
  for (const row of rows) {
    const key = cadastroKey(row.cargo, row.numero);
    if (seen.has(key)) duplicates += 1;
    seen.set(key, row);
  }
  return { rows: Array.from(seen.values()), duplicates };
}

export async function importCandidatos(
  rows: Array<{
    numero: string;
    nome: string;
    cargo: string;
    foto_url?: string | null;
    sq_candidato?: string | null;
  }>,
  opts?: { origem?: "catalogo" | "cadastro" }
): Promise<{
  upserted: number;
  skippedCadastro: number;
  duplicates: number;
  sqPersisted: boolean;
}> {
  const origem = opts?.origem ?? "catalogo";
  const collected: ImportRow[] = [];

  for (const r of rows) {
    const cargo = r.cargo.trim();
    const chapada = validarNumeroCargoChapada(cargo, r.numero);
    const numero = chapada.ok
      ? chapada.numero
      : normalizeChapadaNumero(r.numero);
    const nome = r.nome.trim();
    if (!numero || !nome || !cargo) continue;
    const sq = normalizeSqCandidato(r.sq_candidato);
    collected.push({
      numero,
      nome,
      cargo,
      foto_url: r.foto_url?.trim() || null,
      sq_candidato: sq,
      origem,
    });
  }

  const unique = uniqueImportRows(collected);
  const normalized = unique.rows;
  const duplicates = unique.duplicates;

  const hasOrigem = await candidatosHasOrigemColumn();
  const hasSq = await candidatosHasSqColumn();
  const supabase = getSupabase();

  if (!supabase) {
    const existing = getMockCandidatos();
    const cadastroMap = new Map(
      existing
        .filter((c) => c.origem === "cadastro")
        .map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
    );
    const toUpsert: ImportRow[] = [];
    let skippedCadastro = 0;
    for (const row of normalized) {
      const featured = cadastroMap.get(cadastroKey(row.cargo, row.numero));
      if (featured && origem !== "cadastro") {
        skippedCadastro += 1;
        if (hasSq && row.sq_candidato && !featured.sq_candidato) {
          featured.sq_candidato = row.sq_candidato;
        }
        if (row.foto_url && !featured.foto_url) {
          featured.foto_url = row.foto_url;
        }
        continue;
      }
      toUpsert.push(row);
    }
    const existingByKey = new Map(
      existing.map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
    );
    for (const row of toUpsert) {
      const prev = existingByKey.get(cadastroKey(row.cargo, row.numero));
      if (prev?.foto_url && !row.foto_url) row.foto_url = prev.foto_url;
    }
    upsertMockCandidatos(toUpsert);
    return {
      upserted: toUpsert.length,
      skippedCadastro,
      duplicates,
      sqPersisted: hasSq,
    };
  }

  const selectCols = hasSq
    ? "id, numero, cargo, origem, foto_url, sq_candidato"
    : "id, numero, cargo, origem, foto_url";
  type Existing = {
    id: string;
    numero: string;
    cargo: string;
    origem?: string | null;
    foto_url?: string | null;
    sq_candidato?: string | null;
  };
  const existingList = await fetchAllSupabaseRows<Existing>(
    supabase,
    "candidatos",
    selectCols
  );
  const cadastroMap = new Map(
    existingList
      .filter((c) => c.origem === "cadastro")
      .map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
  );

  const toUpsert: ImportRow[] = [];
  const cadastroPatches: Array<{
    id: string;
    foto_url?: string;
    sq_candidato?: string;
  }> = [];
  let skippedCadastro = 0;

  for (const row of normalized) {
    const featured = cadastroMap.get(cadastroKey(row.cargo, row.numero));
    if (featured && origem !== "cadastro") {
      skippedCadastro += 1;
      const patch: { id: string; foto_url?: string; sq_candidato?: string } = {
        id: featured.id,
      };
      if (row.foto_url && !featured.foto_url) patch.foto_url = row.foto_url;
      if (hasSq && row.sq_candidato && !featured.sq_candidato) {
        patch.sq_candidato = row.sq_candidato;
      }
      if (patch.foto_url || patch.sq_candidato) cadastroPatches.push(patch);
      continue;
    }
    toUpsert.push(row);
  }

  for (const patch of cadastroPatches) {
    const body: Record<string, string> = {};
    if (patch.foto_url) body.foto_url = patch.foto_url;
    if (patch.sq_candidato) body.sq_candidato = patch.sq_candidato;
    const { error } = await supabase
      .from("candidatos")
      .update(body)
      .eq("id", patch.id);
    if (error) {
      throw supabaseWriteError(
        "Falha ao atualizar oficial do telão",
        error.message
      );
    }
  }

  if (toUpsert.length === 0) {
    return { upserted: 0, skippedCadastro, duplicates, sqPersisted: hasSq };
  }

  const existingByKey = new Map(
    existingList.map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
  );

  const payloadMap = new Map<string, Record<string, unknown>>();
  for (const row of toUpsert) {
    const prev = existingByKey.get(cadastroKey(row.cargo, row.numero));
    const foto = row.foto_url || prev?.foto_url || null;
    const rec: Record<string, unknown> = {
      numero: row.numero,
      nome: row.nome,
      cargo: row.cargo,
      foto_url: foto,
    };
    if (hasOrigem) rec.origem = row.origem;
    if (hasSq && row.sq_candidato) rec.sq_candidato = row.sq_candidato;
    payloadMap.set(cadastroKey(row.cargo, row.numero), rec);
  }
  const payload = Array.from(payloadMap.values());

  let upserted = 0;
  for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
    const slice = payload.slice(i, i + UPSERT_CHUNK);
    const { error, count } = await supabase.from("candidatos").upsert(slice, {
      onConflict: "numero,cargo",
      count: "exact",
    });
    if (error) {
      throw supabaseWriteError("Falha ao importar candidatos", error.message);
    }
    upserted += count ?? slice.length;
  }

  invalidateLiveReadCaches();
  return { upserted, skippedCadastro, duplicates, sqPersisted: hasSq };
}

/**
 * Grava foto_url por numero+cargo.
 * Oficiais do telão (origem=cadastro) só recebem foto se ainda estiver vazia.
 */
export async function applyCandidatoFotos(
  items: Array<{
    numero: string;
    cargo: string;
    foto_url: string;
    id?: string;
  }>
): Promise<{
  updated: number;
  skippedCadastroFoto: number;
  notFound: number;
}> {
  let updated = 0;
  let skippedCadastroFoto = 0;
  let notFound = 0;
  const supabase = getSupabase();

  if (!supabase) {
    const existing = getMockCandidatos();
    for (const item of items) {
      const key = cadastroKey(item.cargo, item.numero);
      const row = existing.find((c) => cadastroKey(c.cargo, c.numero) === key);
      if (!row) {
        notFound += 1;
        continue;
      }
      if (row.origem === "cadastro" && row.foto_url) {
        skippedCadastroFoto += 1;
        continue;
      }
      row.foto_url = item.foto_url;
      updated += 1;
    }
    return { updated, skippedCadastroFoto, notFound };
  }

  const current = await fetchAllSupabaseRows<{
    id: string;
    numero: string;
    cargo: string;
    origem?: string | null;
    foto_url?: string | null;
  }>(supabase, "candidatos", "id, numero, cargo, origem, foto_url");
  const byKey = new Map(
    current.map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
  );
  const byId = new Map(current.map((c) => [c.id, c] as const));

  for (const item of items) {
    const row =
      (item.id ? byId.get(item.id) : undefined) ??
      byKey.get(cadastroKey(item.cargo, item.numero));
    if (!row) {
      notFound += 1;
      continue;
    }
    if (row.origem === "cadastro" && row.foto_url) {
      skippedCadastroFoto += 1;
      continue;
    }
    const { error } = await supabase
      .from("candidatos")
      .update({ foto_url: item.foto_url })
      .eq("id", row.id);
    if (error) {
      throw supabaseWriteError("Falha ao gravar foto", error.message);
    }
    row.foto_url = item.foto_url;
    updated += 1;
  }

  invalidateLiveReadCaches();
  return { updated, skippedCadastroFoto, notFound };
}

/** Grava sq_candidato vazio → valor do CSV. Não apaga SQ já preenchido. */
export async function applyCandidatoSq(
  items: Array<{ numero: string; cargo: string; sq_candidato: string }>
): Promise<{ updated: number; notFound: number }> {
  let updated = 0;
  let notFound = 0;
  const supabase = getSupabase();

  if (!supabase) {
    const existing = getMockCandidatos();
    for (const item of items) {
      const sq = normalizeSqCandidato(item.sq_candidato);
      if (!sq) continue;
      const key = cadastroKey(item.cargo, item.numero);
      const row = existing.find((c) => cadastroKey(c.cargo, c.numero) === key);
      if (!row) {
        notFound += 1;
        continue;
      }
      if (row.sq_candidato) continue;
      row.sq_candidato = sq;
      updated += 1;
    }
    return { updated, notFound };
  }

  if (!(await candidatosHasSqColumn())) {
    return { updated: 0, notFound: 0 };
  }

  const current = await fetchAllSupabaseRows<{
    id: string;
    numero: string;
    cargo: string;
    sq_candidato?: string | null;
  }>(supabase, "candidatos", "id, numero, cargo, sq_candidato");
  const byKey = new Map(
    current.map((c) => [cadastroKey(c.cargo, c.numero), c] as const)
  );

  for (const item of items) {
    const sq = normalizeSqCandidato(item.sq_candidato);
    if (!sq) continue;
    const row = byKey.get(cadastroKey(item.cargo, item.numero));
    if (!row) {
      notFound += 1;
      continue;
    }
    if (row.sq_candidato) continue;
    const { error } = await supabase
      .from("candidatos")
      .update({ sq_candidato: sq })
      .eq("id", row.id);
    if (error) {
      throw supabaseWriteError("Falha ao gravar SQ_CANDIDATO", error.message);
    }
    row.sq_candidato = sq;
    updated += 1;
  }

  invalidateLiveReadCaches();
  return { updated, notFound };
}

/** Só grava foto_url — não muda origem (catálogo/Presidente continua catálogo). */
export async function patchCandidatoFoto(
  id: string,
  foto_url: string | null
): Promise<Candidato> {
  const url = foto_url?.trim() || null;
  const supabase = getSupabase();
  if (!supabase) {
    const updated = updateMockCandidato(id, { foto_url: url });
    if (!updated) throw new Error("Candidato não encontrado.");
    return updated;
  }
  const { data, error } = await supabase
    .from("candidatos")
    .update({ foto_url: url })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw supabaseWriteError("Falha ao gravar foto", error.message);
  return normalizeCandidato(data as Candidato);
}

export function dataModeLabel(): "supabase" | "mock" {
  return hasSupabaseEnv() ? "supabase" : "mock";
}

export function isSupabaseMode(): boolean {
  return hasSupabaseEnv();
}

export { padZona, padSecao };
