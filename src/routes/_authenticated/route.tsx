import { createFileRoute, isRedirect, Outlet, redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The login saved on this phone, read without internet.
function savedUser(): User | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const p = JSON.parse(localStorage.getItem(k) || "null");
        const u = p?.user ?? p?.currentSession?.user;
        if (u && typeof u.id === "string" && u.id) return u as User;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };
      // The server clearly refused this login (for example it was removed): sign in again.
      const status = Number((error as any)?.status ?? 0);
      if (status >= 400 && status < 500) throw redirect({ to: "/auth" });
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    // The server could not be reached (no internet): keep the person in if this phone has a saved login.
    const saved = savedUser();
    if (saved) return { user: saved };
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
