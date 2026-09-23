import type { SouvenirKey } from '@/features/space/model';

export type SouvenirDefinition = {
  key: SouvenirKey;
  title: string;
  description: string;
  engine: 'same_brain' | 'hot';
  assetPath: string;
  fallbackLabel: string;
};

export const souvenirRegistry: Record<SouvenirKey, SouvenirDefinition> = {
  FIRST_THOUGHT: { key: 'FIRST_THOUGHT', title: 'FIRST THOUGHT', description: 'First completed Same Brain', engine: 'same_brain', assetPath: '/souvenirs/first-thought.svg', fallbackLabel: 'FIRST THOUGHT' },
  SAME_BRAIN: { key: 'SAME_BRAIN', title: 'SAME BRAIN', description: 'Three matches in a row', engine: 'same_brain', assetPath: '/souvenirs/same-brain.svg', fallbackLabel: 'SAME BRAIN' },
  LOCKED_IN: { key: 'LOCKED_IN', title: 'LOCKED IN', description: 'Five matches in a row', engine: 'same_brain', assetPath: '/souvenirs/locked-in.svg', fallbackLabel: 'LOCKED IN' },
  PERFECT_SYNC: { key: 'PERFECT_SYNC', title: '100%', description: 'Matched all the way through', engine: 'same_brain', assetPath: '/souvenirs/perfect-sync.svg', fallbackLabel: '100% SYNC' },
  HEAT_CHECK: { key: 'HEAT_CHECK', title: 'HEAT CHECK', description: 'First completed Hot', engine: 'hot', assetPath: '/souvenirs/heat-check.svg', fallbackLabel: 'HEAT CHECK' },
  TURNED_UP: { key: 'TURNED_UP', title: 'TURNED UP', description: 'First mutual step into Bold', engine: 'hot', assetPath: '/souvenirs/turned-up.svg', fallbackLabel: 'TURNED UP' },
  AFTER_HOURS: { key: 'AFTER_HOURS', title: 'AFTER HOURS', description: 'First time you reached Spicy', engine: 'hot', assetPath: '/souvenirs/after-hours.svg', fallbackLabel: 'AFTER HOURS' },
  KITKAT: { key: 'KITKAT', title: 'KITKAT', description: 'Secret level found', engine: 'hot', assetPath: '/souvenirs/kitkat.svg', fallbackLabel: 'KITKAT' },
};

export function getSouvenir(key: SouvenirKey): SouvenirDefinition;
export function getSouvenir(key: string): SouvenirDefinition | undefined;
export function getSouvenir(key: string): SouvenirDefinition | undefined {
  return souvenirRegistry[key as SouvenirKey];
}
