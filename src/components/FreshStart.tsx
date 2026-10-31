import { Component, useEffect, type ReactNode } from "react";
import { autoFreshCheck } from "../lib/freshStart";

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
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        autoFreshCheck();
      } catch {
        // never block the app
      }
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}

export default function FreshStart() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
