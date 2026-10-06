import { useCallback, useEffect, useRef, useState } from "react";
import { type AuditRow, PAGE_SIZE, listAuditLog } from "@/lib/auditLogService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const TABLE_LABELS: Record<string, string> = {
  excise_settings: "Licence details",
  excise_brands: "Brand",
  excise_tp_receipts: "TP receipt",
  excise_tp_items: "TP receipt item",
  excise_daily_sales: "Daily sale",
  bank_accounts: "Bank account",
  bank_entries: "Bank entry",
  bank_transfers: "Bank transfer",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Added",
  update: "Changed",
  delete: "Deleted",
};

const SUMMARY_FIELDS: Record<string, string[]> = {
  excise_settings: ["hotel_name", "licence_no"],
  excise_brands: ["name", "size_ml", "rate"],
  excise_tp_receipts: ["tp_no", "party", "receipt_date"],
  excise_tp_items: ["bottles_total", "cases", "bottles"],
  excise_daily_sales: ["sale_date", "bottles"],
  bank_accounts: ["name", "opening_balance"],
  bank_entries: ["entry_date", "direction", "amount", "description"],
  bank_transfers: ["transfer_date", "amount", "reference"],
};

const SKIP_FIELDS = new Set(["id", "user_id", "created_at", "updated_at"]);

const show = (v: any) => {
  if (v === null || v === undefined || v === "") return "-";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

function summary(r: AuditRow): string {
  const data: Record<string, any> = r.new_data ?? r.old_data ?? {};
  const fields = SUMMARY_FIELDS[r.table_name] ?? [];
  return fields
    .filter((f) => data[f] !== undefined && data[f] !== null && data[f] !== "")
    .map((f) => `${f}: ${show(data[f])}`)
    .join(" | ");
}

function changes(r: AuditRow): string[] {
  if (r.action !== "update" || !r.old_data || !r.new_data) return [];
  const before = r.old_data;
  const after = r.new_data;
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const out: string[] = [];
  for (const k of keys) {
    if (SKIP_FIELDS.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      out.push(`${k}: ${show(before[k])} -> ${show(after[k])}`);
    }
  }
  return out;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ActivityLogView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [msg, setMsg] = useState("");
  const reqRef = useRef(0);

  const loadFirst = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    setRows([]);
    try {
      const list = await listAuditLog({ table: tableFilter, action: actionFilter, offset: 0 });
      if (id !== reqRef.current) return;
      setRows(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load the log: ${e.message ?? e}`);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [tableFilter, actionFilter]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    const id = reqRef.current;
    setLoading(true);
    try {
      const list = await listAuditLog({
        table: tableFilter,
        action: actionFilter,
        offset: rows.length,
      });
      if (id !== reqRef.current) return;
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...list.filter((r) => !seen.has(r.id))];
      });
      setHasMore(list.length === PAGE_SIZE);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load more: ${e.message ?? e}`);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Activity log</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Every add, change and delete of brands, TP receipts, daily sales and bank records is saved here
        automatically. It cannot be edited or deleted. The log starts from the day it was switched on.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">What</span>
          <select className={input} value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
            <option value="all">Everything</option>
            {Object.entries(TABLE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Action</span>
          <select className={input} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">All actions</option>
            <option value="insert">Added</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
          </select>
        </label>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet for this selection.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const diff = changes(r);
            return (
              <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className={r.action === "delete" ? "font-medium text-destructive" : "font-medium"}>
                    {ACTION_LABELS[r.action] ?? r.action}: {TABLE_LABELS[r.table_name] ?? r.table_name}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">{when(r.created_at)}</span>
                </div>
                {summary(r) && <p className="text-muted-foreground">{summary(r)}</p>}
                {diff.length > 0 && (
                  <ul className="list-disc pl-5">
                    {diff.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button className={btn} disabled={loading} onClick={loadMore}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
