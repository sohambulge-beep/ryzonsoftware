import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type StaffRole = 'owner' | 'manager' | 'staff';

export interface StaffMember {
  id: string;
  owner_id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  role: StaffRole;
  photo_url: string | null;
  joining_date: string;
  base_salary: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  staff_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  notes: string | null;
}

export interface ShiftRow {
  id: string;
  staff_id: string;
  week_start: string;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  is_off: boolean;
}

export interface SalaryRow {
  id: string;
  staff_id: string;
  period_month: string;
  base_salary: number;
  earned: number;
  advance: number;
  deduction: number;
  bonus: number;
  net_payable: number;
  paid_amount: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  note: string | null;
}

export interface ActivityRow {
  id: string;
  actor_name: string | null;
  staff_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  requested_by: string | null;
  staff_id: string | null;
  request_type: string;
  amount: number | null;
  details: string | null;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/* ---------------------------------------------------------------- helpers */

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartKey(d: Date = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - day);
  return todayKey(copy);
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function daysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

export function computeEarned(base: number, present: number, half: number, period: string): number {
  const total = daysInMonth(period);
  if (!total) return 0;
  return Math.round(((base * (present + half * 0.5)) / total) * 100) / 100;
}

async function logActivity(action: string, details: string, staffId?: string | null) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  await supabase.from('staff_activity_log').insert({
    actor_user_id: user.id,
    actor_name: (user.user_metadata?.['full_name'] as string) ?? user.email ?? 'User',
    staff_id: staffId ?? null,
    action,
    details,
  });
}

/* ------------------------------------------------------------------ hooks */

export function useMyRole() {
  return useQuery({
    queryKey: ['staff', 'my-role'],
    queryFn: async (): Promise<StaffRole> => {
      const { data, error } = await supabase.rpc('current_role_name');
      if (error) throw error;
      return ((data as string) ?? 'owner') as StaffRole;
    },
    staleTime: 60_000,
  });
}

export function useMyStaffId() {
  return useQuery({
    queryKey: ['staff', 'my-staff-id'],
    queryFn: async (): Promise<string | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase.from('staff').select('id').eq('user_id', auth.user.id).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    staleTime: 60_000,
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ['staff', 'list'],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StaffMember[];
    },
  });
}

export interface StaffInput {
  id?: string;
  full_name: string;
  phone: string;
  email: string;
  role: StaffRole;
  photo_url: string | null;
  joining_date: string;
  base_salary: number;
  is_active: boolean;
  notes: string;
}

export function useSaveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StaffInput) => {
      const payload = {
        full_name: input.full_name,
        phone: input.phone,
        email: input.email || null,
        role: input.role,
        photo_url: input.photo_url,
        joining_date: input.joining_date,
        base_salary: input.base_salary,
        is_active: input.is_active,
        notes: input.notes || null,
      };
      if (input.id) {
        const { error } = await supabase.from('staff').update(payload).eq('id', input.id);
        if (error) throw error;
        await logActivity('Staff updated', `Updated profile for ${input.full_name}`, input.id);
        return input.id;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('staff')
        .insert({ ...payload, owner_id: auth.user?.id as string })
        .select('id')
        .single();
      if (error) throw error;
      await logActivity('Staff added', `Added ${input.full_name} as ${input.role}`, data.id);
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staff: StaffMember) => {
      const { error } = await supabase.from('staff').delete().eq('id', staff.id);
      if (error) throw error;
      await logActivity('Staff removed', `Removed ${staff.full_name}`, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useAttendance(period: string) {
  return useQuery({
    queryKey: ['staff', 'attendance', period],
    queryFn: async (): Promise<AttendanceRow[]> => {
      const last = daysInMonth(period);
      const { data, error } = await supabase
        .from('staff_attendance')
        .select('*')
        .gte('work_date', `${period}-01`)
        .lte('work_date', `${period}-${String(last).padStart(2, '0')}`)
        .order('work_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceRow[];
    },
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      staffId: string;
      staffName: string;
      date: string;
      kind: 'in' | 'out' | 'status';
      status?: string;
    }) => {
      const { staffId, date, kind } = args;
      const { data: existing } = await supabase
        .from('staff_attendance')
        .select('*')
        .eq('staff_id', staffId)
        .eq('work_date', date)
        .maybeSingle();

      if (kind === 'in') {
        if (existing) {
          const { error } = await supabase
            .from('staff_attendance')
            .update({ check_in_at: new Date().toISOString(), status: 'present' })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('staff_attendance').insert({
            staff_id: staffId,
            work_date: date,
            check_in_at: new Date().toISOString(),
            status: 'present',
          });
          if (error) throw error;
        }
        await logActivity('Check-in', `${args.staffName} checked in`, staffId);
      } else if (kind === 'out') {
        if (!existing) throw new Error('Check in first');
        const { error } = await supabase
          .from('staff_attendance')
          .update({ check_out_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
        await logActivity('Check-out', `${args.staffName} checked out`, staffId);
      } else {
        const status = args.status ?? 'present';
        if (existing) {
          const { error } = await supabase.from('staff_attendance').update({ status }).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('staff_attendance')
            .insert({ staff_id: staffId, work_date: date, status });
          if (error) throw error;
        }
        await logActivity('Attendance updated', `${args.staffName} marked ${status} on ${date}`, staffId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useShifts(weekStart: string) {
  return useQuery({
    queryKey: ['staff', 'shifts', weekStart],
    queryFn: async (): Promise<ShiftRow[]> => {
      const { data, error } = await supabase.from('staff_shifts').select('*').eq('week_start', weekStart);
      if (error) throw error;
      return (data ?? []) as unknown as ShiftRow[];
    },
  });
}

export function useSaveShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      staffId: string;
      staffName: string;
      weekStart: string;
      weekday: number;
      start_time: string | null;
      end_time: string | null;
      is_off: boolean;
    }) => {
      const { error } = await supabase.from('staff_shifts').upsert(
        {
          staff_id: args.staffId,
          week_start: args.weekStart,
          weekday: args.weekday,
          start_time: args.start_time,
          end_time: args.end_time,
          is_off: args.is_off,
        },
        { onConflict: 'staff_id,week_start,weekday' },
      );
      if (error) throw error;
      await logActivity(
        'Shift updated',
        `${args.staffName} — ${WEEKDAYS[args.weekday]} ${args.is_off ? 'Off' : `${args.start_time ?? ''}-${args.end_time ?? ''}`}`,
        args.staffId,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', 'shifts'] }),
  });
}

export function useSalaries(period: string) {
  return useQuery({
    queryKey: ['staff', 'salaries', period],
    queryFn: async (): Promise<SalaryRow[]> => {
      const { data, error } = await supabase.from('staff_salary_payments').select('*').eq('period_month', period);
      if (error) throw error;
      return (data ?? []) as unknown as SalaryRow[];
    },
  });
}

export function useSalaryHistory() {
  return useQuery({
    queryKey: ['staff', 'salary-history'],
    queryFn: async (): Promise<SalaryRow[]> => {
      const { data, error } = await supabase
        .from('staff_salary_payments')
        .select('*')
        .order('period_month', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SalaryRow[];
    },
  });
}

export function useSaveSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      staffId: string;
      staffName: string;
      period: string;
      base_salary: number;
      earned: number;
      advance: number;
      deduction: number;
      bonus: number;
      paid_amount: number;
      status: string;
      payment_method: string;
      note: string;
    }) => {
      const net = args.earned + args.bonus - args.deduction - args.advance;
      const { error } = await supabase.from('staff_salary_payments').upsert(
        {
          staff_id: args.staffId,
          period_month: args.period,
          base_salary: args.base_salary,
          earned: args.earned,
          advance: args.advance,
          deduction: args.deduction,
          bonus: args.bonus,
          net_payable: net,
          paid_amount: args.paid_amount,
          status: args.status,
          payment_method: args.payment_method || null,
          paid_at: args.status === 'Paid' ? new Date().toISOString() : null,
          note: args.note || null,
        },
        { onConflict: 'staff_id,period_month' },
      );
      if (error) throw error;
      await logActivity('Salary saved', `${args.staffName} — ${args.period} marked ${args.status}`, args.staffId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ['staff', 'activity'],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from('staff_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ['staff', 'approvals'],
    queryFn: async (): Promise<ApprovalRow[]> => {
      const { data, error } = await supabase
        .from('staff_approval_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApprovalRow[];
    },
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { staffId: string | null; type: string; amount: number | null; details: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('staff_approval_requests').insert({
        requested_by: auth.user?.id as string,
        staff_id: args.staffId,
        request_type: args.type,
        amount: args.amount,
        details: args.details,
      });
      if (error) throw error;
      await logActivity('Approval requested', `${args.type}: ${args.details}`, args.staffId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useReviewApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: 'Approved' | 'Rejected'; note?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('staff_approval_requests')
        .update({
          status: args.status,
          reviewed_by: auth.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_note: args.note ?? null,
        })
        .eq('id', args.id);
      if (error) throw error;
      await logActivity(`Request ${args.status.toLowerCase()}`, `Approval request ${args.status.toLowerCase()}`, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

/** Downscale an image file to a compact data URL so it can be stored with the profile. */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
