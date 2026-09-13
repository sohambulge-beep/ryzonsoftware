import { useMemo } from 'react';
import type { AppData } from '@/types';
import { fmtMoney } from '@/utils';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionView?: string;
}

export function useAlerts(db: AppData): Alert[] {
  return useMemo(() => {
    const alerts: Alert[] = [];

    // 1. Keg/stock level below 20%
    db.taps.forEach(tap => {
      const pct = tap.capacityLiters > 0 ? (tap.currentLiters / tap.capacityLiters) * 100 : 0;
      if (pct < 20) {
        const isCritical = pct < 10;
        alerts.push({
          id: `stock-${tap.id}`,
          severity: isCritical ? 'critical' : 'warning',
          icon: 'fa-solid fa-triangle-exclamation',
          title: 'Stock khatam hone wala hai',
          message: `${tap.name} keg sirf ${pct.toFixed(0)}% reh gaya hai (${tap.currentLiters.toFixed(1)}L / ${tap.capacityLiters}L). Jaldi restock karein!`,
          actionLabel: 'Restock',
          actionView: 'inventory',
        });
      }
    });

    // 2. Customer with pending payment / outstanding tab balance
    db.customers
      .filter(c => c.currentBalance > 0)
      .forEach(c => {
        const isOverLimit = c.currentBalance > c.tabLimit;
        alerts.push({
          id: `pending-${c.id}`,
          severity: isOverLimit ? 'critical' : 'warning',
          icon: 'fa-solid fa-hand-holding-dollar',
          title: 'Payment pending hai',
          message: `${c.name} par ${fmtMoney(c.currentBalance)} outstanding hai.${isOverLimit ? ` Credit limit (${fmtMoney(c.tabLimit)}) cross ho gaya!` : ''}`,
          actionLabel: 'Collect',
          actionView: 'payments',
        });
      });

    // 3. Unusual low sales — today's sales significantly below 7-day average
    const today = new Date().toISOString().split('T')[0];
    const todaySales = db.invoices
      .filter(inv => (inv.timestamp || '').startsWith(today))
      .reduce((s, inv) => s + inv.total, 0);

    const dailyTotals: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayTotal = db.invoices
        .filter(inv => (inv.timestamp || '').startsWith(dateStr))
        .reduce((s, inv) => s + inv.total, 0);
      dailyTotals.push(dayTotal);
    }

    const hasHistory = dailyTotals.filter(v => v > 0).length >= 3;
    if (hasHistory) {
      const avgSales = dailyTotals.reduce((s, v) => s + v, 0) / dailyTotals.length;
      if (avgSales > 0 && todaySales < avgSales * 0.4) {
        alerts.push({
          id: 'low-sales-today',
          severity: 'warning',
          icon: 'fa-solid fa-chart-line',
          title: 'Sales bahut kam hai',
          message: `Aaj ki sales sirf ${fmtMoney(todaySales)} hai — 7-din average (${fmtMoney(avgSales)}) se 60% kam. Kuch action lena chahiye?`,
          actionLabel: 'View POS',
          actionView: 'pos',
        });
      }
    }

    // 4. Invoices with balance due (important payment due)
    const unpaidInvoices = db.invoices.filter(inv => inv.balanceDue > 0);
    unpaidInvoices.forEach(inv => {
      const daysOld = Math.floor((Date.now() - new Date(inv.timestamp).getTime()) / (1000 * 60 * 60 * 24));
      if (daysOld >= 7) {
        alerts.push({
          id: `due-inv-${inv.id}`,
          severity: daysOld >= 14 ? 'critical' : 'warning',
          icon: 'fa-solid fa-file-invoice-dollar',
          title: 'Important payment due',
          message: `Invoice ${inv.invoiceNo} (${inv.customerName || 'Walk-in'}) ka ${fmtMoney(inv.balanceDue)} ${daysOld} din se pending hai.`,
          actionLabel: 'Collect',
          actionView: 'payments',
        });
      }
    });

    // Sort: critical first, then warning, then info
    const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [db]);
}
