-- Apuração Eleitoral Paralela — Santo André
-- Migration 009: domingo dos fiscais
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- 1. whatsapp_suporte em apuracao_config (editável no Cadastro)
-- 2. secoes_esperadas = 1744 só se ainda estiver no seed (0) — não apaga config do usuário
-- 3. Fila bus_pendentes (QR que o parser recusou)
-- 4. Realtime com exception duplicate_object (42710) em reruns

-- ---------------------------------------------------------------------------
-- 1. WhatsApp da central
-- ---------------------------------------------------------------------------
alter table public.apuracao_config
  add column if not exists whatsapp_suporte text;

comment on column public.apuracao_config.whatsapp_suporte is
  'WhatsApp da central (dígitos, com DDI se quiser). Vazio = pedir o número à central.';

-- ---------------------------------------------------------------------------
-- 2. Expectativa de seções: só preenche seed vazio
-- ---------------------------------------------------------------------------
update public.apuracao_config
set secoes_esperadas = 1744,
    updated_at = now()
where id = 1 and secoes_esperadas = 0;

alter table public.apuracao_config
  alter column secoes_esperadas set default 1744;

-- ---------------------------------------------------------------------------
-- 3. BUs pendentes / com erro de parse
-- ---------------------------------------------------------------------------
create table if not exists public.bus_pendentes (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  erro text not null,
  status text not null default 'pendente',
  zona text,
  secao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bus_pendentes_status_check
    check (status in ('pendente', 'reprocessado'))
);

create index if not exists bus_pendentes_status_idx
  on public.bus_pendentes (status, created_at desc);

alter table public.bus_pendentes enable row level security;

drop policy if exists "bus_pendentes_select_anon" on public.bus_pendentes;
create policy "bus_pendentes_select_anon"
  on public.bus_pendentes for select to anon, authenticated
  using (true);

drop policy if exists "bus_pendentes_insert_anon" on public.bus_pendentes;
create policy "bus_pendentes_insert_anon"
  on public.bus_pendentes for insert to anon, authenticated
  with check (true);

drop policy if exists "bus_pendentes_update_anon" on public.bus_pendentes;
create policy "bus_pendentes_update_anon"
  on public.bus_pendentes for update to anon, authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4. Realtime — nunca falhar com 42710 em rerun
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.boletins_urna;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.apuracao_config;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.candidatos;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.bus_pendentes;
exception
  when duplicate_object then
    null;
end $$;
