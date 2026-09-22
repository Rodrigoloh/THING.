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
    await rm(directory, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 });
  }
});
