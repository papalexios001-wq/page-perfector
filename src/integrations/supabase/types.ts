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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          job_id: string | null
          message: string
          page_id: string | null
          site_id: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          job_id?: string | null
          message: string
          page_id?: string | null
          site_id?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          job_id?: string | null
          message?: string
          page_id?: string | null
          site_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "wp_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_cost: number | null
          ai_tokens_used: number | null
          completed_at: string | null
          created_at: string | null
          current_step: string | null
          error_message: string | null
          id: string
          page_id: string | null
          progress: number | null
          result: Json | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          ai_cost?: number | null
          ai_tokens_used?: number | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          page_id?: string | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          ai_cost?: number | null
          ai_tokens_used?: number | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          page_id?: string | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          categories: string[] | null
          created_at: string | null
          featured_image: string | null
          id: string
          post_id: number | null
          post_type: string | null
          retry_count: number | null
          score_after: Json | null
          score_before: Json | null
          site_id: string | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          url: string
          word_count: number | null
        }
        Insert: {
          categories?: string[] | null
          created_at?: string | null
          featured_image?: string | null
          id?: string
          post_id?: number | null
          post_type?: string | null
          retry_count?: number | null
          score_after?: Json | null
          score_before?: Json | null
          site_id?: string | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          url: string
          word_count?: number | null
        }
        Update: {
          categories?: string[] | null
          created_at?: string | null
          featured_image?: string | null
          id?: string
          post_id?: number | null
          post_type?: string | null
          retry_count?: number | null
          score_after?: Json | null
          score_before?: Json | null
          site_id?: string | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          url?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "wp_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      serp_cache: {
        Row: {
          created_at: string
          expires_at: string
          gl: string
          hl: string
          id: string
          query: string
          result: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          gl?: string
          hl?: string
          id?: string
          query: string
          result: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          gl?: string
          hl?: string
          id?: string
          query?: string
          result?: Json
        }
        Relationships: []
      }
      wp_sites: {
        Row: {
          capabilities: Json | null
          connected_at: string | null
          created_at: string | null
          id: string
          site_description: string | null
          site_name: string | null
          site_url: string
          username: string
        }
        Insert: {
          capabilities?: Json | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          site_description?: string | null
          site_name?: string | null
          site_url: string
          username: string
        }
        Update: {
          capabilities?: Json | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          site_description?: string | null
          site_name?: string | null
          site_url?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
