import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const testingRoot = resolve(import.meta.dirname, "..");
const simulatorRoot = resolve(testingRoot, "..");
const independentRoot = join(testingRoot, "expected", "independent");

for (const path of walk(simulatorRoot)) {
  if (!/\.(?:ts|tsx|mjs|js)$/.test(path) || isWithin(path, testingRoot)) continue;
  const source = readFileSync(path, "utf8");
  for (const specifier of moduleSpecifiers(path, source)) {
    const target = resolveSpecifier(path, specifier);
    if ((target !== null && isWithin(target, testingRoot)) || /(?:^|[\\/])testing(?:[\\/]|$)/.test(specifier)) {
      throw new Error(`production source imports testing-owned content: ${relative(simulatorRoot, path)} -> ${specifier}`);
    }
  }
  if (/src[\\/]simulator[\\/]testing|testing[\\/]fixtures/.test(source)) {
    throw new Error(`production source contains a testing path: ${relative(simulatorRoot, path)}`);
  }
}

for (const path of walk(independentRoot)) {
  if (!/\.(?:ts|mjs|js)$/.test(path)) continue;
  const source = readFileSync(path, "utf8");
  for (const specifier of moduleSpecifiers(path, source)) {
    const target = resolveSpecifier(path, specifier);
    if (
      (target !== null && !isWithin(target, independentRoot)) ||
      /(?:engine|assembly|backends|scene|host|runtime|public)(?:[\\/]|$)/.test(specifier)
    ) {
      throw new Error(`independent expected imports project implementation: ${relative(independentRoot, path)} -> ${specifier}`);
    }
  }
}

const productSnapshotPath = join(testingRoot, "product-samples", "auto-live-multiple-grouping.snapshot.json");
const productSnapshot = JSON.parse(readFileSync(productSnapshotPath, "utf8"));
if (
  productSnapshot.kind !== "product-derived-regression-snapshot" ||
  productSnapshot.derivedWithProductionCode !== true ||
  productSnapshot.originalBehaviorAuthority !== false ||
  productSnapshot.productSemanticsId !== "simulator.auto-live-multiple-source-order-regression-v1" ||
  !Array.isArray(productSnapshot.charts) || productSnapshot.charts.length !== 2 ||
  productSnapshot.charts.some((chart) => !/^[0-9A-F]{64}$/.test(chart.source_sha256))
) {
  throw new Error("Auto Live product snapshot lacks an explicit non-oracle authority boundary");
}
const updateSource = readFileSync(join(
  testingRoot, "support", "updateAutoLiveMultipleGroupingProductSnapshot.mjs",
), "utf8");
for (const required of [
  'kind: "product-derived-regression-snapshot"',
  "derivedWithProductionCode: true",
  "originalBehaviorAuthority: false",
  '"engine",\n  "chart",\n  "construction.js"',
]) {
  if (!updateSource.includes(required)) throw new Error(`product snapshot updater boundary missing: ${required}`);
}

console.log("simulator expected import graph verified with TypeScript AST: production fixture-free; independent expected implementation-free; product snapshot non-authoritative");

function moduleSpecifiers(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const values = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      values.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        values.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function scriptKind(path) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function resolveSpecifier(sourcePath, specifier) {
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) return null;
  const base = isAbsolute(specifier) ? specifier : resolve(dirname(sourcePath), specifier);
  for (const candidate of [
    base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}.json`,
    join(base, "index.ts"), join(base, "index.mjs"),
  ]) {
    if (statSafe(candidate)) return candidate;
  }
  return base;
}

function isWithin(path, root) {
  const value = resolve(path);
  const parent = resolve(root);
  return value === parent || value.startsWith(`${parent}${sep}`);
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
  try { return statSync(path); } catch { return null; }
}
