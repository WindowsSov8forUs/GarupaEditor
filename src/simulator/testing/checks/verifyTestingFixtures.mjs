import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(checkRoot, "..");
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
const sourceRelations = new Set([
  "byte-identical",
  "history-rewrite-normalized",
  "historical-snapshot",
  "source-container-extract",
  "source-manifest-record",
]);
const sourceHead = "343c09cc06ee97f3f2532518eff6192913de2b19";
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
if (manifest.sourceRepository !== "https://github.com/WindowsSov8forUs/GirlsBandParty-Reverse") {
  throw new Error("testing fixture source repository is not the canonical remote identity");
}
if (manifest.sourceHead !== sourceHead) {
  throw new Error("testing fixture sourceHead is not the sanitized Reverse remote head");
}
if (!Array.isArray(manifest.entries) || manifest.entries.length !== 225) {
  throw new Error("testing fixture manifest must preserve the 225 immutable payload entries");
}
const manifestPaths = new Set();
for (const entry of manifest.entries) {
  if (
    typeof entry.path !== "string" || manifestPaths.has(entry.path) ||
    typeof entry.sourcePath !== "string" || !/^[0-9a-f]{40}$/i.test(entry.sourceReverseCommit) ||
    !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 ||
    !/^[0-9A-F]{64}$/.test(entry.sha256) ||
    !consumerRoles.has(entry.consumerRole) || !sourceRelations.has(entry.sourceRelation) ||
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
    if (
      typeof entry.supersededFor !== "string" || typeof entry.supersededBy !== "string" ||
      typeof entry.authorityNote !== "string"
    ) {
      throw new Error(`historical fixture lacks explicit supersession: ${entry.path}`);
    }
  } else if (entry.supersededFor !== undefined || entry.supersededBy !== undefined) {
    throw new Error(`only historical fixtures may declare supersession: ${entry.path}`);
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
const metadataTuple = manifest.entries.map((entry) => ({
  path: entry.path,
  sourceReverseCommit: entry.sourceReverseCommit,
  sourcePath: entry.sourcePath,
  bytes: entry.bytes,
  sha256: entry.sha256,
}));
const payloadTuple = manifest.entries.map((entry) => ({
  path: entry.path,
  bytes: entry.bytes,
  sha256: entry.sha256,
}));
const metadataTupleSha256 = createHash("sha256").update(JSON.stringify(metadataTuple)).digest("hex");
const payloadTupleSha256 = createHash("sha256").update(JSON.stringify(payloadTuple)).digest("hex");
if (
  manifest.identity?.legacyMetadataTupleSha256 !== "d9a9abdd1d0caf0cdc32fb6d86f9403f48ed1d4393517b72b99ee6bcece71f22" ||
  manifest.identity.currentMetadataTupleSha256 !== metadataTupleSha256 ||
  metadataTupleSha256 !== "10d701d3f123c21158448dc0456f16f6e6174fb10d3f780a0c6309641893c0ad" ||
  manifest.identity.payloadTupleSha256 !== payloadTupleSha256 ||
  payloadTupleSha256 !== "49fd39c3c9f791fce1707c768168b48df05bfebd8047d532c4e0b56da8db4ac0" ||
  metadataTupleSha256 === manifest.identity.legacyMetadataTupleSha256 ||
  JSON.stringify(manifest.identity.metadataProjection) !== JSON.stringify([
    "path", "sourceReverseCommit", "sourcePath", "bytes", "sha256",
  ]) ||
  JSON.stringify(manifest.identity.payloadProjection) !== JSON.stringify(["path", "bytes", "sha256"]) ||
  manifest.identity.serialization !== "JSON.stringify(entry-order object projection)"
) {
  throw new Error("testing fixture legacy provenance and immutable payload identities are not independently fixed");
}
for (const entry of manifest.entries) {
  if (entry.consumerRole !== "historical-superseded") continue;
  const replacement = manifest.entries.find((candidate) => candidate.path === entry.supersededBy);
  if (!replacement || replacement.consumerRole !== "reverse-oracle") {
    throw new Error(`historical fixture replacement is absent or not a current oracle: ${entry.path}`);
  }
}
const historicalPath = "reverse-snapshots/device-closure/artifacts/investigations/device-runtime-closure-10-1-4/particle_simulation_oracle.json";
const currentPath = "reverse-snapshots/particle-box-direction-native/artifacts/investigations/simulator-particle-box-direction-native-10-1-4/particle_simulation_box_corrected_oracle.json";
const historical = manifest.entries.find((entry) => entry.path === historicalPath);
const current = manifest.entries.find((entry) => entry.path === currentPath);
if (
  historical?.consumerRole !== "historical-superseded" || historical.supersededBy !== currentPath ||
  historical.sha256 !== "A081A49AAC5F9C1D486D6977EC8590FD494669265C07D9E665916341A65DEDDE" ||
  current?.consumerRole !== "reverse-oracle" ||
  current.sha256 !== "FB17C438C7A55E767559755ED1453E07AED766C4AA98649C82D92F0CB54E568B"
) {
  throw new Error("historical +Y and current native +Z particle identities are not both fixed");
}
const bbkkFixturePath = "reverse-snapshots/full-visible-lifecycle/artifacts/investigations/simulator-full-visible-lifecycle-reaudit-10-1-4/product-inputs/B.B.K.K.B.K.K..json";
const bbkkFixture = manifest.entries.find((entry) => entry.path === bbkkFixturePath);
const bbkkProductPath = join(testingRoot, "product-samples", "bbkk-single-width-regression.json");
const bbkkProduct = readFileSync(bbkkProductPath);
const bbkkProductHash = createHash("sha256").update(bbkkProduct).digest("hex").toUpperCase();
const bbkkProvenance = JSON.parse(readFileSync(join(
  testingRoot, "product-samples", "bbkk-single-width-regression.provenance.json",
), "utf8"));
if (
  bbkkFixture?.consumerRole !== "product-input" || bbkkFixture.bytes !== bbkkProduct.byteLength ||
  bbkkFixture.sha256 !== bbkkProductHash || bbkkProductHash !== "54938A6CA7509D1C0286C756AC44EA643FBD755236BC5F2D1B543FE894F221F8" ||
  !String(bbkkProvenance.authority).includes("product regression input only")
) {
  throw new Error("B.B.K Reverse-linked and product-regression inputs lost their distinct authority roles");
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
