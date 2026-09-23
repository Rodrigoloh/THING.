export const charms = { cherry: '🍒', moon: '🌙', spark: '✨', clover: '🍀' } as const;
export type Charm = keyof typeof charms;
export const thingColors = {
  cherry: '#FF4057', butter: '#FFD84A', electric_blue: '#3E63FF', acid: '#B6F23A',
  tangerine: '#FF7438', purple: '#A56BFF', paper: '#F4F1E9', ink: '#161616',
} as const;
export type ThingColor = keyof typeof thingColors;
export type ActiveHangout = { id: string; game_type: 'same_brain' | 'know_me' | 'this_or_that' | 'hot'; state: string; created_at: string; current_user_joined: boolean; other_user_joined: boolean };
export type RecentHangout = { id: string; game_type: ActiveHangout['game_type']; state: string; created_at: string; completed_at: string | null; result: { matches?: number; rounds?: number; match_rate?: number; best_match_streak?: number } | null; souvenir_keys: string[] };
export type ThingSnapshot = {
  id: string;
  status: 'pending_invite' | 'pending_charm' | 'active' | 'disconnected';
  charm_key: Charm | null;
  color_key: ThingColor;
  color_source: 'charm' | 'manual';
  created_by: string;
  viewer_id: string;
  members: { user_id: string; display_name: string }[];
  proposal: { charm_key: Charm; proposed_by: string; proposer_name: string; version: number } | null;
  invite: { code: string; expires_at: string; expired: boolean } | null;
  active_hangout: ActiveHangout | null;
  recent_hangouts: RecentHangout[];
};
export type InvitePreview = { inviter_name: string; expires_at: string };
export type InviteRpcResult<T> = { ok: true; data: T } | { ok: false; error: FlowError };
export const inviteCookie = 'thing-pending-invite';
export function normalizeInvite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,32}$/.test(code) ? code : null;
}
export function inviteDestination(code: unknown) {
  const normalized = normalizeInvite(code);
  return normalized ? `/join/${normalized}` : null;
}
// Extract only the bearer code. Never navigate to a pasted URL's host or query.
export function parseInviteInput(value: unknown): string | null {
  const code = normalizeInvite(value);
  if (code) return code;
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (input.startsWith('/join/')) return normalizeInvite(input.slice(6));
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const match = /^\/join\/([a-z0-9]{6,32})\/?$/i.exec(url.pathname);
    return match ? normalizeInvite(match[1]) : null;
  } catch { return null; }
}
export function browserInviteDestination() {
  const code = document.cookie.split('; ').find((part) => part.startsWith(`${inviteCookie}=`))?.slice(inviteCookie.length + 1);
  return inviteDestination(code);
}
export const flowErrors = ['session_required', 'profile_required', 'invite_unavailable', 'invite_expired', 'invite_used', 'invite_revoked', 'invite_rate_limited', 'thing_full', 'own_invite', 'thing_unavailable', 'proposal_changed', 'own_proposal', 'invalid_charm', 'invalid_color', 'invalid_game_type', 'invalid_hot_level', 'invalid_hot_mode', 'hot_consent_required', 'our_deck_unavailable', 'hangout_unavailable', 'hangout_in_progress', 'invalid_card', 'batch_full', 'batch_incomplete', 'prompt_pack_unavailable', 'round_unavailable', 'invalid_answer', 'answer_locked', 'too_many_pending', 'connection_failed'] as const;
export type FlowError = typeof flowErrors[number];
export function flowError(error: unknown): FlowError {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : '';
  return flowErrors.find((key) => key === message) ?? 'connection_failed';
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: FlowError };

export function inviteRpcResult<T>(value: unknown): Result<T> {
  if (!value || typeof value !== 'object' || !('ok' in value)) return { ok: false, error: 'connection_failed' };
  const result = value as { ok: unknown; data?: T; error?: unknown };
  if (result.ok === true && 'data' in result) return { ok: true, data: result.data as T };
  return { ok: false, error: flowErrors.includes(result.error as FlowError) ? result.error as FlowError : 'connection_failed' };
}
