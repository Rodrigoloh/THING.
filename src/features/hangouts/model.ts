export const gameTypes = ['same_brain', 'know_me', 'this_or_that', 'hot'] as const;
export type GameType = typeof gameTypes[number];
export type HotLevel = 'flirty' | 'bold' | 'spicy';
export type HotMode = 'standard' | 'our_deck';

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
  members: { display_name: string }[];
  round: SameBrainRound | null;
  result: SameBrainResult | null;
};
