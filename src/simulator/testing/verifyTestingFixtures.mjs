import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testingRoot, "fixtures");
const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));
if (manifest.sourceRepository !== "HOST________/VSCode/GirlsBandParty-Reverse") {
  throw new Error("testing fixture source repository changed");
}
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceHead)) {
  throw new Error("testing fixture source commit must be a full Reverse commit");
}
if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
  throw new Error("testing fixture manifest is empty");
}
const manifestPaths = new Set();
for (const entry of manifest.entries) {
  if (
    typeof entry.path !== "string" || manifestPaths.has(entry.path) ||
    typeof entry.sourcePath !== "string" || !/^[0-9a-f]{40}$/i.test(entry.sourceReverseCommit) ||
    !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 ||
    !/^[0-9A-F]{64}$/.test(entry.sha256) ||
    (!entry.sourcePath.startsWith("artifacts/") && !entry.sourcePath.startsWith("runtime/") &&
      !entry.sourcePath.startsWith("samples/") && !entry.sourcePath.startsWith("static/"))
  ) {
    throw new Error(`fixture provenance shape invalid: ${entry.path}`);
  }
  if (entry.path.startsWith("reverse-snapshots/evidence-integrity/") &&
    entry.sourceReverseCommit !== manifest.sourceHead) {
    throw new Error(`current evidence-integrity fixture is not pinned to sourceHead: ${entry.path}`);
  }
  manifestPaths.add(entry.path);
  const path = join(fixtureRoot, entry.path);
  const actual = readFileSync(path);
  if (statSync(path).size !== entry.bytes) {
    throw new Error(`fixture byte length mismatch: ${entry.path}`);
  }
  const hash = createHash("sha256").update(actual).digest("hex").toUpperCase();
  if (hash !== entry.sha256) {
    throw new Error(`fixture SHA-256 mismatch: ${entry.path}`);
  }
}
for (const path of walk(fixtureRoot)) {
  const fixturePath = relative(fixtureRoot, path).replaceAll("\\", "/");
  if ([".gitattributes", "README.md", "manifest.json"].includes(fixturePath)) continue;
  if (!manifestPaths.has(fixturePath)) {
    throw new Error(`unmanifested testing fixture: ${fixturePath}`);
  }
}
console.log(`simulator test fixtures verified: ${manifest.entries.length} files; Reverse=${manifest.sourceHead}`);

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
