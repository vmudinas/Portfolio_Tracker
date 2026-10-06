-- Portfolio Tracker: one row per user holding the whole app state (funds, transactions,
-- watchlists, alerts, settings and API keys) as JSON.
-- Run this once in Supabase → SQL Editor → New query → Run.

create table if not exists public.portfolio_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  revision   integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  -- keep rows small (the app's data is a few KB; this stops abuse of the free tier)
  constraint portfolio_state_size check (octet_length(data::text) < 1000000)
);

-- Row Level Security: every signed-in user can only see and change their own row.
alter table public.portfolio_state enable row level security;

drop policy if exists "Read own portfolio" on public.portfolio_state;
create policy "Read own portfolio" on public.portfolio_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own portfolio" on public.portfolio_state;
create policy "Create own portfolio" on public.portfolio_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own portfolio" on public.portfolio_state;
create policy "Update own portfolio" on public.portfolio_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Signed-out visitors get nothing; signed-in users get only what the policies above allow.
revoke all on public.portfolio_state from anon;
grant select, insert, update on public.portfolio_state to authenticated;
