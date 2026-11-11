import { Component, useEffect, useState, type ReactNode } from "react";
import StorageGuard from "./StorageGuard";
import ActivityWatcher from "./ActivityWatcher";
import LoginGate from "./LoginGate";
import PresencePing from "./PresencePing";
import PlanSync from "./PlanSync";

const DISMISS_KEY = "pt_install_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

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
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        const l = document.createElement("link");
        l.rel = "manifest";
        l.href = "/manifest.webmanifest";
        document.head.appendChild(l);
      }
      if (!document.querySelector('meta[name="theme-color"]')) {
        const m = document.createElement("meta");
        m.name = "theme-color";
        m.content = "#0b1020";
        document.head.appendChild(m);
      }
    } catch {
      // ignore
    }

    try {
      const host = window.location.hostname;
      const inPreview =
        window.top !== window.self || host.includes("lovableproject.com") || host.startsWith("id-preview");
      if ("serviceWorker" in navigator && !inPreview) {
        if (window.location.search.includes("nosw=1")) {
          // Escape hatch: open the app with ?nosw=1 to switch the offline helper off and clear its copies.
          navigator.serviceWorker
            .getRegistrations()
            .then((list) => Promise.all(list.map((r) => r.unregister())))
            .then(() => caches.keys())
            .then((names) => Promise.all(names.map((n) => caches.delete(n))))
            .catch(() => {});
        } else {
          navigator.serviceWorker.register("/sw.js").catch(() => {});
        }
      }
    } catch {
      // ignore
    }

    const onPrompt = (e: any) => {
      e.preventDefault();
      if (dismissedRecently()) return; // the person said "Later" in the last 7 days
      setDeferred(e);
    };
    const onInstalled = () => {
      rememberDismissed();
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;
  return (
    <div className="fixed left-2 top-20 z-50 flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-xs">
      <span>Install this app on your phone</span>
      <button
        className="underline"
        onClick={async () => {
          try {
            deferred.prompt();
            await deferred.userChoice;
          } catch {
            // ignore
          }
          rememberDismissed();
          setDeferred(null);
        }}
      >
        Install
      </button>
      <button
        className="underline"
        onClick={() => {
          rememberDismissed();
          setDeferred(null);
        }}
      >
        Later
      </button>
    </div>
  );
}

export default function PwaSetup() {
  return (
    <>
      <Guard>
        <Inner />
      </Guard>
      <StorageGuard />
      <ActivityWatcher />
      <PresencePing />
      <PlanSync />
      <LoginGate />
    </>
  );
}
