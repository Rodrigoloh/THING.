// Minimal types for the checked-in Supabase migrations. Regenerate from the
// hosted project after applying migrations if generated types become the norm.
export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_type: "preset" | "upload" | null;
  avatar_key: string | null;
  locale: "en" | "es";
};

export type ThingStatus = "pending" | "active" | "disconnected";
export type ThingMemberRole = "creator" | "member";
export type ThingMemberStatus = "pending" | "active" | "left";
export type ThingInviteStatus = "active" | "accepted" | "expired" | "revoked";

export type Thing = {
  id: string;
  created_by: string;
  status: ThingStatus;
  charm_key: string | null;
  accent_color: string | null;
  created_at: string;
  activated_at: string | null;
};

export type ThingMember = {
  thing_id: string;
  user_id: string;
  role: ThingMemberRole;
  status: ThingMemberStatus;
  joined_at: string | null;
};

export type ThingInvite = {
  id: string;
  thing_id: string;
  code: string;
  created_by: string;
  status: ThingInviteStatus;
  expires_at: string;
  created_at: string;
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
      things: {
        Row: Thing;
        Insert: { id?: string; created_by: string; status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; created_at?: string; activated_at?: string | null };
        Update: { status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; activated_at?: string | null };
        Relationships: [];
      };
      thing_members: {
        Row: ThingMember;
        Insert: { thing_id: string; user_id: string; role: ThingMemberRole; status?: ThingMemberStatus; joined_at?: string | null };
        Update: { status?: ThingMemberStatus; joined_at?: string | null };
        Relationships: [];
      };
      thing_invites: {
        Row: ThingInvite;
        Insert: { id?: string; thing_id: string; code: string; created_by: string; status?: ThingInviteStatus; expires_at: string; created_at?: string };
        Update: { status?: ThingInviteStatus };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_active_thing_member: { Args: { target_thing_id: string }; Returns: boolean };
      is_thing_creator: { Args: { target_thing_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
