import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = walk(root).filter((path) =>
  [".ts", ".tsx"].includes(extname(path)) && !path.includes(`${join("resources", "testing")}`),
);
const forbiddenRuntimeTokens = [
  "simulator-static/current-10.1.4",
  "fallbackMaps",
];

for (const path of runtimeFiles) {
  const source = readFileSync(path, "utf8");
  for (const token of forbiddenRuntimeTokens) {
    if (source.includes(token)) {
      throw new Error(`${relative(root, path)} contains forbidden resource-lock token: ${token}`);
    }
  }
}

const repositoryRoot = resolve(root, "..", "..");
const sourceRoot = join(repositoryRoot, "src");
const builtinCatalogPath = join(root, "builtin", "builtinResourceCatalog.ts");
for (const path of walk(sourceRoot).filter((candidate) => [".ts", ".tsx"].includes(extname(candidate)))) {
  if (path === builtinCatalogPath) continue;
  const source = readFileSync(path, "utf8");
  if (/from\s+["'][^"']*assets\//.test(source)) {
    throw new Error(`${relative(sourceRoot, path)} imports a physical builtin outside the application catalog`);
  }
}
const assetsRoot = join(sourceRoot, "assets");
const manifest = JSON.parse(readFileSync(join(root, "builtin", "builtinResourceManifest.json"), "utf8"));
const actualAssets = walk(assetsRoot).filter((path) => statSync(path).isFile());
if (manifest.storageSchema !== 1 || manifest.entries.length !== actualAssets.length) {
  throw new Error("builtin resource manifest does not cover the exact source asset inventory");
}
const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]));
for (const path of actualAssets) {
  const logicalPath = relative(assetsRoot, path).replaceAll("\\", "/");
  const bytes = readFileSync(path);
  const entry = byPath.get(logicalPath);
  const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (!entry || entry.byteLength !== bytes.length || entry.sha256 !== digest) {
    throw new Error(`builtin resource manifest mismatch: ${logicalPath}`);
  }
}

console.log(`resource boundaries: ok (${runtimeFiles.length} runtime files, ${actualAssets.length} builtins)`);

function walk(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}
