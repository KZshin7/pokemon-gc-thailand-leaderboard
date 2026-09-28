-- Upgrade projects that already applied the earlier leaderboard migration.
drop policy if exists "Owners and reviewers can read evidence" on storage.objects;
drop policy if exists "Owners can read evidence" on storage.objects;
drop policy if exists "Users can create their own pending entry" on public.leaderboard_entries;

drop function if exists public.get_leaderboard_evidence_path_for_review(uuid);
drop function if exists public.review_leaderboard_entry(uuid, text);
drop function if exists public.is_leaderboard_reviewer();

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

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_verification_status,
  drop constraint if exists leaderboard_entries_verified_timestamp,
  drop column if exists verification_status,
  drop column if exists verified_at,
  drop column if exists reviewed_by;

revoke all on table public.leaderboard_entries from public, anon, authenticated;
grant select (id, player_name, rating, has_evidence, created_at, updated_at)
  on public.leaderboard_entries to anon, authenticated;
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

create policy "Owners can read evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'leaderboard-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
