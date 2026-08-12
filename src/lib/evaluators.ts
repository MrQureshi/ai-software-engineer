import type { EvaluationResult } from "langsmith/evaluation";

/**
 * Only the slice of langsmith's evaluator args each function below
 * actually needs — grading structural properties of the graph's final
 * state, not the request/reference/run metadata evaluate() also passes.
 */
interface EvalArgs {
  outputs: Record<string, unknown>;
}

export function hasPlanEvaluator({ outputs }: EvalArgs): EvaluationResult {
  const plan = outputs.plan;
  const passed = Array.isArray(plan) && plan.length > 0;

  return {
    key: "has_plan",
    score: passed ? 1 : 0,
    comment: passed
      ? `Plan has ${(plan as unknown[]).length} step(s).`
      : "No plan was produced.",
  };
}

export function changedFilesEvaluator({ outputs }: EvalArgs): EvaluationResult {
  const changedFiles = outputs.changedFiles;
  const passed = Array.isArray(changedFiles) && changedFiles.length > 0;

  return {
    key: "changed_files",
    score: passed ? 1 : 0,
    comment: passed
      ? `Changed ${(changedFiles as unknown[]).length} file(s): ${(changedFiles as string[]).join(", ")}`
      : "No files were changed.",
  };
}

export function testerRanEvaluator({ outputs }: EvalArgs): EvaluationResult {
  const testReport = outputs.testReport;
  const passed = typeof testReport === "string" && testReport.trim().length > 0;

  return {
    key: "tester_ran",
    score: passed ? 1 : 0,
    comment: passed ? "Tester produced a report." : "Tester never ran (no testReport).",
  };
}

export const evaluators = [hasPlanEvaluator, changedFilesEvaluator, testerRanEvaluator];
