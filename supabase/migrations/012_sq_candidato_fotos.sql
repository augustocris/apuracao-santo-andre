-- Apuração Eleitoral Paralela — Santo André
-- Migration 012: garante candidatos.sq_candidato (idempotente com a 008)
-- Cole no SQL Editor do Supabase se a 008 não rodou. A Vercel não executa SQL.
--
-- Sem esta coluna o import CSV não grava SQ_CANDIDATO e o ZIP / “Vincular
-- fotos já no Storage” não casa FSP{sq}_div.jpg / FBR{sq}_div.jpg no catálogo.
-- Depois de rodar: Cadastro → reimportar consulta_cand2026_SP (+ BR Presidente)
-- → Vincular fotos já no Storage. Não precisa reenviar o ZIP.

alter table public.candidatos
  add column if not exists sq_candidato text;

create index if not exists candidatos_sq_candidato_idx
  on public.candidatos (sq_candidato)
  where sq_candidato is not null;

comment on column public.candidatos.sq_candidato is
  'Identificador TSE SQ_CANDIDATO (fotos de urna). Opcional; matching principal é filename + CSV.';
