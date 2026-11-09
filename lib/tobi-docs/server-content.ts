import "server-only";

import architecture from "../../docs/portal/architecture.md?raw";
import diagramsJson from "../../docs/portal/diagrams.json";
import featuresJson from "../../docs/portal/features.json";
import manifestJson from "../../docs/portal/manifest.json";
import operations from "../../docs/portal/operations.md?raw";
import overview from "../../docs/portal/overview.md?raw";
import regressionCasesJson from "../../docs/portal/regression-cases.json";
import testRunsJson from "../../docs/portal/test-runs.json";
import {
  diagramSchema,
  docManifestSchema,
  featureSchema,
  regressionCaseSchema,
  testRunSchema,
  type RegressionCaseView,
  type TobiDocContent,
} from "@/lib/tobi-docs/schema";

function resultForCase(
  regressionCase: ReturnType<typeof regressionCaseSchema.parse>,
  testRuns: ReturnType<typeof testRunSchema.parse>[],
): RegressionCaseView {
  const run = [...testRuns].reverse().find((candidate) => candidate.caseIds.includes(regressionCase.id)) ?? null;
  return {
    ...regressionCase,
    lastResult: run?.result
      ?? (regressionCase.mode === "MANUAL" ? "MANUAL" : regressionCase.mode === "NOT_AUTOMATED" ? "NOT_AUTOMATED" : "NOT_RUN"),
    run,
  };
}

export function getTobiDocContent(): TobiDocContent {
  const testRuns = testRunSchema.array().parse(testRunsJson);
  const regressionCases = regressionCaseSchema.array().parse(regressionCasesJson);
  return {
    manifest: docManifestSchema.parse(manifestJson),
    overview,
    architecture,
    operations,
    features: featureSchema.array().parse(featuresJson),
    regressionCases: regressionCases.map((regressionCase) => resultForCase(regressionCase, testRuns)),
    testRuns,
    diagrams: diagramSchema.array().parse(diagramsJson),
  };
}
