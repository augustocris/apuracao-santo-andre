-- Apuração Eleitoral Paralela — Santo André
-- Migration 002: admin config, state-election cargos, idempotent realtime
-- Run in the Supabase SQL editor after 001_init.sql.

-- ---------------------------------------------------------------------------
-- 1. Idempotent Realtime publication for boletins_urna
--    (001 used a bare ALTER which fails if already added)
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.boletins_urna;
exception
  when duplicate_object then
    null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Singleton config for expected sections + telão report cargos
-- ---------------------------------------------------------------------------
create table if not exists public.apuracao_config (
  id integer primary key default 1 check (id = 1),
  secoes_esperadas integer not null default 0 check (secoes_esperadas >= 0),
  relatorio_cargos text[] not null default array[
    'Governador',
    'Senador',
    'Deputado Federal',
    'Deputado Estadual'
  ]::text[],
  zonas_config jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.apuracao_config (id, secoes_esperadas, relatorio_cargos, zonas_config)
values (
  1,
  0,
  array['Governador', 'Senador', 'Deputado Federal', 'Deputado Estadual']::text[],
  '[]'::jsonb
)
on conflict (id) do nothing;

alter table public.apuracao_config enable row level security;

drop policy if exists "apuracao_config_select_anon" on public.apuracao_config;
create policy "apuracao_config_select_anon"
  on public.apuracao_config for select to anon, authenticated
  using (true);

drop policy if exists "apuracao_config_insert_anon" on public.apuracao_config;
create policy "apuracao_config_insert_anon"
  on public.apuracao_config for insert to anon, authenticated
  with check (true);

drop policy if exists "apuracao_config_update_anon" on public.apuracao_config;
create policy "apuracao_config_update_anon"
  on public.apuracao_config for update to anon, authenticated
  using (true) with check (true);

-- SECURITY CAVEAT (demo): anon may read/write config, matching 001 open RLS.
-- Restrict writes in production (service role API or authenticated admin only).

-- ---------------------------------------------------------------------------
-- 3. Ensure delete policy on candidatos (admin edit/replace)
-- ---------------------------------------------------------------------------
drop policy if exists "candidatos_delete_anon" on public.candidatos;
create policy "candidatos_delete_anon"
  on public.candidatos for delete to anon, authenticated
  using (true);

drop policy if exists "locais_votacao_delete_anon" on public.locais_votacao;
create policy "locais_votacao_delete_anon"
  on public.locais_votacao for delete to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. Seed state-election candidates (admin remains source of truth for race)
--    Keeps Prefeito/Vereador rows from 001 if present; adds new cargos.
-- ---------------------------------------------------------------------------
insert into public.candidatos (id, numero, nome, cargo, foto_url) values
  ('22222222-2222-2222-2222-222222222201', '13', 'Maria Silva', 'Governador', null),
  ('22222222-2222-2222-2222-222222222202', '45', 'João Santos', 'Governador', null),
  ('22222222-2222-2222-2222-222222222211', '131', 'Carlos Oliveira', 'Senador', null),
  ('22222222-2222-2222-2222-222222222212', '456', 'Patricia Lima', 'Senador', null),
  ('22222222-2222-2222-2222-222222222221', '1313', 'Ana Costa', 'Deputado Federal', null),
  ('22222222-2222-2222-2222-222222222231', '13131', 'Roberto Alves', 'Deputado Estadual', null)
on conflict (numero, cargo) do nothing;

-- Sync secoes_esperadas from existing locais when still zero
update public.apuracao_config c
set secoes_esperadas = greatest(
  c.secoes_esperadas,
  (select count(*)::integer from public.locais_votacao)
),
updated_at = now()
where c.id = 1 and c.secoes_esperadas = 0;
