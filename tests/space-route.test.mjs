import test from 'node:test';
import assert from 'node:assert/strict';

const { default: SpacePage } = await import('../src/app/thing/[thingId]/space/page.tsx');

test('/thing/[thingId]/space redirects to the canonical Thing Space', async () => {
  await assert.rejects(
    SpacePage({ params: Promise.resolve({ thingId: 'thing-123' }) }),
    (error) => String(error?.digest ?? error).includes('NEXT_REDIRECT;replace;/thing/thing-123;'),
  );
});
