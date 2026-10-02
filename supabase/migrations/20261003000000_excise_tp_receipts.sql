create table if not exists public.excise_tp_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tp_no text not null,
  auto_tp_no text not null default '',
  party text not null default '',
  receipt_date date not null default current_date,
  status text not null default 'not_verified' check (status in ('not_verified','verified')),
  created_at timestamptz not null default now(),
  unique (user_id, tp_no)
);

create table if not exists public.excise_tp_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  receipt_id uuid not null references public.excise_tp_receipts(id) on delete cascade,
  brand_id uuid not null references public.excise_brands(id) on delete restrict,
  cases integer not null default 0 check (cases >= 0),
  bottles integer not null default 0 check (bottles >= 0),
  bottles_total integer not null default 0 check (bottles_total > 0),
  check (cases + bottles > 0)
);

create index if not exists excise_tp_items_receipt_idx on public.excise_tp_items(receipt_id);

alter table public.excise_tp_receipts enable row level security;
alter table public.excise_tp_items enable row level security;

drop policy if exists "own excise_tp_receipts" on public.excise_tp_receipts;
create policy "own excise_tp_receipts" on public.excise_tp_receipts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own excise_tp_items" on public.excise_tp_items;
create policy "own excise_tp_items" on public.excise_tp_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.create_excise_tp_receipt(
  p_tp_no text,
  p_auto_tp_no text,
  p_party text,
  p_receipt_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if btrim(coalesce(p_tp_no, '')) = '' then
    raise exception 'Enter the TP number';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one brand with cases or bottles';
  end if;

  insert into public.excise_tp_receipts (user_id, tp_no, auto_tp_no, party, receipt_date)
  values (
    auth.uid(),
    btrim(p_tp_no),
    btrim(coalesce(p_auto_tp_no, '')),
    btrim(coalesce(p_party, '')),
    coalesce(p_receipt_date, current_date)
  )
  returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.excise_tp_items (user_id, receipt_id, brand_id, cases, bottles, bottles_total)
    select
      auth.uid(),
      v_receipt_id,
      b.id,
      coalesce((v_item ->> 'cases')::int, 0),
      coalesce((v_item ->> 'bottles')::int, 0),
      coalesce((v_item ->> 'cases')::int, 0) * b.bottles_per_case
        + coalesce((v_item ->> 'bottles')::int, 0)
    from public.excise_brands b
    where b.id = (v_item ->> 'brand_id')::uuid;

    if not found then
      raise exception 'Brand not found';
    end if;
  end loop;

  return v_receipt_id;
end;
$$;

revoke all on function public.create_excise_tp_receipt(text, text, text, date, jsonb) from public, anon;
grant execute on function public.create_excise_tp_receipt(text, text, text, date, jsonb) to authenticated;
