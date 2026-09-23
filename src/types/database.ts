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

import type { ThingSnapshot, InvitePreview, InviteRpcResult, ThingColor } from '@/features/things/model';
import type { CreateHangoutResult, GameType, HangoutSnapshot, HotLevel, HotMode, HotSetup, SameBrainSnapshot, SameBrainResult } from '@/features/hangouts/model';
import type { SpaceSnapshot } from '@/features/space/model';
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
  color_key: ThingColor;
  color_source: 'charm' | 'manual';
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
        Insert: { id?: string; created_by: string; status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; created_at?: string; activated_at?: string | null; charm_round?: number; request_id?: string | null; color_key?: ThingColor; color_source?: 'charm' | 'manual' };
        Update: { status?: ThingStatus; charm_key?: string | null; accent_color?: string | null; activated_at?: string | null; charm_round?: number; color_key?: ThingColor; color_source?: 'charm' | 'manual' };
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
      hot_consents: {
        Row: { thing_id: string; user_id: string; accepted_level: HotLevel; updated_at: string };
        Insert: { thing_id: string; user_id: string; accepted_level: HotLevel; updated_at?: string };
        Update: { accepted_level?: HotLevel; updated_at?: string };
        Relationships: [];
      };
      hangouts: {
        Row: { id: string; thing_id: string; game_type: GameType; state: HangoutSnapshot['state']; hot_level: HotLevel | null; hot_mode: HotMode | null; result: unknown; created_at: string; started_at: string | null; completed_at: string | null };
        Insert: { id?: string; thing_id: string; game_type: GameType; state?: HangoutSnapshot['state']; hot_level?: HotLevel | null; hot_mode?: HotMode | null; result?: unknown; created_at?: string; started_at?: string | null; completed_at?: string | null };
        Update: { state?: HangoutSnapshot['state']; result?: unknown; started_at?: string | null; completed_at?: string | null };
        Relationships: [];
      };
      hangout_members: {
        Row: { hangout_id: string; user_id: string; batch_ready: boolean; joined_at: string };
        Insert: { hangout_id: string; user_id: string; batch_ready?: boolean; joined_at?: string };
        Update: { batch_ready?: boolean };
        Relationships: [];
      };
      hot_deck_cards: {
        Row: { id: string; hangout_id: string; created_by: string; content: string; card_state: 'deck' | 'drawn' | 'discard'; created_at: string; drawn_at: string | null };
        Insert: { id?: string; hangout_id: string; created_by: string; content: string; card_state?: 'deck' | 'drawn' | 'discard'; created_at?: string; drawn_at?: string | null };
        Update: { card_state?: 'deck' | 'drawn' | 'discard'; drawn_at?: string | null };
        Relationships: [];
      };
      game_prompts: {
        Row: { id: string; game_type: GameType; round_type: string; prompt_en: string; prompt_es: string; option_a_en: string; option_a_es: string; option_b_en: string; option_b_es: string; mood: string; context: string; intensity: number; tags: string[]; adult: boolean; reveal_style: string; active: boolean };
        Insert: { id?: string; game_type: GameType; round_type?: string; prompt_en: string; prompt_es: string; option_a_en: string; option_a_es: string; option_b_en: string; option_b_es: string; mood?: string; context?: string; intensity?: number; tags?: string[]; adult?: boolean; reveal_style?: string; active?: boolean };
        Update: { active?: boolean; mood?: string; context?: string; intensity?: number; tags?: string[]; reveal_style?: string };
        Relationships: [];
      };
      hangout_rounds: {
        Row: { id: string; hangout_id: string; round_number: number; prompt_id: string; state: 'pending' | 'answering' | 'revealed'; created_at: string; revealed_at: string | null };
        Insert: { id?: string; hangout_id: string; round_number: number; prompt_id: string; state?: 'pending' | 'answering' | 'revealed'; created_at?: string; revealed_at?: string | null };
        Update: { state?: 'pending' | 'answering' | 'revealed'; revealed_at?: string | null };
        Relationships: [];
      };
      hangout_answers: {
        Row: { id: string; round_id: string; user_id: string; answer_key: 'a' | 'b'; answered_at: string };
        Insert: { id?: string; round_id: string; user_id: string; answer_key: 'a' | 'b'; answered_at?: string };
        Update: { answer_key?: 'a' | 'b' };
        Relationships: [];
      };
      hangout_results: {
        Row: { hangout_id: string; game_type: GameType; rounds_played: number; result_json: SameBrainResult | Record<string, unknown>; completed_at: string };
        Insert: { hangout_id: string; game_type: GameType; rounds_played: number; result_json: SameBrainResult | Record<string, unknown>; completed_at?: string };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      thing_souvenirs: {
        Row: { id: string; thing_id: string; souvenir_key: 'FIRST_THOUGHT' | 'SAME_BRAIN' | 'LOCKED_IN' | 'PERFECT_SYNC'; source_hangout_id: string; unlocked_at: string; metadata_json: Record<string, unknown> };
        Insert: { id?: string; thing_id: string; souvenir_key: 'FIRST_THOUGHT' | 'SAME_BRAIN' | 'LOCKED_IN' | 'PERFECT_SYNC'; source_hangout_id: string; unlocked_at?: string; metadata_json?: Record<string, unknown> };
        Update: { [_ in never]: never };
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
      update_thing_color: { Args: { p_thing_id: string; p_color_key: ThingColor }; Returns: undefined };
      end_thing: { Args: { p_thing_id: string }; Returns: undefined };
      hot_setup_snapshot: { Args: { p_thing_id: string }; Returns: HotSetup };
      set_hot_consent: { Args: { p_thing_id: string; p_level: HotLevel }; Returns: HotSetup };
      create_hangout: { Args: { p_thing_id: string; p_game_type: GameType; p_hot_mode: HotMode | null }; Returns: CreateHangoutResult };
      join_hangout: { Args: { p_hangout_id: string }; Returns: undefined };
      hangout_snapshot: { Args: { p_hangout_id: string }; Returns: HangoutSnapshot };
      add_hot_deck_card: { Args: { p_hangout_id: string; p_content: string }; Returns: string };
      ready_hot_batch: { Args: { p_hangout_id: string }; Returns: undefined };
      same_brain_snapshot: { Args: { p_hangout_id: string }; Returns: SameBrainSnapshot };
      start_same_brain: { Args: { p_hangout_id: string }; Returns: undefined };
      submit_same_brain_answer: { Args: { p_hangout_id: string; p_round_id: string; p_answer_key: 'a' | 'b' }; Returns: undefined };
      advance_same_brain_round: { Args: { p_hangout_id: string }; Returns: undefined };
      complete_same_brain: { Args: { p_hangout_id: string }; Returns: SameBrainResult };
      space_snapshot: { Args: { p_thing_id: string }; Returns: SpaceSnapshot };
      is_active_thing_member: { Args: { target_thing_id: string }; Returns: boolean };
      is_thing_creator: { Args: { target_thing_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
