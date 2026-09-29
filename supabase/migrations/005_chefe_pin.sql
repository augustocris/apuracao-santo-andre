-- Apuração Eleitoral Paralela — Santo André
-- Migration 005: PIN do /chefe + Presidente permitido em candidatos.cargo
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- Presidente e Governador usam 2 dígitos no TSE. O app NÃO infere Governador
-- para números de 2 dígitos; sem CARG/cabeçalho o cargo fica 'Indefinido'.
-- Unique continua (numero, cargo) — Presidente 13 e Governador 13 coexistem.

-- ---------------------------------------------------------------------------
-- 1. PIN do acesso chefe
-- ---------------------------------------------------------------------------
alter table public.apuracao_config
  add column if not exists chefe_pin text;

update public.apuracao_config
set chefe_pin = 'andre2026'
where id = 1 and (chefe_pin is null or btrim(chefe_pin) = '');

alter table public.apuracao_config
  alter column chefe_pin set default 'andre2026';

-- ---------------------------------------------------------------------------
-- 2. RLS (mesmo estilo demo)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Recria ingest_bu_completo: não força Governador em 2 dígitos.
--    Cargo vem do payload; se vazio, 'Indefinido'.
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

    v_cargo := coalesce(nullif(btrim(v_item->>'cargo'), ''), 'Indefinido');
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

grant execute on function public.ingest_bu_completo(text, text, text, text, jsonb)
  to anon, authenticated;

-- SECURITY CAVEAT (demo): anon lê chefe_pin no config. Troque o PIN no Cadastro
-- e, em produção, restrinja reads/writes (auth admin).
