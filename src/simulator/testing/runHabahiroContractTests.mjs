import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(testingRoot, "..", "..", "..");
const output = mkdtempSync(join(tmpdir(), "garupa-habahiro-contract-"));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
try {
  run(process.execPath, [tsc, "-p", join(testingRoot, "tsconfig.tests.json"), "--outDir", output]);
  run(process.execPath, [join(output, "src", "simulator", "testing", "habahiroComplete.test.js")]);
} finally {
  rmSync(output, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
