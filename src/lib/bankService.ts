import { supabase } from "@/integrations/supabase/client";

// New tables are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface BankAccount {
  id: string;
  name: string;
  last4: string;
  opening_balance: number;
  opening_date: string;
}

export interface BankEntry {
  id: string;
  account_id: string;
  entry_date: string;
  direction: "credit" | "debit";
  amount: number;
  description: string;
  reference: string;
}

const PAGE = 1000;

export async function listBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await db.from("bank_accounts").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, opening_balance: Number(a.opening_balance) || 0 }));
}

export async function createBankAccount(input: {
  name: string;
  last4: string;
  opening_balance: number;
  opening_date: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the account name");
  if (!/^[0-9]{0,4}$/.test(input.last4)) throw new Error("Last 4 digits must be numbers only");
  if (!Number.isFinite(input.opening_balance)) throw new Error("Opening balance is not a number");
  if (!input.opening_date) throw new Error("Pick the opening date");

  const { data, error } = await db
    .from("bank_accounts")
    .insert({
      name,
      last4: input.last4,
      opening_balance: Math.round(input.opening_balance * 100) / 100,
      opening_date: input.opening_date,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("An account with this name already exists");
    throw new Error(error.message);
  }
  return data.id;
}

export async function deleteBankAccount(id: string) {
  const { error } = await db.from("bank_accounts").delete().eq("id", id);
  if (error) throw error;
}

// Loads every entry of an account (in pages of 1000) in date order.
export async function listBankEntries(accountId: string): Promise<BankEntry[]> {
  const all: BankEntry[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("bank_entries")
      .select("*")
      .eq("account_id", accountId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []).map((e: any) => ({ ...e, amount: Number(e.amount) || 0 }));
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function addBankEntry(input: {
  account_id: string;
  entry_date: string;
  direction: "credit" | "debit";
  amount: number;
  description: string;
  reference: string;
}) {
  if (!input.account_id) throw new Error("Select a bank account first");
  if (!input.entry_date) throw new Error("Pick the date");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be more than 0");
  }
  const { error } = await db.from("bank_entries").insert({
    account_id: input.account_id,
    entry_date: input.entry_date,
    direction: input.direction,
    amount: Math.round(input.amount * 100) / 100,
    description: input.description.trim(),
    reference: input.reference.trim(),
  });
  if (error) throw error;
}

export async function deleteBankEntry(id: string) {
  const { error } = await db.from("bank_entries").delete().eq("id", id);
  if (error) throw error;
}
