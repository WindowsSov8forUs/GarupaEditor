import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "src", "runtime-contract-audit.json");
const SOURCE_ROOTS = [join(ROOT, "src"), join(ROOT, "src-tauri", "src"), join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "java", "com", "garupa", "editor")];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".rs", ".kt"]);
const MARKERS = [
  ["evidence-required-call", "evidenceRequired("],
  ["evidence-required-string", '"evidence-required"'],
  ["terminal-close", "closeTerminal("],
  ["exact-prototype", "Object.getPrototypeOf"],
  ["exact-key-order", ".sort().join("],
  ["rejected-call", "rejected("],
  ["throw-error", "throw new Error("],
];

const files = [];
for (const root of SOURCE_ROOTS) await collect(root, files);
files.sort((left, right) => normalized(left).localeCompare(normalized(right)));

const productionEntries = [];
const testMarkerCounts = Object.fromEntries(MARKERS.map(([kind]) => [kind, 0]));
for (const file of files) {
  const rel = normalized(file);
  if (rel === "src/runtime-contract-audit.json") continue;
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/);
  const testOnly = /(?:^|\/)testing(?:\/|$)|\.test\.[^.]+$|(?:^|\/)tests?(?:\/|$)/.test(rel);
  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index];
    for (const [marker, token] of MARKERS) {
      if (!source.includes(token)) continue;
      if (testOnly) {
        testMarkerCounts[marker] += 1;
        continue;
      }
      productionEntries.push({
        file: rel,
        line: index + 1,
        marker,
        symbol: nearestSymbol(lines, index),
        source: source.trim().slice(0, 300),
      });
    }
  }
}
productionEntries.sort((left, right) =>
  left.file.localeCompare(right.file) || left.line - right.line || left.marker.localeCompare(right.marker));

const entries = productionEntries.map((entry, index) => Object.freeze({
  id: `RCB-${String(index + 1).padStart(4, "0")}`,
  ...entry,
  trigger: "pending call-site review",
  userReachability: "runtime-review-required",
  currentEffect: effect(entry.marker),
  authority: authority(entry.marker),
  risk: Object.freeze({
    security: null,
    corruptBytesOrStorage: null,
    ownershipOrAtomicity: null,
    irreversibleMutation: null,
  }),
  disposition: "pending-classification",
  productSemanticsId: null,
  regression: null,
}));
const markerCounts = Object.fromEntries(MARKERS.map(([kind]) => [kind, entries.filter((entry) => entry.marker === kind).length]));
const audit = {
  schemaVersion: 1,
  policy: "src/runtime-contract-policy.md",
  scope: "production TypeScript/JavaScript, Rust and Android host sources; tests summarized separately",
  status: entries.length === 0 ? "classified" : "inventory-pending-classification",
  classificationRule: "Every production entry must become continue-product, action-unavailable, integrity-failure, terminal-fault, or test-only-assertion before final acceptance.",
  summary: {
    productionEntryCount: entries.length,
    pendingClassificationCount: entries.filter((entry) => entry.disposition === "pending-classification").length,
    markerCounts,
    testMarkerCounts,
  },
  entries,
};
const serialized = `${JSON.stringify(audit, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let existing = "";
  try { existing = await readFile(OUTPUT, "utf8"); } catch {}
  if (existing !== serialized) {
    console.error("runtime contract audit is stale; run npm run contracts:audit");
    process.exitCode = 1;
  } else {
    console.log(`runtime contract audit: current (${entries.length} production entries)`);
  }
} else {
  await writeFile(OUTPUT, serialized, "utf8");
  console.log(`runtime contract audit: wrote ${entries.length} production entries; ${audit.summary.pendingClassificationCount} pending classification`);
}

async function collect(directory, output) {
  let rows;
  try { rows = await readdir(directory, { withFileTypes: true }); } catch { return; }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  for (const row of rows) {
    if (["node_modules", "target", "dist"].includes(row.name)) continue;
    if (row.name === "generated" && normalized(join(directory, row.name)).includes("src-tauri/gen/android")) continue;
    const path = join(directory, row.name);
    if (row.isDirectory()) await collect(path, output);
    else if (row.isFile() && EXTENSIONS.has(extname(row.name))) output.push(path);
  }
}
function normalized(path) { return relative(ROOT, path).split(sep).join("/"); }
function nearestSymbol(lines, index) {
  for (let cursor = index; cursor >= Math.max(0, index - 30); cursor -= 1) {
    const line = lines[cursor].trim();
    const match = line.match(/^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|fn|struct|impl|enum)\s+([A-Za-z0-9_]+)/);
    if (match) return match[1];
    const method = line.match(/^(?:public|private|protected)?\s*(?:readonly\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (method) return method[1];
  }
  return "module-scope";
}
function effect(marker) {
  if (marker === "terminal-close") return "session-terminal-candidate";
  if (marker.startsWith("evidence-required")) return "evidence-controlled-result-candidate";
  if (marker.startsWith("exact-")) return "overexact-input-gate-candidate";
  if (marker === "throw-error") return "exception-candidate";
  return "typed-rejection-candidate";
}
function authority(marker) {
  if (marker.startsWith("evidence-required")) return "evidence-or-internal-assertion-review";
  if (marker.startsWith("exact-")) return "semantic-necessity-review";
  return "integrity-product-or-internal-review";
}
