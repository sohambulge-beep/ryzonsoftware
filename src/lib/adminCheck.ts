import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";

let cached: { sig: string; client: SupabaseClient } | null = null;

// Uses the same cloud connection and sign-in that the Cloud backup tab saved on this phone.
export function getCloudClient(): SupabaseClient | null {
  try {
    const url = localStorage.getItem(LS_URL);
    const key = localStorage.getItem(LS_KEY);
    if (!url || !key) return null;
    const sig = `${url}|${key}`;
    if (cached && cached.sig === sig) return cached.client;
    const client = createClient(url.trim(), key.trim(), {
      auth: { storageKey: "pt-cloud-backup-auth", persistSession: true, autoRefreshToken: true },
    });
    cached = { sig, client };
    return client;
  } catch {
    return null;
  }
}

// True only when this phone is signed in to the cloud as an admin.
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const c = getCloudClient();
    if (!c) return false;
    const { data: s } = await c.auth.getSession();
    if (!s.session) return false;
    const { data, error } = await c.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
