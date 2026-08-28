export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      bookings: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          pickup_stop: string | null;
          route: string | null;
          service_date: string;
          slot: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          pickup_stop?: string | null;
          route?: string | null;
          service_date: string;
          slot: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          pickup_stop?: string | null;
          route?: string | null;
          service_date?: string;
          slot?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      daily_pass_requests: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string;
          route: string;
          pickup_stop: string | null;
          service_date: string;
          slot: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          phone: string;
          route: string;
          pickup_stop?: string | null;
          service_date?: string;
          slot: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string;
          route?: string;
          pickup_stop?: string | null;
          service_date?: string;
          slot?: string;
          status?: string;
        };
        Relationships: [];
      };
      routes: {
        Row: { id: string; name: string; display_order: number };
        Insert: { id?: string; name: string; display_order?: number };
        Update: { id?: string; name?: string; display_order?: number };
        Relationships: [];
      };
      stops: {
        Row: { id: string; route_id: string; name: string; display_order: number };
        Insert: { id?: string; route_id: string; name: string; display_order?: number };
        Update: { id?: string; route_id?: string; name?: string; display_order?: number };
        Relationships: [];
      };
      opt_outs: {
        Row: {
          created_at: string;
          id: string;
          service_date: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          service_date: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          service_date?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          photo_url: string | null;
          pickup_stop: string | null;
          route: string | null;
          subscription_type: string;
          payment_status: string;
          trips_remaining: number;
          trips_total: number;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          phone?: string | null;
          photo_url?: string | null;
          pickup_stop?: string | null;
          route?: string | null;
          subscription_type?: string;
          payment_status?: string;
          trips_remaining?: number;
          trips_total?: number;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          photo_url?: string | null;
          pickup_stop?: string | null;
          route?: string | null;
          subscription_type?: string;
          payment_status?: string;
          trips_remaining?: number;
          trips_total?: number;
          username?: string | null;
        };
        Relationships: [];
      };
      scans: {
        Row: {
          id: string;
          scanned_at: string;
          scanned_by: string | null;
          service_date: string;
          slot: string | null;
          student_id: string;
        };
        Insert: {
          id?: string;
          scanned_at?: string;
          scanned_by?: string | null;
          service_date?: string;
          slot?: string | null;
          student_id: string;
        };
        Update: {
          id?: string;
          scanned_at?: string;
          scanned_by?: string | null;
          service_date?: string;
          slot?: string | null;
          student_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      guest_passes: {
        Row: {
          id: string;
          request_id: string;
          full_name: string;
          phone: string;
          route: string;
          pickup_stop: string | null;
          slot: string;
          service_date: string;
          pass_token: string;
          is_scanned: boolean;
          scanned_at: string | null;
          scanned_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          full_name: string;
          phone: string;
          route: string;
          pickup_stop?: string | null;
          slot: string;
          service_date: string;
          pass_token?: string;
          is_scanned?: boolean;
          scanned_at?: string | null;
          scanned_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          full_name?: string;
          phone?: string;
          route?: string;
          pickup_stop?: string | null;
          slot?: string;
          service_date?: string;
          pass_token?: string;
          is_scanned?: boolean;
          scanned_at?: string | null;
          scanned_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      scan_pass: { Args: { p_student_id: string; p_slot: string }; Returns: Json };
      scan_guest_pass: { Args: { p_token: string }; Returns: Json };
      fleet_manifest_report: {
        Args: { p_date: string | null };
        Returns: {
          route: string;
          morning_scans: number;
          early_return_passengers: number;
          opted_out_count: number;
          remaining_for_4pm: number;
          recommended_bus: string;
        }[];
      };
      list_staff_users: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          email: string;
          role: string;
          is_active: boolean;
        }[];
      };
      update_staff_user: {
        Args: { p_user_id: string; p_full_name: string; p_phone: string; p_role: string };
        Returns: Json;
      };
      decide_daily_pass_request: {
        Args: { p_request_id: string; p_action: string };
        Returns: Json;
      };
      get_guest_pass: {
        Args: { p_token: string };
        Returns: {
          full_name: string;
          route: string;
          pickup_stop: string | null;
          slot: string;
          service_date: string;
          is_scanned: boolean;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "supervisor" | "student";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "student"],
    },
  },
} as const;
