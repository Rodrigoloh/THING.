export type ChatMessage = { id: string; thing_id: string; author_id: string; body: string; created_at: string };

export function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.trim().replace(/\s+/g, ' ');
  return body && body.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(body) ? body : null;
}
