import type { Invoice, Settings } from "@/types";
import { fmtMoney, fmtDateTime } from "@/utils";

/** Normalize a stored phone number into a wa.me-compatible digit string. */
export function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  // Assume India (+91) when a bare 10-digit local number is stored
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

export function buildInvoiceMessage(invoice: Invoice, settings: Settings): string {
  const taxPct = `${((settings?.taxRate ?? 0) * 100).toFixed(1)}%`;
  const lines: string[] = [];

  lines.push(`*${settings?.barName || "Invoice"}*`);
  lines.push(`Invoice: *${invoice.invoiceNo}*`);
  lines.push(`Date: ${fmtDateTime(invoice.timestamp)}`);
  lines.push(`Customer: ${invoice.customerName || "Walk-in Guest"}`);
  lines.push("");
  lines.push("*Items*");
  for (const item of invoice.items) {
    lines.push(
      `• ${item.beerName} — ${item.qty} x ${fmtMoney(item.unitPrice)} = ${fmtMoney(item.total)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${fmtMoney(invoice.subtotal)}`);
  lines.push(`GST / Tax (${taxPct}): ${fmtMoney(invoice.tax)}`);
  lines.push(`*Grand Total: ${fmtMoney(invoice.total)}*`);
  lines.push(`Paid: ${fmtMoney(invoice.paidAmount)} (${invoice.paymentMethod})`);
  if (invoice.balanceDue > 0) {
    lines.push(`Balance Due: ${fmtMoney(invoice.balanceDue)}`);
  }
  lines.push(`Status: ${invoice.status}`);
  lines.push("");
  lines.push("Thank you for your visit! 🍻");

  return lines.join("\n");
}

/** Opens WhatsApp (app or web) with a prefilled invoice message. */
export function sendInvoiceOnWhatsApp(invoice: Invoice, settings: Settings, phone?: string) {
  const text = encodeURIComponent(buildInvoiceMessage(invoice, settings));
  const digits = normalizePhone(phone);
  const url = digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
