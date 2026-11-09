import { z } from "zod";

import { isAllowedDocumentationLink } from "./link-policy.ts";

export const documentationStatusSchema = z.enum([
  "IMPLEMENTED",
  "DEMO",
  "PARTIAL",
  "PLANNED",
  "UNVERIFIED",
]);

export const testModeSchema = z.enum(["AUTOMATED", "MANUAL", "NOT_AUTOMATED"]);
export const testResultSchema = z.enum(["PASS", "FAIL", "NOT_RUN", "MANUAL", "NOT_AUTOMATED"]);

const sourceReferenceSchema = z.string()
  .regex(/^[A-Za-z0-9_./-]+(?::\d+)?$/)
  .refine((value) => !value.split(":", 1)[0].split("/").includes(".."), "Cesta nesmí opustit repository.");

export const docManifestSchema = z.object({
  documentationReviewedAt: z.string().min(1),
  reviewedSourceRevision: z.string().min(1),
  lastVerifiedTestRunAt: z.string().min(1),
  testedRevision: z.string().min(1),
  scopeNote: z.string().min(1),
  sourceRepositoryUrl: z.string().refine(isAllowedDocumentationLink, "Zdrojový repozitář musí používat veřejnou HTTPS adresu."),
  sourceBaseUrl: z.string().refine(isAllowedDocumentationLink, "Zdrojový repozitář musí používat veřejnou HTTPS adresu."),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  changedSources: z.record(sourceReferenceSchema, z.string().regex(/^[a-f0-9]{64}$/u)),
}).strict();

export const featureSchema = z.object({
  id: z.string().regex(/^FEAT-\d{3}$/),
  name: z.string().min(1),
  scenario: z.string().min(1),
  behavior: z.string().min(1),
  entryPoints: z.array(z.string().min(1)).min(1),
  dependencies: z.array(z.string().min(1)),
  status: documentationStatusSchema,
  configRefs: z.array(z.string().min(1)),
  sourceRefs: z.array(sourceReferenceSchema).min(1),
  testCaseIds: z.array(z.string().regex(/^REG-\d{3}$/)),
  evidenceNotes: z.string().min(1).optional(),
}).strict();

export const regressionCaseSchema = z.object({
  id: z.string().regex(/^REG-\d{3}$/),
  title: z.string().min(1),
  category: z.string().min(1),
  priority: z.enum(["P0", "P1", "P2"]),
  preconditions: z.array(z.string().min(1)),
  steps: z.array(z.string().min(1)).min(1),
  expected: z.array(z.string().min(1)).min(1),
  mode: testModeSchema,
  implementationRefs: z.array(sourceReferenceSchema).min(1),
  automation: z.object({
    file: sourceReferenceSchema,
    testName: z.string().min(1),
    command: z.string().min(1),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "AUTOMATED" && !value.automation) {
    context.addIssue({ code: "custom", message: "Automatizovaný případ musí mít vazbu na test." });
  }
  if (value.mode !== "AUTOMATED" && value.automation) {
    context.addIssue({ code: "custom", message: "Neautomatizovaný případ nesmí tvrdit automatizaci." });
  }
});

export const testRunSchema = z.object({
  id: z.string().regex(/^RUN-[A-Z0-9-]+$/),
  executedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  testedRevision: z.string().min(1),
  environment: z.string().min(1),
  command: z.string().min(1),
  result: z.enum(["PASS", "FAIL"]),
  summary: z.string().min(1),
  evidence: sourceReferenceSchema,
  releaseEvidence: z.boolean(),
  caseIds: z.array(z.string().regex(/^REG-\d{3}$/)).min(1),
}).strict();

export const diagramSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  nodes: z.array(z.string().min(1)).min(2),
  connections: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1).optional(),
  }).strict()).min(1),
  textAlternative: z.string().min(1),
}).strict();

export type DocManifest = z.infer<typeof docManifestSchema>;
export type DocFeature = z.infer<typeof featureSchema>;
export type RegressionCase = z.infer<typeof regressionCaseSchema>;
export type TestRun = z.infer<typeof testRunSchema>;
export type DocDiagram = z.infer<typeof diagramSchema>;
export type DocumentationStatus = z.infer<typeof documentationStatusSchema>;
export type TestMode = z.infer<typeof testModeSchema>;
export type TestResult = z.infer<typeof testResultSchema>;

export type RegressionCaseView = RegressionCase & {
  lastResult: TestResult;
  run: TestRun | null;
};

export type TobiDocContent = {
  manifest: DocManifest;
  overview: string;
  architecture: string;
  operations: string;
  features: DocFeature[];
  regressionCases: RegressionCaseView[];
  testRuns: TestRun[];
  diagrams: DocDiagram[];
};
