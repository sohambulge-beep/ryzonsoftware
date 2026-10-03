create table if not exists public.excise_daily_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_id uuid not null references public.excise_brands(id) on delete restrict,
  sale_date date not null default current_date,
  bottles integer not null check (bottles > 0),
  created_at timestamptz not null default now()
);
create index if not exists excise_daily_sales_date_idx on public.excise_daily_sales(user_id, sale_date);
grant select, insert, update, delete on public.excise_daily_sales to authenticated;
grant all on public.excise_daily_sales to service_role;
alter table public.excise_daily_sales enable row level security;
drop policy if exists "own excise_daily_sales" on public.excise_daily_sales;
create policy "own excise_daily_sales" on public.excise_daily_sales
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.excise_brands b where b.id = brand_id and b.user_id = auth.uid()));
create or replace view public.excise_stock_summary with (security_invoker = true) as
select b.id as brand_id, b.name, b.category, b.size_ml,
  coalesce((select sum(i.bottles_total) from public.excise_tp_items i where i.brand_id = b.id), 0) as received,
  coalesce((select sum(s.bottles) from public.excise_daily_sales s where s.brand_id = b.id), 0) as sold
from public.excise_brands b;
revoke all on public.excise_stock_summary from anon;
grant select on public.excise_stock_summary to authenticated;