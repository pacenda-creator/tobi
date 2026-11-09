// Do not read or print connection values. No fake credentials.
import { spawn } from 'node:child_process';
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(?:DATABASE_URL|POSTGRES_|SUPABASE_)/.test(key)) delete env[key];
}
delete env.TOBI_IN_MEMORY_CONFIG;
const child = spawn('npm', ['run', 'build'], { env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.code); process.exitCode = 1; });
child.on('close', (code) => { process.exitCode = code ?? 1; });
