import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchCurrentUserRole,
  type AppRole,
  type PermissionKey,
} from "@/lib/StaffLoginService";

interface RoleContextValue {
  role: AppRole;
  permissions: PermissionKey[];
  loading: boolean;
  canAccess: (module: string) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<AppRole>("waiter");
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetchCurrentUserRole();
        if (active) {
          setRole(r.role);
          setPermissions(r.permissions);
        }
      } catch (e) {
        console.error("Role load failed:", e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const canAccess = (module: string) =>
    role === "owner" || permissions.includes(module as PermissionKey);

  return (
    <RoleContext.Provider value={{ role, permissions, loading, canAccess }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}

export function canAccessModule(role: AppRole, permissions: PermissionKey[], module: string): boolean {
  return role === "owner" || permissions.includes(module as PermissionKey);
}

/** Ye views permission-list ke bahar hain — sabko dikhte hain. */
const ALWAYS_ALLOWED = ["dashboard", "settings", "owner", "profitloss", "tableskot"];

/** Sidebar ke items ko role ke hisaab se filter karta hai. */
export function filterItemsForRole<T extends { id: string }>(
  items: T[],
  role: AppRole,
  permissions: PermissionKey[],
): T[] {
  if (role === "owner") return items;
  return items.filter(
    i => ALWAYS_ALLOWED.includes(i.id) || permissions.includes(i.id as PermissionKey),
  );
}

/** Module ke around wrapper — access nahi to "Access Denied" page. */
export function RoleGuard({ module, children }: { module: string; children: ReactNode }) {
  const { canAccess, loading, role } = useRole();

  if (loading) {
    return <div className="text-center py-20 text-zinc-500 text-sm">Loading access...</div>;
  }
  if (!canAccess(module)) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center p-8 rounded-2xl border border-red-900/50 bg-red-950/30">
        <i className="fa-solid fa-lock text-4xl text-red-400 mb-4 block" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-sm text-zinc-400">
          Aapke role (<b className="text-amber-400">{role}</b>) ko is module ka access nahi hai.
          Owner se permission maango.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

// INTEGRATION (3 jagah, chhote edits):
// 1) src/routes/_authenticated/index.tsx:
//      import { RoleProvider, RoleGuard } from "@/components/RoleGuard";
//      <PlanProvider> ke andar: <RoleProvider> ... </RoleProvider>
// 2) views record mein wrap karo:
//      pos: <RoleGuard module="pos"><PosView /></RoleGuard>,
//      billing: <RoleGuard module="billing"><BillingView /></RoleGuard>,  ... (sab gated views)
// 3) src/components/Sidebar.tsx:
//      import { useRole, filterItemsForRole } from "@/components/RoleGuard";
//      const { role, permissions } = useRole();
//      render se pehle: const visibleItems = filterItemsForRole(group.items, role, permissions);
//      aur map(visibleItems ...)
