-- Apuração Eleitoral Paralela — Santo André
-- Migration 004: ingestão completa do BU (todos os candidatos da urna)
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- Objetivo: distinguir cadastrados oficiais (origem=cadastro) dos descobertos
-- no QR/foto (origem=bu), gravar TODOS os pares numero:votos em boletins_urna
-- e bloquear urna duplicada (zona+seção) para o fluxo featured e o completo.

-- ---------------------------------------------------------------------------
-- 1. candidatos.origem
-- ---------------------------------------------------------------------------
alter table public.candidatos
  add column if not exists origem text;

update public.candidatos
set origem = 'cadastro'
where origem is null or btrim(origem) = '';

alter table public.candidatos
  alter column origem set default 'cadastro';

alter table public.candidatos
  drop constraint if exists candidatos_origem_check;

alter table public.candidatos
  add constraint candidatos_origem_check
  check (origem in ('cadastro', 'bu'));

alter table public.candidatos
  alter column origem set not null;

create index if not exists candidatos_origem_idx on public.candidatos (origem);
create index if not exists candidatos_cargo_numero_idx on public.candidatos (cargo, numero);

-- ---------------------------------------------------------------------------
-- 2. RLS (mesmo estilo demo das 001–003: anon select/insert)
--    Policies já existem; recria as de candidatos para cobrir a nova coluna.
-- ---------------------------------------------------------------------------
alter table public.candidatos enable row level security;
alter table public.boletins_urna enable row level security;

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

-- Realtime continua em boletins_urna (idempotente)
do $$
begin
  alter publication supabase_realtime add table public.boletins_urna;
exception
  when duplicate_object then
    null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Transação de ingestão completa
--    p_votes: [{ "numero", "nome", "cargo", "quantidade" }, ...]
--    Não sobrescreve nome/origem de cadastrados oficiais (origem=cadastro).
--    Se a urna (zona+seção) já existe, não insere nada.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_bu_completo(
  p_zona text,
  p_secao text,
  p_raw_text text,
  p_fiscal_nome text,
  p_votes jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_exists boolean;
  v_item jsonb;
  v_numero text;
  v_nome text;
  v_cargo text;
  v_qtd integer;
  v_cand_id uuid;
  v_seen text[] := '{}';
  v_key text;
  inserted integer := 0;
begin
  if p_zona is null or btrim(p_zona) = '' or p_secao is null or btrim(p_secao) = '' then
    return jsonb_build_object('ok', false, 'error', 'Zona e seção são obrigatórias.');
  end if;

  if p_votes is null or jsonb_typeof(p_votes) <> 'array' or jsonb_array_length(p_votes) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nenhum voto para gravar.');
  end if;

  select exists(
    select 1
    from public.boletins_urna
    where zona = p_zona and secao = p_secao
  ) into v_exists;

  if v_exists then
    return jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'message', 'Urna já cadastrada anteriormente'
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_votes)
  loop
    v_numero := regexp_replace(coalesce(v_item->>'numero', ''), '[^0-9]', '', 'g');
    v_numero := nullif(ltrim(v_numero, '0'), '');
    if v_numero is null then
      continue;
    end if;

    v_cargo := coalesce(nullif(btrim(v_item->>'cargo'), ''), 'Outro');
    v_nome := coalesce(
      nullif(btrim(v_item->>'nome'), ''),
      'Candidato ' || v_numero
    );
    v_qtd := coalesce((v_item->>'quantidade')::integer, 0);
    if v_qtd < 0 then
      v_qtd := 0;
    end if;

    v_key := v_cargo || '::' || v_numero;
    if v_key = any (v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_key);

    insert into public.candidatos (numero, nome, cargo, origem)
    values (v_numero, v_nome, v_cargo, 'bu')
    on conflict (numero, cargo) do update
    set nome = case
      when public.candidatos.origem = 'cadastro' then public.candidatos.nome
      when excluded.nome like 'Candidato %' then public.candidatos.nome
      else excluded.nome
    end
    returning id into v_cand_id;

    insert into public.boletins_urna (
      zona, secao, candidato_id, quantidade_votos, raw_text, fiscal_nome
    ) values (
      p_zona, p_secao, v_cand_id, v_qtd, p_raw_text, p_fiscal_nome
    );

    inserted := inserted + 1;
  end loop;

  if inserted = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nenhum voto válido para gravar.');
  end if;

  return jsonb_build_object('ok', true, 'inserted', inserted);
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'message', 'Urna já cadastrada anteriormente'
    );
end;
$$;

comment on function public.ingest_bu_completo(text, text, text, text, jsonb) is
  'Grava todos os votos de um BU: upsert candidatos origem=bu (sem sobrescrever cadastro) e insert boletins. Bloqueia urna duplicada.';

grant execute on function public.ingest_bu_completo(text, text, text, text, jsonb)
  to anon, authenticated;

-- SECURITY CAVEAT (demo): anon pode inserir candidatos e boletins, como nas
-- migrations anteriores. Em produção, restrinja writes (auth admin / service role).
