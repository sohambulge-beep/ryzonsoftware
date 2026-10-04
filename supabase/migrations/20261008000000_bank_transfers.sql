create table if not exists public.bank_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  to_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  transfer_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  reference text not null default '',
  debit_entry_id uuid not null references public.bank_entries(id) on delete cascade,
  credit_entry_id uuid not null references public.bank_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create index if not exists bank_transfers_user_date_idx
  on public.bank_transfers(user_id, transfer_date desc);

alter table public.bank_transfers enable row level security;

drop policy if exists "own bank_transfers" on public.bank_transfers;
create policy "own bank_transfers" on public.bank_transfers
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bank_accounts a
      where a.id = from_account_id and a.user_id = auth.uid()
    )
    and exists (
      select 1 from public.bank_accounts a
      where a.id = to_account_id and a.user_id = auth.uid()
    )
  );

-- When a transfer record is removed (directly, or because one of its entries was deleted),
-- remove both of its entries too, so the two bank balances stay in step.
create or replace function public.bank_transfer_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.bank_entries
  where id in (old.debit_entry_id, old.credit_entry_id);
  return old;
end;
$$;

drop trigger if exists bank_transfer_cleanup_trg on public.bank_transfers;
create trigger bank_transfer_cleanup_trg
after delete on public.bank_transfers
for each row execute function public.bank_transfer_cleanup();

create or replace function public.create_bank_transfer(
  p_from uuid,
  p_to uuid,
  p_date date,
  p_amount numeric,
  p_reference text,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_amount numeric(14,2);
  v_from_name text;
  v_to_name text;
  v_note text;
  v_ref text;
  v_date date;
  v_debit uuid;
  v_credit uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Select both accounts';
  end if;
  if p_from = p_to then
    raise exception 'Choose two different accounts';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Amount must be more than 0';
  end if;

  v_amount := round(p_amount, 2);
  v_note := btrim(coalesce(p_note, ''));
  v_ref := btrim(coalesce(p_reference, ''));
  v_date := coalesce(p_date, current_date);

  select name into v_from_name from public.bank_accounts where id = p_from;
  if not found then
    raise exception 'From account not found';
  end if;
  select name into v_to_name from public.bank_accounts where id = p_to;
  if not found then
    raise exception 'To account not found';
  end if;

  insert into public.bank_entries (user_id, account_id, entry_date, direction, amount, description, reference)
  values (
    auth.uid(), p_from, v_date, 'debit', v_amount,
    'Transfer to ' || v_to_name || case when v_note <> '' then ' - ' || v_note else '' end,
    v_ref
  )
  returning id into v_debit;

  insert into public.bank_entries (user_id, account_id, entry_date, direction, amount, description, reference)
  values (
    auth.uid(), p_to, v_date, 'credit', v_amount,
    'Transfer from ' || v_from_name || case when v_note <> '' then ' - ' || v_note else '' end,
    v_ref
  )
  returning id into v_credit;

  insert into public.bank_transfers
    (user_id, from_account_id, to_account_id, transfer_date, amount, reference, debit_entry_id, credit_entry_id)
  values
    (auth.uid(), p_from, p_to, v_date, v_amount, v_ref, v_debit, v_credit)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_bank_transfer(uuid, uuid, date, numeric, text, text) from public, anon;
grant execute on function public.create_bank_transfer(uuid, uuid, date, numeric, text, text) to authenticated;
