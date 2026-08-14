import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const tempRoot = mkdtempSync(join(tmpdir(), "simulator-total-revalidation-"));
const observation = join(tempRoot, "actual-pixi-observation.json");
const leaves = [
  ["fixture-provenance", "verifyTestingFixtures.mjs", {}],
  ["current-static-audit", "verifyEvidenceIntegrityStatic.mjs", {}],
  ["chart-boundary", "runChartConstructionBoundaryTests.mjs", {}],
  ["chart-parsing", "runChartConstructionParsingTests.mjs", {}],
  ["chart-batches", "runChartBatchConversionTests.mjs", {}],
  ["chart-graphs", "runChartNoteGraphTests.mjs", {}],
  ["chart-multi-range", "runChartMultiRangeTests.mjs", {}],
  ["chart-command-data", "runChartCommandDataTests.mjs", {}],
  ["chart-finalize", "runChartFinalizeTests.mjs", {}],
  ["chart-production", "runChartProductionAcceptanceTests.mjs", {}],
  ["clock", "runClockSchedulingTests.mjs", {}],
  ["auto", "runAutoLiveTests.mjs", {}],
  ["manual", "runManualInputAcceptanceTests.mjs", {}],
  ["score-life-rank", "runScoreLifeStateTests.mjs", {}],
  ["render-contract", "runRenderContractTests.mjs", {}],
  ["render-geometry", "runOrdinaryNoteGeometryTests.mjs", {}],
  ["render-pixi-raw", "runRenderPixiTests.mjs", { SIMULATOR_RENDER_OBSERVATION_PATH: observation }],
  ["render-pixi-independent", "verifyTotalRevalidationObservation.mjs", {}, [observation]],
  ["render-chart-gates", "runRenderProductionChartTests.mjs", {}],
  ["audio", "runAudioTests.mjs", {}],
  ["particle", "runParticleTests.mjs", {}],
  ["host-runtime-public-gate", "runAutonomousModuleTests.mjs", {}],
  ["remaining-capability-consumption", "runC07EvidenceConsumptionTests.mjs", {}],
  ["production-browser-webview2", "runBrowserPixiDecoderWebView2Tests.mjs", {}],
  ["ordinary-full-scene-browser-webview2", "runOrdinaryRenderingWebView2Tests.mjs", {}],
];
const started = Date.now();
try {
  run("isolated-tsc", "npx.cmd", ["tsc", "-p", join(repositoryRoot, "src", "simulator", "tsconfig.json")], {});
  for (const [id, runner, env, extraArgs = []] of leaves) {
    run(id, process.execPath, [join(testingRoot, runner), ...extraArgs], env);
  }
  console.log(`total revalidation unique-leaf DAG passed: leaves=${leaves.length + 1} elapsedMs=${Date.now() - started}; portable gates include initial seek and real browser decode; fixed-device exact remains objectively blocked and stage-9 remains unauthorized`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function run(id, command, args, env) {
  console.log(`\n=== total-revalidation leaf: ${id} ===`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 1_200_000,
    env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules"), ...env },
    shell: command.endsWith(".cmd"),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
