import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const testingRoot = resolve(import.meta.dirname, "..");
const simulatorRoot = resolve(testingRoot, "..");
const expectedRoot = join(testingRoot, "expected");

for (const path of walk(simulatorRoot)) {
  if (!/\.(?:ts|tsx|mjs|js)$/.test(path) || path.startsWith(`${testingRoot}\\`) || path.startsWith(`${testingRoot}/`)) {
    continue;
  }
  const source = readFileSync(path, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    if (/testing(?:[\\/]|$)|fixtures(?:[\\/]|$)|expected(?:[\\/]|$)/.test(specifier)) {
      throw new Error(`production source imports testing-owned content: ${relative(simulatorRoot, path)} -> ${specifier}`);
    }
  }
  if (/src[\\/]simulator[\\/]testing|testing[\\/]fixtures/.test(source)) {
    throw new Error(`production source contains a testing path: ${relative(simulatorRoot, path)}`);
  }
}

for (const path of walk(join(expectedRoot, "independent"))) {
  if (!/\.(?:ts|mjs|js)$/.test(path)) continue;
  const source = readFileSync(path, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes("src/simulator")) {
      throw new Error(`independent expected module imports project implementation: ${relative(expectedRoot, path)} -> ${specifier}`);
    }
  }
}

for (const path of walk(join(expectedRoot, "product-derived"))) {
  if (extname(path) !== ".json") continue;
  const snapshot = JSON.parse(readFileSync(path, "utf8"));
  if (
    snapshot.status !== "product-derived-regression-snapshot" ||
    typeof snapshot.productSemanticsId !== "string" ||
    typeof snapshot.authority !== "string" ||
    !snapshot.authority.includes("not independent Reverse evidence")
  ) {
    throw new Error(`product-derived snapshot lacks explicit authority boundary: ${relative(expectedRoot, path)}`);
  }
}

console.log("simulator expected-import boundary verified: production is fixture-free; independent expected is implementation-free");

function moduleSpecifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);
}

function* walk(root) {
  if (!statSafe(root)?.isDirectory()) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}
