-- Apuração Eleitoral Paralela — Santo André
-- Migration 003: public Storage bucket for candidate photos
-- Run in the Supabase SQL editor after 001 + 002.
--
-- Creates bucket `candidatos` (public read) and allows anon/authenticated
-- upload + update + delete for the Cadastro UI (demo-friendly RLS, same
-- posture as 001/002). Restrict writes in production if needed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidatos',
  'candidatos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read
drop policy if exists "candidatos_storage_select_public" on storage.objects;
create policy "candidatos_storage_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'candidatos');

-- Anon upload (Cadastro via browser + anon key)
drop policy if exists "candidatos_storage_insert_anon" on storage.objects;
create policy "candidatos_storage_insert_anon"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'candidatos');

drop policy if exists "candidatos_storage_update_anon" on storage.objects;
create policy "candidatos_storage_update_anon"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'candidatos')
  with check (bucket_id = 'candidatos');

drop policy if exists "candidatos_storage_delete_anon" on storage.objects;
create policy "candidatos_storage_delete_anon"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'candidatos');

-- SECURITY CAVEAT (demo): anon may write photos. For production, prefer
-- authenticated admin or a service-role upload API route.
