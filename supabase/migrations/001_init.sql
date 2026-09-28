-- Apuração Eleitoral Paralela — Santo André
-- Run this migration in the Supabase SQL editor (or via CLI).

create extension if not exists "pgcrypto";

-- 1. Polling places (escolas / seções)
create table if not exists public.locais_votacao (
  id uuid primary key default gen_random_uuid(),
  zona text not null,
  secao text not null,
  nome_escola text not null,
  bairro text,
  constraint locais_votacao_zona_secao_unique unique (zona, secao)
);

-- 2. Candidates
create table if not exists public.candidatos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  nome text not null,
  cargo text not null,
  foto_url text,
  constraint candidatos_numero_cargo_unique unique (numero, cargo)
);

-- 3. Ballot box bulletins (one row per candidate per urna)
create table if not exists public.boletins_urna (
  id uuid primary key default gen_random_uuid(),
  zona text not null,
  secao text not null,
  candidato_id uuid not null references public.candidatos (id) on delete restrict,
  quantidade_votos integer not null check (quantidade_votos >= 0),
  raw_text text,
  fiscal_nome text,
  created_at timestamptz not null default now(),
  constraint boletins_urna_zona_secao_candidato_unique unique (zona, secao, candidato_id)
);

create index if not exists boletins_urna_created_at_idx on public.boletins_urna (created_at desc);
create index if not exists boletins_urna_zona_secao_idx on public.boletins_urna (zona, secao);

-- Realtime: enable replication for live telão updates
alter publication supabase_realtime add table public.boletins_urna;

-- RLS (demo-friendly: anon can read everything and insert bulletins)
alter table public.locais_votacao enable row level security;
alter table public.candidatos enable row level security;
alter table public.boletins_urna enable row level security;

drop policy if exists "locais_votacao_select_anon" on public.locais_votacao;
create policy "locais_votacao_select_anon"
  on public.locais_votacao for select to anon, authenticated
  using (true);

drop policy if exists "locais_votacao_insert_anon" on public.locais_votacao;
create policy "locais_votacao_insert_anon"
  on public.locais_votacao for insert to anon, authenticated
  with check (true);

drop policy if exists "locais_votacao_update_anon" on public.locais_votacao;
create policy "locais_votacao_update_anon"
  on public.locais_votacao for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "candidatos_select_anon" on public.candidatos;
create policy "candidatos_select_anon"
  on public.candidatos for select to anon, authenticated
  using (true);

drop policy if exists "candidatos_insert_anon" on public.candidatos;
create policy "candidatos_insert_anon"
  on public.candidatos for insert to anon, authenticated
  with check (true);

drop policy if exists "candidatos_update_anon" on public.candidatos;
create policy "candidatos_update_anon"
  on public.candidatos for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "boletins_urna_select_anon" on public.boletins_urna;
create policy "boletins_urna_select_anon"
  on public.boletins_urna for select to anon, authenticated
  using (true);

drop policy if exists "boletins_urna_insert_anon" on public.boletins_urna;
create policy "boletins_urna_insert_anon"
  on public.boletins_urna for insert to anon, authenticated
  with check (true);

-- Seed data (Santo André sample)
insert into public.candidatos (id, numero, nome, cargo, foto_url) values
  ('11111111-1111-1111-1111-111111111101', '13', 'Maria Silva', 'Prefeito', null),
  ('11111111-1111-1111-1111-111111111102', '45', 'João Santos', 'Prefeito', null),
  ('11111111-1111-1111-1111-111111111103', '22', 'Ana Costa', 'Prefeito', null),
  ('11111111-1111-1111-1111-111111111201', '13001', 'Carlos Oliveira', 'Vereador', null),
  ('11111111-1111-1111-1111-111111111202', '45002', 'Patricia Lima', 'Vereador', null),
  ('11111111-1111-1111-1111-111111111203', '22003', 'Roberto Alves', 'Vereador', null),
  ('11111111-1111-1111-1111-111111111204', '15015', 'Fernanda Souza', 'Vereador', null)
on conflict (numero, cargo) do nothing;

insert into public.locais_votacao (zona, secao, nome_escola, bairro) values
  ('001', '0001', 'EMEF Professora Maria Alice', 'Centro'),
  ('001', '0002', 'EMEF Professora Maria Alice', 'Centro'),
  ('001', '0003', 'EE Professor Anísio Teixeira', 'Vila Assunção'),
  ('002', '0010', 'EMEF Doutor Américo Brasiliense', 'Campestre'),
  ('002', '0011', 'EMEF Doutor Américo Brasiliense', 'Campestre'),
  ('003', '0020', 'EE Doutor Celso Gallo', 'Jardim'),
  ('003', '0021', 'EMEF Padre Anchieta', 'Utinga'),
  ('004', '0030', 'EMEF Joaquim Nabuco', 'Parque das Nações'),
  ('004', '0031', 'EE Fundação Salvador Arena', 'Parque das Nações'),
  ('005', '0040', 'EMEF Walt Disney', 'Bangu')
on conflict (zona, secao) do nothing;
