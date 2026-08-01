import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const simulatorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scannedRoots = ["engine", "host", "backends"].map((path) => resolve(simulatorRoot, path));
const pixiBackendRoot = resolve(simulatorRoot, "backends", "pixi");
const forbidden = [
  { label: "React", pattern: /(?:from\s+["']react(?:\/[^"']*)?["']|import\s+["']react)/ },
  { label: "Pixi", pattern: /(?:from\s+["']pixi\.js["']|import\s+["']pixi\.js["'])/ },
  { label: "Tauri", pattern: /@tauri-apps/ },
  { label: "DOM global", pattern: /\b(?:document|window)\s*\./ },
  { label: "DOM type", pattern: /\b(?:HTMLElement|HTMLCanvasElement|AudioContext)\b/ },
  { label: "main program", pattern: /(?:src\/app|\.\.\/\.\.\/app|\.\.\/\.\.\/App)/ },
  { label: "editor chart model", pattern: /chartCore/ },
];

function listTypeScriptFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }
    return extname(entry.name) === ".ts" ? [entryPath] : [];
  });
}

const violations = [];
for (const root of scannedRoots) {
  for (const path of listTypeScriptFiles(root)) {
    const source = readFileSync(path, "utf8");
    for (const rule of forbidden) {
      if (rule.label === "Pixi" && path.startsWith(`${pixiBackendRoot}${sep}`)) {
        continue;
      }
      if (rule.pattern.test(source)) {
        violations.push(`${rule.label}: ${path}`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Forbidden simulator dependencies:\n${violations.join("\n")}`);
}

console.log("simulator dependency boundary verified");
