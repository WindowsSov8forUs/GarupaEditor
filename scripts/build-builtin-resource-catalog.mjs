import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const assetsRoot = join(repositoryRoot, "src", "assets");
const outputPath = join(repositoryRoot, "src", "resources", "builtin", "builtinResourceManifest.json");
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
if (unknownArguments.length > 0) {
  throw new Error(`unknown builtin manifest arguments: ${unknownArguments.join(", ")}`);
}

const entries = walk(assetsRoot).map((path) => {
  const bytes = readFileSync(path);
  return {
    path: relative(assetsRoot, path).replaceAll("\\", "/"),
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  };
}).sort((a, b) => a.path.localeCompare(b.path));
const generated = `${JSON.stringify({ storageSchema: 1, entries }, null, 2)}\n`;

if (checkOnly) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== generated) {
    throw new Error("builtin resource manifest is stale; run npm.cmd run resources:builtin-manifest");
  }
  console.log(`builtin resource manifest: current (${entries.length} files)`);
} else {
  writeFileSync(outputPath, generated, "utf8");
  console.log(`builtin resource manifest: wrote ${entries.length} files`);
}

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(path));
    else if (entry.isFile() && extname(path)) output.push(path);
  }
  return output;
}
