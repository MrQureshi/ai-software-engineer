export function createChecker() {
  let passed = 0;
  let failed = 0;

  function check(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`PASS - ${label}`);
      passed++;
    } else {
      console.log(`FAIL - ${label}${detail ? ` (${detail})` : ""}`);
      failed++;
    }
  }

  function finish() {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }

  return { check, finish };
}
