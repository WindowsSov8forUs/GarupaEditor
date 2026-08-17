import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const simulatorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scannedRoots = [simulatorRoot];
const testingRoot = resolve(simulatorRoot, "testing");
const pixiAllowedRoots = [
  resolve(simulatorRoot, "backends", "pixi"),
  resolve(simulatorRoot, "platform"),
];
const domAllowedRoots = [
  resolve(simulatorRoot, "backends", "audio"),
  resolve(simulatorRoot, "backends", "movie"),
  resolve(simulatorRoot, "backends", "pixi"),
  resolve(simulatorRoot, "platform"),
];
const forbidden = [
  { label: "React", pattern: /(?:from\s+["']react(?:\/[^"']*)?["']|import\s+["']react)/ },
  { label: "Pixi", pattern: /(?:from\s+["']pixi\.js["']|import\s+["']pixi\.js["'])/ },
  { label: "Tauri", pattern: /@tauri-apps/ },
  { label: "DOM global", pattern: /\b(?:document|window)\s*\./ },
  { label: "DOM type", pattern: /\b(?:HTMLElement|HTMLCanvasElement|AudioContext)\b/ },
  { label: "main program", pattern: /(?:src\/app|\.\.\/\.\.\/app|\.\.\/\.\.\/App)/ },
  { label: "editor chart model", pattern: /chartCore/ },
  { label: "removed legacy chart format converter", pattern: new RegExp("chart" + "FormatConverter") },
  {
    label: "removed character/multiplayer mechanism",
    pattern: /\b(?:SituationSkillManager|FeverTimeManager|updateFeverMemberPoint|changeFeverCommand|sessionBusinessData|voiceGain|deckTotalParameter|freeLiveEventBonusDeckTotalParameter|ownTeamMemberCount|team-live-festival|collaboration)\b/,
  },
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
    if (path.startsWith(`${testingRoot}${sep}`)) continue;
    for (const rule of forbidden) {
      if (rule.label === "Pixi" && pixiAllowedRoots.some((root) =>
        path === root || path.startsWith(`${root}${sep}`))) {
        continue;
      }
      if ((rule.label === "DOM global" || rule.label === "DOM type") &&
        domAllowedRoots.some((root) => path === root || path.startsWith(`${root}${sep}`))) {
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
