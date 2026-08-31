import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const caseRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(caseRoot, "..", "..");
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-simulator-chart-parsing-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
let builderConstructor;
let testCount = 0;

try {
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [
      typeScriptCli,
      "-p",
      join(testingRoot, "tsconfig.tests.json"),
      "--outDir",
      outputRoot,
    ]);
  }
  const chartRoot = join(outputRoot, "src", "simulator", "engine", "chart");
  const { MusicScoreBezierConverter, MusicScoreHeaderParser } = require(
    join(chartRoot, "musicScoreBezier.js"),
  );
  const { NoteDataBMSBuilder } = require(join(chartRoot, "bmsBuilder.js"));
  builderConstructor = NoteDataBMSBuilder;

  const fixturesRoot = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "fixtures",
  );
  const fixtures = [
    {
      file: "poppin_shuffle_special.txt",
      outputHash: "B3F3AEC64444D2553060641B1ADA203F99478727489A627C97F39B3FEA08880D",
      outputLines: 2107,
      materialCount: 2563,
      startBpm: 220,
      startBpmString: "220",
      isMultiRange: false,
    },
    {
      file: "786_miracle_april_habahiro_special.txt",
      outputHash: "C1C68FC617D1621F6F15C01F28E1C9CF64293D7CB154608CABD94F9D67CEFE1A",
      outputLines: 1778,
      materialCount: 2564,
      startBpm: 180,
      startBpmString: "180",
      isMultiRange: true,
    },
  ];

  for (const fixture of fixtures) {
    test(`production conversion ${fixture.file}`, () => {
      const source = readFileSync(join(fixturesRoot, fixture.file), "utf8");
      const converted = new MusicScoreBezierConverter(
        new MusicScoreHeaderParser(),
      ).convert(source);
      assertEqual(converted.status, "ok", "conversion status");
      assert(converted.value !== null, "production fixture must contain controls");
      assertEqual(
        createHash("sha256").update(converted.value).digest("hex").toUpperCase(),
        fixture.outputHash,
        "converted SHA-256",
      );
      assertEqual(converted.value.split("\n").length - 1, fixture.outputLines, "line count");

      const builder = new NoteDataBMSBuilder();
      const initialized = builder.initialize(converted.value, false);
      assertEqual(initialized.status, "ok", "builder status");
      assertEqual(countMaterials(builder.resultDictionary), fixture.materialCount, "material count");
      assertEqual(builder.startBpm, fixture.startBpm, "start BPM");
      assertEqual(builder.startBpmString, fixture.startBpmString, "start BPM string");
      assertEqual(builder.isMultiRangeNotes, fixture.isMultiRange, "multi-range flag");
    });
  }

  test("button groups retain first occurrence order", () => {
    const builder = initializeBuilder([
      "#BPM 120",
      "#WAV01 normal.wav",
      "#00013:01",
      "#00011:01",
    ]);
    const bar = builder.resultDictionary.get(0);
    assert(bar !== undefined, "bar zero must exist");
    assertDeepEqual(
      bar.bmsNoteList_.map((group) => group.buttonType_),
      [3, 1],
      "button group order",
    );
  });

  test("CC01 equal-position cells merge music and sound values", () => {
    const builder = initializeBuilder([
      "#BPM 120",
      "#WAV01 bgm_a.wav",
      "#WAV02 bgm_b.wav",
      "#00001:01",
      "#00001:02",
    ]);
    const material = firstMaterial(builder.resultDictionary);
    assertDeepEqual(material.playMusicList_, ["01", "02"], "music values");
    assertDeepEqual(material.soundValueList, ["bgm_a", "bgm_b"], "sound values");
  });

  test("CC03 and CC08 preserve numeric and source BPM strings", () => {
    const builder = initializeBuilder([
      "#BPM 120",
      "#BPM01 175.50",
      "#00003:78",
      "#00108:01",
    ]);
    assertDeepEqual(builder.bpmChangeRealValueList, [120, 175.5], "BPM values");
    assertDeepEqual(builder.bpmChangeStringRealValueList, ["120", "175.50"], "BPM strings");
  });

  test("Slide material retains virtual lane direction and distance", () => {
    const builder = initializeBuilder([
      "#BPM 120",
      "#WAV01 slide_a_LS27.wav",
      "#00011:01",
    ]);
    const material = firstMaterial(builder.resultDictionary);
    assertEqual(material.VirtualLaneDirection, 1, "left virtual lane");
    assertEqual(material.VirtualLaneDistance, 27, "virtual lane distance");
  });

  test("HABAHIRO retains equal-position CC source identities", () => {
    const builder = initializeBuilder([
      "#HABAHIRO",
      "#BPM 120",
      "#WAV01 normal.wav",
      "#00011:01",
      "#00031:01",
    ]);
    const bar = builder.resultDictionary.get(0);
    assert(bar !== undefined, "bar zero must exist");
    assertEqual(bar.bmsNoteList_.length, 1, "shared internal button group");
    assertDeepEqual(
      bar.bmsNoteList_[0].noteList_.map((material) => material.ccNum),
      [11, 31],
      "CC identities",
    );
  });

  test("malformed cells and missing BPM headers fail closed", () => {
    const malformed = new NoteDataBMSBuilder().initialize("#00011:0\n", false);
    assertEqual(malformed.status, "integrity-failure", "odd cell status");
    assertEqual(malformed.capability, "chart-construction.invalid-bms", "odd cell boundary");
    const missingBpm = new NoteDataBMSBuilder().initialize("#00008:01\n", false);
    assertEqual(missingBpm.status, "integrity-failure", "missing BPM status");
  });

  console.log(`chart-construction parsing tests passed: ${testCount}`);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function test(name, callback) {
  callback();
  testCount += 1;
  console.log(`ok - ${name}`);
}

function initializeBuilder(lines) {
  const builder = new builderConstructor();
  const result = builder.initialize(lines.join("\n") + "\n", false);
  assertEqual(result.status, "ok", "synthetic builder status");
  return builder;
}

function countMaterials(resultDictionary) {
  let count = 0;
  for (const bar of resultDictionary.values()) {
    for (const group of bar.bmsNoteList_) {
      count += group.noteList_.length;
    }
  }
  return count;
}

function firstMaterial(resultDictionary) {
  const bar = resultDictionary.values().next().value;
  assert(bar !== undefined, "a bar must exist");
  const group = bar.bmsNoteList_[0];
  assert(group !== undefined, "a button group must exist");
  const material = group.noteList_[0];
  assert(material !== undefined, "a material must exist");
  return material;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual, expected, message) {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
