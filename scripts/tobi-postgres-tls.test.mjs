import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import tls from 'node:tls';
import { registerHooks } from 'node:module';
import { fixtures } from './tobi-tls-fixtures.mjs';
import pg from 'pg';

const int = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const message = (type, payload = Buffer.alloc(0)) => Buffer.concat([Buffer.from(type), int(payload.length + 4), payload]);
const ready = () => message('Z', Buffer.from('I'));
async function serverFor(cert, key) {
  const sockets = new Set();
  const state = { startups: 0, queries: 0 };
  const context = tls.createSecureContext({ cert, key });
  const track = socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  };
  const server = net.createServer(socket => {
    track(socket);
    let request = Buffer.alloc(0);
    const upgrade = chunk => {
      request = Buffer.concat([request, chunk]);
      if (request.length < 8) return;
      socket.removeListener('data', upgrade);
      if (request.length !== 8 || request.readInt32BE(0) !== 8 || request.readInt32BE(4) !== 80877103) { socket.destroy(); return; }
      socket.write('S');
      const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
      track(secure);
      let pending = Buffer.alloc(0);
      let startup = true;
      secure.on('data', data => {
        pending = Buffer.concat([pending, data]);
        if (startup) {
          if (pending.length < 4 || pending.length < pending.readInt32BE(0)) return;
          const length = pending.readInt32BE(0);
          if (pending.readInt32BE(4) !== 196608) { secure.destroy(); return; }
          pending = pending.subarray(length);
          startup = false;
          state.startups++;
          secure.write(Buffer.concat([message('R', int(0)), ready()]));
        }
        while (pending.length >= 5) {
          const length = pending.readInt32BE(1);
          if (pending.length < length + 1) return;
          const type = String.fromCharCode(pending[0]);
          const payload = pending.subarray(5, length + 1);
          pending = pending.subarray(length + 1);
          if (type === 'P') {
            // Unnamed extended query with the adapter's actual parameterized SELECT.
            const sql = payload.subarray(1, payload.indexOf(0, 1)).toString();
            if (!sql.startsWith('SELECT config_version, config, updated_at FROM public.tobi_configurations WHERE id = $1')) { secure.destroy(); return; }
            secure.write(message('1'));
          } else if (type === 'B') secure.write(message('2'));
          else if (type === 'D') secure.write(message('n'));
          else if (type === 'E') { state.queries++; secure.write(message('C', Buffer.from('SELECT 0\0'))); }
          else if (type === 'S') secure.write(ready());
          else if (type === 'X') secure.end();
          else { secure.destroy(); return; }
        }
      });
    };
    socket.on('data', upgrade);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) { for (const socket of sockets) socket.destroy(); throw error; }
  let closing;
  return {
    state, port: server.address().port,
    close() {
      if (!closing) {
        for (const socket of sockets) socket.destroy();
        closing = new Promise(resolve => server.close(resolve));
      }
      return closing;
    },
  };
}

test('real pg adapter TLS: trusted CA/bundle, untrusted/default trust and hostname rejection', { timeout: 45000 }, async () => {
  const fixture = await fixtures();
  const prior = { ...process.env };
  const original = console.error;
  const logs = [];
  const pools = [];
  const options = [];
  globalThis.__tobiRealPool = class extends pg.Pool {
    constructor(config) { super(config); pools.push(this); options.push(config); }
  };
  const wrapper = 'data:text/javascript,export const Pool = globalThis.__tobiRealPool;';
  const hook = registerHooks({ resolve(s,c,n) { return s === 'pg' ? { shortCircuit: true, url: wrapper } : n(s,c); } });
  console.error = (...args) => logs.push(args);
  try {
    let sequence = 0;
    for (const [cert, ca, expected] of [
      ['good', fixture.ca, null], ['good', fixture.other + fixture.ca, null],
      ['good', fixture.other, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
      ['wrong', fixture.ca, 'ERR_TLS_CERT_ALTNAME_INVALID'],
      ['good', undefined, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
    ]) {
      const server = await serverFor(fixture[cert], fixture[`${cert}Key`]);
      const deadline = setTimeout(() => { void server.close(); }, 8000);
      try {
        process.env.DATABASE_URL = `postgres://fixture:unique-fake-password@127.0.0.1:${server.port}/fixture?sslmode=disable`;
        if (ca === undefined) delete process.env.DATABASE_CA_CERT; else process.env.DATABASE_CA_CERT = ca;
        logs.length = 0;
        const { createPostgresTobiConfigRepository } = await import(`../lib/tobi-config-postgres.ts?real-tls=${sequence++}`);
        const repo = createPostgresTobiConfigRepository();
        if (expected === null) {
          assert.equal(await repo.readActive(), null);
          assert.equal(server.state.startups, 1);
          assert.equal(server.state.queries, 1);
          assert.equal(logs.length, 0);
        } else {
          await assert.rejects(repo.readActive(), e => e.message === 'TOBi configuration unavailable: PostgreSQL query failed.' && e.cause === undefined);
          assert.equal(JSON.stringify(logs) === JSON.stringify([['TOBi PostgreSQL failure', JSON.stringify({ phase:'query', code:expected, category:'tls' })]]), true);
          assert.equal(server.state.startups, 0);
          assert.equal(server.state.queries, 0);
        }
        const ssl = options.at(-1).ssl;
        assert.equal(ssl.rejectUnauthorized, true);
        assert.equal(Object.hasOwn(ssl, 'ca'), ca !== undefined);
        assert.equal(ssl.ca === ca, true);
        assert.equal(Object.hasOwn(ssl, 'checkServerIdentity'), false);
        assert.equal(Object.hasOwn(ssl, 'servername'), false);
      } finally {
        clearTimeout(deadline);
        await server.close();
        await Promise.all(pools.splice(0).map(pool => pool.end()));
      }
    }
  } finally {
    hook.deregister();
    await Promise.all(pools.splice(0).map(pool => pool.end()));
    delete globalThis.__tobiRealPool;
    process.env = prior;
    console.error = original;
    await fixture.cleanup();
  }
});
