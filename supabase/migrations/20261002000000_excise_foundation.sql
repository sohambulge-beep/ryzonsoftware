create table if not exists public.excise_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hotel_name text not null default '',
  licence_no text not null default '',
  flr2_no text not null default '',
  permit_holder_no text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.excise_brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('IMFL','MML','Wine','Ferm Beer','Mild Beer')),
  size_ml integer not null check (size_ml > 0),
  bottles_per_case integer not null default 12 check (bottles_per_case > 0),
  rate numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name, size_ml)
);

alter table public.excise_settings enable row level security;
alter table public.excise_brands enable row level security;

drop policy if exists "own excise_settings" on public.excise_settings;
create policy "own excise_settings" on public.excise_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own excise_brands" on public.excise_brands;
create policy "own excise_brands" on public.excise_brands
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
