import { git } from "./docs-provenance.mjs";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_CHECKS = ["clean-checkout", "install", "lint", "typecheck", "regression", "build"];

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireCommitBoundRecord(errors, label, record, commit, allowedStatuses, statusField = "status") {
  if (!record || typeof record !== "object") {
    errors.push(`${label} is missing.`);
    return;
  }
  const conflictingField = statusField === "status" ? "decision" : "status";
  if (Object.hasOwn(record, conflictingField)) {
    errors.push(`${label} must use ${statusField} only; ${conflictingField} is not allowed.`);
  }
  if (!allowedStatuses.includes(record[statusField])) {
    errors.push(`${label} must be ${allowedStatuses.join(" or ")}.`);
  }
  if (record.commit !== commit) errors.push(`${label} is not bound to candidate commit ${commit}.`);
  if (!isIsoDate(record.completedAt)) errors.push(`${label}.completedAt must be an ISO date.`);
  if (typeof record.actor !== "string" || record.actor.trim() === "") {
    errors.push(`${label}.actor must identify the human, agent or CI identity.`);
  }
  if (typeof record.evidence !== "string" || record.evidence.trim() === "") {
    errors.push(`${label}.evidence must identify traceable evidence.`);
  }
}

export function validateStagingRelease(manifest, { expectedCommit } = {}) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["Manifest must be a JSON object."];
  }
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  if (manifest.environment !== "staging") errors.push("environment must be staging.");
  if (!SHA_PATTERN.test(manifest.commit ?? "")) errors.push("commit must be a lowercase 40-character Git SHA.");

  const commit = manifest.commit;
  if (expectedCommit && commit !== expectedCommit) {
    errors.push(`Manifest commit ${commit} does not match expected commit ${expectedCommit}.`);
  }
  if (!isIsoDate(manifest.candidateCreatedAt)) errors.push("candidateCreatedAt must be an ISO date.");

  requireCommitBoundRecord(errors, "developer", manifest.developer, commit, ["READY"]);

  if (!Array.isArray(manifest.checks)) {
    errors.push("checks must be an array.");
  } else {
    for (const name of REQUIRED_CHECKS) {
      const matches = manifest.checks.filter((check) => check?.name === name);
      if (matches.length !== 1) {
        errors.push(`Exactly one ${name} check is required.`);
        continue;
      }
      const check = matches[0];
      requireCommitBoundRecord(errors, `checks.${name}`, check, commit, ["PASS"]);
      if (typeof check.command !== "string" || check.command.trim() === "") {
        errors.push(`checks.${name}.command is required.`);
      }
    }
  }

  for (const reviewName of ["architecture", "ux"]) {
    const review = manifest.reviews?.[reviewName];
    if (!review || typeof review !== "object") {
      errors.push(`reviews.${reviewName} is missing.`);
      continue;
    }
    if (typeof review.required !== "boolean") errors.push(`reviews.${reviewName}.required must be boolean.`);
    const allowedStatus = review.required ? ["COMPLETE"] : ["NOT_REQUIRED"];
    requireCommitBoundRecord(errors, `reviews.${reviewName}`, review, commit, allowedStatus);
  }

  requireCommitBoundRecord(errors, "documentation", manifest.documentation, commit, ["READY"]);
  requireCommitBoundRecord(errors, "qa", manifest.qa, commit, ["GO"], "decision");

  if (!Number.isInteger(manifest.openCriticalDefects) || manifest.openCriticalDefects !== 0) {
    errors.push("openCriticalDefects must be the integer 0.");
  }
  const deployment = manifest.deploymentPrerequisites;
  if (!deployment || typeof deployment !== "object") {
    errors.push("deploymentPrerequisites is missing.");
  } else {
    if (deployment.status !== "VERIFIED") errors.push("deploymentPrerequisites.status must be VERIFIED.");
    if (deployment.target !== "staging") errors.push("deploymentPrerequisites.target must be staging.");
    if (typeof deployment.url !== "string" || !deployment.url.startsWith("https://")) {
      errors.push("deploymentPrerequisites.url must be an HTTPS staging URL.");
    }
    for (const field of ["mechanism", "ciIdentity", "rollback", "smokeAuth", "evidence"]) {
      if (typeof deployment[field] !== "string" || deployment[field].trim() === "") {
        errors.push(`deploymentPrerequisites.${field} is required.`);
      }
    }
    if (!isIsoDate(deployment.verifiedAt)) {
      errors.push("deploymentPrerequisites.verifiedAt must be an ISO date.");
    }
  }
  if (manifest.productionApproval !== undefined) {
    errors.push("A staging manifest must not contain or reuse productionApproval.");
  }

  return errors;
}

export async function currentCommit() {
  return String(await git(["rev-parse", "HEAD"])).trim().toLowerCase();
}

export async function workingTreeIsClean() {
  return String(await git(["status", "--porcelain", "--untracked-files=all"])).trim() === "";
}

async function runCli() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: npm run release:validate -- <manifest.json>");
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`Cannot read staging manifest: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let expectedCommit;
  try {
    expectedCommit = await currentCommit();
  } catch (error) {
    console.error(`Cannot resolve current Git commit: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const errors = validateStagingRelease(manifest, { expectedCommit });
  try {
    if (!await workingTreeIsClean()) errors.push("Working tree must be clean; commit every candidate file before release validation.");
  } catch (error) {
    errors.push(`Cannot verify clean working tree: ${error.message}`);
  }
  if (errors.length > 0) {
    console.error("STAGING GATE: BLOCKED");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`STAGING GATE: READY_TO_DEPLOY ${manifest.commit}`);
  console.log("This validates release evidence and deployment prerequisites only; it does not perform deployment.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await runCli();
