export function buildBillMessage({ businessName, customerName, invoiceNumber, date, items = [], total, note }) {
  const lines = items.map(function (i) {
    return i.name + " x" + i.qty + " = ₹" + (i.qty * i.price);
  });
  return [
    "" + businessName + "",
    "Bill No: " + invoiceNumber,
    "Date: " + date,
    "Customer: " + customerName,
    "",
    ...lines,
    "",
    "Total: ₹" + total + "",
    note ? "\n" + note : "",
  ].join("\n");
}

export function buildWhatsAppLink(phone, message) {
  let num = String(phone).replace(/\D/g, "");
  if (num.length === 10) num = "91" + num;
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(message);
}
