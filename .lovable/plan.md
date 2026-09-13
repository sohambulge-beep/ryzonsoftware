# Staff Management module for TapTrack

I inspected the app: there is no Staff page, no Staff entry in the sidebar, and no staff tables in the database. Only a `profiles` table exists. So this needs to be built from scratch — the plan below does that, stores everything in the real backend, and leaves the current app untouched.

## What you will get

**Staff in the sidebar** — a new "Staff" item in the Core Management group that opens the Staff Management page.

**Staff Management page** with tabs:

1. **Team** — cards/table of staff with photo, name, phone, role (Owner / Manager / Staff), joining date and Active/Inactive status. Add, edit and deactivate staff. Photo upload goes to backend file storage.
2. **Attendance** — Check-in / Check-out button for today, a month calendar showing present / absent / half-day, and a monthly summary (days present, hours worked, late marks).
3. **Roster** — weekly shift grid (staff x Mon–Sun) where each cell holds a shift time range or an off day.
4. **Salary** — base salary per staff, auto-calculated pay from attendance for the selected month, plus advances, deductions and bonuses; payment status (Pending / Partial / Paid) and full payment history.
5. **Activity log** — who did what and when (staff created, checked in, salary paid, shift changed, etc.).
6. **Approvals** — a queue of requests (advance request, leave, attendance correction) that a Manager or Owner approves or rejects.

**Permissions**
- Owner: everything.
- Manager: team view, attendance, roster, approvals; no salary editing, no deleting staff.
- Staff: only their own profile, own check-in/out, own attendance, own shifts, own salary history, and raising requests.

Permissions are enforced in the database itself, not just hidden in the UI.

**Responsive** — cards and stacked layout on mobile, tables and grids on desktop.

**Data persists** — everything is saved in the backend, so it survives refresh and is shared across devices. Nothing existing (POS, billing, inventory, customers, expenses, reports) is changed or removed.

## Technical details

Database (one migration, with GRANTs + RLS on every table):
- `app_role` enum (`owner`, `manager`, `staff`), `user_roles` table, `has_role(uuid, app_role)` security-definer function. First signed-in user of a bar gets `owner`.
- `staff` — id, user_id (nullable link to an auth account), full_name, phone, role, photo_url, joining_date, base_salary, is_active, created_by, timestamps.
- `attendance` — staff_id, date, check_in_at, check_out_at, status, notes; unique per staff/date.
- `shifts` — staff_id, week_start, weekday, start_time, end_time, is_off.
- `salary_payments` — staff_id, period_month, base, earned, advance, deduction, bonus, net, status, paid_at, method, note.
- `staff_activity_log` — actor_user_id, staff_id, action, details jsonb, created_at.
- `approval_requests` — requested_by, staff_id, type, payload jsonb, status, reviewed_by, reviewed_at, note.
- Storage bucket `staff-photos` (public read, authenticated write).

RLS: owner full access via `has_role`; manager scoped read/write per table; staff restricted to rows where `staff.user_id = auth.uid()`.

Frontend:
- `src/views/StaffView.tsx` plus `src/components/staff/*` (StaffList, StaffProfile, AttendanceCalendar, RosterGrid, SalaryPanel, ActivityLog, ApprovalQueue) and `src/modals/StaffModal.tsx`.
- Data access through `src/lib/staff.functions.ts` (`createServerFn` + `requireSupabaseAuth`) with TanStack Query for caching/invalidation.
- `staff` added to `ViewId` in `src/types.ts`, to the sidebar nav list, and to the view map in `src/routes/_authenticated/index.tsx`. Staff data lives in the backend, not in the existing localStorage store, so the current store logic is untouched.
- `useRole()` hook reads the signed-in user's role and drives what each tab shows.

Verification in the Preview before reporting back: Staff appears in the sidebar, opens the page, a staff profile can be created and reappears after refresh, and attendance / roster / salary tabs all load.
