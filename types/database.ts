export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  simulateur_seo: {
    Tables: {
      portal_sso_log: {
        Row: {
          created_at: string
          id: number
          jti: string | null
          outcome: string
          portal_account_id: string | null
          portal_user_id: string | null
          preview: boolean
          reason: string | null
          trace_id: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          jti?: string | null
          outcome: string
          portal_account_id?: string | null
          portal_user_id?: string | null
          preview?: boolean
          reason?: string | null
          trace_id?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          jti?: string | null
          outcome?: string
          portal_account_id?: string | null
          portal_user_id?: string | null
          preview?: boolean
          reason?: string | null
          trace_id?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      portal_ticket_jti: {
        Row: {
          consumed_at: string
          expires_at: string
          jti: string
          portal_account_id: string | null
          trace_id: string | null
        }
        Insert: {
          consumed_at?: string
          expires_at: string
          jti: string
          portal_account_id?: string | null
          trace_id?: string | null
        }
        Update: {
          consumed_at?: string
          expires_at?: string
          jti?: string
          portal_account_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      report_views: {
        Row: {
          id: string
          report_id: string
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          interactions: number
          legacy_author: string | null
          legacy_stats: Json | null
          prospect: string
          sector: string
          site_url: string
          state: string
          time_seconds: number
          updated_at: string
        }
        Insert: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id: string
          interactions?: number
          legacy_author?: string | null
          legacy_stats?: Json | null
          prospect?: string
          sector?: string
          site_url?: string
          state: string
          time_seconds?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          interactions?: number
          legacy_author?: string | null
          legacy_stats?: Json | null
          prospect?: string
          sector?: string
          site_url?: string
          state?: string
          time_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_engagement: {
        Args: { p_interactions: number; p_report_id: string; p_seconds: number }
        Returns: boolean
      }
      internal_account_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      list_accounts: {
        Args: never
        Returns: {
          id: string
          name: string
          status: string
        }[]
      }
      move_report_account: {
        Args: { p_account_id: string; p_reason: string; p_report_id: string }
        Returns: undefined
      }
      record_view: { Args: { p_report_id: string }; Returns: boolean }
      report_accounts: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          report_id: string
        }[]
      }
      report_authors: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      report_view_stats: {
        Args: never
        Returns: {
          last_viewed_at: string
          report_id: string
          view_count: number
        }[]
      }
      report_viewers: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      tool_role: { Args: never; Returns: string }
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
  simulateur_seo: {
    Enums: {},
  },
} as const

