import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { CHANGE_EVENT, findToCreate, readDone, readTemplates, saveDone } from '@/lib/recurringExpenses';

// Has no screen. While the app is open it records the fixed expenses that have fallen due.
export function RecurringExpenseRunner() {
  const { db, saveExpense } = useStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(CHANGE_EVENT, bump);
    return () => window.removeEventListener(CHANGE_EVENT, bump);
  }, []);

  useEffect(() => {
    // A short wait lets the app finish loading its saved data first.
    const timer = window.setTimeout(() => {
      const templates = readTemplates();
      if (templates.length === 0) return;
      const done = new Set(readDone());
      const titles = new Set(db.expenses.map(e => e.title));
      const { create, confirm } = findToCreate(templates, titles, done, new Date());

      let changed = false;
      for (const k of confirm) {
        if (!done.has(k)) {
          done.add(k);
          changed = true;
        }
      }
      if (changed) saveDone([...done]);

      for (const item of create) {
        saveExpense({ title: item.title, category: item.category, amount: item.amount, paymentMethod: item.paymentMethod });
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [db.expenses, saveExpense, tick]);

  return null;
}
