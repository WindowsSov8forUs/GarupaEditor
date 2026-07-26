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
  return execFileSync("git", args, { cwd, encoding });
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

const sourceRoot = manifest.source.repository;
const sourceHead = git(["rev-parse", "HEAD"], sourceRoot).trim();
const expectedHead = manifest.source.finalEvidenceCommit ?? manifest.source.staticBaselineCommit;
if (sourceHead !== expectedHead) {
  fail(`Source commit mismatch: ${sourceHead}`);
}

const sourceStatus = git(["status", "--porcelain"], sourceRoot)
  .split(/\r?\n/)
  .filter(Boolean);
for (const line of sourceStatus) {
  const isAllowedUntrackedPath = manifest.source.excludedUntrackedPaths.some(
    (path) => line === `?? ${path}`,
  );
  if (!isAllowedUntrackedPath) {
    fail(`Unexpected source worktree entry: ${line}`);
  }
}

if (manifest.entries.length !== 26) {
  fail(`Expected 26 evidence entries, found ${manifest.entries.length}`);
}
if (manifest.upstreamDependencies.length !== 4) {
  fail(`Expected 4 upstream dependencies, found ${manifest.upstreamDependencies.length}`);
}

const requiredTasks = ["S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"];
if (manifest.runtimeEvidenceGate.status !== "required-before-code") {
  fail(`Unexpected runtime gate status: ${manifest.runtimeEvidenceGate.status}`);
}
if (
  requiredTasks.some((task) => !manifest.runtimeEvidenceGate.requiredBeforeTasks.includes(task)) ||
  manifest.runtimeEvidenceGate.requiredBeforeTasks.length !== requiredTasks.length
) {
  fail("Runtime gate must block every task from S03 through S10");
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
  checkBytes(
    `${entry.id} source`,
    resolve(sourceRoot, entry.sourcePath),
    entry.bytes,
    entry.sha256,
  );

  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath))
      .split(sep)
      .join("/");
    const indexBytes = git(["show", `:${indexPath}`], projectRoot, null);
    if (indexBytes.length !== entry.bytes) {
      fail(`${entry.id} index byte length mismatch: ${indexBytes.length}`);
    }
    const indexHash = sha256(indexBytes);
    if (indexHash !== entry.sha256) {
      fail(`${entry.id} index hash mismatch: ${indexHash}`);
    }
  }
}

const artifactFiles = listFiles(resolve(packageRoot, "artifacts"));
if (artifactFiles.length !== 26) {
  fail(`Expected 26 copied artifacts, found ${artifactFiles.length}`);
}

const runtimeOraclePath = resolve(
  packageRoot,
  "artifacts/investigations/clock-scheduling-runtime-oracle",
);
if (
  manifest.runtimeEvidenceGate.status === "required-before-code" &&
  listFiles(runtimeOraclePath).length !== 0
) {
  fail("Runtime oracle files exist before S02 closure");
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
  `clock-scheduling evidence verified: entries=${manifest.entries.length}, upstream=${manifest.upstreamDependencies.length}, runtimeGate=${manifest.runtimeEvidenceGate.status}, index=${validateIndex ? "checked" : "skipped"}`,
);
