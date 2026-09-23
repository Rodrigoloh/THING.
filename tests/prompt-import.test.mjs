import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCsvHeader, normalizePromptRow, parseCsv } from '../scripts/import-game-prompts.ts';

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

test('level is null for non-Hot engines and derived strictly for every Hot prefix', () => {
  const base = {
    round_type: 'Reveal', prompt_en: 'Pick one', prompt_es: 'Elige una',
    option_a_en: 'A', option_a_es: 'A', option_b_en: 'B', option_b_es: 'B',
    context: 'both', status: 'Approved',
  };
  const cases = [
    ['SB-001', 'same_brain', 'standard', null],
    ['GU-001', 'know_me', 'default', null],
    ['WH-001', 'this_or_that', 'normal', null],
    ['HT-F-001', 'hot', 'FLIRTY', 'flirty'],
    ['HT-B-001', 'hot', 'Bold', 'bold'],
    ['HT-S-001', 'hot', 'spicy', 'spicy'],
    ['HT-K-001', 'hot', 'KitKat', 'kitkat'],
  ];
  for (const [id, engine, level, expected] of cases) {
    assert.equal(normalizePromptRow({ ...base, id, engine, level }).level, expected, id);
  }
  assert.equal(normalizePromptRow({ ...base, id: 'SB-002', engine: 'same_brain', level: '' }).level, null);
});

test('Hot level must agree with its stable ID prefix', () => {
  const row = { id: 'HT-F-999', engine: 'hot', level: 'Spicy', round_type: 'Reveal', prompt_en: 'Pick', prompt_es: 'Elige', option_a_en: 'A', option_a_es: 'A', option_b_en: 'B', option_b_es: 'B', context: 'both', status: 'Approved' };
  assert.throws(() => normalizePromptRow(row), /HT-F-999 does not match level spicy/);
});
