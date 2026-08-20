import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const assetsRoot = join(repositoryRoot, "src", "assets");
const outputPath = join(repositoryRoot, "src", "resources", "builtin", "builtinResourceManifest.json");
const entries = walk(assetsRoot).map((path) => {
  const bytes = readFileSync(path);
  return {
    path: relative(assetsRoot, path).replaceAll("\\", "/"),
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  };
}).sort((a, b) => a.path.localeCompare(b.path));

writeFileSync(outputPath, `${JSON.stringify({ storageSchema: 1, entries }, null, 2)}\n`, "utf8");
console.log(`builtin resource manifest: ${entries.length} files`);

function walk(directory) {
  const output = [];
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, name.name);
    if (name.isDirectory()) output.push(...walk(path));
    else if (name.isFile() && extname(path)) output.push(path);
  }
  return output;
}
