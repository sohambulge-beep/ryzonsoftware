import { supabase } from "@/integrations/supabase/client";

// New tables/functions are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface TpItemInput {
  brand_id: string;
  cases: number;
  bottles: number;
}

export interface TpReceiptInput {
  tp_no: string;
  auto_tp_no: string;
  party: string;
  receipt_date: string;
  items: TpItemInput[];
}

export interface TpReceipt {
  id: string;
  tp_no: string;
  auto_tp_no: string;
  party: string;
  receipt_date: string;
  status: "verified" | "not_verified";
  excise_tp_items: {
    id: string;
    brand_id: string;
    cases: number;
    bottles: number;
    bottles_total: number;
    excise_brands: { name: string; size_ml: number; bottles_per_case: number } | null;
  }[];
}

export async function listTpReceipts(): Promise<TpReceipt[]> {
  const { data, error } = await db
    .from("excise_tp_receipts")
    .select(
      "*, excise_tp_items(id, brand_id, cases, bottles, bottles_total, excise_brands(name, size_ml, bottles_per_case))"
    )
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTpReceipt(input: TpReceiptInput) {
  const tpNo = input.tp_no.trim();
  if (!tpNo) throw new Error("Enter the TP number");

  const items = input.items
    .filter((i) => i.brand_id && i.cases + i.bottles > 0)
    .map((i) => ({ brand_id: i.brand_id, cases: i.cases, bottles: i.bottles }));
  if (items.length === 0) throw new Error("Add at least one brand with cases or bottles");

  const { error } = await db.rpc("create_excise_tp_receipt", {
    p_tp_no: tpNo,
    p_auto_tp_no: input.auto_tp_no.trim(),
    p_party: input.party.trim(),
    p_receipt_date: input.receipt_date,
    p_items: items,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This TP number is already saved");
    throw new Error(error.message);
  }
}

export async function setTpStatus(id: string, status: "verified" | "not_verified") {
  const { error } = await db.from("excise_tp_receipts").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteTpReceipt(id: string) {
  const { error } = await db.from("excise_tp_receipts").delete().eq("id", id);
  if (error) throw error;
}
