import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const validateIndex = process.argv.includes("--index");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(root, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 64 * 1024 * 1024 });
}

function fail(message) {
  throw new Error(message);
}

function checkBytes(id, path, expectedBytes, expectedHash) {
  const bytes = readFileSync(path);
  if (bytes.length !== expectedBytes) {
    fail(`${id} byte length mismatch: ${bytes.length}`);
  }
  const hash = sha256(bytes);
  if (hash !== expectedHash) {
    fail(`${id} hash mismatch: ${hash}`);
  }
  return bytes;
}

function checkGitBlob(id, commit, path, expectedBytes, expectedHash) {
  const bytes = git(["show", `${commit}:${path}`], sourceRoot, null);
  if (!matchesFrozenBytes(bytes, expectedBytes, expectedHash)) {
    fail(`${id} source blob does not reproduce frozen bytes`);
  }
}

function matchesFrozenBytes(bytes, expectedBytes, expectedHash) {
  if (bytes.length === expectedBytes && sha256(bytes) === expectedHash) {
    return true;
  }
  if (bytes.includes(0)) {
    return false;
  }
  const checkoutBytes = Buffer.from(
    bytes.toString("utf8").replace(/\r?\n/g, "\r\n"),
    "utf8",
  );
  return checkoutBytes.length === expectedBytes && sha256(checkoutBytes) === expectedHash;
}

function checkIndex(id, copiedPath, expectedBytes, expectedHash) {
  if (!validateIndex) {
    return;
  }
  const indexPath = relative(projectRoot, resolve(packageRoot, copiedPath))
    .split(sep)
    .join("/");
  const indexBytes = git(["show", `:${indexPath}`], projectRoot, null);
  if (!matchesFrozenBytes(indexBytes, expectedBytes, expectedHash)) {
    fail(`${id} index blob does not reproduce frozen bytes`);
  }
}

const sourceRoot = manifest.source.repository;
const sourceHead = git(["rev-parse", "HEAD"], sourceRoot).trim();
const expectedHead = manifest.source.finalEvidenceCommit ?? manifest.source.staticBaselineCommit;
if (sourceHead !== expectedHead) {
  fail(`Source commit mismatch: ${sourceHead}`);
}

const sourceStatus = git(["status", "--porcelain"], sourceRoot)
  .split(/\r?\n/)
  .filter(Boolean);
const trackedSourceChanges = [];
for (const line of sourceStatus) {
  const isAllowedUntrackedPath = manifest.source.excludedUntrackedPaths.some(
    (path) => line === `?? ${path}`,
  );
  if (isAllowedUntrackedPath) {
    continue;
  }
  if (!line.startsWith("?? ")) {
    trackedSourceChanges.push(line);
    continue;
  }
  if (!isAllowedUntrackedPath) {
    fail(`Unexpected source worktree entry: ${line}`);
  }
}
if (trackedSourceChanges.length > 0) {
  try {
    git(["diff", "--ignore-space-at-eol", "--quiet"], sourceRoot);
  } catch {
    fail("Source worktree contains non-EOL tracked changes outside the locked commit");
  }
}

if (manifest.entries.length !== 26) {
  fail(`Expected 26 evidence entries, found ${manifest.entries.length}`);
}
if (manifest.upstreamDependencies.length !== 4) {
  fail(`Expected 4 upstream dependencies, found ${manifest.upstreamDependencies.length}`);
}

const requiredTasks = ["S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"];
if (manifest.runtimeEvidenceGate.status !== "closed-with-explicit-nonblocking-fidelity-boundaries") {
  fail(`Unexpected runtime gate status: ${manifest.runtimeEvidenceGate.status}`);
}
if (manifest.runtimeEvidenceGate.sourceClosureStatus !== "closed") {
  fail(`Unexpected source runtime closure status: ${manifest.runtimeEvidenceGate.sourceClosureStatus}`);
}
if (manifest.runtimeEvidenceGate.blockingFindings.length !== 0) {
  fail("Closed S02 gate must not retain blocking findings");
}
const expectedNonBlockingFindings = [
  "habahiro_zero_bpm_60",
  "bpm_pool_cursor_wrap_reuse",
];
if (
  manifest.runtimeEvidenceGate.nonBlockingUnverifiableFindings.length !==
    expectedNonBlockingFindings.length ||
  expectedNonBlockingFindings.some(
    (finding) =>
      !manifest.runtimeEvidenceGate.nonBlockingUnverifiableFindings.some(
        (entry) =>
          entry.id === finding &&
          entry.disposition === "restore-from-existing-evidence" &&
          entry.fidelity === "not-guaranteed-100-percent",
      ),
  )
) {
  fail("Read-only unavailable findings must remain explicit non-blocking fidelity exceptions");
}
if (manifest.runtimeEvidenceGate.requiredBeforeTasks.length !== 0) {
  fail("Closed runtime gate must not block S03 through S10");
}

const ids = new Set();
for (const entry of manifest.entries) {
  if (ids.has(entry.id)) {
    fail(`Duplicate manifest id: ${entry.id}`);
  }
  ids.add(entry.id);

  if (
    entry.sourcePath.startsWith("runtime/tools/") ||
    entry.copiedPath.startsWith("runtime/tools/") ||
    entry.sourcePath.includes("GarupaEditor") ||
    entry.copiedPath.includes("GarupaEditor")
  ) {
    fail(`Forbidden evidence path: ${entry.id}`);
  }

  checkBytes(
    `${entry.id} copied`,
    resolve(packageRoot, entry.copiedPath),
    entry.bytes,
    entry.sha256,
  );
  checkGitBlob(
    entry.id,
    manifest.source.staticBaselineCommit,
    entry.sourcePath,
    entry.bytes,
    entry.sha256,
  );
  checkIndex(entry.id, entry.copiedPath, entry.bytes, entry.sha256);
}

const runtimePackage = manifest.runtimeEvidence.package;
if (ids.has(runtimePackage.id)) {
  fail(`Duplicate manifest id: ${runtimePackage.id}`);
}
ids.add(runtimePackage.id);

const runtimeOraclePath = resolve(packageRoot, runtimePackage.copiedRoot);
const runtimeFiles = listFiles(runtimeOraclePath);
if (runtimeFiles.length !== runtimePackage.files) {
  fail(`Expected ${runtimePackage.files} runtime files, found ${runtimeFiles.length}`);
}
const runtimeBytes = runtimeFiles.reduce((total, path) => total + readFileSync(path).length, 0);
if (runtimeBytes !== runtimePackage.bytes) {
  fail(`Runtime package byte length mismatch: ${runtimeBytes}`);
}

const checksumPath = resolve(runtimeOraclePath, runtimePackage.sha256Manifest);
const checksumBytes = checkBytes(
  `${runtimePackage.id} checksum manifest`,
  checksumPath,
  runtimePackage.sha256ManifestBytes,
  runtimePackage.sha256ManifestHash,
);
checkGitBlob(
  `${runtimePackage.id} checksum manifest`,
  runtimePackage.sourceCommit,
  `${runtimePackage.sourceRoot}/${runtimePackage.sha256Manifest}`,
  runtimePackage.sha256ManifestBytes,
  runtimePackage.sha256ManifestHash,
);
checkIndex(
  `${runtimePackage.id} checksum manifest`,
  `${runtimePackage.copiedRoot}/${runtimePackage.sha256Manifest}`,
  runtimePackage.sha256ManifestBytes,
  runtimePackage.sha256ManifestHash,
);

const checksumLines = checksumBytes.toString("utf8").trimEnd().split(/\r?\n/);
if (checksumLines.length !== runtimePackage.files - 1) {
  fail(`Expected ${runtimePackage.files - 1} runtime checksum rows, found ${checksumLines.length}`);
}
const expectedRuntimePaths = new Set([runtimePackage.sha256Manifest]);
for (const line of checksumLines) {
  const match = /^([0-9A-F]{64})  (.+)$/.exec(line);
  if (!match) {
    fail(`Invalid runtime checksum row: ${line}`);
  }
  const [, expectedHash, relativePath] = match;
  if (expectedRuntimePaths.has(relativePath)) {
    fail(`Duplicate runtime checksum path: ${relativePath}`);
  }
  expectedRuntimePaths.add(relativePath);
  const copiedPath = `${runtimePackage.copiedRoot}/${relativePath}`;
  const sourcePath = `${runtimePackage.sourceRoot}/${relativePath}`;
  const bytes = readFileSync(resolve(packageRoot, copiedPath));
  if (sha256(bytes) !== expectedHash) {
    fail(`${runtimePackage.id} copied hash mismatch: ${relativePath}`);
  }
  const sourceBytes = git(["show", `${runtimePackage.sourceCommit}:${sourcePath}`], sourceRoot, null);
  if (sourceBytes.length !== bytes.length || sha256(sourceBytes) !== expectedHash) {
    fail(`${runtimePackage.id} source mismatch: ${relativePath}`);
  }
  checkIndex(`${runtimePackage.id} ${relativePath}`, copiedPath, bytes.length, expectedHash);
}
for (const path of runtimeFiles) {
  const relativePath = relative(runtimeOraclePath, path).split(sep).join("/");
  if (!expectedRuntimePaths.has(relativePath)) {
    fail(`Unexpected runtime package file: ${relativePath}`);
  }
}

const closure = JSON.parse(readFileSync(resolve(runtimeOraclePath, "closure.json"), "utf8"));
if (closure.s02_gate !== manifest.runtimeEvidenceGate.sourceClosureStatus) {
  fail(`Runtime closure gate mismatch: ${closure.s02_gate}`);
}
if (closure.blocking_findings.length !== 0) {
  fail("Frozen runtime closure unexpectedly retains blocking findings");
}
for (const finding of manifest.runtimeEvidenceGate.nonBlockingUnverifiableFindings) {
  const matrixStatus = closure.version_10_1_4?.sample_matrix?.[finding.id];
  if (typeof matrixStatus !== "string" || !matrixStatus.startsWith("blocked-")) {
    fail(`Missing source non-blocking unavailable boundary: ${finding.id}`);
  }
}

for (const entry of manifest.runtimeEvidence.entries) {
  if (ids.has(entry.id)) {
    fail(`Duplicate manifest id: ${entry.id}`);
  }
  ids.add(entry.id);
  checkBytes(
    `${entry.id} copied`,
    resolve(packageRoot, entry.copiedPath),
    entry.bytes,
    entry.sha256,
  );
  checkGitBlob(entry.id, entry.sourceCommit, entry.sourcePath, entry.bytes, entry.sha256);
  checkIndex(entry.id, entry.copiedPath, entry.bytes, entry.sha256);
}

const artifactFiles = listFiles(resolve(packageRoot, "artifacts"));
const expectedArtifactCount = manifest.entries.length + runtimePackage.files + 5;
if (artifactFiles.length !== expectedArtifactCount) {
  fail(`Expected ${expectedArtifactCount} copied artifacts, found ${artifactFiles.length}`);
}
const revisionFiles = listFiles(resolve(packageRoot, "revisions"));
if (revisionFiles.length !== 4) {
  fail(`Expected 4 frozen revision files, found ${revisionFiles.length}`);
}
const handoffFiles = listFiles(resolve(packageRoot, "handoff"));
if (handoffFiles.length !== 1) {
  fail(`Expected 1 final handoff file, found ${handoffFiles.length}`);
}

const upstreamIds = new Set();
for (const dependency of manifest.upstreamDependencies) {
  if (upstreamIds.has(dependency.id)) {
    fail(`Duplicate upstream dependency id: ${dependency.id}`);
  }
  upstreamIds.add(dependency.id);
  checkBytes(
    `${dependency.id} upstream`,
    resolve(projectRoot, dependency.frozenPath),
    dependency.bytes,
    dependency.sha256,
  );
}

console.log(
  `clock-scheduling evidence verified: static=${manifest.entries.length}, runtime=${runtimePackage.files}, revisions=${manifest.runtimeEvidence.entries.length}, upstream=${manifest.upstreamDependencies.length}, runtimeGate=${manifest.runtimeEvidenceGate.status}, index=${validateIndex ? "checked" : "skipped"}`,
);
