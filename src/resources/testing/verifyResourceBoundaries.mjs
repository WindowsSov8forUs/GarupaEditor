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

console.log(`resource boundaries: ok (${runtimeFiles.length} runtime files)`);

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
