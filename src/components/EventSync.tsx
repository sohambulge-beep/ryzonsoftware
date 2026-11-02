import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { runEventSync } from "../lib/eventSync";

const FIRST_MS = 20000;
const EVERY_MS = 30000;
const ONLINE_DELAY_MS = 3000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const OK_SHOW_MS = 8000;

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [failedMsg, setFailedMsg] = useState("");
  const [okText, setOkText] = useState("");
  const [hidden, setHidden] = useState(false);
  const failuresRef = useRef(0);
  const nextAllowedRef = useRef(0);
  const okTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (Date.now() < nextAllowedRef.current) return; // waiting after a failure
    try {
      const r = await runEventSync();
      failuresRef.current = 0;
      nextAllowedRef.current = 0;
      setFailedMsg("");
      if (r.applied > 0) {
        setOkText(`${r.applied} change(s) from the other phone were added here.`);
        if (okTimerRef.current) clearTimeout(okTimerRef.current);
        okTimerRef.current = setTimeout(() => setOkText(""), OK_SHOW_MS);
      }
    } catch (e: any) {
      failuresRef.current += 1;
      nextAllowedRef.current = Date.now() + Math.min(MAX_BACKOFF_MS, 30000 * 2 ** (failuresRef.current - 1));
      setFailedMsg(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(run, FIRST_MS);
    const every = setInterval(run, EVERY_MS);
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => {
        nextAllowedRef.current = 0;
        run();
      }, ONLINE_DELAY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (onlineTimer) clearTimeout(onlineTimer);
      if (okTimerRef.current) clearTimeout(okTimerRef.current);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  if (hidden) return null;

  let text = "";
  let color = "#22c55e";
  if (failedMsg) {
    color = "#ef4444";
    text = `Two-phone merge could not run: ${failedMsg}. Will retry.`;
  } else if (okText) {
    text = okText;
  } else {
    return null;
  }

  return (
    <div className="fixed bottom-80 left-2 z-50 flex max-w-xs flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
      <span>{text}</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function EventSync() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
