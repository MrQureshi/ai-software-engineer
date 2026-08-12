# IMPLEMENTATION PLAN

1. Verify that the `src/tools` directory exists; create it if it does not.
2. Add a new file `src/tools/formatBytes.ts`.
3. Implement and export a `formatBytes` function that:
4. - Accepts a `bytes: number` and optional `decimals?: number` (default 2).
5. - Returns `"0 B"` for non‑positive input.
6. - Determines the appropriate unit from `["B","KB","MB","GB","TB","PB","EB","ZB","YB"]`.
7. - Calculates the value using `Math.pow(1024, unitIndex)` and formats it with `toFixed(decimals)`.
8. - Trims trailing zeros and the decimal point when not needed.
9. Add JSDoc comments describing parameters, return value, and examples.
10. Export the function as a named export (`export function formatBytes(...)`).
11. Update any barrel file (e.g., `src/tools/index.ts`) to re‑export `formatBytes` if the project uses one.
12. Write unit tests in `src/tools/__tests__/formatBytes.test.ts` covering:
13. - Zero and negative values.
14. - Typical values (bytes, KB, MB, GB, TB).
15. - Custom decimal precision.
16. - Large values beyond TB.
17. Run the test suite and ensure all tests pass.
18. Run lint/formatter (e.g., ESLint, Prettier) to ensure code style compliance.
19. Commit the new file, tests, and any updated barrel exports with a clear commit message.
