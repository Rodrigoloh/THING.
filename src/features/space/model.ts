import type { Charm, ThingColor } from '@/features/things/model';

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
  souvenirs: { key: 'FIRST_THOUGHT' | 'SAME_BRAIN' | 'LOCKED_IN' | 'PERFECT_SYNC'; unlocked_at: string; source_hangout_id: string }[];
};
