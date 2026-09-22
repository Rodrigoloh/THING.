import { normalizeInvite } from './model';

export function buildInviteUrl(origin: string, input: string): string | null {
  const code = normalizeInvite(input);
  if (!code) return null;
  try {
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
    return new URL(`/join/${code}`, base.origin).href;
  } catch {
    return null;
  }
}
