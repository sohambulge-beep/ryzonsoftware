// Paste your PUBLISHABLE (anon) key between the quotes below. Never the secret or service_role key.
export const CLOUD_URL = "https://lkssdcruhunyuqakqcup.supabase.co";
export const CLOUD_KEY = "PASTE_PUBLISHABLE_KEY_HERE";

export function keyLooksUnset(): boolean {
  return CLOUD_KEY.startsWith("PASTE_") || CLOUD_KEY.length < 20;
}

export function keyLooksSecret(): boolean {
  const t = CLOUD_KEY.trim();
  if (t.startsWith("sb_secret_")) return true;
  const p = t.split(".");
  if (p.length === 3) {
    try {
      const json = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")));
      return json.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

// A username becomes the hidden sign-in email. A full email is accepted as it is.
export function loginToEmail(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (t.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
  return /^[a-z0-9._-]{3,30}$/.test(t) ? `${t}@prime-terminal.invalid` : null;
}
