import {
  findMockLocal,
  getMockBoletins,
  getMockCandidatos,
  getMockLocais,
  insertMockBoletins,
  subscribeMock,
  upsertMockCandidatos,
  upsertMockLocais,
} from "@/lib/mock-store";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";
import type {
  Candidato,
  ConfirmVoteRow,
  DashboardSnapshot,
  FeedItem,
  LocalVotacao,
  RankingRow,
  TransmitPayload,
} from "@/lib/types";

function padZona(zona: string): string {
  return zona.replace(/\D/g, "").padStart(3, "0");
}

function padSecao(secao: string): string {
  return secao.replace(/\D/g, "").padStart(4, "0");
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
  mode: "supabase" | "mock",
  cargoFilter: string = "Prefeito"
): DashboardSnapshot {
  const byCand = new Map<string, number>();
  for (const b of boletins) {
    byCand.set(
      b.candidato_id,
      (byCand.get(b.candidato_id) ?? 0) + b.quantidade_votos
    );
  }

  const filtered = candidatos.filter((c) => c.cargo === cargoFilter);
  const totalVotosValidos = filtered.reduce(
    (sum, c) => sum + (byCand.get(c.id) ?? 0),
    0
  );

  const rankings: RankingRow[] = filtered
    .map((candidato) => {
      const votos = byCand.get(candidato.id) ?? 0;
      return {
        candidato,
        votos,
        percentual: totalVotosValidos > 0 ? (votos / totalVotosValidos) * 100 : 0,
      };
    })
    .sort((a, b) => b.votos - a.votos);

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

  return {
    totalSecoes: locais.length,
    urnasApuradas: urnasKeys.size,
    totalVotosValidos,
    rankings,
    feed,
    mode,
  };
}

export async function listCandidatos(): Promise<Candidato[]> {
  const supabase = getSupabase();
  if (!supabase) return getMockCandidatos();

  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .order("cargo")
    .order("numero");

  if (error) throw new Error(error.message);
  return (data ?? []) as Candidato[];
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
  const candidatos = await listCandidatos();
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
  cargoFilter: string = "Prefeito"
): Promise<DashboardSnapshot> {
  const supabase = getSupabase();
  if (!supabase) {
    return buildSnapshot(
      getMockLocais(),
      getMockCandidatos(),
      getMockBoletins(),
      "mock",
      cargoFilter
    );
  }

  const [locaisRes, candRes, buRes] = await Promise.all([
    supabase.from("locais_votacao").select("*"),
    supabase.from("candidatos").select("*"),
    supabase
      .from("boletins_urna")
      .select(
        "id, zona, secao, candidato_id, quantidade_votos, fiscal_nome, created_at"
      )
      .order("created_at", { ascending: false }),
  ]);

  if (locaisRes.error) throw new Error(locaisRes.error.message);
  if (candRes.error) throw new Error(candRes.error.message);
  if (buRes.error) throw new Error(buRes.error.message);

  return buildSnapshot(
    (locaisRes.data ?? []) as LocalVotacao[],
    (candRes.data ?? []) as Candidato[],
    buRes.data ?? [],
    "supabase",
    cargoFilter
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

export async function importCandidatos(
  rows: Array<{
    numero: string;
    nome: string;
    cargo: string;
    foto_url?: string | null;
  }>
): Promise<number> {
  const normalized = rows.map((r) => ({
    numero: r.numero.replace(/\D/g, ""),
    nome: r.nome.trim(),
    cargo: r.cargo.trim(),
    foto_url: r.foto_url?.trim() || null,
  }));

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
