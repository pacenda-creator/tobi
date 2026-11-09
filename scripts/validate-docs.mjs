import { existsSync, readFileSync, readdirSync } from "node:fs";
import { validateSourceProvenance } from "./docs-provenance.mjs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  diagramSchema,
  docManifestSchema,
  featureSchema,
  regressionCaseSchema,
  testRunSchema,
} from "../lib/tobi-docs/schema.ts";
import { isAllowedDocumentationLink } from "../lib/tobi-docs/link-policy.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portalRoot = join(projectRoot, "docs", "portal");

function readJson(name) {
  return JSON.parse(readFileSync(join(portalRoot, name), "utf8"));
}

function sourcePath(reference) {
  return reference.replace(/:\d+$/, "");
}

function validateRepositoryReference(reference, label, errors) {
  const relativePath = sourcePath(reference);
  const target = resolve(projectRoot, relativePath);
  const insideRepository = target === projectRoot || target.startsWith(`${projectRoot}${sep}`);
  if (!insideRepository || relative(projectRoot, target).startsWith("..")) {
    errors.push(`${label}: cesta opouští repository ${reference}`);
    return null;
  }
  if (!existsSync(target)) {
    errors.push(`${label}: chybí zdroj ${reference}`);
    return null;
  }
  const lineMatch = /:(\d+)$/.exec(reference);
  if (lineMatch) {
    const requestedLine = Number(lineMatch[1]);
    const lineCount = readFileSync(target, "utf8").split(/\r?\n/u).length;
    if (requestedLine < 1 || requestedLine > lineCount) errors.push(`${label}: řádek ${requestedLine} neexistuje v ${relativePath}`);
  }
  return target;
}

function uniqueIds(items, label, errors) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) errors.push(`${label}: duplicitní ID ${item.id}`);
    seen.add(item.id);
  }
}

export async function validateDocs() {
  const errors = [];
  const markdownFiles = readdirSync(portalRoot, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".md"));
  const manifest = docManifestSchema.parse(readJson("manifest.json"));
  const features = featureSchema.array().parse(readJson("features.json"));
  const regressionCases = regressionCaseSchema.array().parse(readJson("regression-cases.json"));
  const testRuns = testRunSchema.array().parse(readJson("test-runs.json"));
  const diagrams = diagramSchema.array().parse(readJson("diagrams.json"));

  if (!manifest.documentationReviewedAt || !manifest.reviewedSourceRevision || !manifest.lastVerifiedTestRunAt || !manifest.testedRevision) {
    errors.push("manifest.json: chybí oddělená revize dokumentace nebo testů");
  }
  if (regressionCases.length < 20) errors.push("Katalog musí obsahovat alespoň 20 regresních případů.");
  uniqueIds(features, "features.json", errors);
  uniqueIds(regressionCases, "regression-cases.json", errors);
  uniqueIds(testRuns, "test-runs.json", errors);
  uniqueIds(diagrams, "diagrams.json", errors);
  for (const diagram of diagrams) {
    const nodes = new Set(diagram.nodes);
    for (const connection of diagram.connections) {
      if (!nodes.has(connection.from)) errors.push(`${diagram.id}: vazba začíná na neexistujícím uzlu ${connection.from}`);
      if (!nodes.has(connection.to)) errors.push(`${diagram.id}: vazba končí na neexistujícím uzlu ${connection.to}`);
    }
  }

  const caseIds = new Set(regressionCases.map((item) => item.id));
  const allowedFeatureStatuses = new Set(["IMPLEMENTED", "DEMO", "PARTIAL", "PLANNED", "UNVERIFIED"]);
  const allowedModes = new Set(["AUTOMATED", "MANUAL", "NOT_AUTOMATED"]);
  for (const feature of features) {
    if (!/^FEAT-\d{3}$/.test(feature.id) || !allowedFeatureStatuses.has(feature.status)) errors.push(`${feature.id}: neplatné ID nebo stav`);
    for (const id of feature.testCaseIds ?? []) if (!caseIds.has(id)) errors.push(`${feature.id}: neexistující regresní případ ${id}`);
    for (const reference of feature.sourceRefs ?? []) validateRepositoryReference(reference, feature.id, errors);
  }

  for (const regressionCase of regressionCases) {
    if (!/^REG-\d{3}$/.test(regressionCase.id) || !allowedModes.has(regressionCase.mode)) errors.push(`${regressionCase.id}: neplatné ID nebo režim`);
    for (const reference of regressionCase.implementationRefs ?? []) validateRepositoryReference(reference, regressionCase.id, errors);
    if (regressionCase.mode === "AUTOMATED") {
      if (!regressionCase.automation) errors.push(`${regressionCase.id}: automatizovaný případ nemá automation`);
      else {
        const testFile = validateRepositoryReference(regressionCase.automation.file, regressionCase.id, errors);
        if (testFile && !readFileSync(testFile, "utf8").includes(regressionCase.automation.testName)) errors.push(`${regressionCase.id}: test neobsahuje přesný název „${regressionCase.automation.testName}“`);
      }
    } else if (regressionCase.automation) errors.push(`${regressionCase.id}: neautomatizovaný případ obsahuje automation`);
  }

  const referencedSourcePaths = new Set([
    ...features.flatMap((feature) => feature.sourceRefs),
    ...regressionCases.flatMap((regressionCase) => [
      ...regressionCase.implementationRefs,
      ...(regressionCase.automation ? [regressionCase.automation.file] : []),
    ]),
    ...testRuns.map((run) => run.evidence),
  ].map(sourcePath));
  await validateSourceProvenance(manifest, [...referencedSourcePaths], projectRoot);

  for (const run of testRuns) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(run.executedAt) || !run.testedRevision || !run.command || !run.evidence) errors.push(`${run.id}: PASS/FAIL nemá úplnou evidenci`);
    if (!new Set(["PASS", "FAIL"]).has(run.result)) errors.push(`${run.id}: neplatný výsledek`);
    validateRepositoryReference(run.evidence, run.id, errors);
    if (run.releaseEvidence && !/^[a-f0-9]{40}$/u.test(run.testedRevision)) errors.push(`${run.id}: release evidence musí být navázaná na immutable SHA`);
    if (!run.releaseEvidence && !/pracovní strom|working tree/iu.test(run.testedRevision)) errors.push(`${run.id}: lokální evidence musí výslovně uvést pracovní strom`);
    for (const id of run.caseIds ?? []) {
      const regressionCase = regressionCases.find((item) => item.id === id);
      if (!regressionCase) errors.push(`${run.id}: neexistující regresní případ ${id}`);
      else if (regressionCase.mode !== "AUTOMATED") errors.push(`${run.id}: výsledek běhu je navázán na neautomatizovaný případ ${id}`);
    }
  }

  const allText = [JSON.stringify({ manifest, features, regressionCases, testRuns, diagrams }), ...markdownFiles.map((name) => readFileSync(join(portalRoot, name), "utf8"))].join("\n");
  if (/<\/?[a-z][^>]*>/iu.test(allText)) errors.push("Dokumentace obsahuje raw HTML.");
  if (/\b(?:javascript|data):/iu.test(allText)) errors.push("Dokumentace obsahuje zakázané URL schéma.");
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/u.test(allText)) errors.push("Dokumentace může obsahovat hodnotu secretu.");
  const markdownLinks = [...allText.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of markdownLinks) if (!isAllowedDocumentationLink(link)) errors.push(`Zakázaný odkaz ${link}`);

  if (errors.length) throw new Error(`Validace dokumentace selhala:\n- ${errors.join("\n- ")}`);
  return { features: features.length, regressionCases: regressionCases.length, testRuns: testRuns.length, diagrams: diagrams.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const summary = await validateDocs();
    console.log(`DOCS VALID: ${summary.features} funkcí, ${summary.regressionCases} regresí, ${summary.testRuns} doložené běhy, ${summary.diagrams} diagramy.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
