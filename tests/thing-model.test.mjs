import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvite, inviteDestination, flowError, inviteRpcResult, charms } from '../src/features/things/model.ts';
import { buildInviteUrl } from '../src/features/things/invite-url.ts';

test('invite continuation accepts only a normalized local code, never a redirect URL', () => {
  assert.equal(normalizeInvite('  abc123 '), 'ABC123');
  assert.equal(inviteDestination('abc123'), '/join/ABC123');
  for (const input of [undefined, null, '', 'a', 'x'.repeat(33), '//evil.test', 'https://evil.test', '../things', 'ABC123?next=x', 'ABC123/other', 'ABC%00123']) {
    assert.equal(inviteDestination(input), null);
  }
});
test('QR payload is exactly the current-origin invite URL and contains no user ID', () => {
  assert.equal(buildInviteUrl('https://thing.example/ignored', '  abc123  '), 'https://thing.example/join/ABC123');
  assert.equal(buildInviteUrl('http://localhost:3000', 'ABC123'), 'http://localhost:3000/join/ABC123');
  assert.equal(buildInviteUrl('javascript:alert(1)', 'ABC123'), null);
  assert.doesNotMatch(buildInviteUrl('https://thing.example', 'ABC123'), /user|creator|uuid/i);
});
test('safe errors never expose database internals', () => {
  assert.equal(flowError({ message: 'own_invite' }), 'own_invite');
  assert.equal(flowError({ message: 'private schema and secret details' }), 'connection_failed');
  assert.equal(flowError(null), 'connection_failed');
  assert.equal(Object.keys(charms).length, 4);
  assert.deepEqual(inviteRpcResult({ ok: false, error: 'invite_rate_limited' }), { ok: false, error: 'invite_rate_limited' });
  assert.deepEqual(inviteRpcResult({ ok: false, error: 'private detail' }), { ok: false, error: 'connection_failed' });
});
