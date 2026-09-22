import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabaseEnv } from '../src/lib/supabase/env.ts';

const urlName = 'NEXT_PUBLIC_SUPABASE_URL';
const keyName = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

test('environment validation is explicit and never leaks provided values', () => {
  const previousUrl = process.env[urlName];
  const previousKey = process.env[keyName];
  try {
    delete process.env[urlName];
    delete process.env[keyName];
    assert.throws(getSupabaseEnv, /Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    process.env[urlName] = 'https://example.supabase.co';
    process.env[keyName] = 'sb_secret_do_not_expose';
    assert.throws(getSupabaseEnv, (error) => !error.message.includes('sb_secret_do_not_expose') && /public sb_publishable_/.test(error.message));
    process.env[keyName] = 'sb_publishable_test';
    assert.deepEqual(getSupabaseEnv(), { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
    for (const invalid of ['not-a-url', 'http://example.com', 'https://user:password@example.com', 'https://example.com/path']) {
      process.env[urlName] = invalid;
      assert.throws(getSupabaseEnv, /NEXT_PUBLIC_SUPABASE_URL/);
    }
    process.env[urlName] = 'http://127.0.0.1:54321';
    assert.equal(getSupabaseEnv().url, 'http://127.0.0.1:54321');
  } finally {
    if (previousUrl === undefined) delete process.env[urlName]; else process.env[urlName] = previousUrl;
    if (previousKey === undefined) delete process.env[keyName]; else process.env[keyName] = previousKey;
  }
});
