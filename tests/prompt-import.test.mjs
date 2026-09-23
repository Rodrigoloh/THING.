import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoPromptDuplicates, findPromptDuplicateGroups, normalizeCsvHeader, normalizePromptForDuplicateCheck, normalizePromptRow, parseCsv } from '../scripts/import-game-prompts.ts';

const masterHeader = 'ID,Hangout,Engine,Round Type,Level,Prompt EN,Prompt ES,Option A EN,Option A ES,Option B EN,Option B ES,Mood,Context,Intensity,Tags,Adult,Reveal Style,Notes,Status';

test('master-sheet CSV headers normalize before row validation', () => {
  const source = `\uFEFFTHING. · Hangout Prompt Library,,,,,,,,,,,,,,,,,,\r\nSeed library notes,,,,,,,,,,,,,,,,,,\r\n\r\n${masterHeader}\r\n\r\nHT-F-001,Hot,hot,Reveal,Flirty,Pick one,Elige una,Near,Cerca,Far,Lejos,Playful,both,1,flirty,false,standard,,Approved\r\n, , , , , , , , , , , , , , , , , , \r\n`;
  const rows = parseCsv(source);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'HT-F-001');
  assert.equal(rows[0].round_type, 'Reveal');
  assert.equal(rows[0].prompt_en, 'Pick one');
  assert.equal(rows[0].option_a_es, 'Cerca');
  assert.equal(rows[0].reveal_style, 'standard');
  assert.equal(rows[0].status, 'Approved');
  assert.equal('Prompt EN' in rows[0], false);
});

test('CSV header normalization trims, removes BOM and normalizes punctuation', () => {
  assert.equal(normalizeCsvHeader('\uFEFF Option A (ES) '), 'option_a_es');
  assert.equal(normalizeCsvHeader('Reveal Style'), 'reveal_style');
});

test('CSV parsing reports missing required headers clearly', () => {
  assert.throws(() => parseCsv(masterHeader.replace(',Prompt ES', '') + '\n'), /CSV is missing required header\(s\): prompt_es/);
  assert.throws(() => parseCsv('\n, ,\r\n'), /CSV is missing required header\(s\):/);
});

test('real master rows map Hangout to game_type and preserve Round Type separately', () => {
  const base = {
    prompt_en: 'Pick one', prompt_es: 'Elige una',
    option_a_en: 'A', option_a_es: 'A', option_b_en: 'B', option_b_es: 'B',
    context: 'both', status: 'Approved',
  };
  const cases = [
    ['SB-001', 'Same Brain', 'same_brain', 'choice', 'standard', 'same_brain', 'reveal', null],
    ['GU-001', 'Know Me', 'guess', 'prediction', 'default', 'know_me', 'guess', null],
    ['WH-001', 'This or That', 'who', 'vote', 'normal', 'this_or_that', 'reveal', null],
    ['HT-F-001', 'Hot', 'hot', 'choice', 'FLIRTY', 'hot', 'reveal', 'flirty'],
    ['HT-B-001', 'Hot', 'hot', 'choice', 'Bold', 'hot', 'reveal', 'bold'],
    ['HT-S-001', 'Hot', 'guess', 'prediction', 'spicy', 'hot', 'guess', 'spicy'],
    ['HT-K-001', 'Hot', 'hot', 'respond', 'KitKat', 'hot', 'respond', 'kitkat'],
  ];
  for (const [id, hangout, engine, round_type, level, expectedGameType, expectedRoundType, expectedLevel] of cases) {
    const normalized = normalizePromptRow({ ...base, id, hangout, engine, round_type, level });
    assert.equal(normalized.game_type, expectedGameType, `${id} game_type`);
    assert.equal(normalized.round_type, expectedRoundType, `${id} round_type`);
    assert.equal(normalized.level, expectedLevel, `${id} level`);
  }
  assert.equal(normalizePromptRow({ ...base, id: 'SB-002', hangout: 'Same Brain', engine: 'same_brain', round_type: 'move', level: '' }).round_type, 'move');
});

test('Hot level must agree with its stable ID prefix', () => {
  const row = { id: 'HT-F-999', hangout: 'Hot', engine: 'hot', level: 'Spicy', round_type: 'Reveal', prompt_en: 'Pick', prompt_es: 'Elige', option_a_en: 'A', option_a_es: 'A', option_b_en: 'B', option_b_es: 'B', context: 'both', status: 'Approved' };
  assert.throws(() => normalizePromptRow(row), /HT-F-999 does not match level spicy/);
});

test('prompt duplicate preflight normalizes only case and whitespace and reports every row', () => {
  const base = {
    hangout: 'Hot', engine: 'hot', round_type: 'choice', level: 'Flirty',
    prompt_es: '¿Qué es más hot?', option_a_en: 'A', option_a_es: 'A',
    option_b_en: 'B', option_b_es: 'B', context: 'both', status: 'Approved',
  };
  const rows = [
    normalizePromptRow({ ...base, id: 'HT-F-010', prompt_en: 'Which  is hotter?' }),
    normalizePromptRow({ ...base, id: 'HT-F-011', prompt_en: ' which is HOTTER? ' }),
    normalizePromptRow({ ...base, id: 'HT-F-012', prompt_en: 'Which is hotter!' }),
  ];
  assert.equal(normalizePromptForDuplicateCheck('  Which\t is  HOTTER?  '), 'which is hotter?');
  const groups = findPromptDuplicateGroups(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((row) => row.stable_id), ['HT-F-010', 'HT-F-011']);
  assert.throws(
    () => assertNoPromptDuplicates(rows),
    (error) => error.message.includes('(hot, "which is hotter?")')
      && error.message.includes('stable_id=HT-F-010')
      && error.message.includes('stable_id=HT-F-011')
      && !error.message.includes('stable_id=HT-F-012'),
  );
});
