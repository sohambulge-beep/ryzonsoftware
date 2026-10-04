create or replace function public.excise_stock_register(
  p_brand_id uuid,
  p_from date,
  p_to date
)
returns table (
  line_type text,
  line_date date,
  receipts_qty bigint,
  sales_qty bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select t.line_type, t.line_date, t.receipts_qty, t.sales_qty
  from (
    select
      'opening'::text as line_type,
      p_from as line_date,
      coalesce((
        select sum(i.bottles_total)
        from public.excise_tp_items i
        join public.excise_tp_receipts r on r.id = i.receipt_id
        where i.brand_id = p_brand_id and r.receipt_date < p_from
      ), 0)::bigint as receipts_qty,
      coalesce((
        select sum(s.bottles)
        from public.excise_daily_sales s
        where s.brand_id = p_brand_id and s.sale_date < p_from
      ), 0)::bigint as sales_qty

    union all

    select
      'day'::text,
      d.entry_day,
      coalesce(rc.qty, 0)::bigint,
      coalesce(sl.qty, 0)::bigint
    from (
      select r.receipt_date as entry_day
      from public.excise_tp_receipts r
      join public.excise_tp_items i on i.receipt_id = r.id
      where i.brand_id = p_brand_id and r.receipt_date between p_from and p_to
      union
      select s.sale_date
      from public.excise_daily_sales s
      where s.brand_id = p_brand_id and s.sale_date between p_from and p_to
    ) d
    left join (
      select r.receipt_date as entry_day, sum(i.bottles_total) as qty
      from public.excise_tp_receipts r
      join public.excise_tp_items i on i.receipt_id = r.id
      where i.brand_id = p_brand_id and r.receipt_date between p_from and p_to
      group by r.receipt_date
    ) rc on rc.entry_day = d.entry_day
    left join (
      select s.sale_date as entry_day, sum(s.bottles) as qty
      from public.excise_daily_sales s
      where s.brand_id = p_brand_id and s.sale_date between p_from and p_to
      group by s.sale_date
    ) sl on sl.entry_day = d.entry_day
  ) t
  order by case when t.line_type = 'opening' then 0 else 1 end, t.line_date;
$$;

revoke all on function public.excise_stock_register(uuid, date, date) from public, anon;
grant execute on function public.excise_stock_register(uuid, date, date) to authenticated;