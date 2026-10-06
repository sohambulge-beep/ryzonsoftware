import { supabase } from "@/integrations/supabase/client";

// New tables are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface AuditRow {
  id: string;
  table_name: string;
  action: "insert" | "update" | "delete";
  record_id: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}

export const PAGE_SIZE = 50;

// Newest first. The id is a second sort key because several rows can share the same time.
export async function listAuditLog(opts: {
  table: string;
  action: string;
  offset: number;
}): Promise<AuditRow[]> {
  let q = db
    .from("audit_log")
    .select("id, table_name, action, record_id, old_data, new_data, created_at");
  if (opts.table !== "all") q = q.eq("table_name", opts.table);
  if (opts.action !== "all") q = q.eq("action", opts.action);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(opts.offset, opts.offset + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}
