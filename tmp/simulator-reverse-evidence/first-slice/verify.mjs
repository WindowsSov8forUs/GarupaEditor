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

const trackedSourceChanges = git(["status", "--porcelain", "--untracked-files=no"], sourceRoot).trim();
if (trackedSourceChanges) {
  fail(`Tracked source changes are not allowed:\n${trackedSourceChanges}`);
}

if (manifest.entries.length !== 25) {
  fail(`Expected 25 evidence entries, found ${manifest.entries.length}`);
}

const ids = new Set();
for (const entry of manifest.entries) {
  if (ids.has(entry.id)) {
    fail(`Duplicate evidence id: ${entry.id}`);
  }
  ids.add(entry.id);

  if (entry.sourcePath.startsWith("runtime/tools/") || entry.sourcePath.includes("GarupaEditor")) {
    fail(`Forbidden evidence source: ${entry.sourcePath}`);
  }

  const sourceBytes = readFileSync(resolve(sourceRoot, entry.sourcePath));
  const copiedBytes = readFileSync(resolve(packageRoot, entry.copiedPath));
  const sourceHash = sha256(sourceBytes);
  const copiedHash = sha256(copiedBytes);

  if (sourceHash !== entry.sha256) {
    fail(`${entry.id} source hash mismatch: ${sourceHash}`);
  }
  if (copiedHash !== entry.sha256) {
    fail(`${entry.id} copied hash mismatch: ${copiedHash}`);
  }

  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath)).split(sep).join("/");
    const indexBytes = git(["show", `:${indexPath}`], projectRoot, null);
    const indexHash = sha256(indexBytes);
    if (indexHash !== entry.sha256) {
      fail(`${entry.id} index hash mismatch: ${indexHash}`);
    }
  }
}

const artifactFiles = listFiles(resolve(packageRoot, "artifacts"));
if (artifactFiles.length !== manifest.entries.length) {
  fail(`Expected ${manifest.entries.length} copied artifacts, found ${artifactFiles.length}`);
}

console.log(
  `first-slice evidence verified: entries=${manifest.entries.length}, index=${validateIndex ? "checked" : "skipped"}`,
);
