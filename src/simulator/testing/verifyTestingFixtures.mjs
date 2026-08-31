import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testingRoot, "fixtures");
const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));
const consumerRoles = new Set([
  "reverse-contract",
  "reverse-oracle",
  "reverse-resource",
  "reverse-observation",
  "historical-superseded",
  "product-input",
  "product-probe",
]);
if (manifest.schemaVersion !== 2) {
  throw new Error("testing fixture manifest must use Schema 2");
}
if (
  typeof manifest.consumerRoles !== "object" || manifest.consumerRoles === null ||
  Object.keys(manifest.consumerRoles).length !== consumerRoles.size ||
  [...consumerRoles].some((role) => typeof manifest.consumerRoles[role] !== "string")
) {
  throw new Error("testing fixture consumer-role definitions are incomplete");
}
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
    !consumerRoles.has(entry.consumerRole) ||
    (!entry.sourcePath.startsWith("artifacts/") && !entry.sourcePath.startsWith("runtime/") &&
      !entry.sourcePath.startsWith("samples/") && !entry.sourcePath.startsWith("static/"))
  ) {
    throw new Error(`fixture provenance shape invalid: ${entry.path}`);
  }
  if (entry.path.startsWith("reverse-snapshots/evidence-integrity/") &&
    entry.sourceReverseCommit !== manifest.sourceHead) {
    throw new Error(`current evidence-integrity fixture is not pinned to sourceHead: ${entry.path}`);
  }
  if (entry.consumerRole === "historical-superseded") {
    if (typeof entry.supersededBy !== "string" || typeof entry.authorityNote !== "string") {
      throw new Error(`historical fixture lacks explicit supersession: ${entry.path}`);
    }
  } else if (entry.supersededBy !== undefined) {
    throw new Error(`only historical fixtures may declare supersededBy: ${entry.path}`);
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
for (const entry of manifest.entries) {
  if (entry.consumerRole !== "historical-superseded") continue;
  const replacement = manifest.entries.find((candidate) => candidate.path === entry.supersededBy);
  if (!replacement || replacement.consumerRole !== "reverse-oracle") {
    throw new Error(`historical fixture replacement is absent or not a current oracle: ${entry.path}`);
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
