create table if not exists public.draft_lottery_history (
  season_year integer primary key check (season_year between 1000 and 9999),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.flockville_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.draft_lottery_history enable row level security;
alter table public.flockville_admins enable row level security;

create or replace function public.is_flockville_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.flockville_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_flockville_admin() from public;
grant execute on function public.is_flockville_admin() to authenticated;

revoke all on public.flockville_admins from public, anon, authenticated;
revoke all on public.draft_lottery_history from public, anon, authenticated;
-- Anyone may look up lottery history; only authorized admins may change it.
grant select on public.draft_lottery_history to anon, authenticated;
grant insert, update, delete on public.draft_lottery_history to authenticated;

-- Reject malformed records at the database, not only in the browser.
alter table public.draft_lottery_history
  drop constraint if exists draft_lottery_history_record_shape;
alter table public.draft_lottery_history
  add constraint draft_lottery_history_record_shape check (
    coalesce(
      jsonb_typeof(record) = 'object'
      and record ->> 'year' = season_year::text
      and case
        when jsonb_typeof(record -> 'finalOrder') = 'array'
          then jsonb_array_length(record -> 'finalOrder') > 0
        else false
      end,
      false
    )
  ) not valid;

-- Stamp saves with the server clock instead of trusting the browser clock.
create or replace function public.set_draft_lottery_history_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists draft_lottery_history_set_updated_at on public.draft_lottery_history;
create trigger draft_lottery_history_set_updated_at
  before insert or update on public.draft_lottery_history
  for each row execute function public.set_draft_lottery_history_updated_at();

drop policy if exists "League admins can read lottery history" on public.draft_lottery_history;
drop policy if exists "Anyone can read lottery history" on public.draft_lottery_history;
create policy "Anyone can read lottery history"
  on public.draft_lottery_history for select to anon, authenticated
  using (true);

drop policy if exists "League admins can insert lottery history" on public.draft_lottery_history;
create policy "League admins can insert lottery history"
  on public.draft_lottery_history for insert to authenticated
  with check ((select public.is_flockville_admin()));

drop policy if exists "League admins can update lottery history" on public.draft_lottery_history;
create policy "League admins can update lottery history"
  on public.draft_lottery_history for update to authenticated
  using ((select public.is_flockville_admin()))
  with check ((select public.is_flockville_admin()));

drop policy if exists "League admins can delete lottery history" on public.draft_lottery_history;
create policy "League admins can delete lottery history"
  on public.draft_lottery_history for delete to authenticated
  using ((select public.is_flockville_admin()));

-- After inviting the league administrator in Supabase Auth, replace the email
-- below and run this as a project owner to authorize that account.
-- insert into public.flockville_admins (user_id)
-- select id from auth.users where email = 'league-admin@example.com';

-- A private, append-only journal doubles as an automatic before/after backup.
create table if not exists public.draft_lottery_audit (
  id bigint generated always as identity primary key,
  season_year integer not null,
  action text not null,
  reason text not null,
  actor_id uuid,
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now()
);
alter table public.draft_lottery_audit enable row level security;
revoke all on public.draft_lottery_audit from public, anon, authenticated;
grant select on public.draft_lottery_audit to authenticated;
drop policy if exists "Admins can read backups" on public.draft_lottery_audit;
create policy "Admins can read backups" on public.draft_lottery_audit for select to authenticated
  using ((select public.is_flockville_admin()));

create or replace function public.audit_draft_lottery_history()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  correction text := nullif(current_setting('flockville.correction_reason', true), '');
begin
  if tg_op <> 'INSERT' and old.record ->> 'finalized' = 'true'
    and (tg_op = 'DELETE' or (old.record - 'archived') is distinct from (new.record - 'archived'))
    and correction is null then
    raise exception 'Finalized lottery requires an explicit correction with a reason';
  end if;
  if tg_op = 'UPDATE' and old.record = new.record then return new; end if;
  insert into public.draft_lottery_audit
    (season_year, action, reason, actor_id, before_record, after_record)
    values (
      case when tg_op = 'DELETE' then old.season_year else new.season_year end,
      tg_op, coalesce(correction, 'Automatic history backup'), auth.uid(),
      case when tg_op = 'INSERT' then null else old.record end,
      case when tg_op = 'DELETE' then null else new.record end
    );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists draft_lottery_history_audit on public.draft_lottery_history;
create trigger draft_lottery_history_audit
  after insert or update or delete on public.draft_lottery_history
  for each row execute function public.audit_draft_lottery_history();

-- Snapshot existing records once when upgrading, without rewriting the history.
insert into public.draft_lottery_audit (season_year, action, reason, before_record, after_record)
select season_year, 'BASELINE', 'Existing record at safeguards upgrade', null, record
from public.draft_lottery_history h
where not exists (select 1 from public.draft_lottery_audit a where a.season_year = h.season_year);

create or replace function public.correct_flockville_history(p_year integer, p_record jsonb, p_reason text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare stored jsonb;
begin
  if not public.is_flockville_admin() then raise exception 'League admin access required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 8 or length(p_reason) > 500 then
    raise exception 'Explain the correction in 8 to 500 characters';
  end if;
  perform set_config('flockville.correction_reason', trim(p_reason), true);
  if p_record is null then
    delete from public.draft_lottery_history where season_year = p_year returning record into stored;
  else
    insert into public.draft_lottery_history (season_year, record) values (p_year, p_record)
    on conflict (season_year) do update set record = excluded.record returning record into stored;
  end if;
  perform set_config('flockville.correction_reason', '', true);
  return stored;
end;
$$;
revoke all on function public.correct_flockville_history(integer, jsonb, text) from public;
grant execute on function public.correct_flockville_history(integer, jsonb, text) to authenticated;

create table if not exists public.flockville_dashboard (
  id integer primary key check (id = 1),
  season_year integer not null check (season_year between 1000 and 9999),
  announcements text not null default '' check (length(announcements) <= 4000),
  event_title text not null default '' check (length(event_title) <= 120),
  event_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.flockville_dashboard enable row level security;
revoke all on public.flockville_dashboard from public, anon, authenticated;
grant select on public.flockville_dashboard to anon, authenticated;
grant insert, update on public.flockville_dashboard to authenticated;
drop policy if exists "Anyone reads dashboard" on public.flockville_dashboard;
create policy "Anyone reads dashboard" on public.flockville_dashboard for select to anon, authenticated using (true);
drop policy if exists "Admins insert dashboard" on public.flockville_dashboard;
create policy "Admins insert dashboard" on public.flockville_dashboard for insert to authenticated
  with check ((select public.is_flockville_admin()));
drop policy if exists "Admins update dashboard" on public.flockville_dashboard;
create policy "Admins update dashboard" on public.flockville_dashboard for update to authenticated
  using ((select public.is_flockville_admin())) with check ((select public.is_flockville_admin()));
drop trigger if exists flockville_dashboard_updated_at on public.flockville_dashboard;
create trigger flockville_dashboard_updated_at before insert or update on public.flockville_dashboard
  for each row execute function public.set_draft_lottery_history_updated_at();

create table if not exists public.flockville_live (
  id integer primary key check (id = 1),
  run_id uuid not null,
  publisher_id uuid not null,
  season_year integer not null check (season_year between 1000 and 9999),
  total integer not null check (total between 2 and 64),
  status text not null check (status in ('live', 'complete', 'interrupted')),
  picks jsonb not null default '[]'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.flockville_live enable row level security;
revoke all on public.flockville_live from public, anon, authenticated;
grant select on public.flockville_live to anon, authenticated;
drop policy if exists "Anyone watches draft" on public.flockville_live;
create policy "Anyone watches draft" on public.flockville_live for select to anon, authenticated using (true);

create or replace function public.publish_flockville_live(
  p_run_id uuid, p_year integer, p_total integer, p_status text, p_picks jsonb, p_start boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  current_room public.flockville_live;
  pick jsonb;
  safe_picks jsonb := '[]'::jsonb;
  n integer := 0;
  result jsonb;
begin
  if not public.is_flockville_admin() then raise exception 'League admin access required'; end if;
  if p_run_id is null or p_year is null or p_year not between 1000 and 9999
    or p_total is null or p_total not between 2 and 64
    or p_status is null or p_status not in ('live', 'complete', 'interrupted')
    or jsonb_typeof(p_picks) is distinct from 'array' then raise exception 'Invalid broadcast'; end if;
  for pick in select value from jsonb_array_elements(p_picks) loop
    n := n + 1;
    if jsonb_typeof(pick) <> 'object' or coalesce(pick ->> 'pick', '') <> n::text
      or coalesce(length(trim(pick ->> 'team')), 0) not between 1 and 120
      or coalesce(length(trim(pick ->> 'owner')), 0) not between 1 and 120 then
      raise exception 'Broadcast picks must be consecutive and include original team and owner';
    end if;
    safe_picks := safe_picks || jsonb_build_array(jsonb_build_object(
      'pick', n, 'team', pick ->> 'team', 'owner', pick ->> 'owner',
      'cpuLocked', coalesce(pick ->> 'cpuLocked', 'false') = 'true'
    ));
  end loop;
  if n > p_total or (p_status = 'complete' and n <> p_total) then raise exception 'Incomplete broadcast'; end if;
  -- Serialize the singleton room, including the first broadcast.
  perform pg_advisory_xact_lock(7265421);
  select * into current_room from public.flockville_live where id = 1 for update;
  if p_start then
    if p_status <> 'live' or n <> 0 then raise exception 'Start broadcast without results'; end if;
    if current_room.status = 'live' and current_room.updated_at > now() - interval '90 seconds' then
      raise exception 'A broadcast is already live; finish it or wait for the stale broadcast to expire';
    end if;
    insert into public.flockville_live (id, run_id, publisher_id, season_year, total, status, picks)
    values (1, p_run_id, auth.uid(), p_year, p_total, 'live', '[]')
    on conflict (id) do update set run_id = excluded.run_id, publisher_id = excluded.publisher_id,
      season_year = excluded.season_year, total = excluded.total, status = 'live', picks = '[]',
      revision = public.flockville_live.revision + 1, updated_at = now();
  else
    if current_room.run_id is distinct from p_run_id or current_room.publisher_id is distinct from auth.uid()
      or current_room.status <> 'live' or current_room.season_year <> p_year or current_room.total <> p_total then
      raise exception 'Broadcast is no longer active for this commissioner';
    end if;
    if n < jsonb_array_length(current_room.picks)
      or exists (select 1 from jsonb_array_elements(current_room.picks) with ordinality as x(value, ord)
        where value is distinct from safe_picks -> (ord::integer - 1)) then
      raise exception 'Already revealed picks cannot be rewritten';
    end if;
    update public.flockville_live set picks = safe_picks, status = p_status,
      revision = revision + 1, updated_at = now() where id = 1;
  end if;
  select to_jsonb(room) - 'publisher_id' into result from public.flockville_live room where id = 1;
  return result;
end;
$$;
-- The public projection never exposes the commissioner's Auth identifier.
revoke select on public.flockville_live from anon, authenticated;
grant select (id, run_id, season_year, total, status, picks, revision, updated_at)
  on public.flockville_live to anon, authenticated;
revoke all on function public.publish_flockville_live(uuid, integer, integer, text, jsonb, boolean) from public;
grant execute on function public.publish_flockville_live(uuid, integer, integer, text, jsonb, boolean) to authenticated;
