import assert from "node:assert/strict";

const origin = process.env.CHECK_ORIGIN ?? "http://localhost:3000";
const root = await fetch(origin + "/");
assert.equal(root.status, 200);
const entry = await root.text();
assert.match(entry, /Sign in/);
assert.match(entry, /Create account/);
assert.match(entry, /something between two people\./);
assert.doesNotMatch(entry, /Continue with Google/);
console.log("PASS / renders the editorial authentication entry");

for (const path of ["/things", "/things/new", "/profile/create", "/profile/settings", "/auth/update-password", "/join", "/join/test", "/thing/test", "/thing/test/chat", "/thing/test/moments", "/thing/test/space", "/thing/test/hangout/new", "/thing/00000000-0000-0000-0000-000000000000/hangout/00000000-0000-0000-0000-000000000000"]) {
  const response = await fetch(origin + path, { redirect: "manual" });
  const body = await response.text();
  // Next can encode a redirect in its streamed HTML after headers were sent.
  const redirected = [303, 307, 308].includes(response.status) && response.headers.get("location") === "/";
  const streamed = response.status === 200 && body.includes("NEXT_REDIRECT;replace;/;");
  assert.ok(redirected || streamed, `${path} did not redirect to auth (${response.status})`);
  assert.doesNotMatch(body, /<h1[^>]*>[^<]*(?:your things|make it yours|Account settings|Your Thing)/i);
  console.log(`PASS ${path} requires authentication`);
}

for (const suffix of ["", "?error=access_denied&error_description=private-provider-details", "?next=https://example.com"]) {
  const response = await fetch(origin + "/auth/callback" + suffix, { redirect: "manual" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/?auth_error=1");
  assert.match(response.headers.get("cache-control"), /no-store/);
}
console.log("PASS OAuth callback safely handles missing/canceled code and ignores next");
const inviteCode = 'ABCDEF0123456789ABCDEF0123456789';
const inviteResponse = await fetch(origin + '/join/' + inviteCode, { redirect: 'manual' });
assert.match(inviteResponse.headers.get('set-cookie') ?? '', new RegExp(`thing-pending-invite=${inviteCode}`));
assert.equal(inviteResponse.headers.get('referrer-policy'), 'no-referrer');
const prefetched = await fetch(origin + '/join/' + inviteCode + '?_rsc=prefetch', { redirect: 'manual', headers: { 'next-router-prefetch': '1', purpose: 'prefetch' } });
assert.doesNotMatch(prefetched.headers.get('set-cookie') ?? '', /thing-pending-invite/);
console.log('PASS invite survives auth redirect; prefetch does not replace continuation');
assert.equal((await fetch(origin + "/dev")).status, 404);
assert.equal((await fetch(origin + "/avatars/blob_red.svg")).status, 200);
console.log("PASS production /dev is unavailable; avatar assets remain available");
