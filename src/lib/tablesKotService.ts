import { supabase } from "@/integrations/supabase/client";
import type { DiningTable, TableOrder, KotRecord, KotItem } from "@/types";

// NOTE: generated Supabase types (src/integrations/supabase/types.ts) don't
// know the new tables yet, so we use a loose typed wrapper here. After running
// the SQL migration, re-running Supabase typegen will make this fully typed.
const sb = supabase as unknown as {
  auth: typeof supabase.auth;
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

async function getUserId(): Promise<string> {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Please log in again to use Tables & KOT.");
  return data.user.id;
}

// ---------- TABLES ----------
export async function fetchTables(): Promise<DiningTable[]> {
  const { data, error } = await sb.from("dining_tables").select("*").order("sort_order").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as DiningTable[];
}

export async function createTable(input: { name: string; seats: number; sortOrder: number }): Promise<DiningTable> {
  const userId = await getUserId();
  const { data, error } = await sb
    .from("dining_tables")
    .insert({ user_id: userId, name: input.name, seats: input.seats, sort_order: input.sortOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DiningTable;
}

export async function updateTable(id: string, patch: { name?: string; seats?: number; status?: string }): Promise<void> {
  const { error } = await sb.from("dining_tables").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTable(id: string): Promise<void> {
  const { error } = await sb.from("dining_tables").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- ORDERS ----------
export async function fetchOpenOrder(tableId: string): Promise<TableOrder | null> {
  const { data, error } = await sb
    .from("table_orders")
    .select("*")
    .eq("table_id", tableId)
    .eq("status", "Open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TableOrder | null) ?? null;
}

export async function startOrder(tableId: string): Promise<TableOrder> {
  const userId = await getUserId();
  const { data, error } = await sb
    .from("table_orders")
    .insert({ user_id: userId, table_id: tableId, items: [] })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await updateTable(tableId, { status: "Occupied" });
  return data as TableOrder;
}

export async function cancelOrder(orderId: string, tableId: string): Promise<void> {
  const { error } = await sb.from("table_orders").update({ status: "Cancelled" }).eq("id", orderId);
  if (error) throw new Error(error.message);
  await updateTable(tableId, { status: "Free" });
}

export async function settleOrder(orderId: string, tableId: string, invoiceId: string): Promise<void> {
  const { error } = await sb
    .from("table_orders")
    .update({ status: "Billed", billed_at: new Date().toISOString(), invoice_id: invoiceId })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await updateTable(tableId, { status: "Free" });
}

// ---------- KOT ----------
export async function fetchOrderKots(orderId: string): Promise<KotRecord[]> {
  const { data, error } = await sb.from("kot").select("*").eq("order_id", orderId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as KotRecord[];
}

/**
 * Diff karke ek KOT record banata hai, order ke live items update karta hai.
 * type: 'New' (pehla KOT) | 'Add' | 'Cancel'
 */
export async function pushKot(args: {
  orderId: string;
  tableId: string;
  previousItems: KotItem[];
  finalItems: KotItem[];
  note: string;
}): Promise<KotRecord> {
  const userId = await getUserId();

  const { data: kotNo, error: rpcError } = await sb.rpc("next_kot_no", { p_user_id: userId });
  if (rpcError) throw new Error(rpcError.message);

  const added: KotItem[] = [];
  const removed: KotItem[] = [];

  for (const f of args.finalItems) {
    const prev = args.previousItems.find(i => i.beerId === f.beerId);
    const diff = f.qty - (prev?.qty ?? 0);
    if (diff > 0) added.push({ ...f, qty: diff });
  }
  for (const p of args.previousItems) {
    const fin = args.finalItems.find(i => i.beerId === p.beerId);
    const diff = p.qty - (fin?.qty ?? 0);
    if (diff > 0) removed.push({ ...p, qty: diff, cancelled: true });
  }

  if (added.length === 0 && removed.length === 0) {
    throw new Error("Koi change nahi hai — pehle items add/remove karo.");
  }

  const type = args.previousItems.length === 0 ? "New" : added.length === 0 ? "Cancel" : "Add";
  const items = [...added, ...removed];

  const { error: orderError } = await sb
    .from("table_orders")
    .update({ items: args.finalItems })
    .eq("id", args.orderId);
  if (orderError) throw new Error(orderError.message);

  const { data, error } = await sb
    .from("kot")
    .insert({
      user_id: userId,
      order_id: args.orderId,
      table_id: args.tableId,
      kot_no: kotNo,
      type,
      items,
      note: args.note ?? "",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as KotRecord;
}
