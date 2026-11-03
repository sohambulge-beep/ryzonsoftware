import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { STORAGE_EVENT, getStorageInfo } from "../data";

const LIMIT_CHARS = 5000000;
const WARN_PCT = 75;
// Saved lists and safety copies that can be made again; removing them frees space.
const CLEAN_KEYS = ["pt_offline_cache", "pt_wipe_safety", "pt_apply_safety"];

const stamp = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
  const [info, setInfo] = useState({ full: false, usedChars: 0, lastIdbAt: 0 });
  const [note, setNote] = useState("");
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(() => setInfo(getStorageInfo()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(STORAGE_EVENT, refresh);
    const every = setInterval(refresh, 60000);

    // Ask the browser not to delete this app's data when the phone is short of space.
    try {
      const s: any = (navigator as any).storage;
      if (s && typeof s.persist === "function") {
        Promise.resolve(typeof s.persisted === "function" ? s.persisted() : false)
          .then((already: boolean) => (already ? true : s.persist()))
          .catch(() => false);
      }
    } catch {
      // ignore
    }

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const hello = setTimeout(() => {
      const i = getStorageInfo();
      setInfo(i);
      const pct = Math.round((i.usedChars * 100) / LIMIT_CHARS);
      setNote(
        i.lastIdbAt > 0
          ? `Safe copy on this phone: saved ${stamp(i.lastIdbAt)}. Storage used: ${pct}%.`
          : "The safe copy is not available in this browser mode. Data is kept in the normal phone storage only."
      );
      hideTimer = setTimeout(() => setNote(""), 9000);
    }, 5000);

    return () => {
      window.removeEventListener(STORAGE_EVENT, refresh);
      clearInterval(every);
      clearTimeout(hello);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [refresh]);

  function freeSpace() {
    for (const k of CLEAN_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
    refresh();
    setNote("Cleared saved lists and old safety copies.");
  }

  if (hidden) return null;

  const pct = Math.round((info.usedChars * 100) / LIMIT_CHARS);
  let text = "";
  let color = "#22c55e";
  let canFree = false;
  if (info.full) {
    color = "#ef4444";
    canFree = true;
    text = "Phone storage is full. Your newest data is kept in the safe copy, but please free some space now.";
  } else if (pct >= WARN_PCT) {
    color = "#f59e0b";
    canFree = true;
    text = `Phone storage is ${pct}% full. Please free some space soon.`;
  } else if (note) {
    text = note;
  } else {
    return null;
  }

  return (
    <div className="fixed left-2 right-2 top-14 z-50 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
      <span className="grow">{text}</span>
      {canFree && (
        <button className="underline" onClick={freeSpace}>
          Free space
        </button>
      )}
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function StorageGuard() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
