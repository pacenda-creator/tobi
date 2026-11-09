import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_CHECKS, validateStagingRelease } from "./validate-staging-release.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const AT = "2026-11-07T18:00:00.000Z";

function evidence(status, extra = {}) {
  return { status, commit: SHA, completedAt: AT, actor: "test-runner", evidence: "artifact://test", ...extra };
}

function validManifest() {
  return {
    schemaVersion: 1,
    environment: "staging",
    commit: SHA,
    candidateCreatedAt: AT,
    developer: evidence("READY"),
    checks: REQUIRED_CHECKS.map((name) => evidence("PASS", { name, command: `npm run ${name}` })),
    reviews: {
      architecture: { required: false, ...evidence("NOT_REQUIRED") },
      ux: { required: true, ...evidence("COMPLETE") },
    },
    documentation: evidence("READY"),
    qa: { decision: "GO", commit: SHA, completedAt: AT, actor: "tobi_qa", evidence: "artifact://qa" },
    openCriticalDefects: 0,
    deploymentPrerequisites: {
      status: "VERIFIED",
      target: "staging",
      url: "https://staging.example.test",
      mechanism: "verified-test-adapter",
      ciIdentity: "ci:test",
      rollback: "artifact://rollback-procedure",
      smokeAuth: "vault://staging-smoke-identity",
      verifiedAt: AT,
      evidence: "artifact://deployment-prerequisites",
    },
  };
}

test("accepts a complete staging gate bound to one commit", () => {
  assert.deepEqual(validateStagingRelease(validManifest(), { expectedCommit: SHA }), []);
});

test("rejects an approval copied from another commit", () => {
  const manifest = validManifest();
  manifest.qa.commit = "fedcba9876543210fedcba9876543210fedcba98";
  assert.match(validateStagingRelease(manifest, { expectedCommit: SHA }).join("\n"), /qa is not bound/);
});

test("rejects a missing required automated check", () => {
  const manifest = validManifest();
  manifest.checks = manifest.checks.filter((check) => check.name !== "build");
  assert.match(validateStagingRelease(manifest).join("\n"), /Exactly one build check/);
});

test("rejects QA NO-GO, documentation NOT READY and critical defects", () => {
  const manifest = validManifest();
  manifest.qa.decision = "NO-GO";
  manifest.documentation.status = "NOT_READY";
  manifest.openCriticalDefects = 1;
  const errors = validateStagingRelease(manifest).join("\n");
  assert.match(errors, /qa must be GO/);
  assert.match(errors, /documentation must be READY/);
  assert.match(errors, /openCriticalDefects must be the integer 0/);
});

test("rejects conflicting QA status that attempts to hide NO-GO", () => {
  const manifest = validManifest();
  manifest.qa.status = "GO";
  manifest.qa.decision = "NO-GO";
  const errors = validateStagingRelease(manifest).join("\n");
  assert.match(errors, /qa must use decision only; status is not allowed/);
  assert.match(errors, /qa must be GO/);
});

test("rejects production approval data in a staging manifest", () => {
  const manifest = validManifest();
  manifest.productionApproval = { status: "APPROVED" };
  assert.match(validateStagingRelease(manifest).join("\n"), /must not contain or reuse productionApproval/);
});

test("rejects unverified deployment prerequisites", () => {
  const manifest = validManifest();
  manifest.deploymentPrerequisites.status = "BLOCKED";
  manifest.deploymentPrerequisites.rollback = "";
  const errors = validateStagingRelease(manifest).join("\n");
  assert.match(errors, /deploymentPrerequisites.status must be VERIFIED/);
  assert.match(errors, /deploymentPrerequisites.rollback is required/);
});

test("release Git kontroly odpovídají aktuálnímu HEAD a stavu pracovního stromu", async () => {
  const { currentCommit, workingTreeIsClean } = await import("./validate-staging-release.mjs");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execute = promisify(execFile);
  const options = { cwd: process.cwd(), encoding: "buffer", maxBuffer: 16 * 1024 * 1024 };
  const [head, status] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], options),
    execute("git", ["status", "--porcelain", "--untracked-files=all"], options),
  ]);
  assert.equal(await currentCommit(), String(head.stdout).trim().toLowerCase());
  assert.equal(await workingTreeIsClean(), String(status.stdout).trim() === "");
});
