export const charms = { cherry: '🍒', moon: '🌙', spark: '✨', clover: '🍀' } as const;
export type Charm = keyof typeof charms;
export type ThingSnapshot = {
  id: string;
  status: 'pending_invite' | 'pending_charm' | 'active' | 'disconnected';
  charm_key: Charm | null;
  round: number;
  created_by: string;
  members: { user_id: string; display_name: string }[];
  own_choice: Charm | null;
  partner_ready: boolean;
  invite: { code: string; expires_at: string; expired: boolean } | null;
};
export type InvitePreview = { inviter_name: string; expires_at: string };
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
export const flowErrors = ['session_required', 'profile_required', 'invite_unavailable', 'invite_expired', 'invite_used', 'invite_revoked', 'thing_full', 'own_invite', 'thing_unavailable', 'round_changed', 'invalid_charm', 'already_chosen', 'too_many_pending', 'connection_failed'] as const;
export type FlowError = typeof flowErrors[number];
export function flowError(error: unknown): FlowError {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : '';
  return flowErrors.find((key) => key === message) ?? 'connection_failed';
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: FlowError };
