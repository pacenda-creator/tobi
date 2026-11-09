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
  const authorization = route.indexOf("isTobiAdminAuthorized(requestHeaders)");
  const contentImport = route.indexOf("await import(\"@/lib/tobi-docs/server-content\")");
  assert.ok(authorization >= 0);
  assert.ok(contentImport > authorization);
  assert.match(route, /if \(isTobiAdminAuthorized\(requestHeaders\)\) \{/);
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

test("provenance odmítne neexistující commit i při správném formátu SHA", async () => {
  const { validateSourceProvenance } = await import("./docs-provenance.mjs");
  const manifest = JSON.parse(readFileSync(new URL("../docs/portal/manifest.json", import.meta.url)));
  await assert.rejects(() => validateSourceProvenance({ ...manifest, sourceRevision: "0".repeat(40), sourceBaseUrl: `https://github.com/pacenda-creator/tobi/blob/${"0".repeat(40)}` }, []), /commit/);
});

test("provenance kontroluje repo, přesnou URL, cesty, označení a obsah proti base", async () => {
  const { validateSourceProvenance } = await import("./docs-provenance.mjs");
  const { createHash } = await import("node:crypto");
  const base = "91d4f6d57b547c34ca38ce8afca10652ea83141b";
  const path = "app/doc/page.tsx";
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  const manifest = { sourceRevision: base, sourceRepositoryUrl: "https://github.com/pacenda-creator/tobi.git", sourceBaseUrl: `https://github.com/pacenda-creator/tobi/blob/${base}`, changedSources: { [path]: digest } };
  await assert.doesNotReject(() => validateSourceProvenance(manifest, [path]));
  for (const patch of [
    { sourceRepositoryUrl: "https://github.com/other/repo.git" },
    { sourceBaseUrl: `${manifest.sourceBaseUrl}/tobi-prototype` },
    { sourceBaseUrl: `${manifest.sourceBaseUrl}?fake=1` },
    { changedSources: {} },
    { changedSources: { [path]: "0".repeat(64) } },
    { changedSources: { [path]: digest, "../outside": digest } },
    { changedSources: { [path]: digest, "README.md": digest } },
  ]) await assert.rejects(() => validateSourceProvenance({ ...manifest, ...patch }, [path]));
});

test("provozní chyba Git není neexistující commit", async () => {
  const { validateSourceProvenance } = await import("./docs-provenance.mjs");
  const manifest = JSON.parse(readFileSync("docs/portal/manifest.json"));
  for (const code of ["EPERM", "ENOENT"]) {
    await assert.rejects(() => validateSourceProvenance(manifest, [], process.cwd(), async () => {
      throw Object.assign(new Error("runner failure"), { code, stdout: "91d4f6d57b547c34ca38ce8afca10652ea83141b", status: 0 });
    }), (error) => error.code === "GIT_OPERATIONAL" && error.cause.code === code);
  }
});

async function selectModifiedTextSource(run, base, head) {
  const paths = String(await run(["diff-tree", "--no-commit-id", "--name-only", "--diff-filter=M", "-z", "-r", base, head])).split("\0").filter(Boolean);
  for (const path of paths) {
    const entries = await Promise.all([base, head].map((revision) => run(["ls-tree", "-z", revision, "--", path])));
    if (!entries.every((entry) => /^100(?:644|755) blob [a-f0-9]{40}\t[^\0]+\0$/u.test(String(entry)))) continue;
    const [baseContent, content] = await Promise.all([run(["show", `${base}:${path}`]), run(["show", `${head}:${path}`])]);
    const isText = (bytes) => !bytes.includes(0) && Buffer.from(bytes.toString("utf8")).equals(bytes);
    if (isText(baseContent) && isText(content) && !content.equals(baseContent)) return { path, content, baseContent };
  }
  throw new Error("Historie neobsahuje změněný běžný textový soubor v obou revizích");
}

test("výběr historické změny přeskočí added-file-first a neobyčejné nebo binární soubory", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "diff-tree") return Buffer.from(args.includes("--diff-filter=M") ? "link\0binary.txt\0modified.txt\0" : ".env.example\nlink\nbinary.txt\nmodified.txt\n");
    if (args[0] === "ls-tree") {
      const path = args.at(-1);
      return Buffer.from(`${path === "link" ? "120000" : "100644"} blob ${"a".repeat(40)}\t${path}\0`);
    }
    if (args[0] === "show" && args[1].endsWith(":binary.txt")) return Buffer.from([0, 1]);
    if (args[0] === "show" && args[1].endsWith(":modified.txt")) return Buffer.from(args[1].startsWith("base:") ? "before" : "after");
    throw new Error(`Unexpected Git call: ${JSON.stringify(args)}`);
  };
  const selected = await selectModifiedTextSource(run, "base", "head");
  assert.equal(selected.path, "modified.txt");
  assert.equal(selected.content.equals(selected.baseContent), false);
  for (const revision of ["base", "head"]) assert.ok(calls.some((args) => args[0] === "ls-tree" && args.includes(revision) && args.at(-1) === "modified.txt"));
  assert.ok(calls.some((args) => args[0] === "diff-tree" && args.includes("--diff-filter=M")));
});

test("base funguje nad existující historií nezávisle na dirty statusu", async () => {
  const { git, validateSourceProvenance } = await import("./docs-provenance.mjs");
  const { mkdtemp, mkdir, writeFile, rm, symlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const base = String(await git(["rev-parse", "HEAD^"])).trim();
  const { path, content, baseContent } = await selectModifiedTextSource(git, base, "HEAD");
  const { createHash } = await import("node:crypto");
  const manifest = { sourceRevision: base, sourceRepositoryUrl: "https://github.com/pacenda-creator/tobi.git", sourceBaseUrl: `https://github.com/pacenda-creator/tobi/blob/${base}`, changedSources: content.equals(baseContent) ? {} : { [path]: createHash("sha256").update(content).digest("hex") } };
  const root = await mkdtemp(join(tmpdir(), "docs-provenance-"));
  try {
    // Reuse real existing objects and HEAD; no new commits, refs or index writes.
    await writeFile(join(root, ".git"), `gitdir: ${process.cwd()}/.git\n`);
    await mkdir(join(root, path).slice(0, join(root, path).lastIndexOf("/")), { recursive: true });
    await writeFile(join(root, path), content);
    assert.equal(content.equals(baseContent), false, "Skutečná commitnutá změna vůči předkovi");
    await validateSourceProvenance(manifest, [path], root);
    await writeFile(join(root, "unrelated-dirty-file"), "dirty");
    await validateSourceProvenance(manifest, [path], root);
    await assert.rejects(() => validateSourceProvenance({ ...manifest, sourceRevision: "bad" }, [path], root), /SHA/);
    await assert.rejects(() => validateSourceProvenance({ ...manifest, changedSources: {} }, ["../README.md"], root), /cesta/);
    await assert.rejects(() => validateSourceProvenance({ ...manifest, changedSources: { [path]: "0".repeat(64) } }, [path], root));
    await writeFile(join(root, path), baseContent);
    await assert.rejects(() => validateSourceProvenance(manifest, [path], root), /Publikovaný zdroj/);
    await symlink(`${process.cwd()}/README.md`, join(root, "escape"));
    await assert.rejects(() => validateSourceProvenance({ ...manifest, changedSources: {} }, ["escape"], root), /opouští repository/);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "copy"), content);
    await assert.rejects(() => validateSourceProvenance({ ...manifest, changedSources: {} }, ["nested/copy"], root), /checksum/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("provenance nehashuje vlastní manifest ani jeho metadata", async () => {
  const { validateSourceProvenance } = await import("./docs-provenance.mjs");
  const manifest = JSON.parse(readFileSync("docs/portal/manifest.json"));
  for (const path of ["docs/portal/manifest.json", "docs/portal/features.json", "docs/portal/regression-cases.json", "docs/portal/test-runs.json", "docs/portal/diagrams.json"]) {
    await assert.rejects(() => validateSourceProvenance({ ...manifest, changedSources: {} }, [path]), /metadata/);
  }
});
