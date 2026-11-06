import { Component, useEffect, type ReactNode } from "react";
import { runActivityCheck } from "../lib/activityLog";

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
  useEffect(() => {
    const check = () => {
      try {
        runActivityCheck();
      } catch {
        // never block the app
      }
    };
    const first = setTimeout(check, 6000);
    const every = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, 8000);
    const onLeave = () => check();
    document.addEventListener("visibilitychange", onLeave);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onLeave);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);
  return null;
}

export default function ActivityWatcher() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
