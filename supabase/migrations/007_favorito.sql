-- Apuração Eleitoral Paralela — Santo André
-- Migration 007: candidatos.favorito (checkbox no /chefe)
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- favorito = marcado no ranking do /chefe. Não altera o telão de 5 cards.
-- Default false. Ingest/chapada não tocam nesta coluna (ON CONFLICT só nome/origem).

alter table public.candidatos
  add column if not exists favorito boolean;

update public.candidatos
set favorito = false
where favorito is null;

alter table public.candidatos
  alter column favorito set default false;

alter table public.candidatos
  alter column favorito set not null;

create index if not exists candidatos_favorito_idx
  on public.candidatos (favorito)
  where favorito = true;

comment on column public.candidatos.favorito is
  'Marcado no ranking do /chefe. Não altera o telão.';
