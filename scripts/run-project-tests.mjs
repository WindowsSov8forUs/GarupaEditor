import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const profileIndex = process.argv.indexOf("--profile");
const profile = profileIndex >= 0 ? process.argv[profileIndex + 1] : "development";
if (!new Set(["development", "release"]).has(profile)) {
  throw new Error(`project test runner does not expose profile ${String(profile)}`);
}

const steps = [
  ["app", "src/app/testing/run.mjs", []],
  ["chart", "src/chart/testing/runTests.mjs", []],
  ["resources", "src/resources/testing/runTests.mjs", []],
  ["runtime-contract-audit", "scripts/audit-runtime-contract-blockers.mjs", ["--check"]],
  ["simulator", "src/simulator/testing/suite/run.mjs", ["--profile", profile]],
];
for (const [id, path, args] of steps) {
  console.log(`\n=== project tests: ${id} ===`);
  const result = spawnSync(process.execPath, [join(root, path), ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\nproject test profile passed: ${profile}`);
