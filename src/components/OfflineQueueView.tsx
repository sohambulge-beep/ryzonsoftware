import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  QUEUE_EVENT,
  discardFailed,
  flushQueue,
  getFailed,
  getQueue,
  isInstalled,
  retryFailed,
  type FailedItem,
  type QueueItem,
} from "@/lib/offlineQueue";

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const preview = (body: string) => (body.length > 140 ? `${body.slice(0, 140)}...` : body);

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">The offline queue could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [active, setActive] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    setPending(getQueue());
    setFailed(getFailed());
    setActive(isInstalled());
  }, []);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    refresh();
    window.addEventListener(QUEUE_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_EVENT, refresh);
  }, [refresh]);

  async function sendNow() {
    setBusy(true);
    setMsg("");
    try {
      const r = await flushQueue();
      setMsg(
        `${r.sent} sent, ${r.failed} refused, ${r.left} still waiting.` + (r.note ? ` ${r.note}` : "")
      );
    } catch (e: any) {
      setMsg(`Could not send: ${e?.message ?? e}`);
    }
    refresh();
    setBusy(false);
  }

  function onDiscard(f: FailedItem) {
    if (!confirm("Delete this entry for good? It will not be saved in the database.")) return;
    discardFailed(f.id);
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Offline queue</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        When there is no internet, entries for the database (Excise, Bank and so on) are saved on this phone and sent
        by themselves when internet returns. They do not show in lists, stock or reports until they are sent, so do
        not enter them again. Reports that the server prepares need internet.
      </p>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>{active ? "Offline saving is on." : "Offline saving is not active on this version of the app."}</p>
        <p>{online ? "Internet: connected." : "Internet: not connected."}</p>
        <p>
          Waiting to be sent: {pending.length} | Refused by the server: {failed.length}
        </p>
        <button className={btn} disabled={busy || pending.length === 0 || !online} onClick={sendNow}>
          {busy ? "Sending..." : "Send now"}
        </button>
      </section>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Waiting to be sent</h2>
          {pending.map((q) => (
            <div key={q.id} className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">{q.label}</p>
              <p className="text-muted-foreground">
                Saved {when(q.at)}
                {q.tries > 0 ? ` | tried ${q.tries} time(s)` : ""}
              </p>
              {q.body && <p className="break-all text-xs">{preview(q.body)}</p>}
            </div>
          ))}
        </section>
      )}

      {failed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Could not be sent</h2>
          {failed.map((f) => (
            <div key={f.id} className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">{f.label}</p>
              <p className="text-destructive">{f.error}</p>
              <p className="text-muted-foreground">Saved {when(f.at)}</p>
              {f.body && <p className="break-all text-xs">{preview(f.body)}</p>}
              <div className="flex gap-4">
                <button
                  className="underline"
                  onClick={() => {
                    retryFailed(f.id);
                    refresh();
                  }}
                >
                  Retry
                </button>
                <button className="underline" onClick={() => onDiscard(f)}>
                  Discard
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function OfflineQueueView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
