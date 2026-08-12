# IMPLEMENTATION

Created **src/tools/formatBytes.ts** with a `formatBytes` function that:
- Handles non‑positive inputs returning `"0 B"`.
- Determines appropriate binary unit (B, KB, MB, …, YB).
- Formats the value with configurable decimal precision (default 2).
- Trims unnecessary trailing zeros and decimal points.
- Includes comprehensive JSDoc comments and examples.

## Changed Files

- src/tools/formatBytes.ts
