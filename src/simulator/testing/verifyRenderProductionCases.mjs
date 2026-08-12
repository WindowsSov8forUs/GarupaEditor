import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pixi = readFileSync(resolve(root, "backends/pixi/pixiRendererBackend.ts"), "utf8");

const unresolved = [
  [
    "PR08/PR09/PR11",
    /1 \+ 0\.08 \* Math\.sin/.test(pixi) ||
      /0\.8 \+ 0\.2 \* Math\.abs\(Math\.sin/.test(pixi),
    "Flick/Directional/Long Flash still use synthetic sine animation",
  ],
  [
    "PR22/PR23/PR24",
    /0\.7 \+ 0\.3 \* Math\.abs\(Math\.sin/.test(pixi),
    "All Perfect still uses a synthetic whole-node sine animation",
  ],
  [
    "PR26",
    /total === 0 \? "" : `\+\$\{total\}`/.test(pixi) ||
      /Math\.fround\(0\.6 \+ 0\.4 \* progress\)/.test(pixi),
    "AddScore still uses system Text (and the guard also rejects the former wrong phase-0 curve)",
  ],
  [
    "PR27",
    /`\$\{state\.representativeResult\}\$\{timing\}`/.test(pixi) ||
      /elapsedSeconds < 0\.85 \? 1 : Math\.max/.test(pixi),
    "Result/JudgeTiming still uses system Text (and the guard also rejects the former invented fade)",
  ],
  [
    "PR29/PR30",
    /\.rect\(0, 0, 224 \* secondary, 26\)/.test(pixi) ||
      /`\$\{state\.currentLife\}\/\$\{state\.playerMaxLife\}`/.test(pixi),
    "Life/Game Over still uses synthetic Graphics and system Text",
  ],
];

const active = unresolved.filter(([, present]) => present);
if (active.length === 0) {
  throw new Error(
    "The unrestored-render guard no longer finds the known implementations; replace this guard with Reverse-backed semantic Pixi oracles before closing RP14.",
  );
}

const detail = active.map(([ids, , reason]) => `${ids}: ${reason}`).join("\n");
throw new Error(
  `ordinary rendering portable gate remains open; Reverse final R7 did not claim production consumption:\n${detail}`,
);
