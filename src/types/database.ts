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

import type { ThingSnapshot, InvitePreview, InviteRpcResult } from '@/features/things/model';
export type ThingStatus = "pending_invite" | "pending_charm" | "active" | "disconnected";
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
  charm_round: number;
  request_id: string | null;
};

export type ThingMember = {
  thing_id: string;
  user_id: string;
  role: ThingMemberRole;
  status: ThingMemberStatus;
  joined_at: string | null;
  seat: number;
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
        Insert: { id?: string; created_by: string; status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; created_at?: string; activated_at?: string | null; charm_round?: number; request_id?: string | null };
        Update: { status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; activated_at?: string | null; charm_round?: number };
        Relationships: [];
      };
      thing_members: {
        Row: ThingMember;
        Insert: { thing_id: string; user_id: string; role: ThingMemberRole; status?: ThingMemberStatus; joined_at?: string | null; seat: number };
        Update: { status?: ThingMemberStatus; joined_at?: string | null };
        Relationships: [];
      };
      thing_invites: {
        Row: ThingInvite;
        Insert: { id?: string; thing_id: string; code: string; created_by: string; status?: ThingInviteStatus; expires_at: string; created_at?: string };
        Update: { status?: ThingInviteStatus };
        Relationships: [];
      };
      thing_charm_choices: {
        Row: { thing_id: string; user_id: string; round: number; charm_key: string };
        Insert: { thing_id: string; user_id: string; round: number; charm_key: string };
        Update: { charm_key?: string };
        Relationships: [];
      };
      current_charm_proposals: {
        Row: { thing_id: string; charm_key: string; proposed_by: string; proposal_version: number; updated_at: string };
        Insert: { thing_id: string; charm_key: string; proposed_by: string; proposal_version: number; updated_at?: string };
        Update: { charm_key?: string; proposed_by?: string; proposal_version?: number; updated_at?: string };
        Relationships: [];
      };
      thing_invite_attempts: {
        Row: { user_id: string; window_started: string; attempts: number };
        Insert: { user_id: string; window_started: string; attempts: number };
        Update: { window_started?: string; attempts?: number };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_thing: { Args: { p_request_id: string }; Returns: string };
      preview_thing_invite: { Args: { p_code: string }; Returns: InvitePreview };
      accept_thing_invite: { Args: { p_code: string }; Returns: string };
      preview_thing_invite_v2: { Args: { p_code: string }; Returns: InviteRpcResult<InvitePreview> };
      accept_thing_invite_v2: { Args: { p_code: string }; Returns: InviteRpcResult<string> };
      choose_thing_charm: { Args: { p_thing_id: string; p_round: number; p_charm: string }; Returns: undefined };
      propose_thing_charm: { Args: { p_thing_id: string; p_expected_version: number; p_charm: string }; Returns: number };
      accept_thing_charm: { Args: { p_thing_id: string; p_expected_version: number }; Returns: undefined };
      thing_snapshot: { Args: { p_thing_id: string }; Returns: ThingSnapshot };
      list_my_things: { Args: Record<string, never>; Returns: ThingSnapshot[] };
      renew_thing_invite: { Args: { p_thing_id: string }; Returns: undefined };
      cancel_pending_thing: { Args: { p_thing_id: string }; Returns: undefined };
      is_active_thing_member: { Args: { target_thing_id: string }; Returns: boolean };
      is_thing_creator: { Args: { target_thing_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
