import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SYNC_EVENT, getReview, runSync } from "../lib/stockSync";

const FIRST_MS = 25000;
const EVERY_MS = 60000;
const ONLINE_DELAY_MS = 3000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const OK_SHOW_MS = 8000;

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
  const [failedMsg, setFailedMsg] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const [okText, setOkText] = useState("");
  const [hidden, setHidden] = useState(false);
  const failuresRef = useRef(0);
  const nextAllowedRef = useRef(0);
  const okTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshReview = useCallback(() => {
    setReviewCount(getReview().items.length);
  }, []);

  const run = useCallback(async () => {
    if (Date.now() < nextAllowedRef.current) return; // waiting after a failure
    try {
      const r = await runSync();
      if (r.status === "ok") {
        failuresRef.current = 0;
        nextAllowedRef.current = 0;
        setFailedMsg("");
        if (r.uploaded > 0) {
          setOkText(`${r.uploaded} stock / udhaar change(s) saved in the cloud.`);
          if (okTimerRef.current) clearTimeout(okTimerRef.current);
          okTimerRef.current = setTimeout(() => setOkText(""), OK_SHOW_MS);
        }
      }
    } catch (e: any) {
      failuresRef.current += 1;
      nextAllowedRef.current = Date.now() + Math.min(MAX_BACKOFF_MS, 60000 * 2 ** (failuresRef.current - 1));
      setFailedMsg(e?.message ?? String(e));
    }
    refreshReview();
  }, [refreshReview]);

  useEffect(() => {
    refreshReview();
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
    window.addEventListener(SYNC_EVENT, refreshReview);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (onlineTimer) clearTimeout(onlineTimer);
      if (okTimerRef.current) clearTimeout(okTimerRef.current);
      window.removeEventListener("online", goOnline);
      window.removeEventListener(SYNC_EVENT, refreshReview);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run, refreshReview]);

  if (hidden) return null;

  let text = "";
  let color = "#22c55e";
  if (failedMsg) {
    color = "#ef4444";
    text = `Stock / udhaar not saved to the cloud: ${failedMsg}. Will retry.`;
  } else if (reviewCount > 0) {
    color = "#f59e0b";
    text = `${reviewCount} stock / udhaar value(s) differ from another phone. Open Excise, Sync review.`;
  } else if (okText) {
    text = okText;
  } else {
    return null;
  }

  return (
    <div className="fixed bottom-56 left-2 z-50 flex max-w-xs flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
      <span>{text}</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function StockSync() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
