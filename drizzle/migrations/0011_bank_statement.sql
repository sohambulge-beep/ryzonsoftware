create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  last4 text not null default '' check (last4 ~ '^[0-9]{0,4}$'),
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table if not exists public.bank_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id) on delete cascade,
  entry_date date not null default current_date,
  direction text not null check (direction in ('credit','debit')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  reference text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists bank_entries_account_idx on public.bank_entries(account_id, entry_date, created_at);
grant select, insert, update, delete on public.bank_accounts to authenticated;
grant all on public.bank_accounts to service_role;
grant select, insert, update, delete on public.bank_entries to authenticated;
grant all on public.bank_entries to service_role;
alter table public.bank_accounts enable row level security;
alter table public.bank_entries enable row level security;
drop policy if exists "own bank_accounts" on public.bank_accounts;
create policy "own bank_accounts" on public.bank_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own bank_entries" on public.bank_entries;
create policy "own bank_entries" on public.bank_entries
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.bank_accounts a where a.id = account_id and a.user_id = auth.uid()));