// Real PostgreSQL, separate TCP connections, no hosted project or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

test('Thing database: migrations, RPCs, RLS and concurrent transactions', { timeout: 240000 }, async (t) => {
  const socket = createServer();
  await new Promise((done) => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  const testRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(testRoot, 'thing-test-'));
  const password = randomUUID();
  const cluster = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {} });
  let admin;
  const clients = [];
  try {
    await cluster.initialise();
    await cluster.start();
    admin = cluster.getPgClient();
    await admin.connect();
    await admin.query(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema auth, public, storage to anon, authenticated;
      grant execute on all functions in schema auth to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
    const legacyOwner = randomUUID(), legacyPartner = randomUUID(), legacyOne = randomUUID(), legacyTwo = randomUUID();
    for (const migration of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      await admin.query(await readFile(join('supabase/migrations', migration), 'utf8'));
      if (migration === '20260922000200_create_things.sql') {
        await t.test('original d64a5e1 RLS tests pass before the additive upgrade', async () => {
          await admin.query(await readFile('supabase/tests/things_rls.sql', 'utf8'));
        });
        await admin.query('insert into auth.users(id) values($1),($2)', [legacyOwner, legacyPartner]);
        await admin.query('insert into public.things(id,created_by) values($1,$3),($2,$3)', [legacyOne, legacyTwo, legacyOwner]);
        await admin.query("insert into public.thing_members(thing_id,user_id,role,status,joined_at) values($1,$3,'creator','active',now()),($2,$3,'creator','active',now()),($2,$4,'member','active',now())", [legacyOne, legacyTwo, legacyOwner, legacyPartner]);
        await admin.query("insert into public.thing_invites(thing_id,created_by,code,expires_at) values($1,$2,'LEGACY',now()+interval '7 days')", [legacyOne, legacyOwner]);
      }
      if (migration === '20260922000300_thing_flow.sql') {
        await admin.query("insert into public.thing_charm_choices(thing_id,user_id,round,charm_key) values($1,$2,1,'moon')", [legacyTwo, legacyPartner]);
      }
    }
    await t.test('upgrade preserves pending drafts, assigns seats and preserves existing invites', async () => {
      const { rows } = await admin.query('select id,status from public.things where id=any($1::uuid[])', [[legacyOne, legacyTwo]]);
      assert.equal(rows.find((r) => r.id === legacyOne).status, 'pending_invite');
      assert.equal(rows.find((r) => r.id === legacyTwo).status, 'pending_charm');
      assert.equal((await admin.query("select status from public.thing_invites where code='LEGACY'")).rows[0].status, 'active');
      assert.deepEqual((await admin.query('select seat from public.thing_members where thing_id=$1 order by seat', [legacyTwo])).rows.map((r) => r.seat), [1, 2]);
      assert.deepEqual((await admin.query('select charm_key,proposed_by,proposal_version from public.current_charm_proposals where thing_id=$1', [legacyTwo])).rows[0], { charm_key: 'moon', proposed_by: legacyPartner, proposal_version: 1 });
    });
    await admin.query('delete from public.things where id=any($1::uuid[])', [[legacyOne, legacyTwo]]);
    await admin.query('delete from auth.users where id=any($1::uuid[])', [[legacyOwner, legacyPartner]]);
    async function authenticatedClient(id, { anonymous = false } = {}) {
      const client = new pg.Client({ user: 'postgres', password, database: 'postgres', host: '127.0.0.1', port });
      await client.connect();
      clients.push(client);
      await client.query('set role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ sub: id, role: 'authenticated', is_anonymous: anonymous })]);
      return client;
    }
    async function account(name, { profile = true, anonymous = false } = {}) {
      const id = randomUUID();
      await admin.query('insert into auth.users(id) values($1)', [id]);
      if (profile) await admin.query('insert into public.profiles(id, display_name) values($1,$2)', [id, name]);
      const client = await authenticatedClient(id, { anonymous });
      return { id, client };
    }
    async function rpc(user, name, args = []) {
      return (await user.client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
    }
    async function inviteRpc(user, name, args = []) {
      const result = await rpc(user, name, args);
      if (!result?.ok) throw new Error(result?.error ?? 'connection_failed');
      return result.data;
    }
    const a = await account('Creator');
    const b = await account('Partner');
    const c = await account('Outsider');
    async function draft() {
      const id = await rpc(a, 'create_thing', [randomUUID()]);
      const state = await rpc(a, 'thing_snapshot', [id]);
      return { id, code: state.invite.code };
    }
    async function raceOnThing(id, operations) {
      await admin.query('begin');
      await admin.query('select id from public.things where id=$1 for update', [id]);
      const settled = Promise.allSettled(operations.map((op) => op()));
      try {
        // A barrier proves separate transactions are actually waiting on the
        // same locked row before release; Promise.all alone would not prove it.
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const { rows } = await admin.query("select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and pid <> pg_backend_pid()");
          if (rows[0].n >= operations.length) { blocked = true; break; }
          await new Promise((done) => setTimeout(done, 10));
        }
        assert.ok(blocked, 'Both independent connections reached the database lock');
      } finally { await admin.query('commit'); }
      return settled;
    }
    await t.test('create is atomic, idempotent and produces a short readable seven-day invite', async () => {
      const request = randomUUID();
      const id = await rpc(a, 'create_thing', [request]);
      assert.equal(await rpc(a, 'create_thing', [request]), id);
      const s = await rpc(a, 'thing_snapshot', [id]);
      assert.equal(s.status, 'pending_invite');
      assert.equal(s.members.length, 1);
      assert.equal(s.members[0].user_id, a.id);
      assert.match(s.invite.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      assert.ok(Date.parse(s.invite.expires_at) - Date.now() > 6.99 * 86400000);
      await assert.rejects(inviteRpc(a, 'accept_thing_invite_v2', [s.invite.code]), /own_invite/);
      assert.equal((await inviteRpc(b, 'preview_thing_invite_v2', [`  ${s.invite.code.toLowerCase()}  `])).inviter_name, 'Creator');
      assert.equal((await rpc(a, 'thing_snapshot', [id])).members.length, 1);
      await rpc(a, 'cancel_pending_thing', [id]);
      await assert.rejects(inviteRpc(b, 'accept_thing_invite_v2', [s.invite.code]), /invite_unavailable/);
    });
    let joined;
    await t.test('two invite acceptors race: exactly one wins and no third member is possible', async () => {
      joined = await draft();
      const result = await raceOnThing(joined.id, [() => rpc(b, 'accept_thing_invite_v2', [joined.code]), () => rpc(c, 'accept_thing_invite_v2', [joined.code])]);
      assert.equal(result.filter((r) => r.status === 'fulfilled' && r.value.ok).length, 1);
      assert.equal(result.filter((r) => r.status === 'fulfilled' && !r.value.ok).length, 1);
      joined.partner = result[0].status === 'fulfilled' && result[0].value.ok ? b : c;
      joined.outsider = joined.partner === b ? c : b;
      const s = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(s.status, 'pending_charm');
      assert.equal(s.members.length, 2);
      await assert.rejects(inviteRpc(joined.partner, 'accept_thing_invite_v2', [joined.code]), /invite_used/);
      await assert.rejects(rpc(a, 'cancel_pending_thing', [joined.id]), /thing_unavailable/);
      await assert.rejects(admin.query("insert into public.thing_members(thing_id,user_id,role,status,joined_at,seat) values($1,$2,'member','active',now(),2)", [joined.id, joined.outsider.id]), /at most two|unique/);
    });
    await t.test('RLS and column grants hide proposals, invites and mutations from outsiders', async () => {
      const outsider = joined.outsider;
      assert.deepEqual(await rpc(outsider, 'list_my_things'), []);
      await assert.rejects(rpc(outsider, 'thing_snapshot', [joined.id]), /thing_unavailable/);
      await assert.rejects(rpc(outsider, 'propose_thing_charm', [joined.id, 0, 'moon']), /thing_unavailable/);
      for (const table of ['things', 'thing_members', 'thing_invites', 'thing_charm_choices', 'current_charm_proposals']) {
        assert.equal((await outsider.client.query(`select * from public.${table}`)).rowCount, 0);
      }
      await assert.rejects(a.client.query("update public.things set status='active' where id=$1", [joined.id]), /permission denied/);
      await assert.rejects(a.client.query('insert into public.things(created_by) values($1)', [a.id]), /permission denied/);
      await assert.rejects(a.client.query("update public.thing_invites set status='active'"), /permission denied/);
      await assert.rejects(a.client.query("update public.thing_members set status='left'"), /permission denied/);
      await rpc(a, 'propose_thing_charm', [joined.id, 0, 'moon']);
      const partnerView = await rpc(joined.partner, 'thing_snapshot', [joined.id]);
      assert.equal(partnerView.proposal.charm_key, 'moon');
      assert.equal(partnerView.proposal.proposer_name, 'Creator');
      assert.equal(partnerView.invite, null);
      assert.equal((await joined.partner.client.query('select * from public.current_charm_proposals')).rowCount, 1);
      assert.equal((await joined.partner.client.query('select * from public.thing_charm_choices')).rowCount, 0);
      assert.equal((await joined.partner.client.query('select * from public.thing_invites')).rowCount, 0);
      await assert.rejects(rpc(a, 'accept_thing_charm', [joined.id, 1]), /own_proposal/);
      await assert.rejects(rpc(joined.partner, 'propose_thing_charm', [joined.id, 1, 'invalid']), /invalid_charm/);
    });
    await t.test('the other member can replace a proposal and the first can accept it once', async () => {
      assert.equal(await rpc(joined.partner, 'propose_thing_charm', [joined.id, 1, 'spark']), 2);
      const s = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(s.status, 'pending_charm'); assert.equal(s.proposal.version, 2);
      assert.equal(s.proposal.proposer_name, 'Partner'); assert.equal(s.proposal.charm_key, 'spark');
      await assert.rejects(rpc(a, 'accept_thing_charm', [joined.id, 1]), /proposal_changed/);
      await rpc(a, 'accept_thing_charm', [joined.id, 2]);
      for (const member of [a, joined.partner]) {
        const home = await rpc(member, 'thing_snapshot', [joined.id]);
        assert.equal(home.status, 'active'); assert.equal(home.charm_key, 'spark');
        assert.equal(home.members.length, 2);
      }
      const activated = (await admin.query('select status,charm_key,activated_at from public.things where id=$1', [joined.id])).rows[0];
      assert.equal(activated.status, 'active'); assert.equal(activated.charm_key, 'spark'); assert.ok(activated.activated_at);
      await assert.rejects(rpc(a, 'propose_thing_charm', [joined.id, 2, 'moon']), /proposal_changed/);
      await assert.rejects(rpc(joined.partner, 'accept_thing_charm', [joined.id, 2]), /proposal_changed/);
    });
    await t.test('shared color is validated, visible to both members and hidden from outsiders', async () => {
      let themed = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(themed.color_key, 'butter'); assert.equal(themed.color_source, 'charm');
      await rpc(joined.partner, 'update_thing_color', [joined.id, 'purple']);
      themed = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(themed.color_key, 'purple'); assert.equal(themed.color_source, 'manual');
      assert.equal((await rpc(joined.partner, 'thing_snapshot', [joined.id])).color_key, 'purple');
      await admin.query("update public.things set charm_key='moon' where id=$1", [joined.id]);
      assert.equal((await rpc(a, 'thing_snapshot', [joined.id])).color_key, 'purple');
      await assert.rejects(rpc(a, 'update_thing_color', [joined.id, 'rainbow']), /invalid_color/);
      await assert.rejects(rpc(joined.outsider, 'update_thing_color', [joined.id, 'acid']), /thing_unavailable/);
      for (const [charm, color] of Object.entries({ cherry: 'cherry', moon: 'electric_blue', clover: 'acid' })) {
        const themedDraft = await draft();
        await inviteRpc(b, 'accept_thing_invite_v2', [themedDraft.code]);
        await rpc(a, 'propose_thing_charm', [themedDraft.id, 0, charm]);
        await rpc(b, 'accept_thing_charm', [themedDraft.id, 1]);
        const snapshot = await rpc(a, 'thing_snapshot', [themedDraft.id]);
        assert.equal(snapshot.color_key, color); assert.equal(snapshot.color_source, 'charm');
        await admin.query('delete from public.things where id=$1', [themedDraft.id]);
      }
    });
    let ourDeck;
    await t.test('one open Hangout is shared, joinable, idempotent and race-safe', async () => {
      await assert.rejects(rpc(a, 'create_hangout', [joined.id, 'unknown', null]), /invalid_game_type/);
      await assert.rejects(rpc(joined.outsider, 'create_hangout', [joined.id, 'same_brain', null]), /thing_unavailable/);
      const created = await rpc(a, 'create_hangout', [joined.id, 'same_brain', null]);
      assert.equal(created.created, true); assert.equal(created.joined, true);
      let homeA = await rpc(a, 'thing_snapshot', [joined.id]);
      let homeB = await rpc(joined.partner, 'thing_snapshot', [joined.id]);
      assert.equal(homeA.active_hangout.id, created.id); assert.equal(homeA.active_hangout.current_user_joined, true); assert.equal(homeA.active_hangout.other_user_joined, false);
      assert.equal(homeB.active_hangout.id, created.id); assert.equal(homeB.active_hangout.current_user_joined, false); assert.equal(homeB.active_hangout.other_user_joined, true);
      const conflict = await rpc(joined.partner, 'create_hangout', [joined.id, 'hot', 'standard']);
      assert.equal(conflict.id, created.id); assert.equal(conflict.conflict, true); assert.equal(conflict.joined, false);
      assert.equal((await admin.query("select count(*)::int n from public.hangouts where thing_id=$1 and state in ('setup','waiting','ready','active')", [joined.id])).rows[0].n, 1);
      await rpc(joined.partner, 'join_hangout', [created.id]);
      await rpc(joined.partner, 'join_hangout', [created.id]);
      const snapshot = await rpc(joined.partner, 'hangout_snapshot', [created.id]);
      assert.deepEqual(snapshot.members.map((member) => member.display_name), ['Creator', joined.partner === b ? 'Partner' : 'Outsider']);
      homeB = await rpc(joined.partner, 'thing_snapshot', [joined.id]);
      assert.equal(homeB.active_hangout.current_user_joined, true); assert.equal(homeB.active_hangout.other_user_joined, true);
      await assert.rejects(rpc(joined.outsider, 'join_hangout', [created.id]), /hangout_unavailable/);
      await assert.rejects(rpc(joined.outsider, 'hangout_snapshot', [created.id]), /hangout_unavailable/);
      await assert.rejects(a.client.query("insert into public.hangouts(thing_id,game_type) values($1,'same_brain')", [joined.id]), /permission denied/);
      await admin.query("update public.hangouts set state='abandoned',completed_at=now() where id=$1", [created.id]);

      const raced = await raceOnThing(joined.id, [
        () => rpc(a, 'create_hangout', [joined.id, 'same_brain', null]),
        () => rpc(joined.partner, 'create_hangout', [joined.id, 'same_brain', null]),
      ]);
      assert.equal(raced.filter((entry) => entry.status === 'fulfilled').length, 2);
      assert.equal(raced[0].value.id, raced[1].value.id);
      assert.equal((await admin.query("select count(*)::int n from public.hangouts where thing_id=$1 and state in ('setup','waiting','ready','active')", [joined.id])).rows[0].n, 1);
      assert.equal((await admin.query('select count(*)::int n from public.hangout_members where hangout_id=$1', [raced[0].value.id])).rows[0].n, 2);
      await admin.query("update public.hangouts set state='abandoned',completed_at=now() where id=$1", [raced[0].value.id]);
    });
    await t.test('Hot uses the lower shared consent and gates private Our Deck batches', async () => {
      assert.deepEqual(await rpc(a, 'hot_setup_snapshot', [joined.id]), { own_level: null, shared_level: null, both_ready: false, our_deck_available: false });
      let setup = await rpc(a, 'set_hot_consent', [joined.id, 'spicy']);
      assert.equal(setup.shared_level, null); assert.equal(setup.our_deck_available, false);
      setup = await rpc(joined.partner, 'set_hot_consent', [joined.id, 'bold']);
      assert.equal(setup.shared_level, 'bold'); assert.equal(setup.our_deck_available, false);
      await assert.rejects(rpc(a, 'create_hangout', [joined.id, 'hot', 'our_deck']), /our_deck_unavailable/);
      const standard = await rpc(a, 'create_hangout', [joined.id, 'hot', 'standard']);
      assert.equal((await rpc(a, 'hangout_snapshot', [standard.id])).hot_level, 'bold');
      await admin.query("update public.hangouts set state='abandoned',completed_at=now() where id=$1", [standard.id]);
      setup = await rpc(joined.partner, 'set_hot_consent', [joined.id, 'spicy']);
      assert.equal(setup.shared_level, 'spicy'); assert.equal(setup.our_deck_available, true);
      ourDeck = (await rpc(a, 'create_hangout', [joined.id, 'hot', 'our_deck'])).id;
      await rpc(joined.partner, 'join_hangout', [ourDeck]);
      for (const text of ['one', 'two', 'three']) await rpc(a, 'add_hot_deck_card', [ourDeck, text]);
      for (const text of ['four', 'five', 'six']) await rpc(joined.partner, 'add_hot_deck_card', [ourDeck, text]);
      await assert.rejects(rpc(a, 'add_hot_deck_card', [ourDeck, 'extra']), /batch_full/);
      await assert.rejects(rpc(joined.outsider, 'add_hot_deck_card', [ourDeck, 'outside']), /hangout_unavailable/);
      assert.equal((await a.client.query('select * from public.hot_deck_cards where hangout_id=$1', [ourDeck])).rowCount, 3);
      assert.equal((await joined.partner.client.query('select * from public.hot_deck_cards where hangout_id=$1', [ourDeck])).rowCount, 3);
      assert.equal((await joined.outsider.client.query('select * from public.hot_deck_cards where hangout_id=$1', [ourDeck])).rowCount, 0);
      const hidden = await rpc(a, 'hangout_snapshot', [ourDeck]);
      assert.equal(hidden.own_card_count, 3); assert.equal(hidden.partner_card_count, 3);
      assert.doesNotMatch(JSON.stringify(hidden), /created_by|one|four/);
      await rpc(a, 'ready_hot_batch', [ourDeck]);
      await rpc(joined.partner, 'ready_hot_batch', [ourDeck]);
      assert.equal((await rpc(a, 'hangout_snapshot', [ourDeck])).state, 'ready');
      setup = await rpc(a, 'set_hot_consent', [joined.id, 'bold']);
      assert.equal(setup.shared_level, 'bold'); assert.equal(setup.our_deck_available, false);
      assert.equal((await rpc(a, 'hangout_snapshot', [ourDeck])).state, 'abandoned');
      await assert.rejects(rpc(a, 'create_hangout', [joined.id, 'hot', 'our_deck']), /our_deck_unavailable/);
    });
    await t.test('Same Brain keeps answers private, persists results and builds Space', async () => {
      async function playSession(matchCount) {
        const hangoutId = (await rpc(a, 'create_hangout', [joined.id, 'same_brain', null])).id;
        await rpc(a, 'start_same_brain', [hangoutId]);
        await rpc(a, 'start_same_brain', [hangoutId]);
        const rounds = (await admin.query('select id,prompt_id,round_number from public.hangout_rounds where hangout_id=$1 order by round_number', [hangoutId])).rows;
        assert.equal(rounds.length, 8);
        assert.equal(new Set(rounds.map((round) => round.prompt_id)).size, 8);
        assert.equal((await rpc(a, 'same_brain_snapshot', [hangoutId])).state, 'waiting');
        await assert.rejects(rpc(joined.partner, 'same_brain_snapshot', [hangoutId]), /hangout_unavailable/);
        await rpc(joined.partner, 'join_hangout', [hangoutId]);
        await rpc(joined.partner, 'join_hangout', [hangoutId]);
        const firstA = await rpc(a, 'same_brain_snapshot', [hangoutId]);
        const firstB = await rpc(joined.partner, 'same_brain_snapshot', [hangoutId]);
        assert.equal(firstA.state, 'active'); assert.equal(firstA.round.id, firstB.round.id);
        for (const [index, expected] of rounds.entries()) {
          let snapshot = await rpc(a, 'same_brain_snapshot', [hangoutId]);
          assert.equal(snapshot.round.id, expected.id); assert.equal(snapshot.round.number, index + 1);
          assert.equal(snapshot.round.answers.length, 0);
          if (index === 1) {
            await Promise.all([
              rpc(a, 'submit_same_brain_answer', [hangoutId, expected.id, 'a']),
              rpc(joined.partner, 'submit_same_brain_answer', [hangoutId, expected.id, index < matchCount ? 'a' : 'b']),
            ]);
            await assert.rejects(rpc(a, 'submit_same_brain_answer', [hangoutId, expected.id, 'b']), /round_unavailable/);
            snapshot = await rpc(a, 'same_brain_snapshot', [hangoutId]);
            assert.equal(snapshot.round.state, 'revealed'); assert.equal(snapshot.round.answers.length, 2);
            if (index < 7) await rpc(a, 'advance_same_brain_round', [hangoutId]);
            continue;
          }
          await rpc(a, 'submit_same_brain_answer', [hangoutId, expected.id, 'a']);
          await assert.rejects(rpc(a, 'submit_same_brain_answer', [hangoutId, expected.id, 'b']), /answer_locked/);
          if (index === 0) {
            assert.equal((await joined.partner.client.query('select * from public.hangout_answers where round_id=$1', [expected.id])).rowCount, 0);
            snapshot = await rpc(joined.partner, 'same_brain_snapshot', [hangoutId]);
            assert.equal(snapshot.round.own_answer, null); assert.equal(snapshot.round.answers.length, 0);
            assert.doesNotMatch(JSON.stringify(snapshot), /"own_answer":"a"/);
            await assert.rejects(rpc(joined.outsider, 'submit_same_brain_answer', [hangoutId, expected.id, 'a']), /hangout_unavailable/);
          }
          await rpc(joined.partner, 'submit_same_brain_answer', [hangoutId, expected.id, index < matchCount ? 'a' : 'b']);
          snapshot = await rpc(a, 'same_brain_snapshot', [hangoutId]);
          assert.equal(snapshot.round.state, 'revealed'); assert.equal(snapshot.round.answers.length, 2);
          assert.equal(snapshot.round.answers[0].answer_key, 'a');
          if (index < 7) await rpc(a, 'advance_same_brain_round', [hangoutId]);
          else await rpc(joined.partner, 'advance_same_brain_round', [hangoutId]);
        }
        const complete = await rpc(a, 'same_brain_snapshot', [hangoutId]);
        assert.equal(complete.state, 'complete'); assert.equal(complete.result.matches, matchCount);
        assert.equal(complete.result.rounds, 8); assert.equal(Number(complete.result.match_rate), matchCount / 8);
        assert.equal(complete.result.best_match_streak, matchCount);
        assert.equal((await admin.query('select count(*)::int n from public.hangout_results where hangout_id=$1', [hangoutId])).rows[0].n, 1);
        await assert.rejects(rpc(a, 'submit_same_brain_answer', [hangoutId, rounds[7].id, 'a']), /hangout_unavailable/);
        await rpc(a, 'advance_same_brain_round', [hangoutId]);
        assert.deepEqual(await rpc(a, 'complete_same_brain', [hangoutId]), complete.result);
        return hangoutId;
      }

      const first = await playSession(3);
      let space = await rpc(a, 'space_snapshot', [joined.id]);
      assert.equal(space.current_streak, 1); assert.equal(space.same_brain.hangouts, 1);
      assert.deepEqual(space.souvenirs.map((item) => item.key).sort(), ['FIRST_THOUGHT', 'SAME_BRAIN']);

      const locked = await playSession(5);
      space = await rpc(joined.partner, 'space_snapshot', [joined.id]);
      assert.equal(space.current_streak, 1);
      assert.ok(space.souvenirs.some((item) => item.key === 'LOCKED_IN'));
      await admin.query("update public.hangouts set completed_at=(now() at time zone 'UTC')::date - interval '1 day' where id=$1", [first]);
      await admin.query("update public.hangout_results set completed_at=(now() at time zone 'UTC')::date - interval '1 day' where hangout_id=$1", [first]);
      space = await rpc(a, 'space_snapshot', [joined.id]);
      assert.equal(space.current_streak, 2);

      const perfect = await playSession(8);
      await admin.query("update public.hangouts set completed_at=(now() at time zone 'UTC')::date - interval '4 days' where id=$1", [first]);
      await admin.query("update public.hangouts set completed_at=(now() at time zone 'UTC')::date - interval '3 days' where id=$1", [locked]);
      space = await rpc(a, 'space_snapshot', [joined.id]);
      assert.equal(space.current_streak, 1); assert.equal(space.best_streak, 2);
      assert.equal(space.same_brain.hangouts, 3); assert.equal(space.same_brain.rounds, 24); assert.equal(space.same_brain.matches, 16);
      assert.equal(Number(space.same_brain.lifetime_match_rate), 16 / 24);
      assert.equal(Number(space.same_brain.best_session_match_rate), 1); assert.equal(space.same_brain.best_match_streak, 8);
      assert.deepEqual(space.souvenirs.map((item) => item.key).sort(), ['FIRST_THOUGHT', 'LOCKED_IN', 'PERFECT_SYNC', 'SAME_BRAIN']);
      assert.equal((await admin.query('select count(*)::int n from public.thing_souvenirs where thing_id=$1', [joined.id])).rows[0].n, 4);
      assert.equal((await rpc(a, 'complete_same_brain', [perfect])).matches, 8);
      assert.equal((await admin.query('select count(*)::int n from public.thing_souvenirs where thing_id=$1', [joined.id])).rows[0].n, 4);

      const incomplete = (await rpc(a, 'create_hangout', [joined.id, 'same_brain', null])).id;
      await rpc(a, 'start_same_brain', [incomplete]);
      assert.equal((await rpc(a, 'space_snapshot', [joined.id])).same_brain.hangouts, 3);
      await assert.rejects(rpc(joined.outsider, 'same_brain_snapshot', [incomplete]), /hangout_unavailable/);
      await assert.rejects(rpc(joined.outsider, 'space_snapshot', [joined.id]), /thing_unavailable/);
      for (const table of ['hangout_rounds', 'hangout_answers', 'hangout_results', 'thing_souvenirs']) {
        assert.equal((await joined.outsider.client.query(`select * from public.${table}`)).rowCount, 0);
      }
    });
    await t.test('ending is member-only, idempotent, preserves history and blocks new Hangouts', async () => {
      await assert.rejects(rpc(joined.outsider, 'end_thing', [joined.id]), /thing_unavailable/);
      await rpc(joined.partner, 'end_thing', [joined.id]);
      await rpc(a, 'end_thing', [joined.id]);
      for (const member of [a, joined.partner]) {
        const ended = await rpc(member, 'thing_snapshot', [joined.id]);
        assert.equal(ended.status, 'disconnected');
        assert.ok(ended.recent_hangouts.length >= 3);
      }
      assert.equal((await rpc(a, 'hangout_snapshot', [ourDeck])).state, 'abandoned');
      await assert.rejects(rpc(a, 'create_hangout', [joined.id, 'know_me', null]), /thing_unavailable/);
    });
    await t.test('expired, revoked, unknown invites fail; renewal invalidates the old code', async () => {
      const d = await draft();
      await admin.query("update public.thing_invites set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where thing_id=$1", [d.id]);
      await assert.rejects(inviteRpc(b, 'accept_thing_invite_v2', [d.code]), /invite_expired/);
      await assert.rejects(inviteRpc(b, 'preview_thing_invite_v2', [d.code]), /invite_expired/);
      await rpc(a, 'renew_thing_invite', [d.id]);
      const fresh = (await rpc(a, 'thing_snapshot', [d.id])).invite.code;
      assert.notEqual(fresh, d.code);
      await assert.rejects(inviteRpc(b, 'accept_thing_invite_v2', [d.code]), /invite_expired/);
      await admin.query("update public.thing_invites set status='revoked' where code=$1", [fresh]);
      await assert.rejects(inviteRpc(b, 'accept_thing_invite_v2', [fresh]), /invite_revoked/);
      await assert.rejects(inviteRpc(b, 'accept_thing_invite_v2', ['UNKNOWN']), /invite_unavailable/);
      await rpc(a, 'cancel_pending_thing', [d.id]);
    });
    await t.test('failed create rolls back Thing and membership together', async () => {
      const before = (await rpc(a, 'list_my_things')).length;
      await admin.query(`create function public.test_reject_invite() returns trigger language plpgsql as $$ begin raise exception 'test_storage_failure'; end; $$;
        create trigger test_reject_invite before insert on public.thing_invites for each row execute function public.test_reject_invite();`);
      const request = randomUUID();
      try { await assert.rejects(rpc(a, 'create_thing', [request]), /test_storage_failure/); }
      finally { await admin.query('drop trigger test_reject_invite on public.thing_invites; drop function public.test_reject_invite()'); }
      assert.equal((await rpc(a, 'list_my_things')).length, before);
      assert.equal((await admin.query('select count(*)::int n from public.things where request_id=$1', [request])).rows[0].n, 0);
      const id = await rpc(a, 'create_thing', [request]);
      await rpc(a, 'cancel_pending_thing', [id]);
    });
    await t.test('invite expiring while acceptance waits on a lock is rejected', async () => {
      const d = await draft();
      const result = await raceOnThing(d.id, [async () => {
        const accepting = rpc(b, 'accept_thing_invite_v2', [d.code]);
        // The uncommitted expiry becomes visible only after the Thing lock releases.
        await admin.query("update public.thing_invites set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where thing_id=$1", [d.id]);
        return accepting;
      }]);
      assert.equal(result[0].status, 'fulfilled');
      assert.deepEqual(result[0].value, { ok: false, error: 'invite_expired' });
      assert.equal((await rpc(a, 'thing_snapshot', [d.id])).members.length, 1);
      await rpc(a, 'cancel_pending_thing', [d.id]);
    });
    await t.test('simultaneous proposal and acceptance serialize; stale operation loses safely', async () => {
      const d = await draft();
      await inviteRpc(b, 'accept_thing_invite_v2', [d.code]);
      await rpc(a, 'propose_thing_charm', [d.id, 0, 'moon']);
      const concurrentPartner = { id: b.id, client: await authenticatedClient(b.id) };
      const result = await raceOnThing(d.id, [
        () => rpc(b, 'propose_thing_charm', [d.id, 1, 'clover']),
        () => rpc(concurrentPartner, 'accept_thing_charm', [d.id, 1]),
      ]);
      assert.equal(result.filter((entry) => entry.status === 'fulfilled').length, 1);
      assert.equal(result.filter((entry) => entry.status === 'rejected').length, 1);
      const state = await rpc(a, 'thing_snapshot', [d.id]);
      assert.ok(state.status === 'active' || (state.status === 'pending_charm' && state.proposal.version === 2));
    });
    await t.test('invite lookup is account-limited and legacy codes remain valid', async () => {
      const limited = await account('Limited');
      for (let attempt = 0; attempt < 30; attempt++) {
        assert.deepEqual(await rpc(limited, 'preview_thing_invite_v2', ['NOTHERE']), { ok: false, error: 'invite_unavailable' });
      }
      assert.deepEqual(await rpc(limited, 'preview_thing_invite_v2', ['NOTHERE']), { ok: false, error: 'invite_rate_limited' });
      await assert.rejects(rpc(limited, 'preview_thing_invite', ['NOTHERE']), /permission denied/);
      const legacy = await draft();
      await admin.query("update public.thing_invites set code='ABCDEF23456789ABCDEF23456789ABCD' where thing_id=$1", [legacy.id]);
      assert.equal((await inviteRpc(b, 'preview_thing_invite_v2', [' abcdef23456789abcdef23456789abcd '])).inviter_name, 'Creator');
      await rpc(a, 'cancel_pending_thing', [legacy.id]);
    });
    await t.test('short-code collision retries before returning a unique invite', async () => {
      const existing = await draft();
      await admin.query("update public.thing_invites set code='AAAAAA' where thing_id=$1", [existing.id]);
      await admin.query(`create sequence public.test_invite_code_sequence;
        create or replace function public.generate_short_thing_invite_code() returns text language sql volatile security definer set search_path='' as
          $$ select case when nextval('public.test_invite_code_sequence') = 1 then 'AAAAAA' else 'BBBBBB' end $$;`);
      const collisionId = await rpc(a, 'create_thing', [randomUUID()]);
      assert.equal((await rpc(a, 'thing_snapshot', [collisionId])).invite.code, 'BBBBBB');
      await rpc(a, 'cancel_pending_thing', [existing.id]);
      await rpc(a, 'cancel_pending_thing', [collisionId]);
    });
    await t.test('missing profile, guest session and unauthenticated role cannot mutate', async () => {
      const missing = await account('Missing', { profile: false });
      const guest = await account('Guest', { anonymous: true });
      await assert.rejects(rpc(missing, 'create_thing', [randomUUID()]), /profile_required/);
      await assert.rejects(rpc(guest, 'create_thing', [randomUUID()]), /session_required/);
      await guest.client.query('set role anon');
      await assert.rejects(rpc(guest, 'list_my_things'), /permission denied/);
    });
  } finally {
    await Promise.all(clients.map((client) => client.end()));
    if (admin) await admin.end();
    await cluster.stop();
    assert.ok(directory.startsWith(join(testRoot, 'thing-test-')), 'Only remove this temporary test cluster');
    await rm(directory, { recursive: true, force: true, maxRetries: 100, retryDelay: 250 });
  }
});
