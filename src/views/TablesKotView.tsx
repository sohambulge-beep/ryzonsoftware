import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney, fmtTime } from '@/utils';
import type { DiningTable, TableOrder, KotItem, KotRecord } from '@/types';
import * as svc from '@/lib/tablesKotService';
import { TableFormModal } from '@/components/tables/TableFormModal';
import { KotPrintModal } from '@/components/tables/KotPrintModal';

const STATUS_CARD: Record<string, string> = {
  'Free': 'border-emerald-700/60 bg-emerald-950/30 hover:border-emerald-500',
  'Occupied': 'border-amber-600/60 bg-amber-950/30 hover:border-amber-500',
  'Bill Pending': 'border-rose-700/60 bg-rose-950/30 hover:border-rose-500',
};

const STATUS_BADGE: Record<string, string> = {
  'Free': 'bg-emerald-500/20 text-emerald-300 border border-emerald-700/50',
  'Occupied': 'bg-amber-500/20 text-amber-300 border border-amber-700/50',
  'Bill Pending': 'bg-rose-500/20 text-rose-300 border border-rose-700/50',
};

export function TablesKotView() {
  const { db, processTableCheckout, openModal } = useStore();

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [order, setOrder] = useState<TableOrder | null>(null);
  const [kots, setKots] = useState<KotRecord[]>([]);
  const [draft, setDraft] = useState<KotItem[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');

  const [tableModal, setTableModal] = useState<{ open: boolean; table: DiningTable | null }>({ open: false, table: null });
  const [printKot, setPrintKot] = useState<KotRecord | null>(null);

  const selected = tables.find(t => t.id === selectedId) ?? null;

  const loadTables = async () => {
    try {
      setTables(await svc.fetchTables());
      setLoadError('');
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({
    free: tables.filter(t => t.status === 'Free').length,
    occupied: tables.filter(t => t.status === 'Occupied').length,
    pending: tables.filter(t => t.status === 'Bill Pending').length,
  }), [tables]);

  const openTable = async (t: DiningTable) => {
    setSelectedId(t.id);
    setSearch('');
    setNote('');
    setOrder(null);
    setDraft([]);
    setKots([]);
    try {
      const o = await svc.fetchOpenOrder(t.id);
      if (o) {
        setOrder(o);
        setDraft(o.items.map(i => ({ ...i })));
        setKots(await svc.fetchOrderKots(o.id));
      }
    } catch (e: any) {
      alert(e?.message ?? 'Failed to open table');
    }
  };

  // ----- order item helpers -----
  const addItem = (tapId: string) => {
    const tap = db.taps.find(t => t.id === tapId);
    if (!tap) return;
    if (tap.currentLiters < 0.5) {
      alert(`${tap.name} is tapped out!`);
      return;
    }
    setDraft(prev => {
      const existing = prev.find(i => i.beerId === tapId);
      const newQty = (existing?.qty ?? 0) + 1;
      if (newQty * 0.5 > tap.currentLiters) {
        alert(`Keg me sirf ${tap.currentLiters.toFixed(1)}L bacha hai!`);
        return prev;
      }
      if (existing) {
        return prev.map(i => (i.beerId === tapId ? { ...i, qty: newQty } : i));
      }
      return [...prev, { beerId: tap.id, beerName: tap.name, qty: 1, unitPrice: tap.pricePerPint }];
    });
  };

  const setDraftQty = (beerId: string, qty: number) => {
    if (qty <= 0) {
      setDraft(prev => prev.filter(i => i.beerId !== beerId));
      return;
    }
    const tap = db.taps.find(t => t.id === beerId);
    if (tap && qty * 0.5 > tap.currentLiters) {
      alert(`Keg me sirf ${tap.currentLiters.toFixed(1)}L bacha hai!`);
      return;
    }
    setDraft(prev => prev.map(i => (i.beerId === beerId ? { ...i, qty } : i)));
  };

  const subtotal = draft.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = Number((subtotal * db.settings.taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const filteredTaps = useMemo(() => {
    const q = search.toLowerCase();
    return db.taps.filter(t => t.name.toLowerCase().includes(q) || t.brewery.toLowerCase().includes(q) || t.style.toLowerCase().includes(q));
  }, [db.taps, search]);

  // ----- actions -----
  const takeOrder = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const o = await svc.startOrder(selected.id);
      setOrder(o);
      setDraft([]);
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to start order');
    } finally {
      setBusy(false);
    }
  };

  const sendToKitchen = async () => {
    if (!order || !selected) return;
    if (draft.length === 0) {
      alert('Pehle menu se items add karo!');
      return;
    }
    setBusy(true);
    try {
      const kot = await svc.pushKot({
        orderId: order.id,
        tableId: selected.id,
        previousItems: order.items,
        finalItems: draft,
        note,
      });
      setOrder({ ...order, items: draft.map(i => ({ ...i })) });
      setKots(prev => [...prev, kot]);
      setPrintKot(kot);
      setNote('');
    } catch (e: any) {
      alert(e?.message ?? 'KOT failed');
    } finally {
      setBusy(false);
    }
  };

  const generateBill = async () => {
    if (!selected) return;
    if (!confirm(`Generate bill for ${selected.name}? Table "Bill Pending" ho jayega.`)) return;
    setBusy(true);
    try {
      await svc.updateTable(selected.id, { status: 'Bill Pending' });
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const backToOrder = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await svc.updateTable(selected.id, { status: 'Occupied' });
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!order || !selected) return;
    if (!confirm(`Cancel ${selected.name} ka order? Saare items hat jayenge.`)) return;
    setBusy(true);
    try {
      await svc.cancelOrder(order.id, selected.id);
      setOrder(null); setDraft([]); setKots([]); setSelectedId(null);
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const settle = async (method: 'Cash' | 'Card') => {
    if (!order || !selected) return;
    if (draft.length === 0) {
      alert('Order me items nahi hain!');
      return;
    }
    if (!confirm(`Settle ${selected.name} — ${fmtMoney(total)} via ${method}? Invoice generate hogi.`)) return;
    setBusy(true);
    try {
      const items = draft.map(i => {
        const tap = db.taps.find(t => t.id === i.beerId);
        return {
          beerId: i.beerId,
          beerName: i.beerName,
          qty: i.qty,
          unitPrice: i.unitPrice,
          litersTotal: i.qty * 0.5,
          costTotal: i.qty * 0.5 * (tap?.costPerLiter ?? 0),
          total: i.qty * i.unitPrice,
        };
      });
      const invoiceId = processTableCheckout(items, method);
      if (invoiceId) {
        await svc.settleOrder(order.id, selected.id, invoiceId);
        openModal('invoiceView', invoiceId);
        setOrder(null); setDraft([]); setKots([]); setSelectedId(null);
        await loadTables();
      }
    } catch (e: any) {
      alert(e?.message ?? 'Settle failed');
    } finally {
      setBusy(false);
    }
  };

  const saveTable = async (data: { name: string; seats: number }) => {
    setBusy(true);
    try {
      if (tableModal.table) {
        await svc.updateTable(tableModal.table.id, data);
      } else {
        await svc.createTable({ ...data, sortOrder: tables.length + 1 });
      }
      setTableModal({ open: false, table: null });
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const removeTable = async (t: DiningTable) => {
    if (t.status !== 'Free') {
      alert('Table pe active order hai — pehle settle ya cancel karo!');
      return;
    }
    if (!confirm(`Delete table "${t.name}"?`)) return;
    setBusy(true);
    try {
      await svc.deleteTable(t.id);
      if (selectedId === t.id) { setSelectedId(null); setOrder(null); setDraft([]); setKots([]); }
      await loadTables();
    } catch (e: any) {
      alert(e?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-xs font-mono">
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-800/50">Free: {counts.free}</span>
          <span className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-800/50">Occupied: {counts.occupied}</span>
          <span className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-800/50">Bill Pending: {counts.pending}</span>
        </div>
        <button
          onClick={() => setTableModal({ open: true, table: null })}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
        >
          <i className="fa-solid fa-plus" /> Add Table
        </button>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl border border-red-800 bg-red-950/40 text-red-200 text-sm">
          <i className="fa-solid fa-triangle-exclamation mr-2" />
          <b>Tables load nahi hue:</b> {loadError}
          <div className="mt-2 text-xs text-red-300">
            Solution: Supabase Dashboard → SQL Editor → neeche diya migration SQL run karo (Step 0), phir page refresh karo.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Table grid */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="text-center py-16 text-zinc-500 text-sm">Loading tables...</div>
          ) : tables.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
              <i className="fa-solid fa-utensils text-3xl mb-3 block opacity-40" />
              Koi table nahi hai. "Add Table" dabake shuru karo.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {tables.map(t => (
                <div key={t.id} className={`relative rounded-xl border p-4 transition ${STATUS_CARD[t.status]} ${selectedId === t.id ? 'ring-2 ring-amber-500' : ''}`}>
                  <button type="button" onClick={() => openTable(t)} className="w-full text-left cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5"><i className="fa-solid fa-chair mr-1" />{t.seats} seats</div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                    </div>
                    {t.status !== 'Free' && order && selectedId === t.id && (
                      <div className="mt-2 text-[11px] font-mono text-amber-300">Order open • {fmtTime(order.opened_at)}</div>
                    )}
                  </button>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition mt-6">
                    <button onClick={() => setTableModal({ open: true, table: t })} title="Edit table" className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 text-[10px] hover:bg-zinc-700">
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button onClick={() => removeTable(t)} title="Delete table" className="w-6 h-6 rounded bg-zinc-800 text-red-400 text-[10px] hover:bg-red-950">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order panel */}
        <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 lg:sticky lg:top-0">
          {!selected ? (
            <div className="text-center py-16 text-zinc-500 text-xs">
              <i className="fa-solid fa-arrow-pointer text-3xl mb-3 block opacity-40" />
              Order lene ke liye kisi table pe click karo
            </div>
          ) : !order ? (
            <div className="text-center py-10">
              <div className="font-bold text-white text-lg">{selected.name}</div>
              <div className="text-xs text-zinc-400 mt-1 mb-5">{selected.seats} seats • Free</div>
              <button onClick={takeOrder} disabled={busy} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold px-6 py-2.5 rounded-lg text-sm transition">
                <i className="fa-solid fa-receipt mr-2" />Take Order
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <div className="font-bold text-white">{selected.name}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">Opened {fmtTime(order.opened_at)} • <span className={selected.status === 'Bill Pending' ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>{selected.status}</span></div>
                </div>
                <button onClick={cancelOrder} disabled={busy} className="text-[11px] text-red-400 hover:underline disabled:opacity-50">Cancel Order</button>
              </div>

              {selected.status === 'Bill Pending' ? (
                <>
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-900/50 space-y-1.5 text-sm">
                    <div className="text-rose-300 font-bold text-xs uppercase tracking-wider font-mono mb-2">Bill Ready</div>
                    <div className="flex justify-between text-zinc-400 text-xs"><span>Items</span><span className="font-mono">{draft.reduce((s, i) => s + i.qty, 0)}</span></div>
                    <div className="flex justify-between text-zinc-400 text-xs"><span>Subtotal</span><span className="font-mono">{fmtMoney(subtotal)}</span></div>
                    <div className="flex justify-between text-zinc-400 text-xs"><span>Tax ({(db.settings.taxRate * 100).toFixed(1)}%)</span><span className="font-mono">{fmtMoney(tax)}</span></div>
                    <div className="flex justify-between text-white font-bold pt-1 border-t border-rose-900/50"><span>Total</span><span className="font-mono text-amber-400">{fmtMoney(total)}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => settle('Cash')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition"><i className="fa-solid fa-money-bill mr-1" /> Cash</button>
                    <button onClick={() => settle('Card')} disabled={busy} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition"><i className="fa-solid fa-credit-card mr-1" /> Card</button>
                  </div>
                  <button onClick={backToOrder} disabled={busy} className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 py-2 rounded-lg text-sm transition">Back to Order (edit)</button>
                </>
              ) : (
                <>
                  {/* Menu */}
                  <div>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 mb-2">
                      <i className="fa-solid fa-magnifying-glass text-zinc-500 text-xs" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu (POS products)..." className="bg-transparent text-xs w-full outline-none text-zinc-200" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto scrollbar-thin pr-1">
                      {filteredTaps.map(t => {
                        const out = t.currentLiters < 0.5;
                        return (
                          <button key={t.id} type="button" disabled={out} onClick={() => addItem(t.id)}
                            className={`p-2 rounded-lg border text-left text-[11px] transition ${out ? 'opacity-40 border-red-900/40 cursor-not-allowed' : 'bg-zinc-950/70 border-zinc-800 hover:border-amber-500/60 cursor-pointer'}`}>
                            <div className="font-bold text-zinc-200 truncate">{t.name}</div>
                            <div className="flex justify-between mt-1 font-mono">
                              <span className="text-amber-400">{fmtMoney(t.pricePerPint)}</span>
                              <span className={t.currentLiters < 5 ? 'text-red-400' : 'text-zinc-500'}>{t.currentLiters.toFixed(0)}L</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Draft order */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {draft.length === 0 ? (
                      <div className="text-center py-4 text-zinc-500 text-[11px]">Menu se items add karo, phir "Send to Kitchen" dabao</div>
                    ) : draft.map(i => (
                      <div key={i.beerId} className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between text-xs">
                        <div className="flex-1 pr-2 min-w-0">
                          <div className="font-bold text-zinc-200 truncate">{i.beerName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{fmtMoney(i.unitPrice)}/pt</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-md">
                            <button onClick={() => setDraftQty(i.beerId, i.qty - 1)} className="px-2 py-1 text-zinc-400 hover:text-white">-</button>
                            <span className="px-1.5 font-mono text-[11px] font-bold text-amber-400">{i.qty}</span>
                            <button onClick={() => setDraftQty(i.beerId, i.qty + 1)} className="px-2 py-1 text-zinc-400 hover:text-white">+</button>
                          </div>
                          <span className="font-mono font-bold text-white w-16 text-right">{fmtMoney(i.qty * i.unitPrice)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Kitchen note (optional)..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500" />

                  <div className="flex justify-between text-xs text-zinc-400 pt-1">
                    <span>Subtotal <span className="text-zinc-500">+ tax {(db.settings.taxRate * 100).toFixed(1)}%</span></span>
                    <span className="font-mono text-zinc-200">{fmtMoney(total)}</span>
                  </div>

                  <button onClick={sendToKitchen} disabled={busy || draft.length === 0} className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-2.5 rounded-lg text-sm transition">
                    <i className="fa-solid fa-kitchen-set mr-2" />Send to Kitchen (KOT)
                  </button>
                  <button onClick={generateBill} disabled={busy || draft.length === 0} className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 font-semibold py-2 rounded-lg text-sm transition">
                    <i className="fa-solid fa-file-invoice-dollar mr-2" />Generate Bill
                  </button>
                </>
              )}

              {/* KOT history */}
              {kots.length > 0 && (
                <div className="pt-3 border-t border-zinc-800">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-2">KOT History</div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                    {kots.map(k => (
                      <div key={k.id} className="flex items-center justify-between text-[11px] bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                        <span className="font-mono text-zinc-300">
                          <span className="text-amber-400 font-bold">#{k.kot_no}</span> {k.type} • {k.items.reduce((s, i) => s + i.qty, 0)} items • {fmtTime(k.created_at)}
                        </span>
                        <button onClick={() => setPrintKot(k)} className="text-zinc-400 hover:text-amber-400" title="Reprint"><i className="fa-solid fa-print" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TableFormModal open={tableModal.open} table={tableModal.table} onClose={() => setTableModal({ open: false, table: null })} onSave={saveTable} />
      {printKot && selected && <KotPrintModal kot={printKot} tableName={selected.name} onClose={() => setPrintKot(null)} />}
    </div>
  );
}
