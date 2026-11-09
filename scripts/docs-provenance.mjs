import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const execute = promisify(execFile);
export async function git(args, root = process.cwd(), runner = execute) {
  try {
    return (await runner("git", args, { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch (cause) {
    throw Object.assign(new Error(`Git operational error: ${cause.code}: ${cause.message}`, { cause }), { code: "GIT_OPERATIONAL" });
  }
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repository = "https://github.com/pacenda-creator/tobi.git";
export async function validateSourceProvenance(manifest, paths, root = process.cwd(), runner = execute) {
  const run = (args) => git(args, root, runner);
  const base = manifest.sourceRevision;
  if (!/^[a-f0-9]{40}$/u.test(base ?? "")) throw new Error("sourceRevision: neplatný SHA");
  const origin = String(await run(["config", "--get", "remote.origin.url"])).trim();
  if (manifest.sourceRepositoryUrl !== repository || origin !== repository) throw new Error("Nesprávný repository/origin");
  if (manifest.sourceBaseUrl !== `https://github.com/pacenda-creator/tobi/blob/${base}`) throw new Error("Nepřesná sourceBaseUrl");
  // A successful batch query distinguishes a missing object from a failed process.
  const object = String(await run(["cat-file", "--batch-check", "--batch-all-objects"]));
  if (!object.split("\n").some((line) => line.startsWith(`${base} commit `))) throw new Error("sourceRevision: commit neexistuje");
  try { await run(["merge-base", "--is-ancestor", base, "HEAD"]); }
  catch (error) {
    if (error.cause?.code === 1) throw new Error("sourceRevision: commit není předek HEAD");
    throw error;
  }
  const changed = manifest.changedSources ?? {};
  for (const path of Object.keys(changed)) if (!paths.includes(path)) throw new Error(`Nepoužitá změněná reference ${path}`);
  const actualRoot = await realpath(root);
  for (const path of paths) {
    if (/^docs\/portal\/(?:manifest|features|regression-cases|test-runs|diagrams)\.json$/u.test(path)) throw new Error(`Provenance metadata nejsou hashovaný zdroj: ${path}`);
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(path) || path.split("/").some((part) => part === "." || part === "..")) throw new Error(`Neplatná cesta ${path}`);
    const target = await realpath(resolve(root, path));
    if (!target.startsWith(`${actualRoot}${sep}`)) throw new Error(`Cesta opouští repository ${path}`);
    const content = await readFile(target);
    const entry = String(await run(["ls-tree", base, "--", path]));
    let same = false;
    if (entry) {
      const match = /^100[0-7]{3} blob ([a-f0-9]{40})\t/u.exec(entry);
      if (!match) throw new Error(`Zdroj není běžný soubor ${path}`);
      same = content.equals(await run(["cat-file", "blob", match[1]]));
    }
    if (same && Object.hasOwn(changed, path)) throw new Error(`Publikovaný zdroj nesmí být označen jako změněný: ${path}`);
    if (!same && (!/^[a-f0-9]{64}$/u.test(changed[path] ?? "") || changed[path] !== hash(content))) throw new Error(`Chybí nebo nesouhlasí checksum změněného zdroje ${path}`);
  }
}
