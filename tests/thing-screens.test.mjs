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
    if (specifier === '@/features/hangouts/actions' && context.parentURL?.endsWith('/features/things/screens.tsx')) {
      return { url: 'data:text/javascript,' + encodeURIComponent("export async function joinHangout(){throw new Error('Actions must not run during render')}"), shortCircuit: true };
    }
    if (specifier === './actions' && context.parentURL?.endsWith('/features/things/screens.tsx')) {
      const source = ['acceptCharm', 'declineCharm', 'acceptInvite', 'forgetInvite', 'manageInvite', 'proposeCharm', 'startThing', 'endThing', 'updateThingColor', 'updateThingNickname'].map((name) => `export async function ${name}(){throw new Error('Actions must not run during render')}`).join(';');
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { ThingsScreen, ThingScreen, JoinScreen, StartScreen } = await import('../src/features/things/screens.tsx');
function render(component, props, locale = 'en') {
  return renderToStaticMarkup(h(AppRouterContext.Provider, { value: { refresh() {}, replace() {} } }, h(LocaleProvider, { initialLocale: locale }, h(component, props))));
}
const pending = { id: 'test-thing', status: 'pending_invite', charm_key: null, color_key: 'cherry', color_source: 'charm', created_by: 'creator', viewer_id: 'creator', members: [{ user_id: 'creator', display_name: 'Test Creator' }], proposal: null, invite: { code: 'ABC123', expires_at: '2030-01-01T00:00:00Z', expired: false }, active_hangout: null, recent_hangouts: [] };
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
  assert.equal((first.match(/type="radio"/g) ?? []).length, 12);
  assert.match(first, /disabled=""[^>]*>propose this Charm/);
  const active = { ...joined, nickname: 'Lucky Orbit', status: 'active', charm_key: 'clover' };
  const space = { thing_id: active.id, status: 'active', charm_key: 'clover', color_key: 'acid', members: active.members, total_completed_hangouts: 3, current_streak: 2, best_streak: 2, same_brain: { hangouts: 3, rounds: 24, matches: 16, lifetime_match_rate: 16 / 24, best_session_match_rate: 1, best_match_streak: 8 }, know_me:{predictions:8,correct:6,accuracy:.75,best_session_rate:.75}, this_or_that:{rounds:8,agreements:5,agreement_rate:.625}, hot:{hangouts:1,spicy_hangouts:1,highest_level:'spicy',kitkat_progress:1,kitkat_unlocked:false}, souvenirs: [{ key: 'FIRST_THOUGHT', unlocked_at: '2030-01-01T00:00:00Z', source_hangout_id: 'h1' }] };
  const home = render(ThingScreen, { result: { ok: true, data: active }, spaceResult: { ok: true, data: space }, chatPreview:{ok:true,data:[{id:'m1',thing_id:active.id,author_id:'creator',body:'keep this one',created_at:'2030-01-02T00:00:00Z'}]}, momentsPreview:{ok:true,data:[{id:'p1',thing_id:active.id,author_id:'creator',storage_path:'p',caption:'night out',created_at:'2030-01-03T00:00:00Z',image_url:'https://example.test/photo.jpg'}]} });
  assert.match(home, /Lucky Orbit/); assert.match(home, /Test Creator \+ Test Partner/);
  assert.match(home, /alt="Clover"/);
  assert.match(home, /Start a Hangout/);
  assert.match(home, /your shared little universe/); assert.match(home, /souvenir shelf/); assert.match(home, /little moments/); assert.match(home, /tiny notes/); assert.match(home, /keep this one/);
  assert.match(home, /3<\/strong><span[^>]*>hangouts/); assert.match(home, /href="\/thing\/test-thing\/chat"/); assert.match(home, /href="\/thing\/test-thing\/moments"/); assert.doesNotMatch(home, /href="\/thing\/test-thing\/space"/);
  assert.match(home, /aria-label="Thing settings"/);
  assert.match(home, /FIRST THOUGHT/);
  assert.doesNotMatch(home, /Change color|End this Thing|your thing\./i);
  assert.doesNotMatch(home, /type="radio"|share invite/);
});
test('redesigned lobby card prioritizes Charm, nickname, members and recent signal', () => {
  const recent={id:'h',game_type:'same_brain',state:'complete',created_at:'2030-01-01T00:00:00Z',completed_at:'2030-01-01T01:00:00Z',result:{matches:6,rounds:8},souvenir_keys:[]};
  const item={...joined,nickname:'Lucky Orbit',status:'active',charm_key:'clover',recent_hangouts:[recent]};
  const html=render(ThingsScreen,{result:{ok:true,data:[item]}});
  assert.match(html,/Lucky Orbit/); assert.match(html,/Test Creator \+ Test Partner/); assert.match(html,/alt="Clover"/); assert.match(html,/Same Brain · 6\/8/); assert.match(html,/href="\/thing\/test-thing"/);
});
test('canonical Thing CTA reflects incoming, waiting and active shared Hangouts', () => {
  const base = { ...joined, status: 'active', charm_key: 'moon', color_key: 'electric_blue' };
  const session = { id: 'hangout-1', game_type: 'same_brain', state: 'waiting', created_at: '2030-01-01T00:00:00Z', current_user_joined: false, other_user_joined: true };
  const incoming = render(ThingScreen, { result: { ok: true, data: { ...base, active_hangout: session } } });
  assert.match(incoming, /Same Brain/); assert.match(incoming, /is waiting for you/); assert.match(incoming, /Join Hangout/); assert.doesNotMatch(incoming, /Start a Hangout/);
  const waiting = render(ThingScreen, { result: { ok: true, data: { ...base, active_hangout: { ...session, current_user_joined: true, other_user_joined: false } } } });
  assert.match(waiting, /waiting for them/); assert.match(waiting, /Open Hangout/);
  const playing = render(ThingScreen, { result: { ok: true, data: { ...base, active_hangout: { ...session, state: 'active', current_user_joined: true, other_user_joined: true } } } });
  assert.match(playing, /in progress/); assert.match(playing, /Continue Hangout/);
});
test('unified Thing activity summarizes every completed engine without prompt content', () => {
  const recent = [
    { id: 'k', game_type: 'know_me', state: 'complete', created_at: '2030-01-01T00:00:00Z', completed_at: '2030-01-01T01:00:00Z', result: { rounds: 8, correct_predictions: 6 }, souvenir_keys: [] },
    { id: 't', game_type: 'this_or_that', state: 'complete', created_at: '2030-01-02T00:00:00Z', completed_at: '2030-01-02T01:00:00Z', result: { rounds: 8, agreements: 5, agreement_rate: 0.625 }, souvenir_keys: [] },
    { id: 'h', game_type: 'hot', state: 'complete', created_at: '2030-01-03T00:00:00Z', completed_at: '2030-01-03T01:00:00Z', result: { prompts_completed: 9, highest_level: 'spicy' }, souvenir_keys: [] },
  ];
  const html = render(ThingScreen, { result: { ok: true, data: { ...joined, status: 'active', charm_key: 'moon', recent_hangouts: recent } } });
  assert.match(html, /6 \/ 8 predictions/); assert.match(html, /5 \/ 8 agreed/); assert.match(html, /9 prompts · reached spicy/);
  assert.doesNotMatch(html, /secret prompt|option_a|prompt_en/i);
});
test('disconnected Things are preserved as past and cannot start Hangouts', () => {
  const disconnected = { ...joined, status: 'disconnected', charm_key: 'moon' };
  const list = render(ThingsScreen, { result: { ok: true, data: [disconnected] } });
  assert.match(list, /past things/);
  assert.match(list, /disconnected/);
  const home = render(ThingScreen, { result: { ok: true, data: disconnected } });
  assert.match(home, /This Thing has ended/);
  assert.doesNotMatch(home, /Start a Hangout|End this Thing|Thing settings/);
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
