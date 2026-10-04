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
      bank_accounts: {
        Row: {
          created_at: string
          id: string
          last4: string
          name: string
          opening_balance: number
          opening_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last4?: string
          name: string
          opening_balance?: number
          opening_date?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          last4?: string
          name?: string
          opening_balance?: number
          opening_date?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          description: string
          direction: string
          entry_date: string
          id: string
          reference: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          description?: string
          direction: string
          entry_date?: string
          id?: string
          reference?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          description?: string
          direction?: string
          entry_date?: string
          id?: string
          reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_tables: {
        Row: {
          created_at: string
          id: string
          name: string
          seats: number
          sort_order: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          seats?: number
          sort_order?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          seats?: number
          sort_order?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      excise_brands: {
        Row: {
          bottles_per_case: number
          category: string
          created_at: string
          id: string
          name: string
          rate: number
          size_ml: number
          user_id: string
        }
        Insert: {
          bottles_per_case?: number
          category: string
          created_at?: string
          id?: string
          name: string
          rate?: number
          size_ml: number
          user_id?: string
        }
        Update: {
          bottles_per_case?: number
          category?: string
          created_at?: string
          id?: string
          name?: string
          rate?: number
          size_ml?: number
          user_id?: string
        }
        Relationships: []
      }
      excise_daily_sales: {
        Row: {
          bottles: number
          brand_id: string
          created_at: string
          id: string
          sale_date: string
          user_id: string
        }
        Insert: {
          bottles: number
          brand_id: string
          created_at?: string
          id?: string
          sale_date?: string
          user_id?: string
        }
        Update: {
          bottles?: number
          brand_id?: string
          created_at?: string
          id?: string
          sale_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "excise_daily_sales_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "excise_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excise_daily_sales_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "excise_stock_summary"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      excise_settings: {
        Row: {
          created_at: string
          flr2_no: string
          hotel_name: string
          id: string
          licence_no: string
          permit_holder_no: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flr2_no?: string
          hotel_name?: string
          id?: string
          licence_no?: string
          permit_holder_no?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          flr2_no?: string
          hotel_name?: string
          id?: string
          licence_no?: string
          permit_holder_no?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      excise_tp_items: {
        Row: {
          bottles: number
          bottles_total: number
          brand_id: string
          cases: number
          id: string
          receipt_id: string
          user_id: string
        }
        Insert: {
          bottles?: number
          bottles_total?: number
          brand_id: string
          cases?: number
          id?: string
          receipt_id: string
          user_id?: string
        }
        Update: {
          bottles?: number
          bottles_total?: number
          brand_id?: string
          cases?: number
          id?: string
          receipt_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "excise_tp_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "excise_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excise_tp_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "excise_stock_summary"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "excise_tp_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "excise_tp_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      excise_tp_receipts: {
        Row: {
          auto_tp_no: string
          created_at: string
          id: string
          party: string
          receipt_date: string
          status: string
          tp_no: string
          user_id: string
        }
        Insert: {
          auto_tp_no?: string
          created_at?: string
          id?: string
          party?: string
          receipt_date?: string
          status?: string
          tp_no: string
          user_id?: string
        }
        Update: {
          auto_tp_no?: string
          created_at?: string
          id?: string
          party?: string
          receipt_date?: string
          status?: string
          tp_no?: string
          user_id?: string
        }
        Relationships: []
      }
      gst_einvoice_connections: {
        Row: {
          authorization_status: string
          authorization_updated_at: string | null
          authorized_gstin: string
          connection_status: string
          created_at: string
          environment: string
          gstin_validated_at: string | null
          last_connection_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_successful_connection_at: string | null
          provider: string
          provider_reference: string | null
          updated_at: string
          user_id: string
          validated_address: Json | null
          validated_legal_name: string | null
          validated_trade_name: string | null
        }
        Insert: {
          authorization_status?: string
          authorization_updated_at?: string | null
          authorized_gstin?: string
          connection_status?: string
          created_at?: string
          environment?: string
          gstin_validated_at?: string | null
          last_connection_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_successful_connection_at?: string | null
          provider?: string
          provider_reference?: string | null
          updated_at?: string
          user_id?: string
          validated_address?: Json | null
          validated_legal_name?: string | null
          validated_trade_name?: string | null
        }
        Update: {
          authorization_status?: string
          authorization_updated_at?: string | null
          authorized_gstin?: string
          connection_status?: string
          created_at?: string
          environment?: string
          gstin_validated_at?: string | null
          last_connection_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_successful_connection_at?: string | null
          provider?: string
          provider_reference?: string | null
          updated_at?: string
          user_id?: string
          validated_address?: Json | null
          validated_legal_name?: string | null
          validated_trade_name?: string | null
        }
        Relationships: []
      }
      gst_einvoice_logs: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          action: string
          api_environment: string | null
          created_at: string
          document_key: string | null
          error_code: string | null
          error_message: string | null
          gst_invoice_id: string | null
          gstin: string | null
          http_status: number | null
          id: string
          irn: string | null
          payload_hash: string | null
          provider: string
          provider_request_id: string | null
          request_payload: Json | null
          request_started_at: string | null
          request_status: string
          response_payload: Json | null
          response_received_at: string | null
          retry_attempt: number
          success: boolean
          user_id: string
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          action: string
          api_environment?: string | null
          created_at?: string
          document_key?: string | null
          error_code?: string | null
          error_message?: string | null
          gst_invoice_id?: string | null
          gstin?: string | null
          http_status?: number | null
          id?: string
          irn?: string | null
          payload_hash?: string | null
          provider?: string
          provider_request_id?: string | null
          request_payload?: Json | null
          request_started_at?: string | null
          request_status?: string
          response_payload?: Json | null
          response_received_at?: string | null
          retry_attempt?: number
          success?: boolean
          user_id?: string
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          action?: string
          api_environment?: string | null
          created_at?: string
          document_key?: string | null
          error_code?: string | null
          error_message?: string | null
          gst_invoice_id?: string | null
          gstin?: string | null
          http_status?: number | null
          id?: string
          irn?: string | null
          payload_hash?: string | null
          provider?: string
          provider_request_id?: string | null
          request_payload?: Json | null
          request_started_at?: string | null
          request_status?: string
          response_payload?: Json | null
          response_received_at?: string | null
          retry_attempt?: number
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
          gst_rate_configured: boolean
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
          gst_rate_configured?: boolean
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
          gst_rate_configured?: boolean
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
          einvoice_environment: string | null
          einvoice_provider: string | null
          einvoice_required: boolean
          einvoice_status: Database["public"]["Enums"]["einvoice_status"]
          einvoice_validation_error: string | null
          grand_total: number
          id: string
          idempotency_key: string
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
          provider_document_id: string | null
          provider_request_id: string | null
          seller_gstin: string
          seller_legal_name: string
          seller_state_code: string
          sgst_total: number
          signed_invoice: string | null
          signed_qr: string | null
          submission_lock_expires_at: string | null
          submission_lock_token: string | null
          submission_state: string
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
          einvoice_environment?: string | null
          einvoice_provider?: string | null
          einvoice_required?: boolean
          einvoice_status?: Database["public"]["Enums"]["einvoice_status"]
          einvoice_validation_error?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string
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
          provider_document_id?: string | null
          provider_request_id?: string | null
          seller_gstin?: string
          seller_legal_name?: string
          seller_state_code?: string
          sgst_total?: number
          signed_invoice?: string | null
          signed_qr?: string | null
          submission_lock_expires_at?: string | null
          submission_lock_token?: string | null
          submission_state?: string
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
          einvoice_environment?: string | null
          einvoice_provider?: string | null
          einvoice_required?: boolean
          einvoice_status?: Database["public"]["Enums"]["einvoice_status"]
          einvoice_validation_error?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string
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
          provider_document_id?: string | null
          provider_request_id?: string | null
          seller_gstin?: string
          seller_legal_name?: string
          seller_state_code?: string
          sgst_total?: number
          signed_invoice?: string | null
          signed_qr?: string | null
          submission_lock_expires_at?: string | null
          submission_lock_token?: string | null
          submission_state?: string
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
      kot: {
        Row: {
          created_at: string
          id: string
          items: Json
          kot_no: number
          note: string
          order_id: string
          table_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          kot_no: number
          note?: string
          order_id: string
          table_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          kot_no?: number
          note?: string
          order_id?: string
          table_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kot_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "table_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_stock_movements: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          photo_id: string | null
          product_id: string | null
          quantity_change: number
          source: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          photo_id?: string | null
          product_id?: string | null
          quantity_change: number
          source?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          photo_id?: string | null
          product_id?: string | null
          quantity_change?: number
          source?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_stock_movements_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "stock_photos"
            referencedColumns: ["id"]
          },
        ]
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
      staff_roles: {
        Row: {
          business_owner_id: string
          created_at: string
          id: string
          name: string
          permissions: string[]
          role: string
          user_id: string
        }
        Insert: {
          business_owner_id: string
          created_at?: string
          id?: string
          name?: string
          permissions?: string[]
          role?: string
          user_id: string
        }
        Update: {
          business_owner_id?: string
          created_at?: string
          id?: string
          name?: string
          permissions?: string[]
          role?: string
          user_id?: string
        }
        Relationships: []
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
      stock_photos: {
        Row: {
          created_at: string | null
          id: string
          photo_hash: string
          photo_path: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          photo_hash: string
          photo_path: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          photo_hash?: string
          photo_path?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      table_orders: {
        Row: {
          billed_at: string | null
          created_at: string
          id: string
          invoice_id: string | null
          items: Json
          opened_at: string
          status: string
          table_id: string
          user_id: string
        }
        Insert: {
          billed_at?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          items?: Json
          opened_at?: string
          status?: string
          table_id: string
          user_id: string
        }
        Update: {
          billed_at?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          items?: Json
          opened_at?: string
          status?: string
          table_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
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
      excise_stock_summary: {
        Row: {
          brand_id: string | null
          category: string | null
          name: string | null
          received: number | null
          size_ml: number | null
          sold: number | null
        }
        Insert: {
          brand_id?: string | null
          category?: string | null
          name?: string | null
          received?: never
          size_ml?: number | null
          sold?: never
        }
        Update: {
          brand_id?: string | null
          category?: string | null
          name?: string | null
          received?: never
          size_ml?: number | null
          sold?: never
        }
        Relationships: []
      }
    }
    Functions: {
      claim_einvoice_cancellation: {
        Args: { _invoice_id: string }
        Returns: string
      }
      claim_einvoice_submission: {
        Args: { _invoice_id: string }
        Returns: string
      }
      create_excise_tp_receipt: {
        Args: {
          p_auto_tp_no: string
          p_items: Json
          p_party: string
          p_receipt_date: string
          p_tp_no: string
        }
        Returns: string
      }
      current_role_name: { Args: never; Returns: string }
      excise_monthly_return: {
        Args: { p_month: number; p_year: number }
        Returns: {
          brand_id: string
          brand_name: string
          category: string
          closing_qty: number
          opening_qty: number
          receipts_qty: number
          sales_qty: number
          size_ml: number
        }[]
      }
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
      next_kot_no: { Args: { p_user_id: string }; Returns: number }
      release_einvoice_claim: {
        Args: { _invoice_id: string; _lock_token: string }
        Returns: boolean
      }
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
