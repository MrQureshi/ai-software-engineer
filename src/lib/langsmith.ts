/**
 * Mirrors @langchain/core's own tracing-enabled check
 * (dist/utils/callbacks.js, isTracingEnabled) rather than importing it
 * directly — that file isn't part of the package's public export map,
 * so importing it would reach into an unexported internal path.
 */
const TRACING_ENV_VARS = [
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING_V2",
  "LANGSMITH_TRACING",
  "LANGCHAIN_TRACING",
];

export function isTracingEnabled(): boolean {
  return TRACING_ENV_VARS.some((name) => process.env[name] === "true");
}

export function getTracingProject(): string {
  return process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || "default";
}
