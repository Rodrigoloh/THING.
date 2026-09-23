import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

type SourceRow = Record<string, unknown>;
type PromptRow = {
  stable_id: string; game_type: string; level: string | null; round_type: string;
  prompt_en: string; prompt_es: string; option_a_en: string; option_a_es: string;
  option_b_en: string; option_b_es: string; context: string; intensity: number;
  tags: string[]; adult: boolean; status: 'draft' | 'approved' | 'retired'; active: boolean;
  reaction_type: 'respond' | 'use_it' | 'move';
};

const requiredCsvHeaders = [
  ['id', 'stable_id', 'prompt_id'],
  ['engine', 'game_type'],
  ['round_type'],
  ['level'],
  ['prompt_en'],
  ['prompt_es'],
  ['option_a_en'],
  ['option_a_es'],
  ['option_b_en'],
  ['option_b_es'],
  ['context'],
  ['status'],
] as const;

export function normalizeCsvHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function validateCsvHeaders(headers: string[]) {
  const available = new Set(headers);
  const missing = requiredCsvHeaders.filter((alternatives) => !alternatives.some((header) => available.has(header)));
  if (missing.length) throw new Error(`CSV is missing required header(s): ${missing.map((alternatives) => alternatives.join(' or ')).join(', ')}`);
  const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index);
  if (duplicate) throw new Error(`CSV contains duplicate header after normalization: ${duplicate}`);
}

function headerMatchCount(headers: string[]) {
  const available = new Set(headers);
  return requiredCsvHeaders.filter((alternatives) => alternatives.some((header) => available.has(header))).length;
}

export function parseCsv(source: string): SourceRow[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) { validateCsvHeaders([]); return []; }
  const normalizedRows = rows.map((values) => values.map(normalizeCsvHeader));
  let headerIndex = normalizedRows.findIndex((headers) => headerMatchCount(headers) === requiredCsvHeaders.length);
  if (headerIndex < 0) {
    headerIndex = normalizedRows.reduce((best, headers, index) => headerMatchCount(headers) > headerMatchCount(normalizedRows[best]) ? index : best, 0);
  }
  const headers = normalizedRows[headerIndex];
  validateCsvHeaders(headers);
  const data = rows.slice(headerIndex + 1);
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const value = (row: SourceRow, ...keys: string[]) => keys.map((key) => row[key]).find((item) => item !== undefined && item !== null && String(item).trim() !== '');
const text = (row: SourceRow, ...keys: string[]) => String(value(row, ...keys) ?? '').trim();
const truthy = (input: unknown) => input === true || ['true', 'yes', '1'].includes(String(input).trim().toLowerCase());

function normalize(row: SourceRow): PromptRow {
  const stableId = text(row, 'stable_id', 'id', 'prompt_id').toUpperCase();
  const level = text(row, 'level').toLowerCase() || null;
  const statusRaw = text(row, 'status').toLowerCase() || 'draft';
  const status = statusRaw === 'approved' || statusRaw === 'retired' ? statusRaw : 'draft';
  const roundRaw = text(row, 'round_type', 'type').toLowerCase() || 'reveal';
  const roundType = ['guess', 'prediction'].includes(roundRaw) ? 'guess' : ['move', 'challenge', 'action', 'confession'].includes(roundRaw) ? 'move' : 'reveal';
  const context = text(row, 'context').toLowerCase() || 'both';
  const tagsValue = value(row, 'tags');
  const tags = Array.isArray(tagsValue) ? tagsValue.map(String) : String(tagsValue ?? '').split(/[|,]/).map((tag) => tag.trim()).filter(Boolean);
  const levelIntensity: Record<string, number> = { flirty: 1, bold: 2, spicy: 3, kitkat: 4 };
  if (!stableId || !text(row, 'prompt_en') || !text(row, 'prompt_es') || !text(row, 'option_a_en') || !text(row, 'option_a_es') || !text(row, 'option_b_en') || !text(row, 'option_b_es')) throw new Error(`Missing required bilingual content for ${stableId || '(unknown ID)'}`);
  if (stableId.startsWith('HT-') && !['flirty', 'bold', 'spicy', 'kitkat'].includes(level ?? '')) throw new Error(`Invalid Hot level for ${stableId}`);
  const expectedPrefix: Record<string, string> = { flirty: 'HT-F-', bold: 'HT-B-', spicy: 'HT-S-', kitkat: 'HT-K-' };
  if (level && stableId.startsWith('HT-') && !stableId.startsWith(expectedPrefix[level])) throw new Error(`ID ${stableId} does not match level ${level}`);
  if (!['both', 'same_place', 'apart', 'anywhere'].includes(context)) throw new Error(`Invalid context for ${stableId}`);
  const reactionRaw = text(row, 'reaction_type').toLowerCase();
  const reactionType = reactionRaw === 'use_it' || reactionRaw === 'move' ? reactionRaw : 'respond';
  return {
    stable_id: stableId, game_type: text(row, 'game_type', 'engine').toLowerCase(), level, round_type: roundType,
    prompt_en: text(row, 'prompt_en'), prompt_es: text(row, 'prompt_es'), option_a_en: text(row, 'option_a_en'), option_a_es: text(row, 'option_a_es'),
    option_b_en: text(row, 'option_b_en'), option_b_es: text(row, 'option_b_es'), context, intensity: Number(value(row, 'intensity') ?? (level ? levelIntensity[level] : 1)),
    tags, adult: truthy(value(row, 'adult')), status, active: status === 'approved' && text(row, 'active').toLowerCase() !== 'false', reaction_type: reactionType,
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: npm run prompts:import -- path/to/prompts.csv|json');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Never commit the service-role key.');
  const absolutePath = resolve(inputPath);
  const raw = await readFile(absolutePath, 'utf8');
  const sourceRows = extname(absolutePath).toLowerCase() === '.json' ? JSON.parse(raw) as SourceRow[] : parseCsv(raw);
  const rows = sourceRows.map(normalize);
  const duplicate = rows.find((row, index) => rows.findIndex((candidate) => candidate.stable_id === row.stable_id) !== index);
  if (duplicate) throw new Error(`Duplicate stable ID in import: ${duplicate.stable_id}`);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = rows.map((row) => row.stable_id);
  const fields = 'stable_id,game_type,level,round_type,prompt_en,prompt_es,option_a_en,option_a_es,option_b_en,option_b_es,context,intensity,tags,adult,status,active,reaction_type';
  const { data: existing, error: readError } = await supabase.from('game_prompts').select(fields).in('stable_id', ids);
  if (readError) throw readError;
  const comparable = (row: Record<string, unknown>) => JSON.stringify({ ...row, tags: [...((row.tags as string[]) ?? [])].sort() });
  const existingById = new Map((existing ?? []).map((row) => [row.stable_id, row]));
  const changed = rows.filter((row) => !existingById.has(row.stable_id) || comparable(row) !== comparable(existingById.get(row.stable_id) as Record<string, unknown>));
  if (changed.length) {
    const { error } = await supabase.from('game_prompts').upsert(changed, { onConflict: 'stable_id' });
    if (error) throw error;
  }
  const existingIds = new Set(existingById.keys());
  const inserted = rows.filter((row) => !existingIds.has(row.stable_id)).length;
  const updated = changed.length - inserted;
  const skipped = rows.length - changed.length;
  console.log(JSON.stringify({ source: absolutePath, inserted, updated, skipped, total: rows.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
