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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      assistant_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          role: string
          session_id: string
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_sessions: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cached_emails: {
        Row: {
          attachment_info: Json | null
          content: string | null
          created_at: string | null
          date_sent: string
          email_type: string | null
          gmail_message_id: string
          gmail_thread_id: string
          has_attachments: boolean | null
          id: string
          is_unread: boolean | null
          labels: string[] | null
          recipient_email: string | null
          recipient_name: string | null
          sender_email: string
          sender_name: string | null
          snippet: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attachment_info?: Json | null
          content?: string | null
          created_at?: string | null
          date_sent: string
          email_type?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          has_attachments?: boolean | null
          id?: string
          is_unread?: boolean | null
          labels?: string[] | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_email: string
          sender_name?: string | null
          snippet?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attachment_info?: Json | null
          content?: string | null
          created_at?: string | null
          date_sent?: string
          email_type?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          has_attachments?: boolean | null
          id?: string
          is_unread?: boolean | null
          labels?: string[] | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_email?: string
          sender_name?: string | null
          snippet?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          calendar_id: string | null
          created_at: string
          description: string | null
          end_time: string
          external_id: string | null
          id: string
          is_synced: boolean | null
          reminder_minutes: number | null
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          calendar_id?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          external_id?: string | null
          id?: string
          is_synced?: boolean | null
          reminder_minutes?: number | null
          start_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          calendar_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          external_id?: string | null
          id?: string
          is_synced?: boolean | null
          reminder_minutes?: number | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cleanup_history: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          emails_affected: number
          error_message: string | null
          id: string
          sender_domain: string | null
          sender_email: string | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          emails_affected?: number
          error_message?: string | null
          id?: string
          sender_domain?: string | null
          sender_email?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          emails_affected?: number
          error_message?: string | null
          id?: string
          sender_domain?: string | null
          sender_email?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cleanup_rules: {
        Row: {
          action: string
          created_at: string
          domain_pattern: string | null
          id: string
          is_active: boolean
          rule_name: string
          sender_pattern: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          domain_pattern?: string | null
          id?: string
          is_active?: boolean
          rule_name: string
          sender_pattern?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          domain_pattern?: string | null
          id?: string
          is_active?: boolean
          rule_name?: string
          sender_pattern?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_cleanup_analysis: {
        Row: {
          analyzed_at: string
          contains_important_keywords: boolean | null
          created_at: string
          email_count: number
          first_email_date: string | null
          has_unsubscribe_header: boolean | null
          id: string
          important_keywords: string[] | null
          last_email_date: string | null
          recommended_action: string
          sender_domain: string
          sender_email: string
          sender_name: string | null
          unread_count: number
          updated_at: string
          user_id: string
          user_opened_count: number
          user_replied_count: number
        }
        Insert: {
          analyzed_at?: string
          contains_important_keywords?: boolean | null
          created_at?: string
          email_count?: number
          first_email_date?: string | null
          has_unsubscribe_header?: boolean | null
          id?: string
          important_keywords?: string[] | null
          last_email_date?: string | null
          recommended_action?: string
          sender_domain: string
          sender_email: string
          sender_name?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
          user_opened_count?: number
          user_replied_count?: number
        }
        Update: {
          analyzed_at?: string
          contains_important_keywords?: boolean | null
          created_at?: string
          email_count?: number
          first_email_date?: string | null
          has_unsubscribe_header?: boolean | null
          id?: string
          important_keywords?: string[] | null
          last_email_date?: string | null
          recommended_action?: string
          sender_domain?: string
          sender_email?: string
          sender_name?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
          user_opened_count?: number
          user_replied_count?: number
        }
        Relationships: []
      }
      gmail_connections: {
        Row: {
          access_token: string
          created_at: string
          email_address: string
          id: string
          is_active: boolean | null
          last_email_sync_at: string | null
          last_error: string | null
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          email_address: string
          id?: string
          is_active?: boolean | null
          last_email_sync_at?: string | null
          last_error?: string | null
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          email_address?: string
          id?: string
          is_active?: boolean | null
          last_email_sync_at?: string | null
          last_error?: string | null
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          company_address: string | null
          company_email: string | null
          company_logo_path: string | null
          company_name: string | null
          created_at: string
          currency: string
          customer_address: string | null
          customer_email: string
          customer_name: string
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string
          line_items: Json
          notes: string | null
          paid_at: string | null
          payment_token: string | null
          pdf_path: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_address?: string | null
          company_email?: string | null
          company_logo_path?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_email: string
          customer_name: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_token?: string | null
          pdf_path?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_address?: string | null
          company_email?: string | null
          company_logo_path?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_email?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_token?: string | null
          pdf_path?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          is_locked: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          is_locked?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          is_locked?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stored_passwords: {
        Row: {
          created_at: string
          encrypted_password: string
          id: string
          notes: string | null
          title: string
          updated_at: string
          user_id: string
          username: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          encrypted_password: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
          username?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          encrypted_password?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_path: string
          file_size: number | null
          folder_id: string | null
          id: string
          is_favorite: boolean | null
          is_folder: boolean
          mime_type: string | null
          name: string
          source_email_id: string | null
          source_email_subject: string | null
          source_type: string | null
          tags: string[] | null
          thumbnail_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          is_folder?: boolean
          mime_type?: string | null
          name: string
          source_email_id?: string | null
          source_email_subject?: string | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          is_folder?: boolean
          mime_type?: string | null
          name?: string
          source_email_id?: string | null
          source_email_subject?: string | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "user_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          notified: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_invoice_for_payment: {
        Args: { invoice_id: string; token: string }
        Returns: {
          company_name: string
          currency: string
          customer_email: string
          customer_name: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          pdf_path: string
          status: string
          total_cents: number
          type: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
