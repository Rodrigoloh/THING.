import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import { LocaleProvider } from '../src/lib/i18n/provider.tsx';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './actions' && context.parentURL?.endsWith('/features/hangouts/screens.tsx')) {
      const source = ['addHotCard', 'createHangout', 'readyHotBatch', 'setHotConsent'].map((name) => `export async function ${name}(){throw new Error('Actions must not run during render')}`).join(';');
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { HangoutSelectorScreen, HangoutDetailScreen } = await import('../src/features/hangouts/screens.tsx');
function render(component, props, locale = 'en') {
  const router = { refresh() {}, replace() {}, push() {} };
  return renderToStaticMarkup(h(AppRouterContext.Provider, { value: router }, h(LocaleProvider, { initialLocale: locale }, h(component, props))));
}
const thing = {
  id: 'thing-1', status: 'active', charm_key: 'moon', color_key: 'purple', created_by: 'a', viewer_id: 'a',
  members: [{ user_id: 'a', display_name: 'Alex' }, { user_id: 'b', display_name: 'Sam' }], proposal: null, invite: null, recent_hangouts: [],
};

test('Hangout selector shows four real choices and concise bilingual descriptions', () => {
  for (const locale of ['en', 'es']) {
    const html = render(HangoutSelectorScreen, { thingResult: { ok: true, data: thing }, hotResult: { ok: true, data: { own_level: null, shared_level: null, both_ready: false, our_deck_available: false } } }, locale);
    for (const title of ['Same Brain', 'Know Me', 'This or That', 'Hot']) assert.match(html, new RegExp(title));
    assert.doesNotMatch(html, /fake activity|boyfriend|girlfriend/i);
  }
});

test('Our Deck is rendered only when shared Spicy consent is available', () => {
  const bold = render(HangoutSelectorScreen, { thingResult: { ok: true, data: thing }, hotResult: { ok: true, data: { own_level: 'bold', shared_level: 'bold', both_ready: true, our_deck_available: false } } });
  assert.doesNotMatch(bold, /Our Deck/);
  const spicy = render(HangoutSelectorScreen, { thingResult: { ok: true, data: thing }, hotResult: { ok: true, data: { own_level: 'spicy', shared_level: 'spicy', both_ready: true, our_deck_available: true } } });
  assert.match(spicy, /Our Deck/);
  assert.match(spicy, /no names attached/);
});

test('Our Deck setup shows private batch counts without author identity', () => {
  const snapshot = {
    id: 'hangout-1', thing_id: thing.id, game_type: 'hot', state: 'setup', hot_level: 'spicy', hot_mode: 'our_deck',
    created_at: '2030-01-01T00:00:00Z', started_at: null, completed_at: null,
    members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], own_card_count: 2, partner_card_count: 3,
    own_batch_ready: false, both_batches_ready: false,
  };
  const html = render(HangoutDetailScreen, { result: { ok: true, data: snapshot } });
  assert.match(html, /your cards: 2\/3/);
  assert.match(html, /their cards: 3\/3/);
  assert.match(html, /no names attached/);
  assert.doesNotMatch(html, /created_by|author/i);
});
