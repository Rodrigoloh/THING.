// Minimal types for the checked-in profiles migration. Regenerate from Supabase
// when the database expands; no speculative Things or membership tables.
export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_type: "preset" | "upload" | null;
  avatar_key: string | null;
  locale: "en" | "es";
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile & { created_at: string; updated_at: string };
        Insert: { id: string; display_name: string; avatar_url?: string | null; avatar_type?: "preset" | "upload" | null; avatar_key?: string | null; locale?: "en" | "es" };
        Update: { display_name?: string; avatar_url?: string | null; avatar_type?: "preset" | "upload" | null; avatar_key?: string | null; locale?: "en" | "es" };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
