import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../..");
const out = mkdtempSync(join(tmpdir(), "garupa-app-tests-"));

try {
  run(process.execPath, [
    "node_modules/typescript/bin/tsc", "-p", "src/app/testing/tsconfig.json", "--outDir", out,
  ]);
  for (const file of ["editorHelpers.test.js", "slideHiddenMoveOffsets.test.js"]) {
    run(process.execPath, [join(out, "src/app/testing", file)]);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
