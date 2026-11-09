import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createPostgresTobiConfigRepository } from '../lib/tobi-config-postgres.ts';
import { createInitialTobiConfigSnapshot, readOrSeedTobiConfig, saveTobiConfigInRepository } from '../lib/tobi-config-repository.ts';
import { defaultTobiConfig } from '../lib/tobi-config.ts';
import { TobiConfigVersionConflictError } from '../lib/tobi-config-versioning.ts';

async function exercise(client) {
  const repo = createPostgresTobiConfigRepository(async () => client);
  assert.equal(await repo.readActive(), null);
  const seed = createInitialTobiConfigSnapshot('2026-11-09T10:00:00.000Z');
  await repo.insertSeed(seed);
  await repo.insertSeed({ ...seed, configVersion: 8 });
  assert.deepEqual(await readOrSeedTobiConfig(repo), seed);
  const config = structuredClone(defaultTobiConfig);
  config.copy.welcome = "JSON ' quote $4 žluťoučký";
  const saved = await saveTobiConfigInRepository(repo, config, 1);
  assert.equal(saved.configVersion, 2);
  assert.equal(saved.config.copy.welcome, config.copy.welcome);
  assert.match(saved.updatedAt, /^\d{4}-.*Z$/);
  await assert.rejects(() => saveTobiConfigInRepository(repo, defaultTobiConfig, 1), (error) => error instanceof TobiConfigVersionConflictError && error.current.configVersion === 2);
  const results = await Promise.all([repo.updateActive(config, 2, seed.updatedAt), repo.updateActive(config, 2, seed.updatedAt)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await repo.readActive()).configVersion, 3);
  await assert.rejects(() => repo.updateActive(config, NaN, seed.updatedAt), TypeError);
}

test('PostgreSQL query contract: parameterized seed/read/JSON/timestamp/CAS/conflict (fake client only)', async () => {
  let row = null;
  const queries = [];
  await exercise({ async query(sql, values) {
    queries.push(sql);
    assert.ok(!sql.includes("JSON ' quote"));
    assert.ok(Array.isArray(values));
    if (sql.startsWith('INSERT')) {
      assert.match(sql, /ON CONFLICT \(id\) DO NOTHING$/);
      if (!row) row = { config_version: values[1], config: JSON.parse(values[2]), updated_at: new Date(values[3]) };
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE')) {
      assert.match(sql, /WHERE id = \$3 AND config_version = \$4 RETURNING/);
      if (!row || row.config_version !== values[3]) return { rows: [] };
      row = { config_version: row.config_version + 1, config: JSON.parse(values[0]), updated_at: new Date(values[1]) };
    } else assert.match(sql, /WHERE id = \$1$/);
    return { rows: row ? [structuredClone(row)] : [] };
  } });
  assert.ok(queries.length >= 9);
});

test('PostgreSQL errors never leak connection credentials', async () => {
  const repo = createPostgresTobiConfigRepository(async () => ({ async query() { throw new Error('postgres://user:secret@host/db'); } }));
  await assert.rejects(repo.readActive(), { message: 'TOBi configuration unavailable: PostgreSQL query failed.' });
});

test('PGlite actual SQL seed/CAS/read/JSON plus RLS and client grants', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(await readFile('supabase/migrations/20261109000000_tobi_configurations.sql', 'utf8'));
    await exercise(db);
    const { rows } = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tobi_configurations'::regclass");
    assert.equal(rows[0].relrowsecurity, true);
    assert.deepEqual((await db.query("SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='tobi_configurations'")).rows, []);
    for (const role of ['anon', 'authenticated']) {
      const permissions = await db.query("SELECT has_table_privilege($1, 'public.tobi_configurations', 'SELECT,INSERT,UPDATE,DELETE') AS allowed", [role]);
      assert.equal(permissions.rows[0].allowed, false);
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT * FROM public.tobi_configurations'), /permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});

const diagnosticCodes = {
  '28P01': 'authentication', '42501': 'permission', '42P01': 'schema',
  ECONNREFUSED: 'connection', ETIMEDOUT: 'timeout', ENOTFOUND: 'dns',
  SELF_SIGNED_CERT_IN_CHAIN: 'tls', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls', CERT_HAS_EXPIRED: 'tls',
};
const fakeSecret = 'unique-fake-password-TOBi-98172';
const fakeUrl = `postgres://fake:${fakeSecret}@fake.invalid:5432/fake`;
function poisoned(code = fakeUrl) {
  const error = new Error(fakeUrl);
  Object.assign(error, { stack: fakeUrl, code, detail: fakeUrl, query: fakeUrl, parameters: [fakeUrl], cause: { message: fakeUrl, code: fakeUrl } });
  return error;
}
function expectedLog(phase, code = 'UNKNOWN', category = 'unknown') {
  return ['TOBi PostgreSQL failure', JSON.stringify({ phase, code, category })];
}

test('adapter diagnostics use exact safe arguments for query/provider and bounded hostile causes', async () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    const cycle = poisoned(); cycle.cause = cycle;
    const throwing = Object.defineProperties({}, { code: { get() { throw poisoned(); } }, cause: { get() { throw poisoned(); } } });
    const unread = Object.defineProperties({ code: '28P01' }, Object.fromEntries(['message', 'stack', 'detail', 'hint', 'query', 'parameters', 'config', 'cause'].map(key => [key, { get() { throw new Error('must not read'); } }])));
    const cases = [
      ...Object.entries(diagnosticCodes).map(([code, category]) => [poisoned(code), code, category]),
      [poisoned(), 'UNKNOWN', 'unknown'], [{ code: 'ZZ999' }, 'UNKNOWN', 'unknown'],
      [{ cause: { cause: { cause: { code: '42501' } } } }, '42501', 'permission'],
      [{ cause: { cause: { cause: { cause: { code: '28P01' } } } } }, 'UNKNOWN', 'unknown'],
      [cycle, 'UNKNOWN', 'unknown'], [throwing, 'UNKNOWN', 'unknown'], [unread, '28P01', 'authentication'],
      [{ code: 'toString' }, 'UNKNOWN', 'unknown'],
    ];
    for (const phase of ['provider', 'query']) for (const [raw, code, category] of cases) {
      logs.length = 0;
      const repo = createPostgresTobiConfigRepository(async () => {
        if (phase === 'provider') throw raw;
        return { async query() { throw raw; } };
      });
      await assert.rejects(repo.readActive(), error => {
        assert.equal(error.message, `TOBi configuration unavailable: PostgreSQL ${phase === 'provider' ? 'provider' : 'query'} failed.`);
        assert.equal(error.cause, undefined);
        return true;
      });
      assert.deepEqual(logs, [expectedLog(phase, code, category)]);
    }
  } finally { console.error = original; }
});
