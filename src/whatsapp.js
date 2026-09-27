// src/utils/whatsapp.js
// WhatsApp share link banane ke helper functions

/**
 * Bill/Invoice ka WhatsApp message text banata hai
 */
export function buildBillMessage({ businessName, customerName, invoiceNumber, date, items, total, note }) {
  const lines = [];

  lines.push(`*${businessName || "TapTrack"}*`);
  lines.push("");

  if (invoiceNumber) lines.push(`Invoice No: ${invoiceNumber}`);
  if (date) lines.push(`Date: ${date}`);
  if (customerName) {
    lines.push("");
    lines.push(`Customer: ${customerName}`);
  }

  if (items && items.length > 0) {
    lines.push("");
    lines.push("*Bill Details:*");
    items.forEach((item, i) => {
      const qty = item.qty !== undefined ? item.qty : 1;
      const amount = item.amount !== undefined ? item.amount : item.price * qty;
      lines.push(`${i + 1}. ${item.name} x ${qty} = Rs.${amount}`);
    });
  }

  if (total !== undefined && total !== null && total !== "") {
    lines.push("");
    lines.push(`*Total: Rs.${total}*`);
  }

  if (note) {
    lines.push("");
    lines.push(note);
  }

  lines.push("");
  lines.push("Thank you for your business!");

  return lines.join("\n");
}

/**
 * WhatsApp share link banata hai.
 * phone: customer ka number country code ke saath, bina +/space/dash (e.g. "919876543210")
 *        Agar phone khali hai to WhatsApp share picker khulega (user khud contact choose karega).
 */
export function buildWhatsAppLink(message, phone = "") {
  const encoded = encodeURIComponent(message);
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}
