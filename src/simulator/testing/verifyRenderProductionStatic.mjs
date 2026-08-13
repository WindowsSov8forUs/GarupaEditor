import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const repositoryRoot = resolve(simulatorRoot, "..", "..");
const productionRoots = [
  "assembly", "backends", "engine", "host", "platform", "public", "resources", "runtime", "scene",
].map((name) => resolve(simulatorRoot, name));
const forbidden = [
  [/\bfetch\s*\(/, "network fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/https?:\/\//, "remote URL"],
  [/reverse-snapshots/i, "runtime evidence-package read"],
  [/GirlsBandParty-Reverse/i, "runtime Reverse-worktree read"],
  [/runtime[\\/]tools/i, "runtime/tools dependency"],
  [/\bMath\.random\s*\(/, "ambient random source"],
  [/\b(?:Date\.now|performance\.now)\s*\(/, "ambient wall clock"],
  [/\b(?:setTimeout|setInterval)\s*\(/, "implicit timer scheduler"],
  [/\bTextureSource\b/, "synthetic TextureSource decode substitute"],
  [/\bfindTextureBinding\b/, "cross-logical-asset atlas-key lookup"],
  [/\bas\s+any\b|\bRecord\s*<\s*string\s*,\s*any\s*>|:\s*any\b/, "untyped production escape"],
  [/fontFamily\s*:\s*["'](?:Arial|Helvetica|sans-serif|serif|system-ui)/i, "undeclared system font"],
];
const violations = [];
for (const root of productionRoots) {
  for (const path of walk(root)) {
    if (extname(path) !== ".ts") continue;
    const source = readFileSync(path, "utf8");
    for (const [pattern, label] of forbidden) {
      if (pattern.test(source)) violations.push(`${path}: ${label}`);
    }
    if (/catch(?:\s*\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\s*)*\}/m.test(source)) {
      violations.push(`${path}: comment-only swallowed exception`);
    }
  }
}
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (!name.startsWith("simulator:") || typeof command !== "string") continue;
  if (/(^|\s)(python|python3|py)(\.exe)?(\s|$)/i.test(command)) {
    violations.push(`package.json#${name}: Python runtime dependency`);
  }
  if (/https?:\/\//i.test(command)) violations.push(`package.json#${name}: network URL`);
}
if (violations.length > 0) {
  throw new Error(`render production static audit failed:\n${violations.join("\n")}`);
}
console.log("render production static audit passed: all production roots network=off reverse-runtime=off python=off");

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
