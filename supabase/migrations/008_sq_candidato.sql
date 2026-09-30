-- Apuração Eleitoral Paralela — Santo André
-- Migration 008: SQ_CANDIDATO opcional para casar fotos de urna do TSE
-- Idempotente. Cole no SQL Editor do Supabase (a Vercel não executa migrations).
--
-- A chapada casa fotos pelo dígito longo do arquivo (FSP{SQ}_div.jpg / {SQ}_div.jpg / FSP{SQ}.jpg; fallback NR_CANDIDATO se único)
-- + colunas do CSV. Esta coluna só guarda o identificador para reenviar ZIP
-- sem precisar colar o CSV de novo. Não é obrigatória para o import.

alter table public.candidatos
  add column if not exists sq_candidato text;

create index if not exists candidatos_sq_candidato_idx
  on public.candidatos (sq_candidato)
  where sq_candidato is not null;

comment on column public.candidatos.sq_candidato is
  'Identificador TSE SQ_CANDIDATO (fotos de urna). Opcional; matching principal é filename + CSV.';
