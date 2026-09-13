import type { AppData } from '@/types';
import { fmtMoney } from '@/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface AnswerResult {
  text: string;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function monthStr(): string {
  return todayStr().substring(0, 7);
}

function weekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function matchKeywords(query: string, keywords: string[]): boolean {
  const q = query.toLowerCase();
  return keywords.some(k => q.includes(k));
}

function summarizeTopProducts(db: AppData, limit: number): { name: string; qty: number; revenue: number }[] {
  const map = new Map<string, { qty: number; revenue: number }>();
  db.invoices.forEach(inv => {
    inv.items.forEach(item => {
      const ex = map.get(item.beerName) ?? { qty: 0, revenue: 0 };
      ex.qty += item.qty;
      ex.revenue += item.total;
      map.set(item.beerName, ex);
    });
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function answerQuestion(query: string, db: AppData): AnswerResult {
  const q = query.toLowerCase().trim();

  if (!q) return { text: 'Aapka question samajh nahi aaya. Kripya phir se puchein.' };

  // --- PROFIT ---
  if (matchKeywords(q, ['profit', 'labh', 'kam kam', 'kam kyu', 'profit kam', 'profit kyun', 'net profit', 'gross profit'])) {
    const isLow = matchKeywords(q, ['kam', 'low', 'less', 'ghat', 'kam kyu', 'kyu', 'kyun']);
    const totalRev = db.invoices.reduce((s, i) => s + i.total, 0);
    let totalCogs = 0;
    db.invoices.forEach(inv => inv.items.forEach(item => { totalCogs += item.costTotal; }));
    const totalExp = db.expenses.reduce((s, e) => s + e.amount, 0);
    const grossProfit = totalRev - totalCogs;
    const netProfit = grossProfit - totalExp;
    const margin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : '0';

    if (isLow) {
      const reasons: string[] = [];
      if (totalExp > grossProfit * 0.5) reasons.push(`Expenses (${fmtMoney(totalExp)}) kaafi high hain gross profit (${fmtMoney(grossProfit)}) ke comparison mein.`);
      if (db.invoices.filter(i => i.status !== 'Paid').length > 0) {
        const unpaid = db.invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.balanceDue, 0);
        reasons.push(`${fmtMoney(unpaid)} payments pending hain jo profit impact kar rahe hain.`);
      }
      const lowStock = db.taps.filter(t => (t.currentLiters / t.capacityLiters) < 0.2);
      if (lowStock.length > 0) reasons.push(`${lowStock.length} kegs low stock par hain — sales impact ho sakta hai.`);
      if (db.invoices.length < 3) reasons.push(`Sirf ${db.invoices.length} sales records hain — volume kam hai.`);
      reasons.push(`Tax rate ${((db.settings.taxRate || 0) * 100).toFixed(1)}% hai jo revenue se cut hota hai.`);

      return {
        text: `Aaj ka profit analysis:\n\n• Gross Profit: ${fmtMoney(grossProfit)}\n• Net Profit: ${fmtMoney(netProfit)}\n• Profit Margin: ${margin}%\n\nPossible reasons for low profit:\n${reasons.map(r => `• ${r}`).join('\n')}\n\nTip: Expenses reduce karein aur pending payments collect karein profit improve karne ke liye.`
      };
    }

    return {
      text: `Profit Summary:\n\n• Gross Revenue: ${fmtMoney(totalRev)}\n• COGS (Product Cost): ${fmtMoney(totalCogs)}\n• Gross Profit: ${fmtMoney(grossProfit)}\n• Operating Expenses: ${fmtMoney(totalExp)}\n• Net Profit: ${fmtMoney(netProfit)}\n• Profit Margin: ${margin}%`
    };
  }

  // --- TOP / BEST SELLING PRODUCT ---
  if (matchKeywords(q, ['top selling', 'best selling', 'sabse zyada bik', 'sabse zyada sell', 'top product', 'best product', 'most sold', 'popular'])) {
    const top = summarizeTopProducts(db, 5);
    if (top.length === 0) return { text: 'Abhi tak koi sales record nahi hai. POS par sale karne ke baad yahan data dikhega.' };
    const best = top[0];
    const list = top.map((p, i) => `${i + 1}. ${p.name} — ${p.qty} pints, ${fmtMoney(p.revenue)}`).join('\n');
    return {
      text: `Sabse zyada bikne wala product:\n\n"${best.name}" — ${best.qty} pints sold, total revenue ${fmtMoney(best.revenue)}.\n\nTop 5 Products:\n${list}`
    };
  }

  // --- LEAST SELLING PRODUCT ---
  if (matchKeywords(q, ['least selling', 'kam bik', 'worst selling', 'lowest selling', 'kam sell', 'loss', 'kam perform', 'least perform'])) {
    const top = summarizeTopProducts(db, 10);
    if (top.length === 0) return { text: 'Abhi tak koi sales record nahi hai.' };
    const worst = top[top.length - 1];
    return {
      text: `Sabse kam bikne wala product:\n\n"${worst.name}" — sirf ${worst.qty} pints sold, revenue ${fmtMoney(worst.revenue)}.\n\nSuggestion: Is product ko replace karein ya discount de kar promote karein.`
    };
  }

  // --- PENDING PAYMENTS / DUE ---
  if (matchKeywords(q, ['pending payment', 'payment pending', 'pending kit', 'due kit', 'outstanding', 'balance due', 'uncollected', 'bakaya', 'pending kiti', 'pending kitni', 'due kitni', 'collection'])) {
    const customersDue = db.customers.filter(c => c.currentBalance > 0);
    const totalDue = customersDue.reduce((s, c) => s + c.currentBalance, 0);
    const unpaidInvoices = db.invoices.filter(i => i.balanceDue > 0);
    const invoiceDue = unpaidInvoices.reduce((s, i) => s + i.balanceDue, 0);

    if (customersDue.length === 0) {
      return { text: `Koi pending payment nahi hai. Sab customers ka balance clear hai!` };
    }

    const list = customersDue.map(c => `• ${c.name}: ${fmtMoney(c.currentBalance)} (Credit limit: ${fmtMoney(c.tabLimit)})`).join('\n');
    return {
      text: `Total Pending Payments: ${fmtMoney(totalDue)}\n\n${customersDue.length} customer${customersDue.length === 1 ? '' : 's'} with outstanding balance:\n${list}\n\n${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length === 1 ? '' : 's'} with total due ${fmtMoney(invoiceDue)}.`
    };
  }

  // --- EXPENSES ---
  if (matchKeywords(q, ['expense', 'kharch', 'kharcha', 'cost', 'expenditure', 'operation cost', 'monthly expense', 'mahine ka expense', 'is mahine', 'this month expense', 'week expense', 'is week'])) {
    const isMonth = matchKeywords(q, ['month', 'mahine', 'mahina', 'is mahine', 'this month']);
    const isWeek = matchKeywords(q, ['week', 'hafte', 'is week', 'this week']);
    const isToday = matchKeywords(q, ['today', 'aaj', 'aaj ka']);

    let label = 'Total';
    let expenses = db.expenses;

    if (isMonth) {
      const m = monthStr();
      expenses = db.expenses.filter(e => (e.date || '').startsWith(m));
      label = `This month (${m})`;
    } else if (isWeek) {
      const w = weekStr();
      expenses = db.expenses.filter(e => (e.date || '') >= w);
      label = 'This week (last 7 days)';
    } else if (isToday) {
      const t = todayStr();
      expenses = db.expenses.filter(e => (e.date || '').startsWith(t));
      label = 'Today';
    }

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    if (expenses.length === 0) return { text: `${label} ke liye koi expense record nahi hai.` };

    const byCategory = new Map<string, number>();
    expenses.forEach(e => {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    });
    const catList = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `• ${cat}: ${fmtMoney(amt)}`).join('\n');

    return {
      text: `${label} Total Expense: ${fmtMoney(total)}\n\n${expenses.length} expense${expenses.length === 1 ? '' : 's'} recorded:\n\nBy Category:\n${catList}`
    };
  }

  // --- SALES / REVENUE ---
  if (matchKeywords(q, ['sale', 'sales', 'revenue', 'income', 'aaj ki sale', 'today sale', 'week sale', 'month sale', 'total sale', 'bikri', 'kitni sale', 'kitna sale'])) {
    const isToday = matchKeywords(q, ['today', 'aaj', 'aaj ki']);
    const isWeek = matchKeywords(q, ['week', 'hafte', 'is week', 'this week']);
    const isMonth = matchKeywords(q, ['month', 'mahine', 'is mahine', 'this month']);

    let label = 'Total';
    let invoices = db.invoices;

    if (isToday) {
      const t = todayStr();
      invoices = db.invoices.filter(i => (i.timestamp || '').startsWith(t));
      label = 'Today';
    } else if (isWeek) {
      const w = weekStr();
      invoices = db.invoices.filter(i => (i.timestamp || '') >= w);
      label = 'This week (last 7 days)';
    } else if (isMonth) {
      const m = monthStr();
      invoices = db.invoices.filter(i => (i.timestamp || '').startsWith(m));
      label = 'This month';
    }

    const totalRev = invoices.reduce((s, i) => s + i.total, 0);
    const paidRev = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.total, 0);
    const unpaidRev = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.balanceDue, 0);

    return {
      text: `${label} Sales Summary:\n\n• Total Revenue: ${fmtMoney(totalRev)}\n• Paid: ${fmtMoney(paidRev)}\n• Unpaid/Pending: ${fmtMoney(unpaidRev)}\n• Total Orders: ${invoices.length}\n• Average Order Value: ${invoices.length > 0 ? fmtMoney(totalRev / invoices.length) : fmtMoney(0)}`
    };
  }

  // --- STOCK / INVENTORY ---
  if (matchKeywords(q, ['stock', 'keg', 'inventory', 'kya kitna bacha', 'stock level', 'low stock', 'keg level', 'bacha', 'remaning', 'remaining', 'kegan', 'inventry'])) {
    const lowStock = db.taps.filter(t => (t.currentLiters / t.capacityLiters) < 0.2);
    const totalLiters = db.taps.reduce((s, t) => s + t.currentLiters, 0);
    const totalCapacity = db.taps.reduce((s, t) => s + t.capacityLiters, 0);
    const overallPct = totalCapacity > 0 ? ((totalLiters / totalCapacity) * 100).toFixed(1) : '0';

    let text = `Stock Summary:\n\n• Total Beer Available: ${totalLiters.toFixed(1)}L / ${totalCapacity}L (${overallPct}%)\n• Active Taps: ${db.taps.length}\n• Low Stock Alerts: ${lowStock.length}\n`;

    if (lowStock.length > 0) {
      text += `\nLow Stock Kegs (below 20%):\n`;
      text += lowStock.map(t => {
        const pct = ((t.currentLiters / t.capacityLiters) * 100).toFixed(0);
        return `• ${t.name}: ${t.currentLiters.toFixed(1)}L / ${t.capacityLiters}L (${pct}%)`;
      }).join('\n');
      text += `\n\nWarning: Inhe jaldi restock karein!`;
    }

    return { text };
  }

  // --- CUSTOMERS ---
  if (matchKeywords(q, ['customer', 'top customer', 'best customer', 'patron', 'customers kitne', 'kitne customer', 'sabse zyada business', 'regular customer'])) {
    const topCusts = db.customers
      .map(c => ({ name: c.name, totalSpent: c.totalSpent, balance: c.currentBalance, orders: db.invoices.filter(i => i.customerId === c.id).length }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    const totalCustomers = db.customers.length;
    const customersWithBalance = db.customers.filter(c => c.currentBalance > 0).length;

    if (totalCustomers === 0) return { text: 'Abhi koi customer registered nahi hai.' };

    const list = topCusts.map((c, i) => `${i + 1}. ${c.name} — ${fmtMoney(c.totalSpent)} spent, ${c.orders} orders${c.balance > 0 ? `, ${fmtMoney(c.balance)} pending` : ''}`).join('\n');

    return {
      text: `Customer Summary:\n\n• Total Customers: ${totalCustomers}\n• Customers with Pending Balance: ${customersWithBalance}\n\nTop 5 Customers by Total Spent:\n${list}`
    };
  }

  // --- SUPPLIERS ---
  if (matchKeywords(q, ['supplier', 'vendor', 'supply', 'supplier kitne', 'kahan se', 'distributor'])) {
    if (db.suppliers.length === 0) return { text: 'Koi supplier registered nahi hai.' };
    const list = db.suppliers.map(s => {
      const purchases = db.purchases.filter(p => p.supplierId === s.id);
      const totalPurchase = purchases.reduce((sum, p) => sum + p.totalCost, 0);
      return `• ${s.name} — ${purchases.length} orders, ${fmtMoney(totalPurchase)} total purchased`;
    }).join('\n');
    return { text: `Suppliers (${db.suppliers.length}):\n\n${list}` };
  }

  // --- BEST SALES DAY ---
  if (matchKeywords(q, ['best day', 'best sales day', 'sabse zyada sale kis din', 'top day', 'highest sale day', 'best date'])) {
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    db.invoices.forEach(inv => {
      const d = (inv.timestamp || '').split('T')[0];
      if (!d) return;
      const ex = dayMap.get(d) ?? { revenue: 0, orders: 0 };
      ex.revenue += inv.total;
      ex.orders += 1;
      dayMap.set(d, ex);
    });
    if (dayMap.size === 0) return { text: 'Abhi koi sales data nahi hai.' };
    const best = Array.from(dayMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue)[0];
    const date = new Date(best[0] + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    return { text: `Best Sales Day:\n\n${date}\n• Revenue: ${fmtMoney(best[1].revenue)}\n• Orders: ${best[1].orders}\n• Average Order: ${fmtMoney(best[1].revenue / best[1].orders)}` };
  }

  // --- TAX ---
  if (matchKeywords(q, ['tax', 'vat', 'gst', 'tax rate', 'kitna tax'])) {
    return { text: `Current Tax Rate: ${((db.settings.taxRate || 0) * 100).toFixed(1)}%\n\nHar sale par ye tax rate lagta hai.` };
  }

  // --- GENERAL / HELP ---
  if (matchKeywords(q, ['help', 'madad', 'kya kar sakte', 'what can you do', 'commands', 'kaise'])) {
    return {
      text: `Main aapke business data ke baare mein koi bhi sawal ka jawab de sakta hoon. Yeh try karein:\n\n• "Aaj profit kitna hai?"\n• "Is week ka sabse zyada bikne wala product kya hai?"\n• "Total pending payments kitni hai?"\n• "Is mahine ka total expense kitna hai?"\n• "Best sales day kaunsa tha?"\n• "Stock status kya hai?"\n• "Top customers kaun hain?"\n• "Aaj ki sales kitni hai?"`
    };
  }

  // --- FALLBACK: try to give a general business summary ---
  const totalRev = db.invoices.reduce((s, i) => s + i.total, 0);
  let totalCogs = 0;
  db.invoices.forEach(inv => inv.items.forEach(item => { totalCogs += item.costTotal; }));
  const totalExp = db.expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRev - totalCogs - totalExp;
  const totalDue = db.customers.reduce((s, c) => s + c.currentBalance, 0);
  const lowStock = db.taps.filter(t => (t.currentLiters / t.capacityLiters) < 0.2).length;

  return {
    text: `Main aapka question precisely match nahi kar paya, lekin yeh aapke business ka quick summary hai:\n\n• Total Revenue: ${fmtMoney(totalRev)}\n• Net Profit: ${fmtMoney(netProfit)}\n• Pending Payments: ${fmtMoney(totalDue)}\n• Total Expenses: ${fmtMoney(totalExp)}\n• Low Stock Alerts: ${lowStock} kegs\n\nSpecific sawal puchein jaise "profit kya hai?", "top product kya hai?", "expenses kitne hain?" aadi.`
  };
}
