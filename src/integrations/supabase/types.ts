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
      audit_log: {
        Row: {
          action_type: string
          actor: string
          actor_user_id: string | null
          client_id: string | null
          created_at: string
          days_overdue_at_action: number | null
          debtor_name: string | null
          description: string | null
          id: string
          invoice_reference: string | null
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          relance_type: string | null
          session_id: string | null
          source_page: string | null
          table_affected: string | null
          user_role: string | null
        }
        Insert: {
          action_type: string
          actor: string
          actor_user_id?: string | null
          client_id?: string | null
          created_at?: string
          days_overdue_at_action?: number | null
          debtor_name?: string | null
          description?: string | null
          id?: string
          invoice_reference?: string | null
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          relance_type?: string | null
          session_id?: string | null
          source_page?: string | null
          table_affected?: string | null
          user_role?: string | null
        }
        Update: {
          action_type?: string
          actor?: string
          actor_user_id?: string | null
          client_id?: string | null
          created_at?: string
          days_overdue_at_action?: number | null
          debtor_name?: string | null
          description?: string | null
          id?: string
          invoice_reference?: string | null
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          relance_type?: string | null
          session_id?: string | null
          source_page?: string | null
          table_affected?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          bcc_enabled: boolean | null
          ca_annuel: number | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          delai_facturation_jours: number | null
          deleted_at: string | null
          email_alias: string | null
          email_alias_name: string | null
          id: string
          max_payment_plan_months: number | null
          min_first_installment_pct: number | null
          negotiation_allowed: boolean | null
          onboarding_status:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          plan_type: Database["public"]["Enums"]["plan_type"] | null
          siren: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bcc_enabled?: boolean | null
          ca_annuel?: number | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          delai_facturation_jours?: number | null
          deleted_at?: string | null
          email_alias?: string | null
          email_alias_name?: string | null
          id?: string
          max_payment_plan_months?: number | null
          min_first_installment_pct?: number | null
          negotiation_allowed?: boolean | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          plan_type?: Database["public"]["Enums"]["plan_type"] | null
          siren?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bcc_enabled?: boolean | null
          ca_annuel?: number | null
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          delai_facturation_jours?: number | null
          deleted_at?: string | null
          email_alias?: string | null
          email_alias_name?: string | null
          id?: string
          max_payment_plan_months?: number | null
          min_first_installment_pct?: number | null
          negotiation_allowed?: boolean | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          plan_type?: Database["public"]["Enums"]["plan_type"] | null
          siren?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          client_id: string
          created_at: string
          escalade_fees: number | null
          forfait_mensuel: number | null
          id: string
          invoice_reference: string | null
          notes: string | null
          period_month: number
          period_year: number
          status: string | null
          success_fee_amount: number | null
          success_fee_base: number | null
          success_fee_rate: number | null
          total_due: number | null
          tribunal_fees: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          escalade_fees?: number | null
          forfait_mensuel?: number | null
          id?: string
          invoice_reference?: string | null
          notes?: string | null
          period_month: number
          period_year: number
          status?: string | null
          success_fee_amount?: number | null
          success_fee_base?: number | null
          success_fee_rate?: number | null
          total_due?: number | null
          tribunal_fees?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          escalade_fees?: number | null
          forfait_mensuel?: number | null
          id?: string
          invoice_reference?: string | null
          notes?: string | null
          period_month?: number
          period_year?: number
          status?: string | null
          success_fee_amount?: number | null
          success_fee_base?: number | null
          success_fee_rate?: number | null
          total_due?: number | null
          tribunal_fees?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      debtor_context: {
        Row: {
          client_id: string
          content: string
          context_layer: string | null
          context_type: string
          created_at: string
          created_by: string | null
          debtor_id: string
          id: string
          source: string | null
        }
        Insert: {
          client_id: string
          content: string
          context_layer?: string | null
          context_type: string
          created_at?: string
          created_by?: string | null
          debtor_id: string
          id?: string
          source?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          context_layer?: string | null
          context_type?: string
          created_at?: string
          created_by?: string | null
          debtor_id?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debtor_context_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debtor_context_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
        ]
      }
      debtors: {
        Row: {
          avg_payment_delay: number | null
          behavior_tag: string | null
          best_contact_day: string | null
          best_contact_hour: number | null
          ca_percentage: number | null
          city: string | null
          client_contacted_directly: boolean
          client_id: string
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          contact_validated: boolean
          created_at: string
          deleted_at: string | null
          first_invoice_date: string | null
          has_active_dispute: boolean | null
          id: string
          is_in_collective_procedure: boolean | null
          is_in_oraya_scope: boolean
          is_strategic: boolean | null
          last_relance_at: string | null
          late_invoice_rate: number | null
          next_relance_date: string | null
          relance_count: number | null
          relances_pause_until: string | null
          relances_paused: boolean | null
          response_rate: number | null
          risk_category: Database["public"]["Enums"]["risk_category"] | null
          risk_category_override: string | null
          risk_score: number | null
          sector: string | null
          siren: string | null
          sortie_reason: string | null
          status: Database["public"]["Enums"]["debtor_status"] | null
          total_outstanding: number | null
          updated_at: string
          workflow_status: Database["public"]["Enums"]["workflow_status"] | null
        }
        Insert: {
          avg_payment_delay?: number | null
          behavior_tag?: string | null
          best_contact_day?: string | null
          best_contact_hour?: number | null
          ca_percentage?: number | null
          city?: string | null
          client_contacted_directly?: boolean
          client_id: string
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contact_validated?: boolean
          created_at?: string
          deleted_at?: string | null
          first_invoice_date?: string | null
          has_active_dispute?: boolean | null
          id?: string
          is_in_collective_procedure?: boolean | null
          is_in_oraya_scope?: boolean
          is_strategic?: boolean | null
          last_relance_at?: string | null
          late_invoice_rate?: number | null
          next_relance_date?: string | null
          relance_count?: number | null
          relances_pause_until?: string | null
          relances_paused?: boolean | null
          response_rate?: number | null
          risk_category?: Database["public"]["Enums"]["risk_category"] | null
          risk_category_override?: string | null
          risk_score?: number | null
          sector?: string | null
          siren?: string | null
          sortie_reason?: string | null
          status?: Database["public"]["Enums"]["debtor_status"] | null
          total_outstanding?: number | null
          updated_at?: string
          workflow_status?:
            | Database["public"]["Enums"]["workflow_status"]
            | null
        }
        Update: {
          avg_payment_delay?: number | null
          behavior_tag?: string | null
          best_contact_day?: string | null
          best_contact_hour?: number | null
          ca_percentage?: number | null
          city?: string | null
          client_contacted_directly?: boolean
          client_id?: string
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contact_validated?: boolean
          created_at?: string
          deleted_at?: string | null
          first_invoice_date?: string | null
          has_active_dispute?: boolean | null
          id?: string
          is_in_collective_procedure?: boolean | null
          is_in_oraya_scope?: boolean
          is_strategic?: boolean | null
          last_relance_at?: string | null
          late_invoice_rate?: number | null
          next_relance_date?: string | null
          relance_count?: number | null
          relances_pause_until?: string | null
          relances_paused?: boolean | null
          response_rate?: number | null
          risk_category?: Database["public"]["Enums"]["risk_category"] | null
          risk_category_override?: string | null
          risk_score?: number | null
          sector?: string | null
          siren?: string | null
          sortie_reason?: string | null
          status?: Database["public"]["Enums"]["debtor_status"] | null
          total_outstanding?: number | null
          updated_at?: string
          workflow_status?:
            | Database["public"]["Enums"]["workflow_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "debtors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          batch_reference: string
          cleaning_notes: string | null
          client_id: string
          created_at: string
          error_log: string | null
          id: string
          import_date: string
          invoices_inserted: number | null
          invoices_to_verify: number | null
          invoices_updated: number | null
          source: string | null
          status: string | null
        }
        Insert: {
          batch_reference: string
          cleaning_notes?: string | null
          client_id: string
          created_at?: string
          error_log?: string | null
          id?: string
          import_date?: string
          invoices_inserted?: number | null
          invoices_to_verify?: number | null
          invoices_updated?: number | null
          source?: string | null
          status?: string | null
        }
        Update: {
          batch_reference?: string
          cleaning_notes?: string | null
          client_id?: string
          created_at?: string
          error_log?: string | null
          id?: string
          import_date?: string
          invoices_inserted?: number | null
          invoices_to_verify?: number | null
          invoices_updated?: number | null
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_outstanding: number | null
          amount_paid: number | null
          amount_total: number
          attribution_window_start: string | null
          client_id: string
          created_at: string
          credit_note_amount: number | null
          debtor_id: string
          due_date: string
          forfait_recouvrement: number | null
          has_signed_contract: boolean | null
          id: string
          import_batch_id: string | null
          invoice_date: string
          invoice_number: string
          lettrage_notes: string | null
          lettrage_status: Database["public"]["Enums"]["lettrage_status"] | null
          payment_attribution: string | null
          penalties_calculated: number | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          stripe_payment_link: string | null
          updated_at: string
        }
        Insert: {
          amount_outstanding?: number | null
          amount_paid?: number | null
          amount_total: number
          attribution_window_start?: string | null
          client_id: string
          created_at?: string
          credit_note_amount?: number | null
          debtor_id: string
          due_date: string
          forfait_recouvrement?: number | null
          has_signed_contract?: boolean | null
          id?: string
          import_batch_id?: string | null
          invoice_date: string
          invoice_number: string
          lettrage_notes?: string | null
          lettrage_status?:
            | Database["public"]["Enums"]["lettrage_status"]
            | null
          payment_attribution?: string | null
          penalties_calculated?: number | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          stripe_payment_link?: string | null
          updated_at?: string
        }
        Update: {
          amount_outstanding?: number | null
          amount_paid?: number | null
          amount_total?: number
          attribution_window_start?: string | null
          client_id?: string
          created_at?: string
          credit_note_amount?: number | null
          debtor_id?: string
          due_date?: string
          forfait_recouvrement?: number | null
          has_signed_contract?: boolean | null
          id?: string
          import_batch_id?: string | null
          invoice_date?: string
          invoice_number?: string
          lettrage_notes?: string | null
          lettrage_status?:
            | Database["public"]["Enums"]["lettrage_status"]
            | null
          payment_attribution?: string | null
          penalties_calculated?: number | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          stripe_payment_link?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
        ]
      }
      next_checks: {
        Row: {
          check_date: string
          check_type: string
          client_id: string
          created_at: string
          debtor_id: string
          expected_amount: number | null
          id: string
          invoice_id: string | null
          notes: string | null
          plan_installment_id: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          check_date: string
          check_type: string
          client_id: string
          created_at?: string
          debtor_id: string
          expected_amount?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          plan_installment_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          check_date?: string
          check_type?: string
          client_id?: string
          created_at?: string
          debtor_id?: string
          expected_amount?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          plan_installment_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_checks_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_checks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_checks_plan_installment_id_fkey"
            columns: ["plan_installment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_installments: {
        Row: {
          amount: number
          amount_received: number | null
          client_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number
          payment_plan_id: string
          payment_received: boolean | null
          payment_received_at: string | null
        }
        Insert: {
          amount: number
          amount_received?: number | null
          client_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          payment_plan_id: string
          payment_received?: boolean | null
          payment_received_at?: string | null
        }
        Update: {
          amount?: number
          amount_received?: number | null
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          payment_plan_id?: string
          payment_received?: boolean | null
          payment_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_installments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          debtor_id: string
          id: string
          initiated_by_relance_id: string | null
          installment_count: number
          notes: string | null
          status: Database["public"]["Enums"]["payment_plan_status"] | null
          thomas_validated: boolean
          total_amount: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          debtor_id: string
          id?: string
          initiated_by_relance_id?: string | null
          installment_count: number
          notes?: string | null
          status?: Database["public"]["Enums"]["payment_plan_status"] | null
          thomas_validated?: boolean
          total_amount: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          debtor_id?: string
          id?: string
          initiated_by_relance_id?: string | null
          installment_count?: number
          notes?: string | null
          status?: Database["public"]["Enums"]["payment_plan_status"] | null
          thomas_validated?: boolean
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_initiated_by_relance_id_fkey"
            columns: ["initiated_by_relance_id"]
            isOneToOne: false
            referencedRelation: "relances_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_classifications: {
        Row: {
          classified_at: string | null
          classified_by: string | null
          client_id: string
          created_at: string
          debtor_id: string
          email_body: string | null
          email_from: string | null
          email_subject: string | null
          gpt_confidence: number | null
          id: string
          received_at: string | null
        }
        Insert: {
          classified_at?: string | null
          classified_by?: string | null
          client_id: string
          created_at?: string
          debtor_id: string
          email_body?: string | null
          email_from?: string | null
          email_subject?: string | null
          gpt_confidence?: number | null
          id?: string
          received_at?: string | null
        }
        Update: {
          classified_at?: string | null
          classified_by?: string | null
          client_id?: string
          created_at?: string
          debtor_id?: string
          email_body?: string | null
          email_from?: string | null
          email_subject?: string | null
          gpt_confidence?: number | null
          id?: string
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_classifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_classifications_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
        ]
      }
      relances_queue: {
        Row: {
          action_type: Database["public"]["Enums"]["relance_action_type"]
          approval_required: boolean | null
          approved_at: string | null
          attachment_storage_path: string | null
          client_id: string
          days_since_due: number | null
          days_to_payment: number | null
          debtor_id: string
          edited_by: string | null
          email_body: string | null
          email_from: string | null
          email_subject: string | null
          email_to: string | null
          generated_at: string
          has_attachment: boolean | null
          id: string
          response_confidence: number | null
          response_content: string | null
          response_received: boolean | null
          response_received_at: string | null
          response_summary: string | null
          response_type: string | null
          sent_at: string | null
          sequence_step: number | null
          status: Database["public"]["Enums"]["relance_status"] | null
          template_code: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["relance_action_type"]
          approval_required?: boolean | null
          approved_at?: string | null
          attachment_storage_path?: string | null
          client_id: string
          days_since_due?: number | null
          days_to_payment?: number | null
          debtor_id: string
          edited_by?: string | null
          email_body?: string | null
          email_from?: string | null
          email_subject?: string | null
          email_to?: string | null
          generated_at?: string
          has_attachment?: boolean | null
          id?: string
          response_confidence?: number | null
          response_content?: string | null
          response_received?: boolean | null
          response_received_at?: string | null
          response_summary?: string | null
          response_type?: string | null
          sent_at?: string | null
          sequence_step?: number | null
          status?: Database["public"]["Enums"]["relance_status"] | null
          template_code?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["relance_action_type"]
          approval_required?: boolean | null
          approved_at?: string | null
          attachment_storage_path?: string | null
          client_id?: string
          days_since_due?: number | null
          days_to_payment?: number | null
          debtor_id?: string
          edited_by?: string | null
          email_body?: string | null
          email_from?: string | null
          email_subject?: string | null
          email_to?: string | null
          generated_at?: string
          has_attachment?: boolean | null
          id?: string
          response_confidence?: number | null
          response_content?: string | null
          response_received?: boolean | null
          response_received_at?: string | null
          response_summary?: string | null
          response_type?: string | null
          sent_at?: string | null
          sequence_step?: number | null
          status?: Database["public"]["Enums"]["relance_status"] | null
          template_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relances_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relances_queue_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          last_updated: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          last_updated?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          last_updated?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
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
      current_client_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "client"
      debtor_status:
        | "active"
        | "closed"
        | "litigation"
        | "collective_procedure"
        | "paid"
      invoice_status:
        | "pending"
        | "overdue"
        | "partial"
        | "paid"
        | "disputed"
        | "irrecoverable"
      lettrage_status:
        | "unmatched"
        | "matched"
        | "partial"
        | "disputed"
        | "write_off"
      onboarding_status:
        | "pending"
        | "active"
        | "paused"
        | "closed"
        | "alias_pending"
        | "ready_to_launch"
      payment_plan_status:
        | "proposed"
        | "accepted"
        | "active"
        | "completed"
        | "defaulted"
      plan_type: "starter" | "business" | "scale" | "recovery" | "audit"
      relance_action_type:
        | "EMAIL_RELANCE"
        | "DEMANDE_VALIDATION"
        | "ALERTE_VIP"
        | "TACHE_ATTENTE"
        | "ESCALADE"
        | "PAIEMENT_PARTIEL"
        | "FICHE_CLOTURE"
        | "INFO_MANQUANTE"
      relance_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "sent"
        | "auto_sent"
        | "bounced"
        | "cancelled"
      risk_category: "fiable" | "a_surveiller" | "a_risque"
      workflow_status:
        | "en_attente"
        | "pre_relance"
        | "relance_1_envoyee"
        | "relance_2_envoyee"
        | "relance_3_envoyee"
        | "promesse_paiement"
        | "promesse_vague"
        | "paiement_annonce"
        | "promesse_non_tenue"
        | "contestation"
        | "hors_bureau"
        | "difficulte_financiere"
        | "a_classifier_manuellement"
        | "escalade_recommandee"
        | "cloture"
        | "sortie_perimetre"
        | "irrecoverable"
        | "a_relancer"
        | "en_attente_reponse"
        | "promesse_ferme"
        | "paiement_partiel"
        | "escalade_humaine"
        | "escalade_contentieuse"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "client"],
      debtor_status: [
        "active",
        "closed",
        "litigation",
        "collective_procedure",
        "paid",
      ],
      invoice_status: [
        "pending",
        "overdue",
        "partial",
        "paid",
        "disputed",
        "irrecoverable",
      ],
      lettrage_status: [
        "unmatched",
        "matched",
        "partial",
        "disputed",
        "write_off",
      ],
      onboarding_status: [
        "pending",
        "active",
        "paused",
        "closed",
        "alias_pending",
        "ready_to_launch",
      ],
      payment_plan_status: [
        "proposed",
        "accepted",
        "active",
        "completed",
        "defaulted",
      ],
      plan_type: ["starter", "business", "scale", "recovery", "audit"],
      relance_action_type: [
        "EMAIL_RELANCE",
        "DEMANDE_VALIDATION",
        "ALERTE_VIP",
        "TACHE_ATTENTE",
        "ESCALADE",
        "PAIEMENT_PARTIEL",
        "FICHE_CLOTURE",
        "INFO_MANQUANTE",
      ],
      relance_status: [
        "draft",
        "pending_approval",
        "approved",
        "sent",
        "auto_sent",
        "bounced",
        "cancelled",
      ],
      risk_category: ["fiable", "a_surveiller", "a_risque"],
      workflow_status: [
        "en_attente",
        "pre_relance",
        "relance_1_envoyee",
        "relance_2_envoyee",
        "relance_3_envoyee",
        "promesse_paiement",
        "promesse_vague",
        "paiement_annonce",
        "promesse_non_tenue",
        "contestation",
        "hors_bureau",
        "difficulte_financiere",
        "a_classifier_manuellement",
        "escalade_recommandee",
        "cloture",
        "sortie_perimetre",
        "irrecoverable",
        "a_relancer",
        "en_attente_reponse",
        "promesse_ferme",
        "paiement_partiel",
        "escalade_humaine",
        "escalade_contentieuse",
      ],
    },
  },
} as const
