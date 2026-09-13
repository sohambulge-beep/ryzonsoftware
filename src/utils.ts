export function fmtMoney(n: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);
  return `₹${formatted}`;
}

export function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString();
}

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ts: string): string {
  return `${fmtDate(ts)} ${fmtTime(ts)}`;
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function monthStr(): string {
  return todayStr().substring(0, 7);
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function genInvoiceNo(): string {
  return `INV-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function genReceiptNo(): string {
  return `RCP-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function genPoNo(): string {
  return `PO-${Math.floor(1000 + Math.random() * 9000)}`;
}
