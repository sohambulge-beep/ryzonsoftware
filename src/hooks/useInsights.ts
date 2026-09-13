import { useMemo } from 'react';
import type { AppData } from '@/types';
import { fmtMoney } from '@/utils';

export interface ProductInsight {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface DayInsight {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface CustomerInsight {
  id: string;
  name: string;
  totalSpent: number;
  orders: number;
  currentBalance: number;
}

export function useInsights(db: AppData) {
  return useMemo(() => {
    // 1 & 2: Product performance — aggregate across all invoice items
    const productMap = new Map<string, { qty: number; revenue: number; cost: number }>();
    db.invoices.forEach(inv => {
      inv.items.forEach(item => {
        const existing = productMap.get(item.beerName) ?? { qty: 0, revenue: 0, cost: 0 };
        existing.qty += item.qty;
        existing.revenue += item.total;
        existing.cost += item.costTotal;
        productMap.set(item.beerName, existing);
      });
    });

    const allProducts: ProductInsight[] = Array.from(productMap.entries()).map(([name, v]) => ({
      name,
      qty: v.qty,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.revenue - v.cost,
    }));

    const topProducts = [...allProducts].sort((a, b) => b.revenue - a.revenue);
    const topSelling = topProducts[0] ?? null;

    // Least performing: lowest revenue, but only among products with at least some sales
    const leastPerforming = topProducts.length > 1
      ? topProducts[topProducts.length - 1]
      : null;

    // 3: Best sales day — group invoices by date
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    db.invoices.forEach(inv => {
      const dateStr = (inv.timestamp || '').split('T')[0];
      if (!dateStr) return;
      const existing = dayMap.get(dateStr) ?? { revenue: 0, orders: 0 };
      existing.revenue += inv.total;
      existing.orders += 1;
      dayMap.set(dateStr, existing);
    });

    const allDays: DayInsight[] = Array.from(dayMap.entries()).map(([date, v]) => {
      const d = new Date(date + 'T00:00:00');
      return {
        date,
        label: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
        revenue: v.revenue,
        orders: v.orders,
      };
    });

    const bestDay = allDays.length > 0
      ? [...allDays].sort((a, b) => b.revenue - a.revenue)[0]
      : null;

    // 4: Top customers by total spent
    const customerMap = new Map<string, { totalSpent: number; orders: number }>();
    db.invoices.forEach(inv => {
      if (!inv.customerId) return;
      const existing = customerMap.get(inv.customerId) ?? { totalSpent: 0, orders: 0 };
      existing.totalSpent += inv.total;
      existing.orders += 1;
      customerMap.set(inv.customerId, existing);
    });

    const topCustomers: CustomerInsight[] = db.customers
      .map(c => {
        const stats = customerMap.get(c.id);
        return {
          id: c.id,
          name: c.name,
          totalSpent: stats?.totalSpent ?? c.totalSpent ?? 0,
          orders: stats?.orders ?? 0,
          currentBalance: c.currentBalance,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    return {
      topSelling,
      leastPerforming,
      bestDay,
      topCustomers,
      topProducts: topProducts.slice(0, 5),
      hasData: db.invoices.length > 0,
    };
  }, [db]);
}
