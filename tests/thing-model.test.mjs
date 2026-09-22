import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvite, inviteDestination, flowError, charms } from '../src/features/things/model.ts';

test('invite continuation accepts only a normalized local code, never a redirect URL', () => {
  assert.equal(normalizeInvite('  abc123 '), 'ABC123');
  assert.equal(inviteDestination('abc123'), '/join/ABC123');
  for (const input of [undefined, null, '', 'a', 'x'.repeat(33), '//evil.test', 'https://evil.test', '../things', 'ABC123?next=x', 'ABC123/other', 'ABC%00123']) {
    assert.equal(inviteDestination(input), null);
  }
});
test('safe errors never expose database internals', () => {
  assert.equal(flowError({ message: 'own_invite' }), 'own_invite');
  assert.equal(flowError({ message: 'private schema and secret details' }), 'connection_failed');
  assert.equal(flowError(null), 'connection_failed');
  assert.equal(Object.keys(charms).length, 4);
});
