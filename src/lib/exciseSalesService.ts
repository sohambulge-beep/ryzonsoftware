import { supabase } from "@/integrations/supabase/client";

// New tables/views are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface DailySale {
  id: string;
  brand_id: string;
  sale_date: string;
  bottles: number;
  excise_brands: { name: string; size_ml: number; category: string } | null;
}

export interface StockRow {
  brand_id: string;
  name: string;
  category: string;
  size_ml: number;
  received: number;
  sold: number;
}

export async function listDailySales(date: string): Promise<DailySale[]> {
  const { data, error } = await db
    .from("excise_daily_sales")
    .select("*, excise_brands(name, size_ml, category)")
    .eq("sale_date", date)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s: any) => ({ ...s, bottles: Number(s.bottles) || 0 }));
}

export async function addDailySale(input: { brand_id: string; sale_date: string; bottles: number }) {
  if (!input.brand_id) throw new Error("Select a brand");
  if (!input.sale_date) throw new Error("Pick the date");
  if (!Number.isInteger(input.bottles) || input.bottles <= 0) {
    throw new Error("Enter whole bottles (1 or more)");
  }
  const { error } = await db.from("excise_daily_sales").insert({
    brand_id: input.brand_id,
    sale_date: input.sale_date,
    bottles: input.bottles,
  });
  if (error) throw error;
}

export async function deleteDailySale(id: string) {
  const { error } = await db.from("excise_daily_sales").delete().eq("id", id);
  if (error) throw error;
}

export async function getStockSummary(): Promise<StockRow[]> {
  const { data, error } = await db
    .from("excise_stock_summary")
    .select("*")
    .order("category")
    .order("name")
    .order("size_ml");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    received: Number(r.received) || 0,
    sold: Number(r.sold) || 0,
  }));
}
