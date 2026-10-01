-- Apuração Eleitoral Paralela — Santo André
-- Migration 010: allowlist de zonas (apuracao_config.zonas_config)
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- Regras:
-- - Se zonas_config tiver linhas, ESSAS zonas são a allowlist (não apaga cadastro).
-- - Se estiver vazio, ingest aceita as 6 zonas de Santo André (383, 307, 306, 264, 263, 156).
-- - Qualquer seção vale se a zona estiver na lista (383 tem buracos e seção 401).
-- - 383 e 0383 são a mesma zona (só dígitos, sem zeros à esquerda).
-- - Duplicata (zona, seção) permanece.

-- ---------------------------------------------------------------------------
-- 1. Seed das 6 zonas SÓ se o cadastro ainda não tiver zonas_config
-- ---------------------------------------------------------------------------
update public.apuracao_config
set
  zonas_config = '[
    {"zona":"383","secoes":304},
    {"zona":"307","secoes":280},
    {"zona":"306","secoes":290},
    {"zona":"264","secoes":240},
    {"zona":"263","secoes":307},
    {"zona":"156","secoes":323}
  ]'::jsonb,
  updated_at = now()
where id = 1
  and (
    zonas_config is null
    or jsonb_typeof(zonas_config) <> 'array'
    or jsonb_array_length(zonas_config) = 0
  );

-- ---------------------------------------------------------------------------
-- 2. Helper: zona está na allowlist do cadastro (ou fallback SA)
-- ---------------------------------------------------------------------------
create or replace function public.zona_santo_andre_permitida(p_zona text)
returns boolean
language plpgsql
stable
as $$
declare
  v_key text;
  v_has_config boolean;
  v_ok boolean;
begin
  v_key := ltrim(regexp_replace(coalesce(p_zona, ''), '[^0-9]', '', 'g'), '0');
  if v_key is null or v_key = '' then
    return false;
  end if;

  select
    jsonb_typeof(zonas_config) = 'array'
    and jsonb_array_length(zonas_config) > 0
  into v_has_config
  from public.apuracao_config
  where id = 1;

  if coalesce(v_has_config, false) then
    select exists(
      select 1
      from public.apuracao_config c,
           jsonb_array_elements(c.zonas_config) z
      where c.id = 1
        and ltrim(regexp_replace(coalesce(z->>'zona', ''), '[^0-9]', '', 'g'), '0') = v_key
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  return v_key in ('383', '307', '306', '264', '263', '156');
end;
$$;

comment on function public.zona_santo_andre_permitida(text) is
  'True se a zona está em apuracao_config.zonas_config, ou nas 6 de Santo André se o cadastro estiver vazio. Não limita número de seção.';

-- ---------------------------------------------------------------------------
-- 3. ingest_bu_completo: recusa zona fora (mesmo corpo da 006 + check)
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

  if not public.zona_santo_andre_permitida(p_zona) then
    return jsonb_build_object('ok', false, 'error', 'Zona não é de Santo André');
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
      when public.candidatos.origem in ('cadastro', 'catalogo') then public.candidatos.nome
      when excluded.nome like 'Candidato %' then public.candidatos.nome
      else excluded.nome
    end,
    origem = case
      when public.candidatos.origem in ('cadastro', 'catalogo') then public.candidatos.origem
      else 'bu'
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

comment on function public.ingest_bu_completo(text, text, text, text, jsonb) is
  'Grava BU completo. Recusa zona fora de apuracao_config.zonas_config (ou das 6 de SA se vazio). Duplicata (zona, seção).';
