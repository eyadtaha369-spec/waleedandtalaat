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
          sector: string | null;
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
          sector?: string | null;
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
          sector?: string | null;
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
          trip_type: string;
          return_slot: string | null;
          return_pickup_stop: string | null;
          payment_method: string;
          receipt_url: string | null;
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
          trip_type?: string;
          return_slot?: string | null;
          return_pickup_stop?: string | null;
          payment_method?: string;
          receipt_url?: string | null;
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
          trip_type?: string;
          return_slot?: string | null;
          return_pickup_stop?: string | null;
          payment_method?: string;
          receipt_url?: string | null;
        };
        Relationships: [];
      };
      routes: {
        Row: { id: string; name: string; display_order: number; whatsapp_group_link: string | null };
        Insert: { id?: string; name: string; display_order?: number; whatsapp_group_link?: string | null };
        Update: { id?: string; name?: string; display_order?: number; whatsapp_group_link?: string | null };
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
          initial_amount_paid: number;
          second_installment_amount: number | null;
          payment_method: string | null;
          installment_status: string;
          assigned_route: string | null;
          whatsapp_invited_at: string | null;
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
          initial_amount_paid?: number;
          second_installment_amount?: number | null;
          payment_method?: string | null;
          installment_status?: string;
          assigned_route?: string | null;
          whatsapp_invited_at?: string | null;
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
          initial_amount_paid?: number;
          second_installment_amount?: number | null;
          payment_method?: string | null;
          installment_status?: string;
          assigned_route?: string | null;
          whatsapp_invited_at?: string | null;
          trips_remaining?: number;
          trips_total?: number;
          username?: string | null;
        };
        Relationships: [];
      };
      installment_collections: {
        Row: {
          id: string;
          student_id: string;
          amount: number;
          confirmed_by: string | null;
          confirmed_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          amount: number;
          confirmed_by?: string | null;
          confirmed_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          amount?: number;
          confirmed_by?: string | null;
          confirmed_at?: string;
        };
        Relationships: [];
      };
      trip_transactions: {
        Row: {
          id: string;
          student_id: string;
          amount: number;
          description: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          amount: number;
          description: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          amount?: number;
          description?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      exam_bookings: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          exam_date: string;
          pickup_stop: string;
          pickup_time: string;
          status: string;
          pass_token: string | null;
          is_scanned: boolean;
          scanned_at: string | null;
          scanned_by: string | null;
          has_companion: boolean;
          companion_name: string | null;
          companion_relation: string | null;
          receipt_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          exam_date: string;
          pickup_stop: string;
          pickup_time: string;
          status?: string;
          pass_token?: string | null;
          is_scanned?: boolean;
          scanned_at?: string | null;
          scanned_by?: string | null;
          has_companion?: boolean;
          companion_name?: string | null;
          companion_relation?: string | null;
          receipt_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          exam_date?: string;
          pickup_stop?: string;
          pickup_time?: string;
          status?: string;
          pass_token?: string | null;
          is_scanned?: boolean;
          scanned_at?: string | null;
          scanned_by?: string | null;
          has_companion?: boolean;
          companion_name?: string | null;
          companion_relation?: string | null;
          receipt_url?: string | null;
          created_at?: string;
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
          kind: string;
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
          kind?: string;
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
          kind?: string;
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
      scan_pass: {
        Args: { p_student_id: string; p_slot: string; p_service_date: string | null };
        Returns: Json;
      };
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
          assigned_route: string | null;
        }[];
      };
      list_students_for_credentials: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          username: string | null;
          email: string;
        }[];
      };
      list_installment_students: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          route: string | null;
          initial_amount_paid: number;
          second_installment_amount: number | null;
          payment_method: string | null;
          installment_status: string;
        }[];
      };
      confirm_second_installment: {
        Args: { p_student_id: string };
        Returns: Json;
      };
      apply_4pm_noshow_deduction: {
        Args: { p_date: string | null };
        Returns: Json;
      };
      reset_student_trips: {
        Args: { p_student_id: string; p_remaining_trips: number };
        Returns: Json;
      };
      list_package_students: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          route: string | null;
          trips_remaining: number;
          trips_total: number;
        }[];
      };
      get_route_stop_breakdown: {
        Args: { p_route: string | null; p_service_date: string | null };
        Returns: {
          route: string | null;
          pickup_stop: string | null;
          student_id: string | null;
          full_name: string;
          phone: string | null;
          photo_url: string | null;
          subscription_type: string;
          payment_status: string;
          source: string;
        }[];
      };
      count_today_scanned_exam_passes: {
        Args: Record<string, never>;
        Returns: number;
      };
      check_exam_duplicate: {
        Args: { p_phone: string; p_exam_date: string };
        Returns: boolean;
      };
      get_exam_pass: {
        Args: { p_token: string };
        Returns: {
          full_name: string;
          exam_date: string;
          pickup_stop: string;
          pickup_time: string;
          status: string;
          has_companion: boolean;
          companion_name: string | null;
        }[];
      };
      decide_exam_booking: {
        Args: { p_id: string; p_action: string };
        Returns: Json;
      };
      update_staff_user: {
        Args: {
          p_user_id: string;
          p_full_name: string;
          p_phone: string;
          p_role: string;
          p_assigned_route: string | null;
        };
        Returns: Json;
      };
      list_my_route_students: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          pickup_stop: string | null;
          subscription_type: string;
          trips_remaining: number;
          trips_total: number;
          whatsapp_invited_at: string | null;
          username: string | null;
          photo_url: string | null;
        }[];
      };
      list_all_students: {
        Args: { p_route: string | null };
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          route: string | null;
          pickup_stop: string | null;
          subscription_type: string;
          payment_status: string;
          trips_remaining: number;
          trips_total: number;
          whatsapp_invited_at: string | null;
          username: string | null;
          photo_url: string | null;
        }[];
      };
      set_route_whatsapp_link: {
        Args: { p_route: string; p_link: string };
        Returns: undefined;
      };
      list_routes_with_whatsapp_links: {
        Args: Record<string, never>;
        Returns: { route: string; whatsapp_group_link: string | null }[];
      };
      list_route_students_for_whatsapp: {
        Args: { p_route: string | null };
        Returns: {
          user_id: string;
          full_name: string;
          phone: string | null;
          route: string | null;
          whatsapp_invited_at: string | null;
        }[];
      };
      mark_whatsapp_invited: {
        Args: { p_student_ids: string[] };
        Returns: number;
      };
      reset_whatsapp_invited: {
        Args: { p_student_ids: string[] };
        Returns: number;
      };
      reset_route_whatsapp_status: {
        Args: { p_route: string | null };
        Returns: number;
      };
      list_confirmed_daily_passes: {
        Args: Record<string, never>;
        Returns: {
          full_name: string;
          phone: string;
          route: string;
          pickup_stop: string | null;
          slot: string;
          kind: string;
          payment_method: string;
          is_scanned: boolean;
          scanned_at: string | null;
          scanned_by_name: string | null;
          created_at: string;
        }[];
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
          kind: string;
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
