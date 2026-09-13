# Import your store-management app from Google Drive

## What the folder contains

A complete web app (previously live as "mindful-code-navigator") for running a shop or small business:

- **Sign-in / password reset** pages
- **Dashboard** and **Owner dashboard**
- **Point of sale (POS)** and **Billing**
- **Inventory**, **Suppliers**, **Customers**
- **Payments**, **Expenses**
- **Reports**, **Profit & loss**, **Insights**
- **Backup** and **Settings**
- Database setup files (the app stored its data in a hosted database)

## What I will do

1. **Copy every file out of the Drive folder** into this project, preserving the folder structure (source code, pages, views, components, database files). Nothing in the folder will be modified or deleted — it is only read.
2. **Merge it with this project's foundation** so it builds and runs here: keep the current build configuration, port the app's own pages, styles, and logic, and align any version differences.
3. **Set up the built-in database and login** (Lovable Cloud) using the database definitions found in the folder, so sign-in and data storage work end to end.
4. **Verify everything**: the app builds cleanly, the sign-in page loads, and each main screen (dashboard, POS, inventory, reports, etc.) renders in the preview.

## What you'll get

Your existing app running again inside this project, with all its current features intact, ready for you to extend with new instructions.

## Technical details (for reference)

- Source: Drive folder `1ON10S7KAQIS0oXGh-znkiF4S7zbcpvEr` via the linked Google Drive connection (read-only).
- The app is a TanStack Start + React 19 + Tailwind v4 project — same stack as this template, so files port directly.
- Its `supabase/` folder contains the schema; I'll apply it through a Lovable Cloud migration and enable auth.
- The Drive `.env` file will be used only to map configuration names; real secrets will be set through Lovable's secret storage, never committed to code.
