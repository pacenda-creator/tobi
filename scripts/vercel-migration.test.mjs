import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/headers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export async function headers() { return new Headers({ "oai-authenticated-user-id": "admin", "oai-authenticated-user-email": "admin@example.com", "host": "localhost" }); }') };
  if (specifier === 'next/navigation') return { shortCircuit: true, url: 'data:text/javascript,export function redirect() { throw new Error("redirect"); }' };
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
import { readFile } from 'node:fs/promises';
import { isTobiAdminAuthorized } from '../lib/tobi-admin-auth.ts';

test('Vercel rejects spoof Sites headers and local development tokens', () => {
  const prior = { ...process.env };
  try {
    process.env.TOBI_ADMIN_EMAILS = 'admin@example.com';
    process.env.TOBI_ADMIN_IDS = 'admin';
    process.env.TOBI_LOCAL_ADMIN_TOKEN = 'test-token';
    for (const mode of ['production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      assert.equal(isTobiAdminAuthorized(new Headers({ host: 'localhost:3000', 'oai-authenticated-user-id': 'admin', 'oai-authenticated-user-email': 'admin@example.com', cookie: 'tobi-local-admin-token=test-token' })), false);
    }
  } finally { process.env = prior; }
});

test('getChatGPTUser never presents unsigned identity as verified', async () => {
  const { getChatGPTUser } = await import('../app/chatgpt-auth.ts');
  const prior = { ...process.env };
  try {
    process.env.TOBI_ADMIN_EMAILS = 'admin@example.com';
    process.env.TOBI_LOCAL_ADMIN_TOKEN = 'test-token';
    for (const mode of ['production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      assert.equal(await getChatGPTUser(), null);
    }
  } finally { process.env = prior; }
});

test('PostgreSQL adapter imports without a connection and has no eager pg dependency', async () => {
  const { createPostgresTobiConfigRepository } = await import('../lib/tobi-config-postgres.ts');
  let calls = 0;
  const repository = createPostgresTobiConfigRepository(async () => { calls++; throw new Error('not called on import'); });
  assert.equal(calls, 0);
  await assert.rejects(repository.readActive(), /not called on import/);
});

test('real lazy driver path imports pg and creates a single pool only on first configured read', async () => {
  const prior = { ...process.env };
  let imports = 0;
  const driverUrl = 'data:text/javascript,' + encodeURIComponent(`
    export let creations = 0;
    export class Pool {
      constructor(options) {
        if (options.ssl.rejectUnauthorized !== true || /sslmode|ssl=/.test(options.connectionString)) throw new Error('unsafe TLS');
        creations++;
      }
      on() {}
      async query() { return { rows: [] }; }
    }
  `);
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'pg') { imports++; return { shortCircuit: true, url: driverUrl }; }
    return nextResolve(specifier, context);
  } });
  try {
    delete process.env.DATABASE_URL;
    const { createPostgresTobiConfigRepository } = await import('../lib/tobi-config-postgres.ts?lazy-driver-test');
    const repo = createPostgresTobiConfigRepository();
    assert.equal(imports, 0);
    await assert.rejects(repo.readActive(), /DATABASE_URL is required/);
    assert.equal(imports, 0);
    process.env.DATABASE_URL = 'postgres://test:test@localhost/local?sslmode=disable&ssl=false';
    assert.equal(await repo.readActive(), null);
    assert.equal(await repo.readActive(), null);
    assert.equal(imports, 1);
    assert.equal((await import(driverUrl)).creations, 1);
  } finally { hook.deregister(); process.env = prior; }
});

test('production missing DATABASE_URL rejects even with memory flag, without exposing values', async () => {
  const prior = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.TOBI_IN_MEMORY_CONFIG = 'true';
    delete process.env.DATABASE_URL;
    const { getTobiAdminConfigSnapshot } = await import('../lib/tobi-config-store.ts');
    await assert.rejects(getTobiAdminConfigSnapshot(), { message: 'TOBi configuration unavailable: DATABASE_URL is required.' });
  } finally { process.env = prior; }
});

test('Supabase SQL protects private config from public clients', async () => {
  const sql = await readFile('supabase/migrations/20261109000000_tobi_configurations.sql', 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL .* FROM PUBLIC/i);
  for (const role of ['anon', 'authenticated']) {
    assert.match(sql, new RegExp(`rolname = '${role}'`));
    assert.match(sql, new RegExp(`REVOKE ALL .* FROM ${role}`, 'i'));
  }
  assert.doesNotMatch(sql, /CREATE POLICY|GRANT .* TO (?:anon|authenticated|PUBLIC)/i);
});


test('admin GET/PUT reject spoof headers before any DB access; public API returns safe 503', async () => {
  const prior = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.TOBI_ADMIN_EMAILS = 'admin@example.com';
    delete process.env.DATABASE_URL;
    const admin = await import('../app/api/config/admin/route.ts');
    const headers = { 'oai-authenticated-user-id': 'admin', 'oai-authenticated-user-email': 'admin@example.com', host: 'localhost', origin: 'https://tobi.example', 'content-type': 'application/json' };
    for (const method of ['GET', 'PUT']) {
      const response = await admin[method](new Request('https://tobi.example/api/config/admin', { method, headers, ...(method === 'PUT' ? { body: '{}' } : {}) }));
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'forbidden' });
    }
    const publicApi = await import('../app/api/config/public/route.ts');
    const response = await publicApi.GET(new Request('https://tobi.example/api/config/public'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'config_unavailable' });
  } finally { process.env = prior; }
});
