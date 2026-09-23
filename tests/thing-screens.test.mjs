// Presentation tests: server actions are deliberately unavailable here.
// Actual mutations and authorization are exercised by thing-db.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import { LocaleProvider } from '../src/lib/i18n/provider.tsx';
import { flowCopy } from '../src/features/things/copy.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './actions' && context.parentURL?.endsWith('/features/things/screens.tsx')) {
      const source = ['acceptCharm', 'acceptInvite', 'forgetInvite', 'manageInvite', 'proposeCharm', 'startThing', 'endThing', 'updateThingColor'].map((name) => `export async function ${name}(){throw new Error('Actions must not run during render')}`).join(';');
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { ThingsScreen, ThingScreen, JoinScreen, StartScreen } = await import('../src/features/things/screens.tsx');
function render(component, props, locale = 'en') {
  return renderToStaticMarkup(h(AppRouterContext.Provider, { value: { refresh() {}, replace() {} } }, h(LocaleProvider, { initialLocale: locale }, h(component, props))));
}
const pending = { id: 'test-thing', status: 'pending_invite', charm_key: null, color_key: 'cherry', created_by: 'creator', viewer_id: 'creator', members: [{ user_id: 'creator', display_name: 'Test Creator' }], proposal: null, invite: { code: 'ABC123', expires_at: '2030-01-01T00:00:00Z', expired: false }, recent_hangouts: [] };
const joined = { ...pending, status: 'pending_charm', invite: null, members: [...pending.members, { user_id: 'partner', display_name: 'Test Partner' }] };

test('real list renders empty, pending invitation, pending Charm and active states', () => {
  const empty = render(ThingsScreen, { result: { ok: true, data: [] } });
  assert.match(empty, /href="\/things\/new"/);
  for (const thing of [pending, joined, { ...joined, status: 'active', charm_key: 'moon' }]) {
    const html = render(ThingsScreen, { result: { ok: true, data: [thing] } });
    assert.ok(html.includes(flowCopy.en[thing.status]));
    assert.match(html, /Test Creator/);
    if (thing.members.length === 2) assert.match(html, /Test Partner/);
  }
});
test('inviter preview requires an explicit accept button and start does not create during render', () => {
  const html = render(JoinScreen, { code: 'ABC123', preview: { ok: true, data: { inviter_name: 'Test Inviter', expires_at: pending.invite.expires_at } } });
  assert.match(html, /Test Inviter/);
  assert.match(html, /<button[^>]*>join →<\/button>/);
  assert.match(render(StartScreen, {}), /create invite →/);
  assert.match(render(JoinScreen, {}), /invite code or link/);
});
test('Charm proposal renders proposer, correct controls, waiting and final shared Charm', () => {
  const proposal = { charm_key: 'moon', proposed_by: 'creator', proposer_name: 'Test Creator', version: 1 };
  const waiting = render(ThingScreen, { result: { ok: true, data: { ...joined, proposal } } });
  assert.match(waiting, /you proposed this Charm/i);
  assert.match(waiting, /waiting for them/i);
  assert.doesNotMatch(waiting, /type="radio"/);
  const partner = render(ThingScreen, { result: { ok: true, data: { ...joined, viewer_id: 'partner', proposal } } });
  assert.match(partner, /Test Creator chose this Charm/);
  assert.match(partner, /keep it/);
  assert.match(partner, /pick another/);
  assert.doesNotMatch(partner, /wrong|mismatch|try again/i);
  const first = render(ThingScreen, { result: { ok: true, data: joined } });
  assert.equal((first.match(/type="radio"/g) ?? []).length, 4);
  assert.match(first, /disabled=""[^>]*>propose this Charm/);
  const home = render(ThingScreen, { result: { ok: true, data: { ...joined, status: 'active', charm_key: 'clover' } } });
  assert.match(home, /Test Creator \+ Test Partner/);
  assert.match(home, /🍀/);
  assert.match(home, /Start a Hangout/);
  assert.match(home, /nothing here yet/);
  assert.match(home, /Thing settings/);
  assert.match(home, /Change color/);
  assert.match(home, /End this Thing/);
  assert.doesNotMatch(home, /type="radio"|share invite/);
});
test('disconnected Things are preserved as past and cannot start Hangouts', () => {
  const disconnected = { ...joined, status: 'disconnected', charm_key: 'moon' };
  const list = render(ThingsScreen, { result: { ok: true, data: [disconnected] } });
  assert.match(list, /past things/);
  assert.match(list, /disconnected/);
  const home = render(ThingScreen, { result: { ok: true, data: disconnected } });
  assert.match(home, /This Thing has ended/);
  assert.doesNotMatch(home, /Start a Hangout|End this Thing/);
});
test('invite screen reserves a mobile QR and shows the six-character code with sharing controls', () => {
  const html = render(ThingScreen, { result: { ok: true, data: pending } });
  assert.match(html, /QR code for this invite/);
  assert.match(html, /ABC123/);
  assert.match(html, /copy code/);
  assert.match(html, /share invite/);
});
test('invite failure states have distinct actionable copy in both languages', () => {
  for (const locale of ['en', 'es']) {
    for (const error of ['invite_expired', 'invite_used', 'invite_revoked', 'own_invite', 'thing_full']) {
      const html = render(JoinScreen, { code: 'ABC123', preview: { ok: false, error } }, locale);
      assert.ok(html.includes(flowCopy[locale][error]));
      assert.match(html, /role="alert"/);
    }
  }
});
