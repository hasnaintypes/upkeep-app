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
    PostgrestVersion: "14.15"
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
      checks: {
        Row: {
          checked_at: string
          error_message: string | null
          http_status: number | null
          id: string
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
          started_at: string
        }
        Insert: {
          cause?: string | null
          id?: string
          notified?: boolean
          project_id: string
          resolved_at?: string | null
          started_at?: string
        }
        Update: {
          cause?: string | null
          id?: string
          notified?: boolean
          project_id?: string
          resolved_at?: string | null
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
      project_notification_rules: {
        Row: {
          channel_id: string
          digest_only: boolean
          escalation_threshold: number
          id: string
          project_id: string
        }
        Insert: {
          channel_id: string
          digest_only?: boolean
          escalation_threshold?: number
          id?: string
          project_id: string
        }
        Update: {
          channel_id?: string
          digest_only?: boolean
          escalation_threshold?: number
          id?: string
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
          check_interval_seconds: number
          collection: string | null
          created_at: string
          description: string | null
          expected_body_match: string | null
          expected_status: number
          headers: Json | null
          health_url: string
          hosting_provider: string | null
          id: string
          is_active: boolean
          keep_alive_enabled: boolean
          method: string
          name: string
          retry_count: number
          tags: string[] | null
          timeout_ms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          check_interval_seconds?: number
          collection?: string | null
          created_at?: string
          description?: string | null
          expected_body_match?: string | null
          expected_status?: number
          headers?: Json | null
          health_url: string
          hosting_provider?: string | null
          id?: string
          is_active?: boolean
          keep_alive_enabled?: boolean
          method?: string
          name: string
          retry_count?: number
          tags?: string[] | null
          timeout_ms?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          check_interval_seconds?: number
          collection?: string | null
          created_at?: string
          description?: string | null
          expected_body_match?: string | null
          expected_status?: number
          headers?: Json | null
          health_url?: string
          hosting_provider?: string | null
          id?: string
          is_active?: boolean
          keep_alive_enabled?: boolean
          method?: string
          name?: string
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
      get_due_projects: {
        Args: never
        Returns: {
          check_interval_seconds: number
          collection: string | null
          created_at: string
          description: string | null
          expected_body_match: string | null
          expected_status: number
          headers: Json | null
          health_url: string
          hosting_provider: string | null
          id: string
          is_active: boolean
          keep_alive_enabled: boolean
          method: string
          name: string
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
