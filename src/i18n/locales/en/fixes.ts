// English mode: older screens of the app contain a few Hindi-in-English-letters sentences.
// This file turns them into plain English so that nothing Hindi shows when English is chosen.
// A gap ({n}, {#n} for a number, {$n} for an amount) stands for a value that changes.

const fixes: Record<string, string> = {
  // alerts
  'Stock khatam hone wala hai': 'Stock is about to run out',
  'Payment pending hai': 'Payment is pending',
  'Sales bahut kam hai': 'Sales are very low',
  '{n} keg sirf {#p}% reh gaya hai ({#a}L / {#c}L). Jaldi restock karein!': '{n} keg has only {p}% left ({a}L / {c}L). Please restock soon!',
  '{n} par {$a} outstanding hai.': '{n} has {a} outstanding.',
  '{n} par {$a} outstanding hai. Credit limit ({$l}) cross ho gaya!': '{n} has {a} outstanding. The credit limit ({l}) has been crossed!',
  'Aaj ki sales sirf {$a} hai — 7-din average ({$b}) se 60% kam. Kuch action lena chahiye?': "Today's sales are only {a}, which is 60% below the 7-day average ({b}). Should you take some action?",
  'Invoice {n} ({c}) ka {$a} {#d} din se pending hai.': 'Invoice {n} ({c}) has had {a} pending for {d} days.',
  'All clear! Koi alerts nahi hai.': 'All clear! There are no alerts.',
  // access message
  'Aapke role (': 'Your role (',
  ') ko is module ka access nahi hai. Owner se permission maango.': ') does not have access to this module. Ask the owner for permission.',
  // AI assistant
  'Business ke baare mein koi bhi sawal puchein': 'Ask any question about your business',
  'Aapka question samajh nahi aaya. Kripya phir se puchein.': 'I could not understand your question. Please try again.',
  'Abhi tak koi sales record nahi hai. POS par sale karne ke baad yahan data dikhega.': 'There are no sales records yet. Data will appear here after you make a sale in the POS.',
  'Abhi tak koi sales record nahi hai.': 'There are no sales records yet.',
  'Koi pending payment nahi hai. Sab customers ka balance clear hai!': 'There is no pending payment. All customer balances are clear!',
  '{n} ke liye koi expense record nahi hai.': 'There is no expense record for {n}.',
  'Abhi koi customer registered nahi hai.': 'No customer is registered yet.',
  'Koi supplier registered nahi hai.': 'No supplier is registered yet.',
  'Abhi koi sales data nahi hai.': 'There is no sales data yet.',
  // tables and kitchen
  'Tables load nahi hue:': 'Tables could not be loaded:',
  'Solution: Supabase Dashboard → SQL Editor → neeche diya migration SQL run karo (Step 0), phir page refresh karo.': 'Solution: Supabase Dashboard → SQL Editor → run the migration SQL given below (Step 0), then refresh the page.',
  'Koi table nahi hai. "Add Table" dabake shuru karo.': 'There are no tables. Press "Add Table" to start.',
  'Order lene ke liye kisi table pe click karo': 'Click a table to take an order',
  'Menu se items add karo, phir "Send to Kitchen" dabao': 'Add items from the menu, then press "Send to Kitchen"',
  // staff roles
  'Sirf': 'Only',
  'staff roles manage kar sakta hai.': 'can manage staff roles.',
  'Koi staff role assigned nahi hai': 'No staff role is assigned',
  'Staff ka Auth User ID: Supabase Dashboard → Authentication → Users se milta hai.': "The staff member's Auth User ID is found in Supabase Dashboard → Authentication → Users.",
};

export default fixes;
