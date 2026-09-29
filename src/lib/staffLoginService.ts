import { supabase } from "@/integrations/supabase/client";

// ---------- Types ----------
export type AppRole = "owner" | "manager" | "cashier" | "waiter";

export type PermissionKey =
  | "pos" | "billing" | "gst" | "customers" | "expenses" | "inventory"
  | "staff" | "insights" | "suppliers" | "payments" | "reports" | "backup";

export const ALL_PERMISSIONS: PermissionKey[] = [
  "pos", "billing", "gst", "customers", "expenses", "inventory",
  "staff", "insights", "suppliers", "payments", "reports", "backup",
];

/** Default role -> module permissions (requirement #5) */
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, PermissionKey[]> = {
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter(p => p !== "staff" && p !== "backup"),
  cashier: ["pos", "billing", "payments"],
  waiter: ["pos"],
};

export interface StaffRoleRow {
  id: string;
  user_id: string;
  business_owner_id: string;
  name: string;
  role: AppRole;
  permissions: PermissionKey[];
  created_at: string;
}

// Generated Supabase types don't know staff_roles yet — loose wrapper.
const sb = supabase as unknown as {
  auth: typeof supabase.auth;
  from: (table: string) => any;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Please log in.");
  return data.user.id;
}

/** Current logged-in user ka role + permissions laaye. Row nahi mili = owner. */
export async function fetchCurrentUserRole(): Promise<{
  role: AppRole;
  permissions: PermissionKey[];
  row: StaffRoleRow | null;
}> {
  const userId = await currentUserId();
  const { data, error } = await sb
    .from("staff_roles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);

  const row = (data?.[0] as StaffRoleRow | undefined) ?? null;
  if (row) return { role: row.role, permissions: row.permissions ?? [], row };

  // Koi row nahi = ye khud business owner hai → owner + auto-create row
  const { data: created, error: insErr } = await sb
    .from("staff_roles")
    .insert({
      user_id: userId,
      business_owner_id: userId,
      name: "Owner",
      role: "owner",
      permissions: ALL_PERMISSIONS,
    })
    .select()
    .maybeSingle();
  if (insErr && insErr.code !== "23505") console.warn("staff_roles auto-create:", insErr.message);

  return { role: "owner", permissions: ALL_PERMISSIONS, row: (created as StaffRoleRow) ?? null };
}

/** Owner naye staff ko role assign kare (same staff dobara assign = update). */
export async function assignRole(
  userId: string,
  role: AppRole,
  permissions: PermissionKey[],
  name = "",
): Promise<void> {
  const ownerId = await currentUserId();
  const { error } = await sb
    .from("staff_roles")
    .upsert(
      { user_id: userId, business_owner_id: ownerId, name, role, permissions },
      { onConflict: "business_owner_id,user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Existing staff ke permissions update kare. */
export async function updateStaffPermissions(staffId: string, permissions: PermissionKey[]): Promise<void> {
  const { error } = await sb.from("staff_roles").update({ permissions }).eq("id", staffId);
  if (error) throw new Error(error.message);
}

/** Role change kare (optional: saath mein permissions bhi). */
export async function updateStaffRole(staffId: string, role: AppRole, permissions?: PermissionKey[]): Promise<void> {
  const patch: Record<string, unknown> = { role };
  if (permissions) patch.permissions = permissions;
  const { error } = await sb.from("staff_roles").update(patch).eq("id", staffId);
  if (error) throw new Error(error.message);
}

/** Owner ke saare staff roles ki list (modal ke liye). */
export async function fetchStaffRoles(): Promise<StaffRoleRow[]> {
  const { data, error } = await sb.from("staff_roles").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffRoleRow[];
}

/** Staff ka role hata de (delete). */
export async function removeStaffRole(staffId: string): Promise<void> {
  const { error } = await sb.from("staff_roles").delete().eq("id", staffId);
  if (error) throw new Error(error.message);
}
