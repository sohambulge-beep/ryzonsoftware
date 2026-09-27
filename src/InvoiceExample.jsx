// src/components/InvoiceExample.jsx
// YE SIRF EXAMPLE HAI — aapki existing invoice/bill wali file mein
// neeche wala button aur import add karo, aur sample data ki jagah
// apne bill ke real values (jo aapki file mein already hain) daal do.
import React from "react";
import WhatsAppShareButton from "./WhatsAppShareButton";

export default function InvoiceExample() {
  // ---- SAMPLE DATA (apni real values se replace karo) ----
  const bill = {
    customerName: "Rahul Sharma",
    phone: "919876543210", // country code ke saath, bina + ya space
    invoiceNumber: "INV-1024",
    date: "26 Sep 2026",
    items: [
      { name: "Haircut", qty: 1, amount: 200 },
      { name: "Beard Trim", qty: 1, amount: 100 },
    ],
    total: 300,
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>Invoice {bill.invoiceNumber}</h2>
      <p>Customer: {bill.customerName}</p>
      <ul>
        {bill.items.map((item, i) => (
          <li key={i}>
            {item.name} x {item.qty} = Rs.{item.amount}
          </li>
        ))}
      </ul>
      <h3>Total: Rs.{bill.total}</h3>

      {/* 👇 YE BUTTON YAHAN ADD KARO apni invoice file mein 👇 */}
      <WhatsAppShareButton
        phone={bill.phone}
        businessName="TapTrack"
        customerName={bill.customerName}
        invoiceNumber={bill.invoiceNumber}
        date={bill.date}
        items={bill.items}
        total={bill.total}
        note="Please pay at your earliest convenience."
      />
    </div>
  );
}
