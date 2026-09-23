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
