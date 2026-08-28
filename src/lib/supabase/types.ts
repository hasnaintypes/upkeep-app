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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      checks: {
        Row: {
          checked_at: string
          error_message: string | null
          http_status: number | null
          id: string
          is_consensus: boolean
          is_rate_limited: boolean
          project_id: string
          region: string | null
          response_snippet: string | null
          response_time_ms: number | null
          status: string
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          is_consensus?: boolean
          is_rate_limited?: boolean
          project_id: string
          region?: string | null
          response_snippet?: string | null
          response_time_ms?: number | null
          status: string
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          is_consensus?: boolean
          is_rate_limited?: boolean
          project_id?: string
          region?: string | null
          response_snippet?: string | null
          response_time_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checks_aggregated: {
        Row: {
          avg_response_time_ms: number
          id: string
          period_start: string
          period_type: string
          project_id: string
          total_checks: number
          total_failures: number
          uptime_percentage: number
        }
        Insert: {
          avg_response_time_ms: number
          id?: string
          period_start: string
          period_type: string
          project_id: string
          total_checks: number
          total_failures: number
          uptime_percentage: number
        }
        Update: {
          avg_response_time_ms?: number
          id?: string
          period_start?: string
          period_type?: string
          project_id?: string
          total_checks?: number
          total_failures?: number
          uptime_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "checks_aggregated_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          cause: string | null
          id: string
          notified: boolean
          project_id: string
          resolved_at: string | null
          resolved_notified: boolean
          started_at: string
        }
        Insert: {
          cause?: string | null
          id?: string
          notified?: boolean
          project_id: string
          resolved_at?: string | null
          resolved_notified?: boolean
          started_at?: string
        }
        Update: {
          cause?: string | null
          id?: string
          notified?: boolean
          project_id?: string
          resolved_at?: string | null
          resolved_notified?: boolean
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          config: Json
          id: string
          is_active: boolean
          type: string
          user_id: string
        }
        Insert: {
          config: Json
          id?: string
          is_active?: boolean
          type: string
          user_id?: string
        }
        Update: {
          config?: Json
          id?: string
          is_active?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      prober_health: {
        Row: {
          id: boolean
          last_success_at: string | null
        }
        Insert: {
          id?: boolean
          last_success_at?: string | null
        }
        Update: {
          id?: boolean
          last_success_at?: string | null
        }
        Relationships: []
      }
      prober_lock: {
        Row: {
          id: boolean
          is_running: boolean
          started_at: string | null
        }
        Insert: {
          id?: boolean
          is_running?: boolean
          started_at?: string | null
        }
        Update: {
          id?: boolean
          is_running?: boolean
          started_at?: string | null
        }
        Relationships: []
      }
      project_notification_rules: {
        Row: {
          channel_id: string
          digest_frequency: string
          digest_only: boolean
          escalation_threshold: number
          id: string
          is_muted: boolean
          project_id: string
        }
        Insert: {
          channel_id: string
          digest_frequency?: string
          digest_only?: boolean
          escalation_threshold?: number
          id?: string
          is_muted?: boolean
          project_id: string
        }
        Update: {
          channel_id?: string
          digest_frequency?: string
          digest_only?: boolean
          escalation_threshold?: number
          id?: string
          is_muted?: boolean
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notification_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notification_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          body: string | null
          check_interval_seconds: number
          check_type: string
          collection: string | null
          created_at: string
          description: string | null
          expected_body_match: string | null
          expected_json_path: string | null
          expected_json_value: string | null
          expected_status: number
          headers: Json | null
          health_url: string
          hosting_provider: string | null
          id: string
          is_active: boolean
          is_public: boolean
          keep_alive_enabled: boolean
          keep_alive_timezone: string | null
          keep_alive_window_end: string | null
          keep_alive_window_start: string | null
          last_keep_alive_at: string | null
          last_manual_check_at: string | null
          method: string
          name: string
          rate_limit_backoff_count: number
          rate_limit_backoff_until: string | null
          retry_count: number
          tags: string[] | null
          timeout_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          check_interval_seconds?: number
          check_type?: string
          collection?: string | null
          created_at?: string
          description?: string | null
          expected_body_match?: string | null
          expected_json_path?: string | null
          expected_json_value?: string | null
          expected_status?: number
          headers?: Json | null
          health_url: string
          hosting_provider?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          keep_alive_enabled?: boolean
          keep_alive_timezone?: string | null
          keep_alive_window_end?: string | null
          keep_alive_window_start?: string | null
          last_keep_alive_at?: string | null
          last_manual_check_at?: string | null
          method?: string
          name: string
          rate_limit_backoff_count?: number
          rate_limit_backoff_until?: string | null
          retry_count?: number
          tags?: string[] | null
          timeout_ms?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string | null
          check_interval_seconds?: number
          check_type?: string
          collection?: string | null
          created_at?: string
          description?: string | null
          expected_body_match?: string | null
          expected_json_path?: string | null
          expected_json_value?: string | null
          expected_status?: number
          headers?: Json | null
          health_url?: string
          hosting_provider?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          keep_alive_enabled?: boolean
          keep_alive_timezone?: string | null
          keep_alive_window_end?: string | null
          keep_alive_window_start?: string | null
          last_keep_alive_at?: string | null
          last_manual_check_at?: string | null
          method?: string
          name?: string
          rate_limit_backoff_count?: number
          rate_limit_backoff_until?: string | null
          retry_count?: number
          tags?: string[] | null
          timeout_ms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_digest_recipients: {
        Args: { p_frequency: string }
        Returns: {
          to_email: string
          user_id: string
        }[]
      }
      get_due_keep_alive_projects: {
        Args: never
        Returns: {
          body: string | null
          check_interval_seconds: number
          check_type: string
          collection: string | null
          created_at: string
          description: string | null
          expected_body_match: string | null
          expected_json_path: string | null
          expected_json_value: string | null
          expected_status: number
          headers: Json | null
          health_url: string
          hosting_provider: string | null
          id: string
          is_active: boolean
          is_public: boolean
          keep_alive_enabled: boolean
          keep_alive_timezone: string | null
          keep_alive_window_end: string | null
          keep_alive_window_start: string | null
          last_keep_alive_at: string | null
          last_manual_check_at: string | null
          method: string
          name: string
          rate_limit_backoff_count: number
          rate_limit_backoff_until: string | null
          retry_count: number
          tags: string[] | null
          timeout_ms: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_due_projects: {
        Args: never
        Returns: {
          body: string | null
          check_interval_seconds: number
          check_type: string
          collection: string | null
          created_at: string
          description: string | null
          expected_body_match: string | null
          expected_json_path: string | null
          expected_json_value: string | null
          expected_status: number
          headers: Json | null
          health_url: string
          hosting_provider: string | null
          id: string
          is_active: boolean
          is_public: boolean
          keep_alive_enabled: boolean
          keep_alive_timezone: string | null
          keep_alive_window_end: string | null
          keep_alive_window_start: string | null
          last_keep_alive_at: string | null
          last_manual_check_at: string | null
          method: string
          name: string
          rate_limit_backoff_count: number
          rate_limit_backoff_until: string | null
          retry_count: number
          tags: string[] | null
          timeout_ms: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_daily_history: {
        Args: { p_days?: number; p_project_id: string }
        Returns: {
          avg_response_time_ms: number
          day: string
          source: string
          total_checks: number
          total_failures: number
          uptime_percentage: number
        }[]
      }
      get_project_uptime_summary: {
        Args: never
        Returns: {
          last_checked_at: string
          last_status: string
          project_id: string
          uptime_24h: number
          uptime_30d: number
          uptime_7d: number
          uptime_90d: number
        }[]
      }
      get_public_project_daily_history: {
        Args: { p_days?: number; p_project_id: string }
        Returns: {
          avg_response_time_ms: number
          day: string
          source: string
          total_checks: number
          total_failures: number
          uptime_percentage: number
        }[]
      }
      get_public_project_recent_checks: {
        Args: { p_hours?: number; p_project_id: string }
        Returns: {
          checked_at: string
          http_status: number
          response_time_ms: number
          status: string
        }[]
      }
      get_public_project_status: {
        Args: { p_project_id: string }
        Returns: {
          description: string
          id: string
          last_checked_at: string
          last_status: string
          name: string
          uptime_24h: number
          uptime_30d: number
          uptime_7d: number
          uptime_90d: number
        }[]
      }
      get_public_projects_summary: {
        Args: never
        Returns: {
          description: string
          id: string
          last_checked_at: string
          last_status: string
          name: string
          uptime_24h: number
          uptime_30d: number
          uptime_7d: number
          uptime_90d: number
        }[]
      }
      get_user_portfolio_summary: {
        Args: { p_period_hours: number; p_user_id: string }
        Returns: {
          incident_count: number
          last_checked_at: string
          last_status: string
          project_id: string
          project_name: string
          uptime_percentage: number
        }[]
      }
      is_project_publicly_visible: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_valid_timezone: { Args: { tz: string }; Returns: boolean }
      prune_raw_checks: { Args: { p_retention_days?: number }; Returns: number }
      record_prober_success: { Args: never; Returns: undefined }
      release_prober_lock: { Args: never; Returns: undefined }
      rollup_daily_checks: { Args: { p_period_start: string }; Returns: number }
      rollup_hourly_checks: {
        Args: { p_period_start: string }
        Returns: number
      }
      try_acquire_prober_lock: {
        Args: { stale_after_seconds?: number }
        Returns: boolean
      }
      try_claim_manual_check: {
        Args: { p_cooldown_seconds?: number; p_project_id: string }
        Returns: boolean
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
