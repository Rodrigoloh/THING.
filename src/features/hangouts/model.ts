export const gameTypes = ['same_brain', 'know_me', 'this_or_that', 'hot'] as const;
export type GameType = typeof gameTypes[number];
export type HotLevel = 'flirty' | 'bold' | 'spicy' | 'kitkat';
export type HotMode = 'standard' | 'our_deck';
export type HotContext = 'same_place' | 'apart';
export type CreateHangoutResult = { id: string; game_type: GameType; created: boolean; joined: boolean; conflict: boolean };

export type HotSetup = {
  own_level: HotLevel | null;
  shared_level: HotLevel | null;
  both_ready: boolean;
  our_deck_available: boolean;
};

export type HangoutSnapshot = {
  id: string;
  thing_id: string;
  game_type: GameType;
  state: 'setup' | 'waiting' | 'ready' | 'active' | 'complete' | 'abandoned';
  color_key: import('@/features/things/model').ThingColor;
  context: HotContext | null;
  hot_level: HotLevel | null;
  hot_mode: HotMode | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  members: { display_name: string }[];
  own_card_count: number;
  partner_card_count: number;
  own_batch_ready: boolean;
  both_batches_ready: boolean;
};

export type ChoiceAnswer = { answer_key: 'a' | 'b'; is_self: boolean; is_subject: boolean; display_name: string };
export type ChoiceRound = {
  id: string; number: number; state: 'answering' | 'revealed';
  prompt_en: string; prompt_es: string; option_a_en: string; option_a_es: string; option_b_en: string; option_b_es: string;
  subject_name: string | null; predictor_name: string | null; role: 'subject' | 'predictor' | 'voter';
  own_answer: 'a' | 'b' | null; answer_count: number; answers: ChoiceAnswer[];
  explanation: string | null; can_explain: boolean;
};
export type KnowMeResult = { rounds: number; correct_predictions: number; predictions_by_user: Record<string, number> };
export type ThisOrThatResult = { rounds: number; agreements: number; agreement_rate: number; votes_for_a: number; votes_for_b: number };
export type ChoiceSnapshot = {
  id: string; thing_id: string; game_type: 'know_me' | 'this_or_that'; state: HangoutSnapshot['state'];
  color_key: import('@/features/things/model').ThingColor;
  members: { user_id: string; display_name: string }[]; round: ChoiceRound | null;
  result: KnowMeResult | ThisOrThatResult | null;
};

export type HotResult = { prompts_completed: number; highest_level: HotLevel; context: HotContext; reached_spicy: boolean; reached_kitkat: boolean };
export type HotSnapshot = {
  id: string; thing_id: string; state: HangoutSnapshot['state']; color_key: import('@/features/things/model').ThingColor;
  context: HotContext; current_level: HotLevel; notice: 'level_up' | 'staying_here' | null; kitkat_unlocked: boolean; kitkat_first_discovery: boolean; completed_prompts: number;
  members: { user_id: string; display_name: string }[];
  gate: { target_level: Exclude<HotLevel, 'flirty'>; own_vote: boolean | null; votes_cast: number } | null;
  round: null | { id: string; number: number; state: 'answering' | 'revealed'; level: HotLevel; skipped: boolean; round_type: 'reveal' | 'guess' | 'move'; reaction_type: 'respond' | 'use_it' | 'move'; prompt_id: string;
    prompt_en: string; prompt_es: string; option_a_en: string; option_a_es: string; option_b_en: string; option_b_es: string;
    subject_name: string; reactor_name: string; role: 'subject' | 'reactor'; can_answer: boolean;
    own_answer: 'a' | 'b' | null; answer_count: number; answers: { answer_key: 'a' | 'b'; is_self: boolean; is_subject: boolean; display_name: string }[];
    needs_reaction: boolean; can_react: boolean; reaction: 'use_it' | 'respond' | 'skip' | null;
    callback: null | { subject_name: string; selected_option: 'a' | 'b'; option_en: string; option_es: string } };
  result: HotResult | null;
};

export type SameBrainAnswer = {
  answer_key: 'a' | 'b';
  is_self: boolean;
  display_name: string;
};

export type SameBrainRound = {
  id: string;
  number: number;
  state: 'answering' | 'revealed';
  prompt_en: string;
  prompt_es: string;
  option_a_en: string;
  option_a_es: string;
  option_b_en: string;
  option_b_es: string;
  answer_count: number;
  own_answer: 'a' | 'b' | null;
  answers: SameBrainAnswer[];
};

export type SameBrainResult = {
  matches: number;
  rounds: number;
  match_rate: number;
  best_match_streak: number;
};

export type SameBrainSnapshot = {
  id: string;
  thing_id: string;
  state: HangoutSnapshot['state'];
  color_key: import('@/features/things/model').ThingColor;
  members: { display_name: string }[];
  round: SameBrainRound | null;
  result: SameBrainResult | null;
};
