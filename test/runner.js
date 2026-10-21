/**
 * EvoSafe Lightweight Test Runner
 * Runs in Node.js (v18+) without external dependencies.
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

export function describe(suiteName, fn) {
  console.log(`\n\x1b[1m\x1b[34m--- ${suiteName} ---\x1b[0m`);
  fn();
}

export function test(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  \x1b[31m✖\x1b[0m ${testName}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
    failures.push({ suite: testName, error: err });
  }
}

export function assert(condition, message = "Assertion failed") {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ": " : ""}Expected ${JSON.stringify(
        expected
      )}, but got ${JSON.stringify(actual)}`
    );
  }
}

export function assertAlmostEqual(actual, expected, epsilon = 1e-5, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(
      `${message ? message + ": " : ""}Expected ${actual} to be close to ${expected} (within ${epsilon})`
    );
  }
}

export function assertDeepEqual(actual, expected, message) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr !== eStr) {
    throw new Error(
      `${message ? message + ": " : ""}Objects differ.\nActual: ${aStr}\nExpected: ${eStr}`
    );
  }
}

export function summarize() {
  console.log(`\n========================================`);
  console.log(`Total: ${totalTests} | Passed: \x1b[32m${passedTests}\x1b[0m | Failed: \x1b[31m${failedTests}\x1b[0m`);
  console.log(`========================================\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}
