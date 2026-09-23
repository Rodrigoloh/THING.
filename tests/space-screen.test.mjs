import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../src/lib/i18n/provider.tsx';
import { SpaceScreen } from '../src/features/space/screen.tsx';

function render(data, locale = 'en') {
  return renderToStaticMarkup(h(LocaleProvider, { initialLocale: locale }, h(SpaceScreen, { result: { ok: true, data } })));
}

const space = {
  thing_id: 'thing-1', status: 'active', charm_key: 'spark', color_key: 'purple',
  members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], total_completed_hangouts: 3, current_streak: 2, best_streak: 4,
  same_brain: { hangouts: 3, rounds: 24, matches: 16, lifetime_match_rate: 16 / 24, best_session_match_rate: 1, best_match_streak: 8 },
  souvenirs: [{ key: 'FIRST_THOUGHT', unlocked_at: '2030-01-01T00:00:00Z', source_hangout_id: 'h1' }, { key: 'PERFECT_SYNC', unlocked_at: '2030-01-02T00:00:00Z', source_hangout_id: 'h3' }],
};

test('Space shows shared identity, aggregate Same Brain stats and persistent souvenirs', () => {
  const html = render(space);
  assert.match(html, /Alex \+ Sam/); assert.match(html, /3.*completed Hangouts/s); assert.match(html, /67%/);
  assert.match(html, /16.*matches/s); assert.match(html, /8.*best streak/s); assert.match(html, /FIRST THOUGHT/); assert.match(html, /100%/);
  for (const game of ['KNOW ME', 'THIS OR THAT', 'HOT']) assert.match(html, new RegExp(game));
});

test('Space copy renders naturally in Spanish without compatibility language', () => {
  const html = render(space, 'es');
  assert.match(html, /su Space/); assert.match(html, /coincidencia histórica/); assert.doesNotMatch(html, /compatibilidad|ganador|perdedor/i);
});
