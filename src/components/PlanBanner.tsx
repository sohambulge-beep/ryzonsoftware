import { Component, useEffect, useState, type ReactNode } from "react";
import { getCloudClient } from "../lib/adminCheck";
import FreshStart from "./FreshStart";

const CHECK_FIRST_MS = 5000;
const CHECK_EVERY_MS = 30 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

interface Banner {
  text: string;
  red: boolean;
}

// Returns null when there is nothing to show (not signed in, admin, no business linked, or plan is fine).
async function compute(): Promise<Banner | null> {
  const c = getCloudClient();
  if (!c) return null;
  const { data: s } = await c.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data, error } = await c
    .from("businesses")
    .select("business_name, paid_until, active")
    .eq("user_id", uid)
    .limit(1);
  if (error) return null;
  const row: any = (data ?? [])[0];
  if (!row) return null;
  if (row.active === false) {
    return { text: "Your account is marked inactive. Please contact the provider.", red: true };
  }
  if (!row.paid_until) return null;
  const diff = daysBetween(localDate(), row.paid_until);
  if (diff < 0) {
    return {
      text: `Your plan ended ${-diff} day(s) ago (${row.paid_until}). Please renew your plan.`,
      red: true,
    };
  }
  if (diff <= 7) {
    return {
      text:
        diff === 0
          ? `Your plan ends today (${row.paid_until}). Please renew.`
          : `Your plan ends in ${diff} day(s) (${row.paid_until}). Please renew.`,
      red: false,
    };
  }
  return null;
}

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
  const [banner, setBanner] = useState<Banner | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const b = await compute();
        if (alive) setBanner(b);
      } catch {
        if (alive) setBanner(null);
      }
    };
    const first = setTimeout(run, CHECK_FIRST_MS);
    const every = setInterval(run, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  if (!banner || hidden) return null;
  return (
    <div className="fixed top-2 left-2 right-2 z-50 mx-auto flex max-w-md items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span
        style={{
          width: 8,
          height: 8,
          marginTop: 4,
          borderRadius: 9999,
          backgroundColor: banner.red ? "#ef4444" : "#f59e0b",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span className="grow">{banner.text}</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function PlanBanner() {
  return (
    <>
      <FreshStart />
      <Guard>
        <Inner />
      </Guard>
    </>
  );
}
