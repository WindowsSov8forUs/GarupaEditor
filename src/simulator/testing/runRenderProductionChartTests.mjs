import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-render-chart-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
try {
  run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"), "--outDir", outputRoot]);
  verifyHabahiroEarlyFailure();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function verifyHabahiroEarlyFailure() {
  const compiled = join(outputRoot, "src", "simulator");
  const { createNoteBatchInformationList } = require(join(compiled, "engine", "chart", "construction.js"));
  const { validateConstructedChartCapabilities } = require(join(compiled, "assembly", "chartCapabilityValidation.js"));
  const chart = ok(createNoteBatchInformationList({
    musicScoreData: readFileSync(join(
      repositoryRoot,
      "src/simulator/testing/fixtures/reverse-snapshots/chart-construction/fixtures/786_miracle_april_habahiro_special.txt",
    ), "utf8"),
  }), "construct HABAHIRO chart");
  equal(chart.habahiroChangeAbsolutePos, 1728, "locked lane-change position");

  const baseRequest = request(false);
  const unselected = validateConstructedChartCapabilities(chart, baseRequest);
  equal(unselected.status, "rejected", "HAB external preview requires explicit selection");
  equal(unselected.failure.capability, "simulator.composition.habahiro-degraded-preview-not-selected",
    "unselected failure is stable");

  const selected = validateConstructedChartCapabilities(chart, request(true));
  equal(selected.status, "rejected", "external Note animation blocker fails the selected preview early");
  equal(selected.failure.capability, "render.habahiro.external-note-animation-evidence-required",
    "selected blocker is stable");
  console.log("HABAHIRO chart capability gate passed: explicit degraded selection required and unauthorized external animation rejects before resources/backends");
}

function request(allowExternalDegraded) {
  return {
    chartData: {
      bmsText: "unused",
      bgm: {
        cue: "unused", bytes: new Uint8Array([1]), sha256: "A".repeat(64), codec: "mp3",
        sampleRate: 44100, channels: 2, durationSeconds: 1, currentSampleFrames: 44100,
      },
      gameplay: {
        score: {
          level: 27, totalParameter: Math.fround(100000), autoLiveComboCoefficient: Math.fround(1),
          master: { musicId: 786, difficulty: "special", scoreC: 36000, scoreB: 216000, scoreA: 432000, scoreS: 648000, scoreSS: 864000 },
        },
        life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
      },
    },
    config: {
      playMode: "auto-live", highFrequencyMode: false, judgeOffsetFrames: 0,
      practice: { enabled: false, startMilliseconds: 0 },
      habahiroPreview: { allowExternalDegraded },
      visual: { specificSpeed: Math.fround(11), noteSize: Math.fround(100), highAspectRatio: 1, habahiroMeshWidthSetting: Math.fround(1) },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function ok(result, message) {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
