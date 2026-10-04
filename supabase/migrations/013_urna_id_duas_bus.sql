-- Duas urnas na mesma seção: identidade (zona, secao, urna_id / IDUE).
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).

alter table public.boletins_urna
  add column if not exists urna_id text;

alter table public.boletins_urna
  drop constraint if exists boletins_urna_zona_secao_candidato_unique;

drop index if exists boletins_urna_zona_secao_idue_cand_uidx;
create unique index boletins_urna_zona_secao_idue_cand_uidx
  on public.boletins_urna (zona, secao, coalesce(urna_id, ''), candidato_id);

create index if not exists boletins_urna_urna_id_idx
  on public.boletins_urna (zona, secao, urna_id);

drop function if exists public.ingest_bu_completo(text, text, text, text, jsonb);

create or replace function public.ingest_bu_completo(
  p_zona text,
  p_secao text,
  p_raw_text text,
  p_fiscal_nome text,
  p_votes jsonb,
  p_urna_id text default null
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
  v_urna text;
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

  v_urna := nullif(btrim(coalesce(p_urna_id, '')), '');
  if v_urna is null and p_raw_text is not null then
    v_urna := substring(p_raw_text from 'IDUE\s*:\s*(\d+)');
    if v_urna is null then
      v_urna := substring(p_raw_text from 'NR_UE\s*:\s*(\d+)');
    end if;
    if v_urna is null then
      v_urna := substring(p_raw_text from 'NRUE\s*:\s*(\d+)');
    end if;
  end if;

  select exists(
    select 1
    from public.boletins_urna
    where zona = p_zona
      and secao = p_secao
      and coalesce(urna_id, '') = coalesce(v_urna, '')
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
      zona, secao, urna_id, candidato_id, quantidade_votos, raw_text, fiscal_nome
    ) values (
      p_zona, p_secao, v_urna, v_cand_id, v_qtd, p_raw_text, p_fiscal_nome
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

grant execute on function public.ingest_bu_completo(text, text, text, text, jsonb, text)
  to anon, authenticated;

comment on function public.ingest_bu_completo(text, text, text, text, jsonb, text) is
  'Grava BU completo. Duplicata só (zona, seção, IDUE). Duas urnas na mesma seção são permitidas.';
