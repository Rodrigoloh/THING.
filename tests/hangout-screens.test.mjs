import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import { LocaleProvider } from '../src/lib/i18n/provider.tsx';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './actions' && context.parentURL?.endsWith('/features/hangouts/screens.tsx')) {
      const source = ['addHotCard', 'advanceChoiceEngine', 'advanceHot', 'advanceSameBrain', 'completeHot', 'createHangout', 'loadChoiceEngine', 'loadHot', 'loadSameBrain', 'readyHotBatch', 'skipHotPrompt', 'startChoiceEngine', 'startHot', 'startSameBrain', 'submitChoiceAnswer', 'submitHotEscalation', 'submitHotReaction', 'submitHotRound', 'submitKnowMeExplanation', 'submitSameBrainAnswer'].map((name) => `export async function ${name}(){throw new Error('Actions must not run during render')}`).join(';');
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    if (specifier === '@/features/hangouts/actions' && context.parentURL?.endsWith('/components/thing/hangout-shell.tsx')) {
      return { url: 'data:text/javascript,' + encodeURIComponent("export async function abandonHangout(){throw new Error('no render action')} export async function loadHangout(){throw new Error('no render action')}"), shortCircuit: true };
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
  id: 'thing-1', status: 'active', charm_key: 'moon', color_key: 'purple', color_source: 'manual', created_by: 'a', viewer_id: 'a',
  members: [{ user_id: 'a', display_name: 'Alex' }, { user_id: 'b', display_name: 'Sam' }], proposal: null, invite: null, active_hangout: null, recent_hangouts: [],
};

test('Hangout selector shows four real choices and concise bilingual descriptions', () => {
  for (const locale of ['en', 'es']) {
    const html = render(HangoutSelectorScreen, { thingResult: { ok: true, data: thing } }, locale);
    for (const title of ['Same Brain', 'Know Me', 'This or That', 'Hot']) assert.match(html, new RegExp(title));
    assert.doesNotMatch(html, /fake activity|boyfriend|girlfriend/i);
  }
});

test('Play entry progresses through situation and duration without an upfront Hot intensity choice', async () => {
  const source = await readFile('src/features/hangouts/screens.tsx', 'utf8');
  assert.match(source, /selectedGame/); assert.match(source, /same_place/); assert.match(source, /apart/); assert.match(source, /duration/); assert.match(source, /let’s play/);
  assert.doesNotMatch(render(HangoutSelectorScreen, { thingResult: { ok: true, data: thing } }), /choose your Hot limit|Flirty.*Bold.*Spicy/s);
});

test('Our Deck setup shows private batch counts without author identity', () => {
  const snapshot = {
    id: 'hangout-1', thing_id: thing.id, game_type: 'hot', state: 'setup', color_key: 'purple', context: 'same_place', hot_level: 'spicy', hot_mode: 'our_deck',
    created_at: '2030-01-01T00:00:00Z', started_at: null, completed_at: null,
    members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], own_card_count: 2, partner_card_count: 3,
    own_batch_ready: false, both_batches_ready: false,
  };
  const html = render(HangoutDetailScreen, { result: { ok: true, data: snapshot } });
  assert.match(html, /your cards: 2\/3/);
  assert.match(html, /their cards: 3\/3/);
  assert.match(html, /no names attached/);
  assert.match(html, /Cancel Hangout/);
  assert.doesNotMatch(html, /created_by|author/i);
});

test('Same Brain renders private answering, reveal and final result states', () => {
  const base = {
    id: 'hangout-2', thing_id: thing.id, game_type: 'same_brain', state: 'active', color_key: 'purple', context: null, hot_level: null, hot_mode: null,
    created_at: '2030-01-01T00:00:00Z', started_at: '2030-01-01T00:00:01Z', completed_at: null,
    members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], own_card_count: 0, partner_card_count: 0, own_batch_ready: false, both_batches_ready: false,
  };
  const prompt = { id: 'round-1', number: 1, state: 'answering', prompt_en: 'Pick one.', prompt_es: 'Elige una.', option_a_en: 'Tea', option_a_es: 'Té', option_b_en: 'Coffee', option_b_es: 'Café', answer_count: 0, own_answer: null, answers: [] };
  const answering = render(HangoutDetailScreen, { result: { ok: true, data: base }, sameBrainResult: { ok: true, data: { id: base.id, thing_id: thing.id, state: 'active', color_key: 'purple', members: base.members, round: prompt, result: null } } });
  assert.match(answering, /round 1 \/ 8/); assert.match(answering, /Tea/); assert.match(answering, /Coffee/); assert.doesNotMatch(answering, /Sam.*picked/);
  assert.match(answering, /End Hangout/);
  const revealed = render(HangoutDetailScreen, { result: { ok: true, data: base }, sameBrainResult: { ok: true, data: { id: base.id, thing_id: thing.id, state: 'active', color_key: 'purple', members: base.members, round: { ...prompt, state: 'revealed', answer_count: 2, own_answer: 'a', answers: [{ answer_key: 'a', is_self: true, display_name: 'Alex' }, { answer_key: 'a', is_self: false, display_name: 'Sam' }] }, result: null } } });
  assert.match(revealed, /MATCH/); assert.match(revealed, /same brain\./); assert.match(revealed, /you picked/); assert.match(revealed, /they picked/);
  const complete = render(HangoutDetailScreen, { result: { ok: true, data: { ...base, state: 'complete', completed_at: '2030-01-01T01:00:00Z' } }, sameBrainResult: { ok: true, data: { id: base.id, thing_id: thing.id, state: 'complete', color_key: 'purple', members: base.members, round: null, result: { matches: 6, rounds: 8, match_rate: 0.75, best_match_streak: 3 } } } });
  assert.match(complete, /6 \/ 8/); assert.match(complete, /75% matched/); assert.match(complete, /best streak: 3/); assert.match(complete, /back to Thing/);
});

test('Know Me and This or That render private role-aware rounds and persisted results', () => {
  const base = { id: 'choice-1', thing_id: thing.id, state: 'active', color_key: 'purple', context: null, hot_level: null, hot_mode: null, created_at: '2030-01-01T00:00:00Z', started_at: '2030-01-01T00:00:01Z', completed_at: null, members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], own_card_count: 0, partner_card_count: 0, own_batch_ready: false, both_batches_ready: false };
  const round = { id: 'r1', number: 1, state: 'answering', prompt_en: 'Ideal evening?', prompt_es: '¿Tarde ideal?', option_a_en: 'Out', option_a_es: 'Salir', option_b_en: 'Home', option_b_es: 'Casa', subject_name: 'Alex', predictor_name: 'Sam', role: 'predictor', own_answer: null, answer_count: 1, answers: [] };
  const know = render(HangoutDetailScreen, { result: { ok: true, data: { ...base, game_type: 'know_me' } }, choiceResult: { ok: true, data: { id: base.id, thing_id: thing.id, game_type: 'know_me', state: 'active', color_key: 'purple', members: thing.members, round, result: null } } });
  assert.match(know, /what do you think they picked/i); assert.match(know, /Ideal evening/); assert.doesNotMatch(know, /subject chose|Alex picked/i);
  const vote = render(HangoutDetailScreen, { result: { ok: true, data: { ...base, game_type: 'this_or_that' } }, choiceResult: { ok: true, data: { id: base.id, thing_id: thing.id, game_type: 'this_or_that', state: 'active', color_key: 'purple', members: thing.members, round: { ...round, role: 'voter' }, result: null } } });
  assert.match(vote, /who fits this more/i); assert.match(vote, /Alex/); assert.match(vote, /Sam/);
});

test('Hot renders private escalation and universal Skip controls', () => {
  const hangout = { id: 'hot-1', thing_id: thing.id, game_type: 'hot', state: 'active', color_key: 'purple', context: 'apart', hot_level: 'flirty', hot_mode: 'standard', created_at: '2030-01-01T00:00:00Z', started_at: '2030-01-01T00:00:01Z', completed_at: null, members: [{ display_name: 'Alex' }, { display_name: 'Sam' }], own_card_count: 0, partner_card_count: 0, own_batch_ready: false, both_batches_ready: false };
  const hot = { id: hangout.id, thing_id: thing.id, state: 'active', color_key: 'purple', context: 'apart', current_level: 'flirty', notice: null, kitkat_unlocked: false, completed_prompts: 0, members: hangout.members, gate: null, round: { id: 'hr1', number: 1, state: 'answering', level: 'flirty', skipped: false, round_type: 'choice', prompt_en: 'Pick one', prompt_es: 'Elige', option_a_en: 'A', option_a_es: 'A', option_b_en: 'B', option_b_es: 'B', own_answer: null, answer_count: 0, answers: [] }, result: null };
  const round = render(HangoutDetailScreen, { result: { ok: true, data: hangout }, hotResult: { ok: true, data: hot } });
  assert.match(round, /skip/); assert.match(round, /Flirty/);
  const gate = render(HangoutDetailScreen, { result: { ok: true, data: hangout }, hotResult: { ok: true, data: { ...hot, gate: { target_level: 'bold', own_vote: null, votes_cast: 0 } } } });
  assert.match(gate, /wanna turn it up/i); assert.match(gate, /stay flirty/); assert.match(gate, /go bold/); assert.doesNotMatch(gate, /Alex.*declined|Sam.*declined/i);
});
