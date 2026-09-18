export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      gst_einvoice_logs: {
        Row: {
          action: string
          created_at: string
          error_code: string | null
          error_message: string | null
          gst_invoice_id: string | null
          http_status: number | null
          id: string
          provider: string
          request_payload: Json | null
          response_payload: Json | null
          success: boolean
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          gst_invoice_id?: string | null
          http_status?: number | null
          id?: string
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          gst_invoice_id?: string | null
          http_status?: number | null
          id?: string
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_einvoice_logs_gst_invoice_id_fkey"
            columns: ["gst_invoice_id"]
            isOneToOne: false
            referencedRelation: "gst_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_invoice_items: {
        Row: {
          cess_amount: number
          cgst_amount: number
          created_at: string
          description: string
          discount: number
          gst_invoice_id: string
          gst_rate: number
          hsn_sac: string
          id: string
          igst_amount: number
          line_no: number
          line_total: number
          quantity: number
          sgst_amount: number
          taxable_value: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          cess_amount?: number
          cgst_amount?: number
          created_at?: string
          description?: string
          discount?: number
          gst_invoice_id: string
          gst_rate?: number
          hsn_sac?: string
          id?: string
          igst_amount?: number
          line_no?: number
          line_total?: number
          quantity?: number
          sgst_amount?: number
          taxable_value?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Update: {
          cess_amount?: number
          cgst_amount?: number
          created_at?: string
          description?: string
          discount?: number
          gst_invoice_id?: string
          gst_rate?: number
          hsn_sac?: string
          id?: string
          igst_amount?: number
          line_no?: number
          line_total?: number
          quantity?: number
          sgst_amount?: number
          taxable_value?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_invoice_items_gst_invoice_id_fkey"
            columns: ["gst_invoice_id"]
            isOneToOne: false
            referencedRelation: "gst_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_invoices: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          attempt_count: number
          buyer_address: string
          buyer_gstin: string
          buyer_name: string
          buyer_state_code: string
          cancel_reason: string | null
          cancel_remark: string | null
          cancelled_at: string | null
          cess_total: number
          cgst_total: number
          created_at: string
          einvoice_required: boolean
          einvoice_status: Database["public"]["Enums"]["einvoice_status"]
          grand_total: number
          id: string
          igst_total: number
          invoice_date: string
          invoice_no: string
          invoice_timestamp: string
          irn: string | null
          is_interstate: boolean
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          local_invoice_id: string
          place_of_supply: string
          seller_gstin: string
          seller_legal_name: string
          seller_state_code: string
          sgst_total: number
          signed_invoice: string | null
          signed_qr: string | null
          supply_type: string
          tax_total: number
          taxable_total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          attempt_count?: number
          buyer_address?: string
          buyer_gstin?: string
          buyer_name?: string
          buyer_state_code?: string
          cancel_reason?: string | null
          cancel_remark?: string | null
          cancelled_at?: string | null
          cess_total?: number
          cgst_total?: number
          created_at?: string
          einvoice_required?: boolean
          einvoice_status?: Database["public"]["Enums"]["einvoice_status"]
          grand_total?: number
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_no: string
          invoice_timestamp?: string
          irn?: string | null
          is_interstate?: boolean
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          local_invoice_id: string
          place_of_supply?: string
          seller_gstin?: string
          seller_legal_name?: string
          seller_state_code?: string
          sgst_total?: number
          signed_invoice?: string | null
          signed_qr?: string | null
          supply_type?: string
          tax_total?: number
          taxable_total?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          attempt_count?: number
          buyer_address?: string
          buyer_gstin?: string
          buyer_name?: string
          buyer_state_code?: string
          cancel_reason?: string | null
          cancel_remark?: string | null
          cancelled_at?: string | null
          cess_total?: number
          cgst_total?: number
          created_at?: string
          einvoice_required?: boolean
          einvoice_status?: Database["public"]["Enums"]["einvoice_status"]
          grand_total?: number
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_no?: string
          invoice_timestamp?: string
          irn?: string | null
          is_interstate?: boolean
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          local_invoice_id?: string
          place_of_supply?: string
          seller_gstin?: string
          seller_legal_name?: string
          seller_state_code?: string
          sgst_total?: number
          signed_invoice?: string | null
          signed_qr?: string | null
          supply_type?: string
          tax_total?: number
          taxable_total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gst_settings: {
        Row: {
          address_line1: string
          address_line2: string
          applicability_assessed_at: string | null
          applicability_rule_reference: string
          applicability_rule_threshold: number
          city: string
          created_at: string
          default_gst_rate: number
          default_hsn: string
          default_tax_confirmed: boolean
          einvoice_applicability_status: string
          einvoice_applicable: boolean
          einvoice_mode: string
          einvoice_threshold: number
          exemption_notes: string
          gst_enabled: boolean
          gstin: string
          id: string
          legal_name: string
          pincode: string
          place_of_supply: string
          state_code: string
          state_name: string
          supplier_exemption_category: string
          trade_name: string
          turnover_threshold_crossed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          applicability_assessed_at?: string | null
          applicability_rule_reference?: string
          applicability_rule_threshold?: number
          city?: string
          created_at?: string
          default_gst_rate?: number
          default_hsn?: string
          default_tax_confirmed?: boolean
          einvoice_applicability_status?: string
          einvoice_applicable?: boolean
          einvoice_mode?: string
          einvoice_threshold?: number
          exemption_notes?: string
          gst_enabled?: boolean
          gstin?: string
          id?: string
          legal_name?: string
          pincode?: string
          place_of_supply?: string
          state_code?: string
          state_name?: string
          supplier_exemption_category?: string
          trade_name?: string
          turnover_threshold_crossed?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          applicability_assessed_at?: string | null
          applicability_rule_reference?: string
          applicability_rule_threshold?: number
          city?: string
          created_at?: string
          default_gst_rate?: number
          default_hsn?: string
          default_tax_confirmed?: boolean
          einvoice_applicability_status?: string
          einvoice_applicable?: boolean
          einvoice_mode?: string
          einvoice_threshold?: number
          exemption_notes?: string
          gst_enabled?: boolean
          gstin?: string
          id?: string
          legal_name?: string
          pincode?: string
          place_of_supply?: string
          state_code?: string
          state_name?: string
          supplier_exemption_category?: string
          trade_name?: string
          turnover_threshold_crossed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bar_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          bar_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          bar_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          base_salary: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          joining_date: string
          notes: string | null
          owner_id: string
          phone: string
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          joining_date?: string
          notes?: string | null
          owner_id?: string
          phone?: string
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          joining_date?: string
          notes?: string | null
          owner_id?: string
          phone?: string
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      staff_activity_log: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          details: string | null
          id: string
          staff_id: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          staff_id?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_approval_requests: {
        Row: {
          amount: number | null
          created_at: string
          details: string | null
          id: string
          request_type: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          details?: string | null
          id?: string
          request_type: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          details?: string | null
          id?: string
          request_type?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_approval_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          id: string
          notes: string | null
          staff_id: string
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id: string
          status?: string
          updated_at?: string
          work_date?: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_salary_payments: {
        Row: {
          advance: number
          base_salary: number
          bonus: number
          created_at: string
          deduction: number
          earned: number
          id: string
          net_payable: number
          note: string | null
          paid_amount: number
          paid_at: string | null
          payment_method: string | null
          period_month: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          advance?: number
          base_salary?: number
          bonus?: number
          created_at?: string
          deduction?: number
          earned?: number
          id?: string
          net_payable?: number
          note?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          period_month: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          advance?: number
          base_salary?: number
          bonus?: number
          created_at?: string
          deduction?: number
          earned?: number
          id?: string
          net_payable?: number
          note?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          period_month?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_salary_payments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          is_off: boolean
          staff_id: string
          start_time: string | null
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_off?: boolean
          staff_id: string
          start_time?: string | null
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_off?: boolean
          staff_id?: string
          start_time?: string | null
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_role_name: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_or_owner: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      my_staff_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "owner" | "manager" | "staff"
      einvoice_status:
        | "not_required"
        | "pending"
        | "generated"
        | "failed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "staff"],
      einvoice_status: [
        "not_required",
        "pending",
        "generated",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
