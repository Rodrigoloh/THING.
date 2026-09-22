// Real PostgreSQL, separate TCP connections, no hosted project or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

test('Thing database: migrations, RPCs, RLS and concurrent transactions', { timeout: 120000 }, async (t) => {
  const socket = createServer();
  await new Promise((done) => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  const directory = await mkdtemp(resolve('.thing-test-'));
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
    }
    await t.test('upgrade preserves pending drafts, assigns seats and preserves existing invites', async () => {
      const { rows } = await admin.query('select id,status from public.things where id=any($1::uuid[])', [[legacyOne, legacyTwo]]);
      assert.equal(rows.find((r) => r.id === legacyOne).status, 'pending_invite');
      assert.equal(rows.find((r) => r.id === legacyTwo).status, 'pending_charm');
      assert.equal((await admin.query("select status from public.thing_invites where code='LEGACY'")).rows[0].status, 'active');
      assert.deepEqual((await admin.query('select seat from public.thing_members where thing_id=$1 order by seat', [legacyTwo])).rows.map((r) => r.seat), [1, 2]);
    });
    await admin.query('delete from public.things where id=any($1::uuid[])', [[legacyOne, legacyTwo]]);
    await admin.query('delete from auth.users where id=any($1::uuid[])', [[legacyOwner, legacyPartner]]);
    async function account(name, { profile = true, anonymous = false } = {}) {
      const id = randomUUID();
      await admin.query('insert into auth.users(id) values($1)', [id]);
      if (profile) await admin.query('insert into public.profiles(id, display_name) values($1,$2)', [id, name]);
      const client = new pg.Client({ user: 'postgres', password, database: 'postgres', host: '127.0.0.1', port });
      await client.connect();
      clients.push(client);
      await client.query('set role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ sub: id, role: 'authenticated', is_anonymous: anonymous })]);
      return { id, client };
    }
    async function rpc(user, name, args = []) {
      return (await user.client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
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
    await t.test('create is atomic, idempotent and produces a seven-day random invite', async () => {
      const request = randomUUID();
      const id = await rpc(a, 'create_thing', [request]);
      assert.equal(await rpc(a, 'create_thing', [request]), id);
      const s = await rpc(a, 'thing_snapshot', [id]);
      assert.equal(s.status, 'pending_invite');
      assert.equal(s.members.length, 1);
      assert.equal(s.members[0].user_id, a.id);
      assert.match(s.invite.code, /^[A-F0-9]{32}$/);
      assert.ok(Date.parse(s.invite.expires_at) - Date.now() > 6.99 * 86400000);
      await assert.rejects(rpc(a, 'accept_thing_invite', [s.invite.code]), /own_invite/);
      assert.equal((await rpc(b, 'preview_thing_invite', [s.invite.code])).inviter_name, 'Creator');
      assert.equal((await rpc(a, 'thing_snapshot', [id])).members.length, 1);
      await rpc(a, 'cancel_pending_thing', [id]);
      await assert.rejects(rpc(b, 'accept_thing_invite', [s.invite.code]), /invite_unavailable/);
    });
    let joined;
    await t.test('two invite acceptors race: exactly one wins and no third member is possible', async () => {
      joined = await draft();
      const result = await raceOnThing(joined.id, [() => rpc(b, 'accept_thing_invite', [joined.code]), () => rpc(c, 'accept_thing_invite', [joined.code])]);
      assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(result.filter((r) => r.status === 'rejected').length, 1);
      joined.partner = result[0].status === 'fulfilled' ? b : c;
      joined.outsider = result[0].status === 'fulfilled' ? c : b;
      const s = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(s.status, 'pending_charm');
      assert.equal(s.members.length, 2);
      await assert.rejects(rpc(joined.partner, 'accept_thing_invite', [joined.code]), /invite_used/);
      await assert.rejects(rpc(a, 'cancel_pending_thing', [joined.id]), /thing_unavailable/);
      await assert.rejects(admin.query("insert into public.thing_members(thing_id,user_id,role,status,joined_at,seat) values($1,$2,'member','active',now(),2)", [joined.id, joined.outsider.id]), /at most two|unique/);
    });
    await t.test('RLS, column grants, outsider RPCs, and hidden Charm choices', async () => {
      const outsider = joined.outsider;
      assert.deepEqual(await rpc(outsider, 'list_my_things'), []);
      await assert.rejects(rpc(outsider, 'thing_snapshot', [joined.id]), /thing_unavailable/);
      await assert.rejects(rpc(outsider, 'choose_thing_charm', [joined.id, 1, 'moon']), /thing_unavailable/);
      for (const table of ['things', 'thing_members', 'thing_invites', 'thing_charm_choices']) {
        assert.equal((await outsider.client.query(`select * from public.${table}`)).rowCount, 0);
      }
      await assert.rejects(a.client.query("update public.things set status='active' where id=$1", [joined.id]), /permission denied/);
      await assert.rejects(a.client.query('insert into public.things(created_by) values($1)', [a.id]), /permission denied/);
      await assert.rejects(a.client.query("update public.thing_invites set status='active'"), /permission denied/);
      await assert.rejects(a.client.query("update public.thing_members set status='left'"), /permission denied/);
      await rpc(a, 'choose_thing_charm', [joined.id, 1, 'moon']);
      const partnerView = await rpc(joined.partner, 'thing_snapshot', [joined.id]);
      assert.equal(partnerView.own_choice, null);
      assert.equal(partnerView.partner_ready, true);
      assert.equal(partnerView.invite, null);
      assert.equal(JSON.stringify(partnerView).includes('moon'), false);
      assert.equal((await joined.partner.client.query('select * from public.thing_charm_choices')).rowCount, 0);
      assert.equal((await joined.partner.client.query('select * from public.thing_invites')).rowCount, 0);
      await assert.rejects(rpc(a, 'choose_thing_charm', [joined.id, 1, 'spark']), /already_chosen/);
      await assert.rejects(rpc(joined.partner, 'choose_thing_charm', [joined.id, 1, 'invalid']), /invalid_charm/);
    });
    await t.test('mismatch resets both choices; stale rounds rejected; simultaneous match activates once', async () => {
      await rpc(joined.partner, 'choose_thing_charm', [joined.id, 1, 'spark']);
      const s = await rpc(a, 'thing_snapshot', [joined.id]);
      assert.equal(s.status, 'pending_charm'); assert.equal(s.round, 2);
      assert.equal(s.own_choice, null); assert.equal(s.partner_ready, false);
      await assert.rejects(rpc(a, 'choose_thing_charm', [joined.id, 1, 'moon']), /round_changed/);
      const results = await raceOnThing(joined.id, [() => rpc(a, 'choose_thing_charm', [joined.id, 2, 'clover']), () => rpc(joined.partner, 'choose_thing_charm', [joined.id, 2, 'clover'])]);
      assert.ok(results.every((r) => r.status === 'fulfilled'), JSON.stringify(results));
      for (const member of [a, joined.partner]) {
        const home = await rpc(member, 'thing_snapshot', [joined.id]);
        assert.equal(home.status, 'active'); assert.equal(home.charm_key, 'clover');
        assert.equal(home.members.length, 2);
      }
      await assert.rejects(rpc(a, 'choose_thing_charm', [joined.id, 2, 'moon']), /round_changed/);
    });
    await t.test('expired, revoked, unknown invites fail; renewal invalidates the old code', async () => {
      const d = await draft();
      await admin.query("update public.thing_invites set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where thing_id=$1", [d.id]);
      await assert.rejects(rpc(b, 'accept_thing_invite', [d.code]), /invite_expired/);
      await assert.rejects(rpc(b, 'preview_thing_invite', [d.code]), /invite_expired/);
      await rpc(a, 'renew_thing_invite', [d.id]);
      const fresh = (await rpc(a, 'thing_snapshot', [d.id])).invite.code;
      assert.notEqual(fresh, d.code);
      await assert.rejects(rpc(b, 'accept_thing_invite', [d.code]), /invite_expired/);
      await admin.query("update public.thing_invites set status='revoked' where code=$1", [fresh]);
      await assert.rejects(rpc(b, 'accept_thing_invite', [fresh]), /invite_revoked/);
      await assert.rejects(rpc(b, 'accept_thing_invite', ['UNKNOWN']), /invite_unavailable/);
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
        const accepting = rpc(b, 'accept_thing_invite', [d.code]);
        // The uncommitted expiry becomes visible only after the Thing lock releases.
        await admin.query("update public.thing_invites set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where thing_id=$1", [d.id]);
        return accepting;
      }]);
      assert.equal(result[0].status, 'rejected');
      assert.match(result[0].reason.message, /invite_expired/);
      assert.equal((await rpc(a, 'thing_snapshot', [d.id])).members.length, 1);
      await rpc(a, 'cancel_pending_thing', [d.id]);
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
    assert.ok(directory.startsWith(resolve('.thing-test-')), 'Only remove this test cluster inside the workspace');
    await rm(directory, { recursive: true, force: true });
  }
});
