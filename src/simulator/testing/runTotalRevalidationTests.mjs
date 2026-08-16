import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const tempRoot = mkdtempSync(join(tmpdir(), "simulator-total-revalidation-"));
const compiledRoot = join(tempRoot, "compiled-tests");
const observation = join(tempRoot, "actual-pixi-observation.json");
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const quick = process.argv.includes("--quick");
const cleanBrowserBuild = process.argv.includes("--clean-browser-build");
const baseLeaves = [
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
  ["garupa-json-direct-chart", "runPublicGarupaJsonChartTests.mjs", {}],
  ["public-life-profile", "runPublicLifeProfileTests.mjs", {}],
  ["live-rehearsal-four-mode", "runLiveRehearsalModeTests.mjs", {}],
  ["remaining-capability-consumption", "runC07EvidenceConsumptionTests.mjs", {}],
];
const quickLeaves = [
  ["compiled-unit-and-static-subset", "runQuickCompiledTests.mjs", {}],
  ["chart-parsing", "runChartConstructionParsingTests.mjs", {}],
  ["clock", "runClockSchedulingTests.mjs", {}],
  ["auto", "runAutoLiveTests.mjs", {}],
  ["garupa-json-direct-chart", "runPublicGarupaJsonChartTests.mjs", {}],
  ["public-life-profile", "runPublicLifeProfileTests.mjs", {}],
  ["live-rehearsal-four-mode", "runLiveRehearsalModeTests.mjs", {}],
];
const browserEnvironment = cleanBrowserBuild ? { SIMULATOR_WEBVIEW2_CLEAN_BUILD: "1" } : {};
const browserLeaves = [
  ["production-browser-webview2", "runBrowserPixiDecoderWebView2Tests.mjs", browserEnvironment],
  ["ordinary-full-scene-browser-webview2", "runOrdinaryRenderingWebView2Tests.mjs", browserEnvironment],
];
const leaves = quick ? quickLeaves : [...baseLeaves, ...browserLeaves];
const sharedEnvironment = {
  SIMULATOR_TEST_COMPILED_ROOT: compiledRoot,
  SIMULATOR_TEST_SHARED_PREFLIGHT: "1",
};
const started = Date.now();
try {
  run("isolated-tsc", "npx.cmd", ["tsc", "-p", join(repositoryRoot, "src", "simulator", "tsconfig.json")], {});
  run("shared-test-compile", process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    compiledRoot,
  ], {});
  run("fixture-provenance", process.execPath, [join(testingRoot, "verifyTestingFixtures.mjs")], {});
  run("current-static-boundaries", process.execPath, [join(testingRoot, "verifyEvidenceIntegrityStatic.mjs")], {});
  run("dependency-boundary", process.execPath, [join(testingRoot, "verifyDependencies.mjs")], {});
  for (const [id, runner, env, extraArgs = []] of leaves) {
    run(id, process.execPath, [join(testingRoot, runner), ...extraArgs], { ...sharedEnvironment, ...env });
  }
  const semanticLeaves = leaves.length + 3;
  console.log(
    `${quick ? "quick simulator regression" : "total revalidation"} passed: ` +
    `${quick ? "developmentGroups" : "semanticLeaves"}=${semanticLeaves} sharedTestCompile=1 elapsedMs=${Date.now() - started}; ` +
    `browserLeaves=${quick ? "skipped-use-total-revalidation" : cleanBrowserBuild ? "executed-clean-build" : "executed-cached-build"}; ` +
    "fixed-device exact remains objectively blocked and stage-9 remains unauthorized",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function run(id, command, args, env) {
  console.log(`\n=== ${quick ? "quick" : "total-revalidation"} leaf: ${id} ===`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 1_800_000,
    env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules"), ...env },
    shell: command.endsWith(".cmd"),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${id} failed with exit code ${String(result.status)}`);
}
