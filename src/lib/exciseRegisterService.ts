import { supabase } from "@/integrations/supabase/client";

// New functions are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface RegisterDay {
  date: string;
  receipts: number;
  sales: number;
}

export interface StockRegister {
  openingQty: number;
  days: RegisterDay[];
}

const MAX_DAYS = 366;

export async function getStockRegister(brandId: string, from: string, to: string): Promise<StockRegister> {
  if (!brandId) throw new Error("Select a brand");
  if (!from || !to) throw new Error("Pick both dates");
  if (from > to) throw new Error("From date must be before To date");
  const span = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (span > MAX_DAYS) throw new Error("Please pick a range of up to one year");

  const { data, error } = await db.rpc("excise_stock_register", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);

  let openingQty = 0;
  const days: RegisterDay[] = [];
  for (const r of data ?? []) {
    const receipts = Number(r.receipts_qty) || 0;
    const sales = Number(r.sales_qty) || 0;
    if (r.line_type === "opening") {
      openingQty = receipts - sales;
    } else {
      days.push({ date: r.line_date, receipts, sales });
    }
  }
  return { openingQty, days };
}
