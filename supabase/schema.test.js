const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("Supabase upgrades preserve data and enforce public reads, backups, corrections and safe broadcasts", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = "00000000-0000-0000-0000-000000000001";
  const secondAdmin = "00000000-0000-0000-0000-000000000002";
  const run = "11111111-1111-1111-1111-111111111111";
  const otherRun = "22222222-2222-2222-2222-222222222222";
  const record = { year: 2026, finalOrder: [{ pick: 1, team: "Bears", owner: "Jets" }], finalized: true };
  const broadcast = (id, picks, status = "live", start = false) => db.query(
    "select public.publish_flockville_live($1::uuid, 2027, 2, $2, $3::jsonb, $4) as room",
    [id, status, JSON.stringify(picks), start],
  );
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${admin}'), ('${secondAdmin}');
  `);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await db.exec(schema.split("-- A private, append-only journal")[0]);
  await db.exec(`insert into public.flockville_admins values ('${admin}'), ('${secondAdmin}')`);
  await db.query("insert into public.draft_lottery_history (season_year, record) values (2026, $1)", [JSON.stringify(record)]);
  await db.exec(schema);
  await db.exec(schema);
  const baseline = (await db.query("select * from public.draft_lottery_audit")).rows;
  assert.equal(baseline.length, 1);
  assert.equal(baseline[0].action, "BASELINE");
  assert.deepEqual(baseline[0].after_record, record);
  await db.exec("set role anon");
  assert.equal((await db.query("select record from public.draft_lottery_history")).rows.length, 1);
  await db.query("select season_year, picks from public.flockville_live");
  await assert.rejects(db.exec("select publisher_id from public.flockville_live"), /permission denied/);
  await assert.rejects(db.exec("select * from public.draft_lottery_audit"), /permission denied/);
  await assert.rejects(broadcast(run, [], "live", true), /permission denied/);
  await db.exec("reset role; set role authenticated");
  assert.equal((await db.query("select * from public.draft_lottery_audit")).rows.length, 0);
  await assert.rejects(broadcast(run, [], "live", true), /admin access required/);
  await assert.rejects(db.exec("insert into public.flockville_dashboard (id, season_year) values (1, 2027)"), /row-level security/);
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`);
  await db.exec("insert into public.flockville_dashboard (id, season_year, announcements) values (1, 2027, 'Draft night')");
  await assert.rejects(db.query("update public.draft_lottery_history set record = $1 where season_year=2026",
    [JSON.stringify({ ...record, finalized: false })]), /explicit correction/);
  await assert.rejects(db.exec("delete from public.draft_lottery_history where season_year=2026"), /explicit correction/);
  await assert.rejects(db.query("select public.correct_flockville_history(2026, $1, 'short')",
    [JSON.stringify(record)]), /8 to 500/);
  await db.query("select public.correct_flockville_history(2026, $1, 'Correct recorded owner')",
    [JSON.stringify({ ...record, finalOrder: [{ pick: 1, team: "Bears", owner: "Bears" }] })]);
  const backups = (await db.query("select * from public.draft_lottery_audit order by id")).rows;
  assert.equal(backups.length, 2);
  assert.equal(backups[1].before_record.finalOrder[0].owner, "Jets");
  assert.equal(backups[1].after_record.finalOrder[0].owner, "Bears");
  assert.equal(backups[1].reason, "Correct recorded owner");
  await assert.rejects(db.exec("delete from public.draft_lottery_audit"), /permission denied/);
  await db.exec("update public.draft_lottery_history set record = record || '{\"archived\":true}' where season_year=2026");
  const beforeNoop = (await db.query("select count(*)::int as n from public.draft_lottery_audit")).rows[0].n;
  await db.exec("update public.draft_lottery_history set record = record where season_year=2026");
  assert.equal((await db.query("select count(*)::int as n from public.draft_lottery_audit")).rows[0].n, beforeNoop);
  await broadcast(run, [], "live", true);
  await assert.rejects(broadcast(otherRun, [], "live", true), /already live/);
  const first = { pick: 1, team: "Ravens", owner: "Bears", cpuLocked: false, unrevealedSeed: "NEVER STORE" };
  const room = (await broadcast(run, [first])).rows[0].room;
  assert.equal(room.picks.length, 1);
  assert.equal(JSON.stringify(room).includes("NEVER STORE"), false);
  assert.equal(room.publisher_id, undefined);
  await assert.rejects(broadcast(run, []), /cannot be rewritten/);
  await assert.rejects(broadcast(run, [{ ...first, team: "Changed" }]), /cannot be rewritten/);
  await assert.rejects(broadcast(run, [first], "complete"), /Incomplete/);
  await db.exec(`select set_config('request.jwt.claim.sub', '${secondAdmin}', false)`);
  await assert.rejects(broadcast(run, [first]), /no longer active/);
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`);
  await broadcast(run, [first, { pick: 2, team: "Bears", owner: "Bears" }], "complete");
  await broadcast(otherRun, [], "live", true);
  await broadcast(otherRun, [], "interrupted");
  await broadcast(run, [], "live", true);
  await db.exec("reset role; update public.flockville_live set updated_at = '2020-01-01'; set role authenticated");
  await db.exec(`select set_config('request.jwt.claim.sub', '${secondAdmin}', false)`);
  await broadcast(otherRun, [], "live", true);
  await broadcast(otherRun, [], "interrupted");
  await db.exec("reset role; set role anon");
  assert.equal((await db.query("select announcements from public.flockville_dashboard")).rows[0].announcements, "Draft night");
  assert.equal((await db.query("select status from public.flockville_live")).rows[0].status, "interrupted");
  await db.exec("reset role");
  await db.exec(schema);
  assert.equal((await db.query("select count(*)::int as n from public.draft_lottery_history")).rows[0].n, 1);
});
