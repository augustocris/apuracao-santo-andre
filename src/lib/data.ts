import {
  deleteMockCandidato,
  findMockLocal,
  getMockBoletins,
  getMockCandidatos,
  getMockConfig,
  getMockLocais,
  insertMockBoletins,
  replaceMockLocaisForZonas,
  setMockConfig,
  subscribeMock,
  updateMockCandidato,
  upsertMockCandidatos,
  upsertMockLocais,
} from "@/lib/mock-store";
import {
  CARGOS_OFICIAIS,
  DEFAULT_RELATORIO_CARGOS,
  validarNumeroCargo,
} from "@/lib/cargos";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";
import type {
  ApuracaoConfig,
  Candidato,
  CargoRanking,
  ConfirmVoteRow,
  DashboardSnapshot,
  FeedItem,
  LocalVotacao,
  RankingRow,
  TransmitPayload,
  ZonaConfigRow,
} from "@/lib/types";

function padZona(zona: string): string {
  return zona.replace(/\D/g, "").padStart(3, "0");
}

function padSecao(secao: string): string {
  return secao.replace(/\D/g, "").padStart(4, "0");
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
  };
}

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
  const filtered = candidatos.filter((c) => c.cargo === cargo);
  const totalVotos = filtered.reduce(
    (sum, c) => sum + (byCand.get(c.id) ?? 0),
    0
  );
  const rankings: RankingRow[] = filtered
    .map((candidato) => {
      const votos = byCand.get(candidato.id) ?? 0;
      return {
        candidato,
        votos,
        percentual: totalVotos > 0 ? (votos / totalVotos) * 100 : 0,
      };
    })
    .sort((a, b) => b.votos - a.votos);

  return { cargo, rankings, totalVotos };
}

function buildSnapshot(
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
  const byCand = new Map<string, number>();
  for (const b of boletins) {
    byCand.set(
      b.candidato_id,
      (byCand.get(b.candidato_id) ?? 0) + b.quantidade_votos
    );
  }

  const cargoFilters = resolveCargoFilters(
    config.relatorio_cargos,
    cargoOverride
  );
  const rankingsByCargo = cargoFilters.map((cargo) =>
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
    relatorioCargos: cargoFilters,
    feed,
    mode,
  };
}

export async function getConfig(): Promise<ApuracaoConfig> {
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
      secoes_esperadas: 0,
      relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
      zonas_config: [],
    });
  }

  if (!data) {
    const seed = normalizeConfig({
      secoes_esperadas: 0,
      relatorio_cargos: [...DEFAULT_RELATORIO_CARGOS],
      zonas_config: [],
    });
    await supabase.from("apuracao_config").upsert(seed);
    return seed;
  }

  return normalizeConfig(data as ApuracaoConfig);
}

export async function saveConfig(
  patch: Partial<
    Pick<ApuracaoConfig, "secoes_esperadas" | "relatorio_cargos" | "zonas_config">
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

  const { data, error } = await supabase
    .from("apuracao_config")
    .upsert({
      id: 1,
      secoes_esperadas: next.secoes_esperadas,
      relatorio_cargos: next.relatorio_cargos,
      zonas_config: next.zonas_config,
      updated_at: next.updated_at,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return normalizeConfig(data as ApuracaoConfig);
}

export async function listCandidatos(opts?: {
  activeRaceOnly?: boolean;
}): Promise<Candidato[]> {
  const supabase = getSupabase();
  let list: Candidato[];

  if (!supabase) {
    list = getMockCandidatos();
  } else {
    const { data, error } = await supabase
      .from("candidatos")
      .select("*")
      .order("cargo")
      .order("numero");

    if (error) throw new Error(error.message);
    list = (data ?? []) as Candidato[];
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

  const row = {
    numero: validated.numero,
    nome,
    cargo: input.cargo.trim(),
    foto_url: input.foto_url?.trim() || null,
  };

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
    if (error) throw new Error(error.message);
    return data as Candidato;
  }

  const { data, error } = await supabase
    .from("candidatos")
    .upsert(row, { onConflict: "numero,cargo" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Candidato;
}

export async function removeCandidato(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    if (!deleteMockCandidato(id)) throw new Error("Candidato não encontrado.");
    return;
  }
  const { error } = await supabase.from("candidatos").delete().eq("id", id);
  if (error) throw new Error(error.message);
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

export async function resolveConfirmRows(
  votes: Array<{ numero: string; quantidade: number }>
): Promise<{ rows: ConfirmVoteRow[]; unknown: string[] }> {
  const candidatos = await listCandidatos({ activeRaceOnly: true });
  const byNumero = new Map(candidatos.map((c) => [c.numero, c]));
  const rows: ConfirmVoteRow[] = [];
  const unknown: string[] = [];

  for (const vote of votes) {
    const candidato = byNumero.get(vote.numero);
    if (!candidato) {
      unknown.push(vote.numero);
      continue;
    }
    rows.push({ candidato, quantidade: vote.quantidade });
  }

  return { rows, unknown };
}

export async function transmitVotes(
  payload: TransmitPayload
): Promise<{ ok: true } | { ok: false; duplicate: true; message: string }> {
  const zona = padZona(payload.zona);
  const secao = padSecao(payload.secao);
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
        message: "Urna já cadastrada anteriormente",
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
      message: "Urna já cadastrada anteriormente",
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
        message: "Urna já cadastrada anteriormente",
      };
    }
    throw new Error(error.message);
  }

  return { ok: true };
}

export async function fetchDashboard(
  cargoOverride?: string | string[]
): Promise<DashboardSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return buildSnapshot(
      getMockLocais(),
      getMockCandidatos(),
      getMockBoletins(),
      getMockConfig(),
      "mock",
      cargoOverride
    );
  }

  const [locaisRes, candRes, buRes, config] = await Promise.all([
    supabase.from("locais_votacao").select("*"),
    supabase.from("candidatos").select("*"),
    supabase
      .from("boletins_urna")
      .select(
        "id, zona, secao, candidato_id, quantidade_votos, fiscal_nome, created_at"
      )
      .order("created_at", { ascending: false }),
    getConfig(),
  ]);

  if (locaisRes.error) throw new Error(locaisRes.error.message);
  if (candRes.error) throw new Error(candRes.error.message);
  if (buRes.error) throw new Error(buRes.error.message);

  return buildSnapshot(
    (locaisRes.data ?? []) as LocalVotacao[],
    (candRes.data ?? []) as Candidato[],
    buRes.data ?? [],
    config,
    "supabase",
    cargoOverride
  );
}

export function subscribeDashboard(
  onChange: () => void,
  pollMs = 4000
): () => void {
  const supabase = getSupabase();

  if (!supabase) {
    const unsub = subscribeMock(onChange);
    const timer = setInterval(onChange, pollMs);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }

  const channel = supabase
    .channel("boletins_urna_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "boletins_urna" },
      () => onChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "apuracao_config" },
      () => onChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "candidatos" },
      () => onChange()
    )
    .subscribe();

  const timer = setInterval(onChange, pollMs);

  return () => {
    clearInterval(timer);
    void supabase.removeChannel(channel);
  };
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

export async function importCandidatos(
  rows: Array<{
    numero: string;
    nome: string;
    cargo: string;
    foto_url?: string | null;
  }>
): Promise<number> {
  const normalized = rows.map((r) => {
    const validated = validarNumeroCargo(r.cargo, r.numero);
    if (!validated.ok) {
      // Allow legacy cargos (Prefeito/Vereador) via import API
      return {
        numero: r.numero.replace(/\D/g, ""),
        nome: r.nome.trim(),
        cargo: r.cargo.trim(),
        foto_url: r.foto_url?.trim() || null,
      };
    }
    return {
      numero: validated.numero,
      nome: r.nome.trim(),
      cargo: r.cargo.trim(),
      foto_url: r.foto_url?.trim() || null,
    };
  });

  const supabase = getSupabase();
  if (!supabase) return upsertMockCandidatos(normalized);

  const { error, count } = await supabase.from("candidatos").upsert(
    normalized,
    { onConflict: "numero,cargo", count: "exact" }
  );
  if (error) throw new Error(error.message);
  return count ?? normalized.length;
}

export function dataModeLabel(): "supabase" | "mock" {
  return hasSupabaseEnv() ? "supabase" : "mock";
}

export { padZona, padSecao };
