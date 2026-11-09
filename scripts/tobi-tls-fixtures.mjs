import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
export async function fixtures() {
  const dir = await mkdtemp(join(tmpdir(), 'tobi-tls-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const run = async args => {
      try { await exec('openssl', args, { cwd: dir, timeout: 15000 }); }
      catch { throw new Error('OpenSSL fixture generation failed'); }
    };
    for (const ca of ['ca', 'other']) await run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${ca}.key`,'-out',`${ca}.pem`,'-days','1','-subj',`/CN=${ca}`]);
    for (const [name, san] of [['good','IP:127.0.0.1'],['wrong','DNS:wrong.invalid']]) {
      await run(['req','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj','/CN=fixture']);
      await writeFile(join(dir, 'ext'), `subjectAltName=${san}\nextendedKeyUsage=serverAuth\n`);
      await run(['x509','-req','-in',`${name}.csr`,'-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',`${name}.pem`,'-days','1','-extfile','ext']);
    }
    const result = { cleanup };
    for (const name of ['ca','other','good','wrong']) {
      result[name] = await readFile(join(dir, `${name}.pem`), 'utf8');
      if (name === 'good' || name === 'wrong') result[`${name}Key`] = await readFile(join(dir, `${name}.key`));
    }
    return result;
  } catch (error) { await cleanup(); throw error; }
}
