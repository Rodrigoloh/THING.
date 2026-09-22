import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInviteInput, browserInviteDestination } from '../src/features/things/model.ts';
import { profileDestination } from '../src/features/profile/profile.ts';

test('join accepts code or pasted link and extracts only a local bearer destination', () => {
  for (const input of [' abc123 ', '/join/abc123', 'https://thing.example/join/abc123', 'https://thing.example/join/abc123/?utm_source=share']) {
    assert.equal(parseInviteInput(input), 'ABC123');
  }
  for (const input of ['javascript:alert(1)', 'https://example.com/other/ABC123', 'https://user:pass@example.com/join/ABC123', 'https://example.com/join/ABC123/more', '//example.com/join/ABC123', null]) {
    assert.equal(parseInviteInput(input), null);
  }
});

test('invite continuation survives sign-in and profile creation without accepting', () => {
  const previous = globalThis.document;
  globalThis.document = { cookie: 'other=value; thing-pending-invite=ABC123' };
  try {
    assert.equal(profileDestination('/', false), '/profile/create');
    assert.equal(browserInviteDestination(), '/join/ABC123');
    assert.equal(profileDestination('/profile/create', true), '/things');
    assert.equal(browserInviteDestination(), '/join/ABC123');
    assert.equal(profileDestination('/join/ABC123', true), null);
    globalThis.document.cookie = 'thing-pending-invite=https://evil.example';
    assert.equal(browserInviteDestination(), null);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
