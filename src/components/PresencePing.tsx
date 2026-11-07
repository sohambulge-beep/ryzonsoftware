import { Component, useEffect, type ReactNode } from "react";
import { getCloudClient } from "../lib/adminCheck";

const FIRST_MS = 25000;
const EVERY_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 4 * 60 * 1000;
const FAIL_PAUSE_MS = 60 * 60 * 1000;

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Tells the provider "this customer is using the app now". It never shows anything and never stops the app.
function Inner() {
  useEffect(() => {
    let alive = true;
    let lastAt = 0;
    let pausedUntil = 0;

    const ping = async () => {
      if (!alive) return;
      if (Date.now() < pausedUntil) return;
      if (Date.now() - lastAt < MIN_GAP_MS) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const c = getCloudClient();
      if (!c) return;
      lastAt = Date.now();
      try {
        const { data: s } = await c.auth.getSession();
        if (!s.session) return;
        const { error } = await c.rpc("touch_business");
        if (error) pausedUntil = Date.now() + FAIL_PAUSE_MS; // for example the SQL was not run yet
      } catch {
        pausedUntil = Date.now() + FAIL_PAUSE_MS;
      }
    };

    const first = setTimeout(ping, FIRST_MS);
    const every = setInterval(ping, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

export default function PresencePing() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
