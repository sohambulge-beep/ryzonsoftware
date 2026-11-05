import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchCurrentUserRole,
  type AppRole,
  type PermissionKey,
} from "@/lib/staffLoginService";

const CACHE_KEY = "pt_role_cache";

interface RoleContextValue {
  role: AppRole;
  permissions: PermissionKey[];
  loading: boolean;
  canAccess: (module: string) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

// The login saved on this phone, read without internet.
function savedUid(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const p = JSON.parse(localStorage.getItem(k) || "null");
        const id = p?.user?.id ?? p?.currentSession?.user?.id;
        if (typeof id === "string" && id) return id;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

// The last role that was loaded for THIS login, used only when the server cannot be asked (for example offline).
function readCache(): { role: AppRole; permissions: PermissionKey[] } | null {
  try {
    const uid = savedUid();
    if (!uid) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || p.uid !== uid || typeof p.role !== "string" || !Array.isArray(p.permissions)) return null;
    return {
      role: p.role as AppRole,
      permissions: p.permissions.filter((x: any) => typeof x === "string") as PermissionKey[],
    };
  } catch {
    return null;
  }
}

function writeCache(role: AppRole, permissions: PermissionKey[]) {
  try {
    const uid = savedUid();
    if (!uid) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, role, permissions }));
  } catch {
    // ignore
  }
}

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
          writeCache(r.role, r.permissions);
        }
      } catch (e) {
        console.error("Role load failed:", e);
        const cached = readCache();
        if (active && cached) {
          setRole(cached.role);
          setPermissions(cached.permissions);
        }
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
const ALWAYS_ALLOWED = ["dashboard", "settings", "owner", "profitloss", "tableskot", "excise"];

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
