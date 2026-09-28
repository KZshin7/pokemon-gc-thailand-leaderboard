-- Shared leaderboard data and owner-private evidence storage.
create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null,
  rating numeric not null,
  evidence_path text,
  has_evidence boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_entries_player_name_length
    check (char_length(btrim(player_name)) between 1 and 60),
  constraint leaderboard_entries_owner_unique unique (owner_id),
  constraint leaderboard_entries_evidence_path_format
    check (evidence_path is null or evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
);

alter table public.leaderboard_entries
  alter column rating type numeric using rating::numeric;
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_rating_range;
alter table public.leaderboard_entries
  add constraint leaderboard_entries_rating_range
  check (rating between 0 and 9999 and rating = trunc(rating, 3));

-- Remove reviewer features from an installation of an earlier PR revision.
drop policy if exists "Owners and reviewers can read evidence" on storage.objects;
drop policy if exists "Owners can read evidence" on storage.objects;
drop policy if exists "Users can create their own pending entry" on public.leaderboard_entries;

drop function if exists public.get_leaderboard_evidence_path_for_review(uuid);
drop function if exists public.review_leaderboard_entry(uuid, text);
drop function if exists public.is_leaderboard_reviewer();

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_verification_status,
  drop constraint if exists leaderboard_entries_verified_timestamp,
  drop column if exists verification_status,
  drop column if exists verified_at,
  drop column if exists reviewed_by;

create or replace function public.set_leaderboard_entry_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
  end if;

  new.updated_at := now();
  new.has_evidence := new.evidence_path is not null;

  if new.evidence_path is not null
     and split_part(new.evidence_path, '/', 1) <> new.owner_id::text then
    raise exception 'Evidence must belong to the entry owner' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists leaderboard_entries_update_metadata on public.leaderboard_entries;
create trigger leaderboard_entries_update_metadata
before insert or update on public.leaderboard_entries
for each row execute function public.set_leaderboard_entry_timestamps();

alter table public.leaderboard_entries enable row level security;
revoke all on table public.leaderboard_entries from public, anon, authenticated;
grant select (
  id, player_name, rating, has_evidence, created_at, updated_at
) on public.leaderboard_entries to anon, authenticated;
grant insert (player_name, rating, evidence_path)
  on public.leaderboard_entries to authenticated;
grant update (player_name, rating, evidence_path)
  on public.leaderboard_entries to authenticated;

drop policy if exists "Anyone can read public leaderboard fields" on public.leaderboard_entries;
create policy "Anyone can read public leaderboard fields"
  on public.leaderboard_entries for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create their own entry" on public.leaderboard_entries;
create policy "Users can create their own entry"
  on public.leaderboard_entries for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can edit their own entry" on public.leaderboard_entries;
create policy "Users can edit their own entry"
  on public.leaderboard_entries for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.get_my_leaderboard_entry()
returns table(entry_id uuid, evidence_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select entry.id, entry.evidence_path
  from public.leaderboard_entries as entry
  where entry.owner_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_leaderboard_entry() from public, anon;
grant execute on function public.get_my_leaderboard_entry() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leaderboard-evidence', 'leaderboard-evidence', false, 1048576, array['image/jpeg'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners can read evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'leaderboard-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owners can upload their evidence" on storage.objects;
create policy "Owners can upload their evidence"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'leaderboard-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) = 'jpg'
  );

drop policy if exists "Owners can delete their evidence" on storage.objects;
create policy "Owners can delete their evidence"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'leaderboard-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'leaderboard_entries'
     ) then
    alter publication supabase_realtime add table public.leaderboard_entries;
  end if;
end;
$$;
