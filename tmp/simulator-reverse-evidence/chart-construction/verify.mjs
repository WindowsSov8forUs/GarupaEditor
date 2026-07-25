import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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

const sourceRoot = manifest.source.repository;
const sourceHead = git(["rev-parse", "HEAD"], sourceRoot).trim();
if (sourceHead !== manifest.source.commit) {
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

if (manifest.entries.length !== 22) {
  fail(`Expected 22 manifest entries, found ${manifest.entries.length}`);
}

const ids = new Set();
for (const entry of manifest.entries) {
  if (ids.has(entry.id)) {
    fail(`Duplicate manifest id: ${entry.id}`);
  }
  ids.add(entry.id);

  if (
    entry.copiedPath.startsWith("runtime/tools/") ||
    entry.copiedPath.includes("GarupaEditor")
  ) {
    fail(`Forbidden copied path: ${entry.copiedPath}`);
  }

  const copiedBytes = readFileSync(resolve(packageRoot, entry.copiedPath));
  if (copiedBytes.length !== entry.bytes) {
    fail(`${entry.id} copied byte length mismatch: ${copiedBytes.length}`);
  }
  const copiedHash = sha256(copiedBytes);
  if (copiedHash !== entry.sha256) {
    fail(`${entry.id} copied hash mismatch: ${copiedHash}`);
  }

  if (entry.sourceKind === "reverse-file") {
    if (
      entry.sourcePath.startsWith("runtime/tools/") ||
      entry.sourcePath.includes("GarupaEditor")
    ) {
      fail(`Forbidden evidence source: ${entry.sourcePath}`);
    }
    const sourceBytes = readFileSync(resolve(sourceRoot, entry.sourcePath));
    if (sourceBytes.length !== entry.bytes) {
      fail(`${entry.id} source byte length mismatch: ${sourceBytes.length}`);
    }
    const sourceHash = sha256(sourceBytes);
    if (sourceHash !== entry.sha256) {
      fail(`${entry.id} source hash mismatch: ${sourceHash}`);
    }
  } else if (entry.sourceKind === "registered-url") {
    if (!entry.sourceUrl.startsWith("https://bestdori.com/")) {
      fail(`${entry.id} uses an unregistered fixture host: ${entry.sourceUrl}`);
    }
    if (!ids.has(entry.registeredBy)) {
      fail(`${entry.id} references unavailable registration evidence: ${entry.registeredBy}`);
    }
  } else {
    fail(`${entry.id} has unsupported source kind: ${entry.sourceKind}`);
  }

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
if (artifactFiles.length !== 18) {
  fail(`Expected 18 copied artifacts, found ${artifactFiles.length}`);
}

const fixtureFiles = listFiles(resolve(packageRoot, "fixtures"));
if (fixtureFiles.length !== 4) {
  fail(`Expected 4 production fixtures, found ${fixtureFiles.length}`);
}

console.log(
  `chart-construction evidence verified: entries=${manifest.entries.length}, artifacts=${artifactFiles.length}, fixtures=${fixtureFiles.length}, index=${validateIndex ? "checked" : "skipped"}`,
);
