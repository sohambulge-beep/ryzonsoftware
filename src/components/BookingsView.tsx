import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const KEY = "pt_bookings";
const MAX_KEEP = 1000;
const MAX_URL = 1900;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Status = "booked" | "arrived" | "noshow" | "cancelled";
const STATUSES: Status[] = ["booked", "arrived", "noshow", "cancelled"];
const STATUS_LABEL: Record<Status, string> = {
  booked: "Booked",
  arrived: "Arrived",
  noshow: "No-show",
  cancelled: "Cancelled",
};

interface Booking {
  id: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  guests: number;
  note: string;
  status: Status;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const shiftDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Turns what is saved into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function clean(v: any): Booking | null {
  if (!v || typeof v !== "object") return null;
  const date = String(v.date ?? "");
  const time = String(v.time ?? "");
  if (!isRealDate(date) || !TIME_RE.test(time)) return null;
  const name = String(v.name ?? "").trim().slice(0, 60);
  if (!name) return null;
  const guests = Number(v.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 500) return null;
  const status: Status = (STATUSES as string[]).includes(v.status) ? (v.status as Status) : "booked";
  return {
    id: String(v.id || newId()).slice(0, 40),
    date,
    time,
    name,
    phone: String(v.phone ?? "").slice(0, 20),
    guests,
    note: String(v.note ?? "").slice(0, 150),
    status,
  };
}

function loadAll(): Booking[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: Booking[] = [];
    const seen = new Set<string>();
    for (const v of parsed) {
      const b = clean(v);
      if (b && !seen.has(b.id)) {
        seen.add(b.id);
        out.push(b);
      }
    }
    return out.slice(0, MAX_KEEP);
  } catch {
    return [];
  }
}

// Saves the list (newest dates kept) and returns what was saved. Throws if the phone refuses to store it.
function persist(list: Booking[]): Booking[] {
  const capped = [...list]
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .slice(0, MAX_KEEP);
  localStorage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Bookings could not open here.</p>;
    return this.props.children;
  }
}

type View = "today" | "tomorrow" | "week" | "past" | "all";

function Inner() {
  const { db } = useStore();
  const [list, setList] = useState<Booking[]>([]);
  const [today, setToday] = useState("");
  const [view, setView] = useState<View>("today");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("20:00");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fGuests, setFGuests] = useState("2");
  const [fNote, setFNote] = useState("");
  const [msg, setMsg] = useState("");

  const bar = String((db as any)?.settings?.barName ?? "").trim();

  // Saved bookings are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    const t = localToday();
    setToday(t);
    setFDate(t);
    setList(loadAll());
  }, []);

  function resetForm() {
    setEditingId("");
    setFDate(today);
    setFTime("20:00");
    setFName("");
    setFPhone("");
    setFGuests("2");
    setFNote("");
  }

  function onSave() {
    const name = fName.trim();
    if (!name) {
      setMsg("Enter the customer's name");
      return;
    }
    if (!isRealDate(fDate)) {
      setMsg("Pick a valid date");
      return;
    }
    if (!TIME_RE.test(fTime)) {
      setMsg("Pick a valid time");
      return;
    }
    const g = Number(fGuests);
    if (!Number.isInteger(g) || g < 1 || g > 500) {
      setMsg("Guests must be a whole number from 1 to 500");
      return;
    }
    const ph = fPhone.trim();
    if (ph && !waNumber(ph) && !confirm("This phone number does not look valid, so the WhatsApp button will not work. Save anyway?")) {
      return;
    }
    const dupe =
      ph !== "" &&
      list.some(
        (b) => b.id !== editingId && b.date === fDate && b.time === fTime && b.phone.trim() === ph && b.status !== "cancelled"
      );
    if (dupe && !confirm("A booking with this phone at this date and time already exists. Save anyway?")) return;

    const rec: Booking = {
      id: editingId || newId(),
      date: fDate,
      time: fTime,
      name: name.slice(0, 60),
      phone: ph.slice(0, 20),
      guests: g,
      note: fNote.trim().slice(0, 150),
      status: "booked",
    };
    const next = editingId
      ? list.map((b) => (b.id === editingId ? { ...rec, status: b.status } : b))
      : [rec, ...list];
    try {
      setList(persist(next));
    } catch {
      setMsg("Could not save on this phone (storage is blocked or full). Nothing was changed.");
      return;
    }
    setMsg(editingId ? "Booking updated." : `Booking saved for ${dayLabel(rec.date)}, ${t12(rec.time)}.`);
    resetForm();
  }

  function onEdit(b: Booking) {
    setEditingId(b.id);
    setFDate(b.date);
    setFTime(b.time);
    setFName(b.name);
    setFPhone(b.phone);
    setFGuests(String(b.guests));
    setFNote(b.note);
    setMsg("");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }

  function setStatus(id: string, s: Status) {
    try {
      setList(persist(list.map((b) => (b.id === id ? { ...b, status: s } : b))));
      setMsg("");
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
    }
  }

  function onDelete(b: Booking) {
    if (!confirm(`Delete the booking of ${b.name}?`)) return;
    try {
      setList(persist(list.filter((x) => x.id !== b.id)));
      if (editingId === b.id) resetForm();
      setMsg("Booking deleted.");
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
    }
  }

  function message(b: Booking) {
    return (
      `Namaste ${b.name} ji,\n` +
      `${bar ? `${bar} me` : "Hamare yahan"} aapki booking confirm hai: ${dayLabel(b.date)}, ${t12(b.time)}, ${b.guests} log.` +
      `${b.note ? ` Note: ${b.note}.` : ""}\n` +
      `Koi badlav ho to kripya bata dein. Dhanyavaad.`
    );
  }

  async function onCopy(b: Booking) {
    try {
      await navigator.clipboard.writeText(message(b));
      setMsg(`Message for ${b.name} copied. Paste it in WhatsApp.`);
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  function onCsv() {
    if (list.length === 0) {
      setMsg("No booking saved yet.");
      return;
    }
    const head = ["date", "time", "name", "phone", "guests", "status", "note"];
    const rows = [...list]
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((b) => [b.date, b.time, b.name, b.phone, b.guests, STATUS_LABEL[b.status], b.note]);
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-bookings-${localToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${list.length} booking(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  const shown = useMemo(() => {
    if (!today) return [];
    const q = query.trim().toLowerCase();
    const tomorrow = shiftDays(today, 1);
    const weekEnd = shiftDays(today, 6);
    const rows = list.filter((b) => {
      if (view === "today" && b.date !== today) return false;
      if (view === "tomorrow" && b.date !== tomorrow) return false;
      if (view === "week" && !(b.date >= today && b.date <= weekEnd)) return false;
      if (view === "past" && !(b.date < today)) return false;
      if (q && !(b.name.toLowerCase().includes(q) || b.phone.includes(q))) return false;
      return true;
    });
    rows.sort((a, b) => {
      const x = (a.date + a.time).localeCompare(b.date + b.time);
      return view === "past" ? -x : x;
    });
    return rows;
  }, [list, today, view, query]);

  const active = shown.filter((b) => b.status === "booked" || b.status === "arrived");
  const guestsTotal = active.reduce((s, b) => s + b.guests, 0);
  const noShow30 = today
    ? list.filter((b) => b.status === "noshow" && b.date >= shiftDays(today, -29) && b.date <= today).length
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Bookings</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Keep table bookings in one place. Bookings are saved on this phone only (not in the cloud backup), so download
        the CSV now and then. The app only opens WhatsApp with a ready message; you press send there.
      </p>

      <section className="space-y-3 rounded-md border p-3">
        <h2 className="font-medium">{editingId ? "Edit booking" : "New booking"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Date</span>
            <input type="date" className={`${input} w-full`} value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Time</span>
            <input type="time" className={`${input} w-full`} value={fTime} onChange={(e) => setFTime(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Name</span>
            <input className={`${input} w-full`} maxLength={60} value={fName} onChange={(e) => setFName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Phone</span>
            <input
              className={`${input} w-full`}
              inputMode="tel"
              value={fPhone}
              onChange={(e) => setFPhone(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 15))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Guests</span>
            <input
              className={`${input} w-full`}
              inputMode="numeric"
              value={fGuests}
              onChange={(e) => setFGuests(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Note (table, birthday, etc.)</span>
            <input className={`${input} w-full`} maxLength={150} value={fNote} onChange={(e) => setFNote(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} onClick={onSave}>
            {editingId ? "Save changes" : "Save booking"}
          </button>
          {editingId && (
            <button className="underline text-sm" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Show</span>
          <select className={`${input} w-full`} value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="week">Next 7 days</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search name or phone</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>
          {active.length} booking(s) | {guestsTotal} guest(s)
        </p>
        <p className="text-muted-foreground">No-shows in the last 30 days: {noShow30}</p>
        <button className="underline" onClick={onCsv}>
          Download bookings (CSV)
        </button>
      </section>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No booking here.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((b) => {
            const num = waNumber(b.phone);
            const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(message(b))}` : "";
            const tooLong = url.length > MAX_URL;
            const passed = b.status === "booked" && today !== "" && b.date < today;
            return (
              <div key={b.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{b.name}</span>
                  <span className="font-medium">{STATUS_LABEL[b.status]}</span>
                </div>
                <p>
                  {dayLabel(b.date)} | {t12(b.time)} | {b.guests} guest(s)
                </p>
                <p className="text-muted-foreground">
                  {b.phone || "No phone saved"}
                  {b.note ? ` | ${b.note}` : ""}
                </p>
                {passed && (
                  <p className="text-destructive">The date has passed. Mark it Arrived or No-show.</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {num && !tooLong ? (
                    <a className={btn} href={url} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  ) : (
                    <button className={btn} disabled>
                      WhatsApp
                    </button>
                  )}
                  <button className="underline" onClick={() => onCopy(b)}>
                    Copy message
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {b.status === "booked" ? (
                    <>
                      <button className="underline" onClick={() => setStatus(b.id, "arrived")}>
                        Arrived
                      </button>
                      <button className="underline" onClick={() => setStatus(b.id, "noshow")}>
                        No-show
                      </button>
                      <button className="underline" onClick={() => setStatus(b.id, "cancelled")}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="underline" onClick={() => setStatus(b.id, "booked")}>
                      Re-open
                    </button>
                  )}
                  <button className="underline" onClick={() => onEdit(b)}>
                    Edit
                  </button>
                  <button className="underline" onClick={() => onDelete(b)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BookingsView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
