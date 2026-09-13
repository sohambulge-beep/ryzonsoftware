import { useState, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney, todayStr, monthStr } from '@/utils';

interface ReportRow {
  cells: string[];
  raw: (string | number)[];
}

export function ReportsView() {
  const { db } = useStore();
  const [reportType, setReportType] = useState('sales');
  const [timeFilter, setTimeFilter] = useState('all');

  const today = todayStr();
  const month = monthStr();

  const report = useMemo(() => {
    let invoices = db.invoices;
    let expenses = db.expenses;
    if (timeFilter === 'today') {
      invoices = invoices.filter(i => (i.timestamp || '').startsWith(today));
      expenses = expenses.filter(e => (e.date || '').startsWith(today));
    } else if (timeFilter === 'month') {
      invoices = invoices.filter(i => (i.timestamp || '').startsWith(month));
      expenses = expenses.filter(e => (e.date || '').startsWith(month));
    }

    if (reportType === 'sales') {
      const totalRev = invoices.reduce((s, i) => s + i.total, 0);
      const totalPints = invoices.reduce((s, i) => s + i.items.reduce((sum, item) => sum + item.qty, 0), 0);
      const kpis = [
        { label: 'TOTAL SALES', value: fmtMoney(totalRev), class: 'text-amber-400' },
        { label: 'TOTAL INVOICES', value: String(invoices.length), class: 'text-white' },
        { label: 'PINTS POURED', value: `${totalPints} Pts`, class: 'text-emerald-400' },
        { label: 'AVG TICKET', value: invoices.length > 0 ? fmtMoney(totalRev / invoices.length) : '$0.00', class: 'text-cyan-400' },
      ];
      const headers = ['Invoice #', 'Customer', 'Date', 'Payment', 'Subtotal', 'Tax', 'Total', 'Status'];
      const rows: ReportRow[] = invoices.map(i => ({
        cells: [i.invoiceNo, i.customerName || 'Walk-in', new Date(i.timestamp).toLocaleDateString(), i.paymentMethod, fmtMoney(i.subtotal), fmtMoney(i.tax), fmtMoney(i.total), i.status],
        raw: [i.invoiceNo, i.customerName, new Date(i.timestamp).toLocaleDateString(), i.paymentMethod, i.subtotal, i.tax, i.total, i.status],
      }));
      return { title: `Sales & Order Revenue Report (${timeFilter.toUpperCase()})`, kpis, headers, rows };
    }

    if (reportType === 'profit') {
      const rev = invoices.reduce((s, i) => s + i.total, 0);
      let cogs = 0;
      invoices.forEach(inv => inv.items.forEach(i => { cogs += i.costTotal; }));
      const exp = expenses.reduce((s, e) => s + e.amount, 0);
      const net = rev - cogs - exp;
      const gross = rev - cogs;
      const grossPct = rev > 0 ? ((gross / rev) * 100).toFixed(1) : '0';
      const netPct = rev > 0 ? ((net / rev) * 100).toFixed(1) : '0';
      const kpis = [
        { label: 'REVENUE', value: fmtMoney(rev), class: 'text-amber-400' },
        { label: 'COGS (BEER COST)', value: fmtMoney(cogs), class: 'text-orange-400' },
        { label: 'OPERATING EXPENSES', value: fmtMoney(exp), class: 'text-red-400' },
        { label: 'NET PROFIT', value: fmtMoney(net), class: 'text-emerald-400' },
      ];
      const headers = ['Financial Metric', 'Amount', '% of Revenue', 'Description'];
      const rows: ReportRow[] = [
        { cells: ['Gross Sales', fmtMoney(rev), '100%', 'Total revenue'], raw: ['Gross Sales', rev, '100%', 'Total revenue'] },
        { cells: ['COGS', `-${fmtMoney(cogs)}`, `${rev > 0 ? ((cogs/rev)*100).toFixed(1) : 0}%`, 'Beer cost'], raw: ['COGS', -cogs, `${grossPct}%`, 'Beer cost'] },
        { cells: ['Gross Profit', fmtMoney(gross), `${grossPct}%`, 'Gross margin'], raw: ['Gross Profit', gross, `${grossPct}%`, 'Gross margin'] },
        { cells: ['Operating Expenses', `-${fmtMoney(exp)}`, `${rev > 0 ? ((exp/rev)*100).toFixed(1) : 0}%`, 'Overhead'], raw: ['Operating Expenses', -exp, `${netPct}%`, 'Overhead'] },
        { cells: ['Net Profit', fmtMoney(net), `${netPct}%`, 'Net margin'], raw: ['Net Profit', net, `${netPct}%`, 'Net margin'] },
      ];
      return { title: `Profitability & Margin Report (${timeFilter.toUpperCase()})`, kpis, headers, rows };
    }

    if (reportType === 'expense') {
      const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
      const kpis = [
        { label: 'TOTAL EXPENSES', value: fmtMoney(totalExp), class: 'text-red-400' },
        { label: 'TRANSACTIONS', value: String(expenses.length), class: 'text-white' },
      ];
      const headers = ['Date', 'Expense Title', 'Category', 'Payment Method', 'Amount'];
      const rows: ReportRow[] = expenses.map(e => ({
        cells: [e.date, e.title, e.category, e.paymentMethod, fmtMoney(e.amount)],
        raw: [e.date, e.title, e.category, e.paymentMethod, e.amount],
      }));
      return { title: `Operating Expense Report (${timeFilter.toUpperCase()})`, kpis, headers, rows };
    }

    // stock
    const totalStock = db.taps.reduce((s, t) => s + t.currentLiters, 0);
    const totalCap = db.taps.reduce((s, t) => s + t.capacityLiters, 0);
    const lowTaps = db.taps.filter(t => t.currentLiters < 10).length;
    const kpis = [
      { label: 'TOTAL ON TAP', value: `${totalStock.toFixed(1)} L`, class: 'text-amber-400' },
      { label: 'TOTAL CAPACITY', value: `${totalCap.toFixed(1)} L`, class: 'text-zinc-300' },
      { label: 'ESTIMATED PINTS LEFT', value: `${Math.floor(totalStock / 0.5)} Pts`, class: 'text-emerald-400' },
      { label: 'LOW KEG ALERTS', value: `${lowTaps} Taps`, class: lowTaps > 0 ? 'text-red-400' : 'text-emerald-400' },
    ];
    const headers = ['Tap #', 'Beer Name', 'Brewery', 'Style', 'Liters Left', 'Capacity', 'Pints Left', 'Inventory Cost Value'];
    const rows: ReportRow[] = db.taps.map(t => ({
      cells: [`#${t.tapNumber}`, t.name, t.brewery, t.style, `${t.currentLiters.toFixed(1)} L`, `${t.capacityLiters} L`, Math.floor(t.currentLiters / 0.5).toString(), fmtMoney(t.currentLiters * t.costPerLiter)],
      raw: [t.tapNumber, t.name, t.brewery, t.style, t.currentLiters.toFixed(1), t.capacityLiters, Math.floor(t.currentLiters / 0.5), (t.currentLiters * t.costPerLiter).toFixed(2)],
    }));
    return { title: 'Draft Beer Stock & Keg Capacity Report', kpis, headers, rows };
  }, [db, reportType, timeFilter, today, month]);

  const exportCSV = () => {
    if (report.rows.length === 0) { alert('No report data available to export.'); return; }
    let csv = report.headers.join(',') + '\r\n';
    report.rows.forEach(row => {
      csv += row.raw.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    link.download = `TapTrack_${reportType}_report_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-clipboard-list text-indigo-400" /> Business Reports & Analytics
          </h2>
          <p className="text-xs text-zinc-400">Generate and export Sales, Profit, Expense, and Keg Stock reports</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select value={reportType} onChange={e => setReportType(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-40">
            <option value="sales">Sales Report</option>
            <option value="profit">Profit Report</option>
            <option value="expense">Expense Report</option>
            <option value="stock">Stock / Keg Report</option>
          </select>
          <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-36">
            <option value="all">All-Time</option>
            <option value="today">Daily (Today)</option>
            <option value="month">Monthly (This Month)</option>
          </select>
          <button onClick={exportCSV} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition w-full sm:w-auto justify-center">
            <i className="fa-solid fa-file-arrow-down" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {report.kpis.map(k => (
          <div key={k.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="text-zinc-500 text-[10px] font-mono">{k.label}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${k.class}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{report.title}</h3>
          <span className="text-xs font-mono text-zinc-500">Generated: {new Date().toLocaleString()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                {report.headers.map(h => <th key={h} className="p-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {report.rows.length === 0 ? (
                <tr><td colSpan={report.headers.length} className="p-6 text-center text-zinc-500">No data matching filter.</td></tr>
              ) : report.rows.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-900/40 transition">
                  {row.cells.map((cell, j) => <td key={j} className="p-3 text-zinc-200">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
