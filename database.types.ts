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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_profile_id: string | null
          trip_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_profile_id?: string | null
          trip_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_profile_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string
          id: string
          is_active: boolean
          phone_number: string
          role: Database["public"]["Enums"]["user_role"]
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          is_active?: boolean
          phone_number: string
          role: Database["public"]["Enums"]["user_role"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          role?: Database["public"]["Enums"]["user_role"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_profile_id: string | null
          reporter_id: string
          resolution_notes: string | null
          status: Database["public"]["Enums"]["report_status"]
          trip_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_profile_id?: string | null
          reporter_id: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          trip_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_profile_id?: string | null
          reporter_id?: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_locations: {
        Row: {
          destination_address: string
          destination_lat: number
          destination_lng: number
          origin_address: string
          origin_lat: number
          origin_lng: number
          trip_id: string
        }
        Insert: {
          destination_address: string
          destination_lat: number
          destination_lng: number
          origin_address: string
          origin_lat: number
          origin_lng: number
          trip_id: string
        }
        Update: {
          destination_address?: string
          destination_lat?: number
          destination_lng?: number
          origin_address?: string
          origin_lat?: number
          origin_lng?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          accepted_at: string | null
          ack_at: string | null
          ack_ip: unknown
          completed_at: string | null
          created_at: string
          destination_area_label: string
          good_faith_ack: boolean
          id: string
          origin_area_label: string
          requester_id: string
          requester_relation: Database["public"]["Enums"]["requester_relation"]
          status: Database["public"]["Enums"]["trip_status"]
          volunteer_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          ack_at?: string | null
          ack_ip?: unknown
          completed_at?: string | null
          created_at?: string
          destination_area_label: string
          good_faith_ack?: boolean
          id?: string
          origin_area_label: string
          requester_id: string
          requester_relation?: Database["public"]["Enums"]["requester_relation"]
          status?: Database["public"]["Enums"]["trip_status"]
          volunteer_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          ack_at?: string | null
          ack_ip?: unknown
          completed_at?: string | null
          created_at?: string
          destination_area_label?: string
          good_faith_ack?: boolean
          id?: string
          origin_area_label?: string
          requester_id?: string
          requester_relation?: Database["public"]["Enums"]["requester_relation"]
          status?: Database["public"]["Enums"]["trip_status"]
          volunteer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          id: string
          profile_id: string
          purge_after: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          storage_path: string
          submitted_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          purge_after?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          storage_path: string
          submitted_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          purge_after?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          storage_path?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_trip: {
        Args: { p_trip_id: string }
        Returns: {
          destination_address: string
          destination_lat: number
          destination_lng: number
          origin_address: string
          origin_lat: number
          origin_lng: number
          requester_first_name: string
          requester_phone: string
          requester_relation: Database["public"]["Enums"]["requester_relation"]
          trip_id: string
        }[]
      }
      cancel_trip: { Args: { p_trip_id: string }; Returns: undefined }
      complete_trip: { Args: { p_trip_id: string }; Returns: undefined }
      create_trip: {
        Args: {
          p_client_ip: unknown
          p_destination_address: string
          p_destination_area_label: string
          p_destination_lat: number
          p_destination_lng: number
          p_origin_address: string
          p_origin_area_label: string
          p_origin_lat: number
          p_origin_lng: number
          p_requester_relation: Database["public"]["Enums"]["requester_relation"]
        }
        Returns: string
      }
      create_trip_from_proxy: {
        Args: {
          p_client_ip: unknown
          p_destination_address: string
          p_destination_area_label: string
          p_destination_lat: number
          p_destination_lng: number
          p_origin_address: string
          p_origin_area_label: string
          p_origin_lat: number
          p_origin_lng: number
          p_requester_id: string
          p_requester_relation: Database["public"]["Enums"]["requester_relation"]
        }
        Returns: string
      }
      get_analytics_kpis: {
        Args: never
        Returns: {
          cancellation_rate: number
          cancelled_trips: number
          completed_trips: number
          completion_rate: number
          total_requesters: number
          total_trips: number
          total_users: number
          total_volunteers: number
        }[]
      }
      get_geographic_distribution: {
        Args: { p_min_threshold: number }
        Returns: {
          origin_area_label: string
          trip_count: number
        }[]
      }
      get_peak_hours_distribution: {
        Args: never
        Returns: {
          hour_of_day: number
          trip_count: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      reveal_contact: {
        Args: { p_trip_id: string }
        Returns: {
          destination_address: string
          destination_lat: number
          destination_lng: number
          origin_address: string
          origin_lat: number
          origin_lng: number
          requester_first_name: string
          requester_phone: string
          requester_relation: Database["public"]["Enums"]["requester_relation"]
          trip_id: string
        }[]
      }
      submit_report: {
        Args: {
          p_reason: string
          p_reported_profile_id: string
          p_trip_id: string
        }
        Returns: string
      }
      suspend_account: {
        Args: { p_reason: string; p_target_profile_id: string }
        Returns: undefined
      }
    }
    Enums: {
      report_status: "pending" | "reviewed" | "dismissed" | "actioned"
      requester_relation: "patient" | "guardian" | "companion"
      trip_status: "pending" | "accepted" | "completed" | "cancelled"
      user_role:
        | "volunteer"
        | "requester"
        | "ops_admin"
        | "verification_admin"
        | "analytics_viewer"
        | "super_admin"
      verification_status:
        | "unverified"
        | "pending_review"
        | "verified"
        | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      report_status: ["pending", "reviewed", "dismissed", "actioned"],
      requester_relation: ["patient", "guardian", "companion"],
      trip_status: ["pending", "accepted", "completed", "cancelled"],
      user_role: [
        "volunteer",
        "requester",
        "ops_admin",
        "verification_admin",
        "analytics_viewer",
        "super_admin",
      ],
      verification_status: [
        "unverified",
        "pending_review",
        "verified",
        "rejected",
      ],
    },
  },
} as const
