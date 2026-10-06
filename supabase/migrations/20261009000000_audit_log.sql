create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  table_name text not null,
  action text not null check (action in ('insert','update','delete')),
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_time_idx
  on public.audit_log(user_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "read own audit_log" on public.audit_log;
create policy "read own audit_log" on public.audit_log
  for select using (user_id = auth.uid());

-- Nobody can write to the log from the app. Only the trigger below writes to it.
revoke insert, update, delete on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_user uuid;
begin
  begin
    if tg_op = 'INSERT' then
      v_new := to_jsonb(new);
      v_row := v_new;
    elsif tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
      v_row := v_new;
    else
      v_old := to_jsonb(old);
      v_row := v_old;
    end if;

    v_user := nullif(v_row ->> 'user_id', '')::uuid;
    if v_user is not null then
      insert into public.audit_log (user_id, actor_id, table_name, action, record_id, old_data, new_data)
      values (v_user, auth.uid(), tg_table_name, lower(tg_op), v_row ->> 'id', v_old, v_new);
    end if;
  exception when others then
    null; -- a logging problem must never block the real operation
  end;
  return null;
end;
$$;

revoke all on function public.audit_log_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'excise_settings', 'excise_brands', 'excise_tp_receipts', 'excise_tp_items',
    'excise_daily_sales', 'bank_accounts', 'bank_entries', 'bank_transfers'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_log_trg on public.%I', t);
      execute format(
        'create trigger audit_log_trg after insert or update or delete on public.%I for each row execute function public.audit_log_row()',
        t
      );
    end if;
  end loop;
end $$;
