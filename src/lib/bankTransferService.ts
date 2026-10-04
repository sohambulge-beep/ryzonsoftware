import { supabase } from "@/integrations/supabase/client";

// New tables/functions are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface BankTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  transfer_date: string;
  amount: number;
  reference: string;
}

export async function createBankTransfer(input: {
  from_account_id: string;
  to_account_id: string;
  transfer_date: string;
  amount: number;
  reference: string;
  note: string;
}) {
  if (!input.from_account_id || !input.to_account_id) throw new Error("Select both accounts");
  if (input.from_account_id === input.to_account_id) throw new Error("Choose two different accounts");
  if (!input.transfer_date) throw new Error("Pick the date");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be more than 0");
  }

  const { error } = await db.rpc("create_bank_transfer", {
    p_from: input.from_account_id,
    p_to: input.to_account_id,
    p_date: input.transfer_date,
    p_amount: Math.round(input.amount * 100) / 100,
    p_reference: input.reference.trim(),
    p_note: input.note.trim(),
  });
  if (error) throw new Error(error.message);
}

// Latest 100 transfers, newest first.
export async function listBankTransfers(): Promise<BankTransfer[]> {
  const { data, error } = await db
    .from("bank_transfers")
    .select("id, from_account_id, to_account_id, transfer_date, amount, reference")
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) || 0 }));
}

// Removes the transfer and both of its bank entries.
export async function deleteBankTransfer(id: string) {
  const { error } = await db.from("bank_transfers").delete().eq("id", id);
  if (error) throw error;
}
