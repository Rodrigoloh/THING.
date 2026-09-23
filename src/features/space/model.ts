import type { Charm, ThingColor } from '@/features/things/model';

export type SouvenirKey = 'FIRST_THOUGHT' | 'SAME_BRAIN' | 'LOCKED_IN' | 'PERFECT_SYNC' | 'HEAT_CHECK' | 'TURNED_UP' | 'AFTER_HOURS' | 'KITKAT';

export type SpaceSnapshot = {
  thing_id: string;
  status: 'active' | 'disconnected';
  charm_key: Charm;
  color_key: ThingColor;
  members: { display_name: string }[];
  total_completed_hangouts: number;
  current_streak: number;
  best_streak: number;
  same_brain: {
    hangouts: number;
    rounds: number;
    matches: number;
    lifetime_match_rate: number;
    best_session_match_rate: number;
    best_match_streak: number;
  };
  know_me: { predictions: number; correct: number; accuracy: number; best_session_rate: number };
  this_or_that: { rounds: number; agreements: number; agreement_rate: number };
  hot: { hangouts: number; spicy_hangouts: number; highest_level: import('@/features/hangouts/model').HotLevel | null; kitkat_progress: number; kitkat_unlocked: boolean };
  souvenirs: { key: SouvenirKey; unlocked_at: string; source_hangout_id: string }[];
};
