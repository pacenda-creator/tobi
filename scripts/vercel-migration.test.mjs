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
  await assert.rejects(repository.readActive(), /PostgreSQL provider failed/);
  assert.equal(calls, 1);
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

test('lazy pg initialization and idle pool events report safe phases before sanitization', async () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const prior = { ...process.env };
  const driverUrl = 'data:text/javascript,' + encodeURIComponent(`
    export let fail = true;
    export let listener;
    export class Pool {
      constructor() { if (fail) { fail = false; throw Object.assign(new Error('postgres://fake:unique-fake-password@fake.invalid/db'), { code: '28P01' }); } }
      on(event, callback) { if (event === 'error') listener = callback; }
      async query() { return { rows: [] }; }
    }
  `);
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'pg') return { shortCircuit: true, url: driverUrl };
    return nextResolve(specifier, context);
  } });
  try {
    process.env.DATABASE_URL = 'postgres://fake:fake@fake.invalid/fake';
    const { createPostgresTobiConfigRepository } = await import('../lib/tobi-config-postgres.ts?diagnostic-phases');
    const repo = createPostgresTobiConfigRepository();
    await assert.rejects(repo.readActive(), { message: 'TOBi configuration unavailable: PostgreSQL initialization failed.' });
    assert.deepEqual(logs, [['TOBi PostgreSQL failure', '{"phase":"initialization","code":"28P01","category":"authentication"}']]);
    await repo.readActive();
    logs.length = 0;
    (await import(driverUrl)).listener({ code: 'CERT_HAS_EXPIRED', message: 'postgres://fake:unique-fake-password@fake.invalid/db' });
    assert.deepEqual(logs, [['TOBi PostgreSQL failure', '{"phase":"idle_pool","code":"CERT_HAS_EXPIRED","category":"tls"}']]);
  } finally { hook.deregister(); process.env = prior; console.error = original; }
});

test('public/admin route failures log only fixed context and preserve API and spoof rejection', async () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const raw = new Error('postgres://fake:unique-fake-password-TOBi-98172@fake.invalid/db');
  const storeUrl = 'data:text/javascript,' + encodeURIComponent(`
    export class TobiConfigVersionConflictError extends Error {}
    export async function getTobiPublicConfigSnapshot() { throw Object.assign(new Error(${JSON.stringify(raw.message)}), { stack: ${JSON.stringify(raw.message)}, cause: { code: ${JSON.stringify(raw.message)} }, code: ${JSON.stringify(raw.message)}, detail: ${JSON.stringify(raw.message)}, query: ${JSON.stringify(raw.message)}, parameters: [${JSON.stringify(raw.message)}] }); }
    export const getTobiAdminConfigSnapshot = getTobiPublicConfigSnapshot;
    export const saveTobiConfig = getTobiPublicConfigSnapshot;
  `);
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/tobi-config-store') return { shortCircuit: true, url: storeUrl };
    return nextResolve(specifier, context);
  } });
  try {
    const api = await import('../app/api/config/public/route.ts?diagnostic-test');
    const response = await api.GET(new Request('https://tobi.example/api/config/public'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'config_unavailable' });
    assert.deepEqual(logs, [['Public TOBi config load failed']]);
    const admin = await import('../app/api/config/admin/route.ts?diagnostic-test');
    assert.equal((await admin.GET(new Request('https://tobi.example/api/config/admin', { headers: { 'oai-authenticated-user-id': 'admin' } }))).status, 403);
    // Isolate the error branches without changing real fail-closed authentication.
    const authHook = registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === '@/lib/tobi-admin-auth') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export const TOBI_CONFIG_MAX_BYTES = 100000; export const declaredBodyFits = () => true; export const hasJsonContentType = () => true; export const hasValidMutationOrigin = () => true; export const isTobiAdminAuthorized = () => true;') };
      return nextResolve(specifier, context);
    } });
    try {
      const authorized = await import('../app/api/config/admin/route.ts?diagnostic-authorized-test');
      for (const method of ['GET', 'PUT']) {
        logs.length = 0;
        const response = await authorized[method](new Request('https://tobi.example/api/config/admin', { method, ...(method === 'PUT' ? { body: JSON.stringify({ expectedVersion: 1, config: {} }) } : {}) }));
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'config_unavailable' });
        assert.deepEqual(logs, [[`Admin TOBi config ${method === 'GET' ? 'load' : 'save'} failed`]]);
      }
    } finally { authHook.deregister(); }
  } finally { hook.deregister(); console.error = original; }
});

test('CA configuration is strict, safe, recoverable and preserves default TLS options', async () => {
  const { fixtures } = await import('./tobi-tls-fixtures.mjs');
  const fixture = await fixtures();
  const prior = { ...process.env };
  const original = console.error;
  const logs = [];
  const options = [];
  globalThis.__tobiCaOptions = options;
  const driver = 'data:text/javascript,' + encodeURIComponent('export class Pool { constructor(options) { globalThis.__tobiCaOptions.push(options); } on() {} async query() { return {rows:[]}; } }');
  const hook = registerHooks({ resolve(s,c,n) { return s === 'pg' ? { shortCircuit:true, url:driver } : n(s,c); } });
  console.error = (...args) => logs.push(args);
  try {
    process.env.DATABASE_URL = 'postgres://fake:unique-fake-password@fake.invalid/db?sslmode=disable&sslrootcert=bad&sslcert=bad&sslkey=bad&ssl=false&uselibpqcompat=true';
    let sequence = 0;
    for (const value of [undefined, fixture.ca, fixture.other + fixture.ca, '', ' \n', 'unique-fake-password', fixture.ca + 'text', 'text' + fixture.ca, fixture.ca.replace(/\n/g, '\\n'), fixture.ca.replace('-----BEGIN CERTIFICATE-----\n', '-----BEGIN CERTIFICATE-----'), fixture.ca.replace(/MI/, '!I'), fixture.ca.slice(0,-30), fixture.ca + '-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----', fixture.ca + '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----']) {
      if (value === undefined) delete process.env.DATABASE_CA_CERT; else process.env.DATABASE_CA_CERT = value;
      const { createPostgresTobiConfigRepository } = await import(`../lib/tobi-config-postgres.ts?ca=${sequence++}`);
      const repo = createPostgresTobiConfigRepository();
      const before = options.length;
      logs.length = 0;
      if (sequence <= 3) {
        assert.equal(await repo.readActive(), null);
        const ssl = options.at(-1).ssl;
        assert.equal(ssl.rejectUnauthorized, true);
        assert.equal(Object.hasOwn(ssl,'checkServerIdentity'), false);
        assert.equal(Object.hasOwn(ssl,'servername'), false);
        assert.equal(Object.hasOwn(ssl,'ca'), value !== undefined);
        assert.equal(ssl.ca === value, true);
        assert.equal(/sslmode|sslrootcert|sslcert|sslkey|ssl=|uselibpqcompat/.test(options.at(-1).connectionString), false);
      } else {
        await assert.rejects(repo.readActive(), e => e.message === 'TOBi configuration unavailable: PostgreSQL initialization failed.' && e.cause === undefined);
        assert.equal(options.length, before);
        assert.equal(JSON.stringify(logs) === JSON.stringify([['TOBi PostgreSQL failure','{"phase":"initialization","code":"TOBI_INVALID_CA_CERT","category":"configuration"}']]), true);
        process.env.DATABASE_CA_CERT = fixture.ca;
        assert.equal(await repo.readActive(), null);
        assert.equal(options.length, before + 1);
      }
    }
  } finally { hook.deregister(); process.env = prior; console.error = original; delete globalThis.__tobiCaOptions; await fixture.cleanup(); }
});
