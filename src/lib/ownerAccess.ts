import { useRole } from "@/components/RoleGuard";

// Tells whether the signed-in person is the owner.
// If there is no role system around the page, everyone counts as the owner (nothing gets hidden).
export function useOwnerAccess(): { isOwner: boolean; loading: boolean; role: string } {
  try {
    const r = useRole();
    return { isOwner: r.role === "owner", loading: r.loading, role: String(r.role) };
  } catch {
    return { isOwner: true, loading: false, role: "owner" };
  }
}
