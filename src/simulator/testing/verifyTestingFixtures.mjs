import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
for (const entry of manifest.entries) {
  const path = join(fixtureRoot, entry.path);
  const actual = readFileSync(path);
  if (statSync(path).size !== entry.bytes) {
    throw new Error(`fixture byte length mismatch: ${entry.path}`);
  }
  const hash = createHash("sha256").update(actual).digest("hex").toUpperCase();
  if (hash !== entry.sha256) {
    throw new Error(`fixture SHA-256 mismatch: ${entry.path}`);
  }
  if (!entry.sourceReverseCommit || !entry.sourcePath) {
    throw new Error(`fixture provenance missing: ${entry.path}`);
  }
}
console.log(`simulator test fixtures verified: ${manifest.entries.length} files; Reverse=${manifest.sourceHead}`);
