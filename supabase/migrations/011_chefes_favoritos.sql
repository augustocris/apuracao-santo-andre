-- Apuração Eleitoral Paralela — Santo André
-- Migration 011: acessos chefe (PIN) + favoritos por chefe
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- Um único /chefe. Ranking, votos e telão continuam globais.
-- Estrelas e “Somente favoritos” usam só chefe_favoritos da sessão do PIN.
-- A coluna candidatos.favorito (007) fica sem uso.

-- ---------------------------------------------------------------------------
-- 1. chefes (PIN único)
-- ---------------------------------------------------------------------------
create table if not exists public.chefes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pin text not null,
  created_at timestamptz not null default now(),
  constraint chefes_pin_unique unique (pin)
);

create index if not exists chefes_pin_idx on public.chefes (pin);

comment on table public.chefes is
  'Acessos do /chefe. Cada PIN carrega a própria lista de favoritos.';

-- ---------------------------------------------------------------------------
-- 2. chefe_favoritos (par único)
-- ---------------------------------------------------------------------------
create table if not exists public.chefe_favoritos (
  chefe_id uuid not null references public.chefes (id) on delete cascade,
  candidato_id uuid not null references public.candidatos (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chefe_favoritos_pkey primary key (chefe_id, candidato_id)
);

create index if not exists chefe_favoritos_candidato_idx
  on public.chefe_favoritos (candidato_id);

comment on table public.chefe_favoritos is
  'Favoritos do ranking /chefe, isolados por PIN. Não altera o telão.';

-- ---------------------------------------------------------------------------
-- 3. Seed Cristiano / andre2026 (não inventa outros PINs)
-- ---------------------------------------------------------------------------
insert into public.chefes (nome, pin)
select 'Cristiano', 'andre2026'
where not exists (
  select 1 from public.chefes where btrim(pin) = 'andre2026'
);

update public.apuracao_config
set
  chefe_pin = 'andre2026',
  updated_at = now()
where id = 1
  and (chefe_pin is null or btrim(chefe_pin) = '');

-- Mantém o PIN legado em sync com o seed (não quebra andre2026).
update public.apuracao_config
set
  chefe_pin = 'andre2026',
  updated_at = now()
where id = 1
  and exists (select 1 from public.chefes where btrim(pin) = 'andre2026')
  and btrim(coalesce(chefe_pin, '')) = 'andre2026';

-- ---------------------------------------------------------------------------
-- 4. RLS aberto (mesmo estilo demo da 001)
-- ---------------------------------------------------------------------------
alter table public.chefes enable row level security;
alter table public.chefe_favoritos enable row level security;

drop policy if exists "chefes_select_anon" on public.chefes;
create policy "chefes_select_anon"
  on public.chefes for select to anon, authenticated
  using (true);

drop policy if exists "chefes_insert_anon" on public.chefes;
create policy "chefes_insert_anon"
  on public.chefes for insert to anon, authenticated
  with check (true);

drop policy if exists "chefes_update_anon" on public.chefes;
create policy "chefes_update_anon"
  on public.chefes for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "chefes_delete_anon" on public.chefes;
create policy "chefes_delete_anon"
  on public.chefes for delete to anon, authenticated
  using (true);

drop policy if exists "chefe_favoritos_select_anon" on public.chefe_favoritos;
create policy "chefe_favoritos_select_anon"
  on public.chefe_favoritos for select to anon, authenticated
  using (true);

drop policy if exists "chefe_favoritos_insert_anon" on public.chefe_favoritos;
create policy "chefe_favoritos_insert_anon"
  on public.chefe_favoritos for insert to anon, authenticated
  with check (true);

drop policy if exists "chefe_favoritos_update_anon" on public.chefe_favoritos;
create policy "chefe_favoritos_update_anon"
  on public.chefe_favoritos for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "chefe_favoritos_delete_anon" on public.chefe_favoritos;
create policy "chefe_favoritos_delete_anon"
  on public.chefe_favoritos for delete to anon, authenticated
  using (true);

-- SECURITY CAVEAT (demo): anon lê PINs em chefes. Adequado para demo interna.
-- Em produção, restrinja reads/writes (auth admin).
