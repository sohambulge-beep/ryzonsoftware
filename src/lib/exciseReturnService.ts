import { supabase } from "@/integrations/supabase/client";

// New functions are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface ReturnRow {
  brand_id: string;
  brand_name: string;
  category: string;
  size_ml: number;
  opening_qty: number;
  receipts_qty: number;
  sales_qty: number;
  closing_qty: number;
}

export async function getMonthlyReturn(year: number, month: number): Promise<ReturnRow[]> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Pick a valid year");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Pick a valid month");

  const { data, error } = await db.rpc("excise_monthly_return", {
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    brand_id: r.brand_id,
    brand_name: r.brand_name,
    category: r.category,
    size_ml: Number(r.size_ml) || 0,
    opening_qty: Number(r.opening_qty) || 0,
    receipts_qty: Number(r.receipts_qty) || 0,
    sales_qty: Number(r.sales_qty) || 0,
    closing_qty: Number(r.closing_qty) || 0,
  }));
}
