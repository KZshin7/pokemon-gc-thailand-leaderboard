-- Shared leaderboard data and private evidence storage.
create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null,
  rating numeric not null,
  evidence_path text,
  has_evidence boolean not null default false,
  verification_status text not null default 'pending',
  verified_at timestamptz,
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_entries_player_name_length
    check (char_length(btrim(player_name)) between 1 and 60),
  constraint leaderboard_entries_owner_unique unique (owner_id),
  constraint leaderboard_entries_evidence_path_format
    check (evidence_path is null or evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  constraint leaderboard_entries_verification_status
    check (verification_status in ('pending', 'verified', 'rejected')),
  constraint leaderboard_entries_verified_timestamp
    check ((verification_status = 'verified') = (verified_at is not null))
);

alter table public.leaderboard_entries
  alter column rating type numeric using rating::numeric;
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_rating_range;
alter table public.leaderboard_entries
  add constraint leaderboard_entries_rating_range
  check (rating between 0 and 9999 and rating = trunc(rating, 3));

create or replace function public.is_leaderboard_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'leaderboard_reviewer', false);
$$;

revoke all on function public.is_leaderboard_reviewer() from public, anon;
grant execute on function public.is_leaderboard_reviewer() to authenticated;

create or replace function public.set_leaderboard_entry_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.verification_status := 'pending';
    new.verified_at := null;
    new.reviewed_by := null;
  end if;

  new.updated_at := now();
  new.has_evidence := new.evidence_path is not null;

  if new.evidence_path is not null
     and split_part(new.evidence_path, '/', 1) <> new.owner_id::text then
    raise exception 'Evidence must belong to the entry owner' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.player_name is distinct from old.player_name
       or new.rating is distinct from old.rating
       or new.evidence_path is distinct from old.evidence_path) then
    new.verification_status := 'pending';
    new.verified_at := null;
    new.reviewed_by := null;
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
  id, player_name, rating, has_evidence, verification_status, verified_at, created_at, updated_at
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

drop policy if exists "Users can create their own pending entry" on public.leaderboard_entries;
create policy "Users can create their own pending entry"
  on public.leaderboard_entries for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and verification_status = 'pending');

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

create or replace function public.get_leaderboard_evidence_path_for_review(p_entry_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_path text;
begin
  if not public.is_leaderboard_reviewer() then
    raise exception 'Reviewer authorization required' using errcode = '42501';
  end if;

  select entry.evidence_path
  into requested_path
  from public.leaderboard_entries as entry
  where entry.id = p_entry_id;

  if not found then
    raise exception 'Leaderboard entry not found' using errcode = 'P0002';
  end if;
  return requested_path;
end;
$$;

revoke all on function public.get_leaderboard_evidence_path_for_review(uuid) from public, anon;
grant execute on function public.get_leaderboard_evidence_path_for_review(uuid) to authenticated;

create or replace function public.review_leaderboard_entry(p_entry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_leaderboard_reviewer() then
    raise exception 'Reviewer authorization required' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'rejected') then
    raise exception 'Status must be verified or rejected' using errcode = '22023';
  end if;

  update public.leaderboard_entries
  set verification_status = p_status,
      verified_at = case when p_status = 'verified' then now() else null end,
      reviewed_by = (select auth.uid())
  where id = p_entry_id;

  if not found then
    raise exception 'Leaderboard entry not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.review_leaderboard_entry(uuid, text) from public, anon;
grant execute on function public.review_leaderboard_entry(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leaderboard-evidence', 'leaderboard-evidence', false, 1048576, array['image/jpeg'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners and reviewers can read evidence" on storage.objects;
create policy "Owners and reviewers can read evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'leaderboard-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_leaderboard_reviewer())
    )
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
