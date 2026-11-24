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
