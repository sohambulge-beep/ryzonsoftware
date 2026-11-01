import { Component, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  QUEUE_EVENT,
  flushQueue,
  getFailed,
  getLastCachedAt,
  getQueue,
  installOfflineQueue,
  onSignedOut,
} from "@/lib/offlineQueue";

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [cachedAt, setCachedAt] = useState(0);
  const [sending, setSending] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    installOfflineQueue();
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const refresh = () => {
      if (!alive) return;
      setPending(getQueue().length);
      setFailed(getFailed().length);
      setCachedAt(getLastCachedAt());
    };
    const send = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (getQueue().length === 0) return;
      if (alive) setSending(true);
      try {
        await flushQueue();
      } catch {
        // never block the app
      }
      if (alive) setSending(false);
      refresh();
    };

    refresh();
    const first = setTimeout(send, 6000);
    const every = setInterval(send, 30000);
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      setOnline(true);
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(send, 3000);
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(QUEUE_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);

    let unsub: (() => void) | null = null;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          onSignedOut();
          refresh();
        } else if (event === "SIGNED_IN") {
          setTimeout(send, 2000);
        }
      });
      unsub = () => sub.subscription.unsubscribe();
    } catch {
      // ignore
    }

    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
      if (onlineTimer) clearTimeout(onlineTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(QUEUE_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (unsub) unsub();
    };
  }, []);

  if (hidden) return null;

  let text = "";
  let color = "#f59e0b";
  if (failed > 0) {
    color = "#ef4444";
    text = `${failed} saved entr${failed === 1 ? "y" : "ies"} could not be sent. Open Excise, Offline queue.`;
  } else if (!online) {
    text =
      pending > 0
        ? `Offline: ${pending} entr${pending === 1 ? "y" : "ies"} saved on this phone. They will be sent when internet returns.`
        : "Offline: keep working. New entries are saved on this phone and sent later." +
          (cachedAt > 0 ? " Lists show the last saved copy." : "");
  } else if (pending > 0) {
    color = "#3b82f6";
    text = sending
      ? `Sending ${pending} saved entr${pending === 1 ? "y" : "ies"}...`
      : `${pending} saved entr${pending === 1 ? "y" : "ies"} waiting to be sent.`;
  } else {
    return null;
  }

  return (
    <div className="fixed bottom-72 left-2 z-50 flex max-w-xs flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
      <span>{text}</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function OfflineQueue() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
