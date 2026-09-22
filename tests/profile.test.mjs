import assert from "node:assert/strict";
import test from "node:test";
import { profileDestination, validateProfileInput, readOwnProfile, submitOwnProfile } from "../src/features/profile/profile.ts";
import { messages, resolveLocale } from "../src/lib/i18n/messages.ts";

const saved = { id: "auth-user-a", display_name: "Test Person", avatar_url: null, avatar_type: null, avatar_key: null, locale: "es" };
function fixture({ profile = null, authUser = { id: saved.id }, authError = null, readError = null, insertError = null, offline = false } = {}) {
  const state = { profile, inserted: [], reads: [] };
  const client = {
    auth: { async getUser() { if (offline) throw new Error("network"); return { data: { user: authUser }, error: authError }; } },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select(fields) {
          assert.equal(fields, "id, display_name, avatar_url, avatar_type, avatar_key, locale");
          return { eq(column, id) {
            assert.equal(column, "id"); assert.equal(id, saved.id); state.reads.push(id);
            return { async maybeSingle() { return { data: state.profile, error: readError }; } };
          } };
        },
        insert(row) {
          state.inserted.push(row);
          return { select() { return { async single() {
            if (insertError) return { data: null, error: insertError };
            state.profile = row;
            return { data: row, error: null };
          } }; } };
        },
      };
    },
  };
  return { client, state };
}

test("authenticated new user with no profile goes to creation; creation route does not loop", async () => {
  const { client } = fixture();
  assert.deepEqual(await readOwnProfile(client), { ok: true, profile: null });
  for (const route of ["/", "/things", "/things/new", "/join", "/join/code", "/thing/id", "/thing/id/chat"]) {
    assert.equal(profileDestination(route, false), "/profile/create");
  }
  assert.equal(profileDestination("/profile/create", false), null);
});

test("existing profile bypasses profile creation and preserves normal navigation", async () => {
  const { client } = fixture({ profile: saved });
  assert.deepEqual(await readOwnProfile(client), { ok: true, profile: saved });
  assert.equal(profileDestination("/", true), "/things");
  assert.equal(profileDestination("/profile/create", true), "/things");
  assert.equal(profileDestination("/things", true), null);
  assert.equal(profileDestination("/join/code", true), null);
  assert.equal(profileDestination("/dev", false), null);
});

test("display name validation rejects empty, whitespace, controls, and overlong names", () => {
  for (const name of ["", "   ", "\t\n", null, 42]) assert.equal(validateProfileInput(name, "en").error, "nameRequired");
  assert.equal(validateProfileInput("x".repeat(51), "en").error, "nameTooLong");
  assert.equal(validateProfileInput("x\u200by", "en").error, "nameInvalid");
  assert.equal(validateProfileInput("line\nbreak", "en").error, "nameInvalid");
  assert.equal(validateProfileInput("Name", "fr").error, "localeInvalid");
  assert.deepEqual(validateProfileInput("  Test Person  ", "es"), { ok: true, displayName: "Test Person", locale: "es" });
});

test("invalid input performs no profile insert", async () => {
  const { client, state } = fixture();
  assert.equal((await submitOwnProfile(client, " ", "en")).error, "nameRequired");
  assert.equal(state.inserted.length, 0);
});

test("successful profile creation derives Auth ID, saves locale and routes to /things", async () => {
  for (const locale of ["en", "es"]) {
    const { client, state } = fixture();
    const result = await submitOwnProfile(client, "  Test Person  ", locale);
    assert.deepEqual(result, { ok: true, profile: { ...saved, locale }, destination: "/things" });
    assert.deepEqual(state.inserted[0], { id: saved.id, display_name: "Test Person", locale, avatar_type: null, avatar_key: null, avatar_url: null });
  }
});

test("duplicate-profile race reads existing values instead of overwriting them", async () => {
  const { client, state } = fixture({ profile: saved, insertError: { code: "23505" } });
  const result = await submitOwnProfile(client, "Losing tab", "en");
  assert.deepEqual(result, { ok: true, profile: saved, destination: "/things" });
  assert.equal(state.profile.display_name, saved.display_name);
  assert.equal(state.profile.locale, "es");
});

test("insert/read/connection failures are explicit and cannot be mistaken for a missing profile", async () => {
  assert.equal((await readOwnProfile(fixture({ readError: { code: "42P01" } }).client)).error, "profileLoadFailed");
  assert.equal((await submitOwnProfile(fixture({ insertError: { code: "42501" } }).client, "Name", "en")).error, "profileSaveFailed");
  assert.equal((await submitOwnProfile(fixture({ offline: true }).client, "Name", "en")).error, "connectionFailed");
  assert.equal((await readOwnProfile(fixture({ offline: true }).client)).error, "connectionFailed");
  const unauthenticated = fixture({ authUser: null });
  assert.equal((await submitOwnProfile(unauthenticated.client, "Name", "en")).error, "sessionRequired");
  assert.equal(unauthenticated.state.inserted.length, 0);
});

test("English and Spanish have complete matching dictionaries and simple browser defaults", () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.es).sort());
  assert.ok(Object.values(messages.en).every(Boolean));
  assert.ok(Object.values(messages.es).every(Boolean));
  assert.equal(resolveLocale(null, "en-US"), "en");
  assert.equal(resolveLocale(null, "es-MX"), "es");
  assert.equal(resolveLocale(null, "ES"), "es");
  assert.equal(resolveLocale(null, "fr-FR"), "en");
});

test("stored profile locale wins over browser locale after returning visits", async () => {
  const { client } = fixture({ profile: saved });
  const result = await readOwnProfile(client);
  assert.equal(resolveLocale(result.profile.locale, "en-US"), "es");
  assert.equal(resolveLocale("en", "es-MX"), "en");
});
