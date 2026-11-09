import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isAllowedDocumentationLink } from "../lib/tobi-docs/link-policy.ts";
import { validateDocs } from "./validate-docs.mjs";

test("odkazy v dokumentaci povolí jen veřejné HTTPS cíle a bezpečné kotvy", () => {
  assert.equal(isAllowedDocumentationLink("#reg-001"), true);
  assert.equal(isAllowedDocumentationLink("https://www.vodafone.cz/pece/"), true);
  for (const value of [
    "https://user:secret@example.com/",
    "https://localhost/internal",
    "https://service.local/internal",
    "https://127.0.0.1/admin",
    "https://10.0.0.1/",
    "https://169.254.1.1/",
    "https://[::1]/",
    "https://[fd00::1]/",
    "https://[fe80::1]/",
    "https://[::ffff:127.0.0.1]/",
  ]) assert.equal(isAllowedDocumentationLink(value), false, value);
});

test("dokumentační zdroje mají platné vazby, evidenci a nejméně 20 regresí", async () => {
  const summary = await validateDocs();
  assert.ok(summary.features >= 10);
  assert.ok(summary.regressionCases >= 20);
  assert.ok(summary.testRuns >= 2);
});

test("route /doc zachová fail-closed autorizaci a načítá obsah až po ní", () => {
  const route = readFileSync(new URL("../app/doc/page.tsx", import.meta.url), "utf8");
  const authorization = route.indexOf("await isTobiAdminAuthorized(requestHeaders)");
  const contentImport = route.indexOf("await import(\"@/lib/tobi-docs/server-content\")");
  assert.ok(authorization >= 0);
  assert.ok(contentImport > authorization);
  assert.match(route, /if \(await isTobiAdminAuthorized\(requestHeaders\)\) \{/);
  assert.doesNotMatch(route, /localPreview|localhost|127\.0\.0\.1/);
  assert.match(route, /index:\s*false/);
  assert.match(route, /follow:\s*false/);
});

test("klientský portál neimportuje verzované zdroje ani nepoužívá raw HTML", () => {
  const portal = readFileSync(new URL("../components/tobi-docs/doc-portal.tsx", import.meta.url), "utf8");
  const markdown = readFileSync(new URL("../components/tobi-docs/doc-markdown.tsx", import.meta.url), "utf8");
  const diagram = readFileSync(new URL("../components/tobi-docs/doc-diagram.tsx", import.meta.url), "utf8");
  const clientSources = `${portal}\n${markdown}\n${diagram}`;
  assert.doesNotMatch(clientSources, /docs\/portal|server-content/);
  assert.doesNotMatch(clientSources, /dangerouslySetInnerHTML/);
});

const repository = "https://github.com/pacenda-creator/tobi.git";

async function provenanceFixture(t) {
  const { git, validateSourceProvenance } = await import("./docs-provenance.mjs");
  const { mkdtemp, mkdir, writeFile, rm, symlink, stat, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const temporary = await mkdtemp(join(tmpdir(), "docs-provenance-"));
  // Register before setup so failed init/config/commit also gets cleaned up.
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "repo");
  await mkdir(root);
  const run = (args) => git(args, root);
  await run(["init", "--object-format=sha1", "--initial-branch=fixture"]);
  assert.equal((await stat(join(root, ".git"))).isDirectory(), true);
  for (const [key, value] of [
    ["user.name", "Provenance Fixture"],
    ["user.email", "fixture@example.invalid"],
    ["commit.gpgSign", "false"],
    ["tag.gpgSign", "false"],
    ["core.autocrlf", "false"],
    ["core.hooksPath", join(temporary, "empty-hooks")],
    ["remote.origin.url", repository],
  ]) await run(["config", "--local", key, value]);
  await mkdir(join(temporary, "empty-hooks"));
  const path = "source.txt";
  const baseContent = Buffer.from("original text\n");
  const content = Buffer.from("changed text\n");
  const write = (path, bytes) => writeFile(join(root, path), bytes);
  const commit = async (message) => {
    await run(["add", "--all"]);
    await run(["commit", "-m", message]);
    return String(await run(["rev-parse", "HEAD"])).trim();
  };
  await write(path, baseContent);
  await write("unchanged.txt", "stable text\n");
  const base = await commit("base");
  await write(path, content);
  const modified = await commit("modify existing text");
  await write("added.txt", "new text\n");
  const head = await commit("only add files");
  assert.equal(String(await run(["rev-parse", "HEAD^"])).trim(), modified);
  assert.deepEqual(String(await run(["diff-tree", "--no-commit-id", "--name-status", "-r", modified, head])).trim().split("\n"), ["A\tadded.txt"]);
  assert.equal(String(await run(["status", "--porcelain"])), "");
  const actualBase = await run(["show", `${base}:${path}`]);
  const actualHead = await run(["show", `${head}:${path}`]);
  assert.deepEqual(actualBase, baseContent);
  assert.deepEqual(actualHead, content);
  assert.equal(actualHead.equals(actualBase), false);
  const digest = createHash("sha256").update(actualHead).digest("hex");
  assert.equal(createHash("sha256").update(await readFile(join(root, path))).digest("hex"), digest);
  const manifest = { sourceRevision: base, sourceRepositoryUrl: repository, sourceBaseUrl: `https://github.com/pacenda-creator/tobi/blob/${base}`, changedSources: { [path]: digest } };
  const validate = (value = manifest, paths = [path]) => validateSourceProvenance(value, paths, root);
  return { root, temporary, run, write, symlink, join, path, baseContent, content, digest, manifest, validate, validateSourceProvenance };
}

test("provenance kontroluje repo, origin, přesnou URL, cesty, označení a checksum", async (t) => {
  const { run, path, digest, manifest, validate } = await provenanceFixture(t);
  await assert.doesNotReject(() => validate());
  for (const [patch, pattern] of [
    [{ sourceRepositoryUrl: "https://github.com/other/repo.git" }, /repository\/origin/],
    [{ sourceBaseUrl: `${manifest.sourceBaseUrl}/tobi-prototype` }, /sourceBaseUrl/],
    [{ sourceBaseUrl: `${manifest.sourceBaseUrl}?fake=1` }, /sourceBaseUrl/],
    [{ changedSources: {} }, /checksum/],
    [{ changedSources: { [path]: "0".repeat(64) } }, /checksum/],
    [{ changedSources: { [path]: digest, "../outside": digest } }, /Nepoužitá/],
    [{ changedSources: { [path]: digest, "unchanged.txt": digest } }, /Nepoužitá/],
    [{ sourceRevision: "bad" }, /SHA/],
  ]) await assert.rejects(() => validate({ ...manifest, ...patch }), pattern);
  await assert.rejects(() => validate({ ...manifest, changedSources: {} }, ["../outside"]), /cesta/);
  await assert.rejects(() => validate({ ...manifest, changedSources: { "unchanged.txt": digest } }, ["unchanged.txt"]), /nesmí být označen/);
  await run(["config", "--local", "remote.origin.url", "https://github.com/other/repo.git"]);
  await assert.rejects(() => validate(), /repository\/origin/);
});

test("provenance odmítne neexistující commit i při správném formátu SHA", async (t) => {
  const { manifest, validate } = await provenanceFixture(t);
  const sourceRevision = "0".repeat(40);
  await assert.rejects(() => validate({
    ...manifest,
    sourceRevision,
    sourceBaseUrl: `https://github.com/pacenda-creator/tobi/blob/${sourceRevision}`,
  }), /commit neexistuje/);
});

test("provenance odmítne změněný obsah s nesprávným checksumem a přijme obnovený obsah", async (t) => {
  const { write, path, content, validate } = await provenanceFixture(t);
  await assert.doesNotReject(() => validate());
  await write(path, "tampered text\n");
  await assert.rejects(() => validate(), /checksum/);
  await write(path, content);
  await assert.doesNotReject(() => validate());
});

test("base funguje i při posledním pouze přidávajícím commitu a dirty stromu", async (t) => {
  const { root, temporary, run, write, symlink, join, path, baseContent, content, manifest, validate } = await provenanceFixture(t);
  await validate();
  await write("unrelated-dirty-file", "dirty");
  assert.notEqual(String(await run(["status", "--porcelain"])), "");
  await validate();
  await write(path, baseContent);
  await assert.rejects(() => validate(), /Publikovaný zdroj/);
  await write(path, content);
  await write("copy.txt", content);
  await assert.rejects(() => validate({ ...manifest, changedSources: {} }, ["copy.txt"]), /checksum/);
  const outside = join(temporary, "outside.txt");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outside, "outside fixture repository");
  await symlink(outside, join(root, "escape"));
  await assert.rejects(() => validate({ ...manifest, changedSources: {} }, ["escape"]), /opouští repository/);
});

test("provozní chyba Git není neexistující commit", async (t) => {
  const { root, manifest, validateSourceProvenance } = await provenanceFixture(t);
  for (const code of ["EPERM", "ENOENT"]) {
    await assert.rejects(() => validateSourceProvenance(manifest, [], root, async () => {
      throw Object.assign(new Error("runner failure"), { code, stdout: manifest.sourceRevision, status: 0 });
    }), (error) => error.code === "GIT_OPERATIONAL" && error.cause.code === code);
  }
});

test("provenance nehashuje vlastní manifest ani jeho metadata", async (t) => {
  const { manifest, validate } = await provenanceFixture(t);
  for (const path of ["docs/portal/manifest.json", "docs/portal/features.json", "docs/portal/regression-cases.json", "docs/portal/test-runs.json", "docs/portal/diagrams.json"]) {
    await assert.rejects(() => validate({ ...manifest, changedSources: {} }, [path]), /metadata/);
  }
});
