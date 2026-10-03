create or replace function public.excise_monthly_return(p_year integer, p_month integer)
returns table (
  brand_id uuid,
  brand_name text,
  category text,
  size_ml integer,
  opening_qty bigint,
  receipts_qty bigint,
  sales_qty bigint,
  closing_qty bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      make_date(p_year, p_month, 1) as d_from,
      (make_date(p_year, p_month, 1) + interval '1 month')::date as d_to
  ),
  rec as (
    select
      i.brand_id,
      coalesce(sum(i.bottles_total) filter (where r.receipt_date < b.d_from), 0) as before_qty,
      coalesce(sum(i.bottles_total) filter (
        where r.receipt_date >= b.d_from and r.receipt_date < b.d_to
      ), 0) as month_qty
    from public.excise_tp_items i
    join public.excise_tp_receipts r on r.id = i.receipt_id
    cross join bounds b
    group by i.brand_id
  ),
  sal as (
    select
      s.brand_id,
      coalesce(sum(s.bottles) filter (where s.sale_date < b.d_from), 0) as before_qty,
      coalesce(sum(s.bottles) filter (
        where s.sale_date >= b.d_from and s.sale_date < b.d_to
      ), 0) as month_qty
    from public.excise_daily_sales s
    cross join bounds b
    group by s.brand_id
  )
  select
    br.id,
    br.name,
    br.category,
    br.size_ml,
    (coalesce(rec.before_qty, 0) - coalesce(sal.before_qty, 0))::bigint,
    coalesce(rec.month_qty, 0)::bigint,
    coalesce(sal.month_qty, 0)::bigint,
    (
      coalesce(rec.before_qty, 0) - coalesce(sal.before_qty, 0)
      + coalesce(rec.month_qty, 0) - coalesce(sal.month_qty, 0)
    )::bigint
  from public.excise_brands br
  left join rec on rec.brand_id = br.id
  left join sal on sal.brand_id = br.id
  order by br.category, br.name, br.size_ml;
$$;

revoke all on function public.excise_monthly_return(integer, integer) from public, anon;
grant execute on function public.excise_monthly_return(integer, integer) to authenticated;
