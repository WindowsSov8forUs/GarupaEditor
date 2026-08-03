import { createHash } from "node:crypto";
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
  await verifyHabahiroDegradedReplay();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

async function verifyHabahiroDegradedReplay() {
  const compiled = join(outputRoot, "src", "simulator");
  const { createNoteBatchInformationList } = require(join(compiled, "engine", "chart", "construction.js"));
  const { createRenderFloat32 } = require(join(compiled, "backends", "renderingValidation.js"));
  const { RecordingSimulatorRendererBackend } = require(join(compiled, "backends", "recordingRendererBackend.js"));
  const { createRecordingSimulatorBackends } = require(join(compiled, "backends", "recordingBackend.js"));
  const { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } = require(join(compiled, "backends", "resources", "localResourceProvider.js"));
  const { createSimulatorEngine } = require(join(compiled, "host", "createSimulatorEngine.js"));
  const fixtureRoot = join(repositoryRoot, "tmp", "simulator-reverse-evidence", "chart-construction", "fixtures");
  const bms = readFileSync(join(fixtureRoot, "786_miracle_april_habahiro_special.txt"), "utf8");
  const chartResult = createNoteBatchInformationList({ musicScoreData: bms });
  ok(chartResult, "construct HABAHIRO production chart");
  equal(chartResult.value.habahiroChangeAbsolutePos, 1728, "locked lane-change position");
  const keyFixture = JSON.parse(readFileSync(join(testingRoot, "habahiroDegradedSpriteKeys.json"), "utf8"));
  equal(keyFixture.keys.length, 179, "degraded Sprite key count");
  const png = new Uint8Array(24);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52], 0);
  png.set([0,0,0,1,0,0,0,1], 16);
  const assetId = "asset.habahiro.external";
  const profile = {
    schemaVersion: 1,
    sample: { package: "jp.co.craftegg.band", versionName: "10.1.4", versionCode: 230, abi: "arm64-v8a" },
    packIdentity: "current-external-portable-habahiro-test-fixture",
    fidelity: { mode: "habahiro", fidelity: "degraded", profile: "current-external-portable-atlas", visibleLabel: "Approximate HABAHIRO" },
    networkAllowed: false,
    automaticFallbackAllowed: false,
    assets: [{
      logicalAssetId: assetId, role: "note-atlas", byteLength: png.byteLength,
      sha256: createHash("sha256").update(png).digest("hex").toUpperCase(), mime: "image/png",
      width: 1, height: 1,
      textureSettings: { scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "normal" },
      atlasRows: keyFixture.keys.map((exactKey) => ({ exactKey, x: 0, y: 0, width: 1, height: 1, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100 })),
      materialRole: "sprite", animationRole: "none", provenance: "current-external-portable",
    }],
    scene: {
      profileId: "degraded-habahiro-ordinary-proxy",
      components: ["sprite","atlas-sprite","mesh","line","mask","text","slider","animation"].map((component) => ({ component, support: "portable-equivalent" })),
      ordering: { tuple: ["domain-layer","source-depth-or-sorting-order","source-z","creation-sequence"], pixiDefaultZIndexAllowed: false },
      projection: { mode: "degraded-habahiro-ordinary-projection-proxy", viewportWidth: 1600, viewportHeight: 720, pixiOrigin: "top-left", worldCenterX: 0, worldCenterY: 0, cameraPositionZ: -15, nearClip: 0, farClip: 25, pixelsPerWorldUnit: 360, clampAllowed: false },
      roundPixels: false, resolution: 1, antialias: false,
    },
  };
  const renderer = new RecordingSimulatorRendererBackend();
  const provider = ok(ImmutableLocalRenderResourceProvider.create([
    { logicalAssetId: assetId, bytes: png },
  ]), "create degraded local provider");
  ok(await renderer.prepare("habahiro-production-replay", profile,
    provider, new PortableRenderResourcePreflightAdapter()), "prepare degraded renderer");
  const f32 = (value) => ok(createRenderFloat32(Math.fround(value)), `Float32 ${value}`);
  const v3 = (x,y,z) => Object.freeze({ x:f32(x), y:f32(y), z:f32(z) });
  const scene = Object.freeze({
    specificSpeed:f32(11), noteSettingScale:f32(1), launcherY:f32(5.420000076293945), targetCenterY:f32(-3.450000047683716), highAspectRatio:f32(1),
    noteStartPositions:Object.freeze(Array.from({length:7},(_,lane)=>v3(Math.fround((lane-3)*0.11),4.976500511169434,-13.5))),
    goalPositions:Object.freeze(Array.from({length:7},(_,lane)=>v3(Math.fround((lane-3)*2.2),-3.450000047683716,-13.5))),
    noteColor:Object.freeze({red:f32(1),green:f32(1),blue:f32(1),alpha:f32(1)}), noteDomainLayer:3,
    screenToSafeAreaRatio:f32(1), longMeshColor:Object.freeze({red:f32(.8),green:f32(.8),blue:f32(.8),alpha:f32(.6)}),
  });
  const engine = ok(createSimulatorEngine({
    chart: chartResult.value,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, playMode: { kind: "auto-live", resultTransform: "identity-no-active-situation-skill" } },
    rendering: { sessionId: "habahiro-production-replay", resources: { noteAtlasLogicalAssetId: assetId, directionalAtlasLogicalAssetId: assetId }, ordinaryNoteScene: scene },
  }, createRecordingSimulatorBackends(renderer)), "create degraded production engine");
  ok(engine.initialize(), "initialize degraded production engine");
  let snapshot = ok(engine.snapshot(), "initial degraded snapshot");
  for (let frame=0; frame<12000 && snapshot.adjustedMusicPosition<1730; frame++) {
    ok(engine.step(1/60), `degraded frame ${frame}`);
    snapshot = ok(engine.snapshot(), `degraded snapshot ${frame}`);
  }
  if (snapshot.adjustedMusicPosition < 1730) throw new Error("lane-change position was not reached");
  const commands = renderer.commandSnapshot();
  equal(commands.length, 4902, "degraded HABAHIRO exact command count");
  const phases = commands.filter((command) => command.kind === "set-hud" && command.renderObjectId === "render:habahiro:lane-change").map((command) => command.state.laneChangePhase);
  equal(phases.join(","), "flash-start,change-lane", "degraded lane-change command order");
  if (!commands.some((command) => command.kind === "set-hud" && command.renderObjectId === "render:hud:fidelity-label" && command.state.label === "Approximate HABAHIRO")) throw new Error("visible degraded label missing");
  ok(engine.dispose(), "dispose degraded production engine");
  equal(renderer.snapshot().objectCount, 0, "degraded replay releases every render owner");
  console.log(`render HABAHIRO degraded production replay passed: batches=${chartResult.value.noteBatches.length} lane=1728 commands=${commands.length}`);

  const ordinaryBms = readFileSync(join(fixtureRoot, "poppin_shuffle_special.txt"), "utf8");
  const ordinaryChart = createNoteBatchInformationList({ musicScoreData: ordinaryBms });
  ok(ordinaryChart, "construct ordinary production chart");
  const ordinaryAssetId = "asset.ordinary.note";
  const lineAsset = (logicalAssetId, materialRole) => ({
    logicalAssetId, role: "material-texture", byteLength: png.byteLength,
    sha256: createHash("sha256").update(png).digest("hex").toUpperCase(), mime: "image/png",
    width: 1, height: 1,
    textureSettings: { scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "normal" },
    atlasRows: [], materialRole, animationRole: "none", provenance: "current-apk",
  });
  const ordinaryKeys = [...keyFixture.keys, ...Array.from({ length: 7 }, (_, lane) => `note_flick_l_${lane}`), ...Array.from({ length: 7 }, (_, lane) => `note_flick_r_${lane}`)];
  const ordinaryProfile = {
    ...profile,
    packIdentity: "current-ordinary-production-audit",
    fidelity: { mode: "ordinary", fidelity: "exact-current" },
    assets: [{
      ...profile.assets[0], logicalAssetId: ordinaryAssetId, provenance: "current-apk",
      atlasRows: ordinaryKeys.map((exactKey) => ({ exactKey, x: 0, y: 0, width: 1, height: 1, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100 })),
    }, lineAsset("asset.ordinary.sync", "sync-line"),
      lineAsset("asset.ordinary.multiple-left", "multiple-directional-line"),
      lineAsset("asset.ordinary.multiple-right", "multiple-directional-line"),
      lineAsset("asset.ordinary.long", "long-note"),
      lineAsset("asset.ordinary.curve", "curve-note")],
    scene: { ...profile.scene, projection: { ...profile.scene.projection, mode: "current-ordinary-rhythmgame-orthographic" } },
  };
  const ordinaryRenderer = new RecordingSimulatorRendererBackend();
  const ordinaryResources = ordinaryProfile.assets.map((asset) => ({ logicalAssetId: asset.logicalAssetId, bytes: png }));
  ok(await ordinaryRenderer.prepare("ordinary-production-audit", ordinaryProfile,
    ok(ImmutableLocalRenderResourceProvider.create(ordinaryResources), "create ordinary local provider"),
    new PortableRenderResourcePreflightAdapter()), "prepare ordinary renderer");
  const ordinaryEngine = ok(createSimulatorEngine({
    chart: ordinaryChart.value,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, playMode: { kind: "auto-live", resultTransform: "identity-no-active-situation-skill" } },
    rendering: { sessionId: "ordinary-production-audit", resources: {
      noteAtlasLogicalAssetId: ordinaryAssetId, directionalAtlasLogicalAssetId: ordinaryAssetId,
      syncLineLogicalAssetId: "asset.ordinary.sync",
      multipleDirectionalLineLeftLogicalAssetId: "asset.ordinary.multiple-left",
      multipleDirectionalLineRightLogicalAssetId: "asset.ordinary.multiple-right",
      longNoteMaterialLogicalAssetId: "asset.ordinary.long",
      curveNoteMaterialLogicalAssetId: "asset.ordinary.curve",
    }, ordinaryNoteScene: { ...scene, syncLineEdgeMargin: f32(.2) } },
  }, createRecordingSimulatorBackends(ordinaryRenderer)), "create ordinary production audit engine");
  ok(ordinaryEngine.initialize(), "initialize ordinary production audit engine");
  let ordinaryFailure = null;
  let ordinaryCommandCount = ordinaryRenderer.drainCommandSnapshot().length;
  const ordinaryCommandDigest = createHash("sha256");
  for (let frame=0; frame<7200 && ordinaryFailure===null; frame++) {
    const result = ordinaryEngine.step(1/30);
    if (result.status === "evidence-required") ordinaryFailure = result;
    const frameCommands = ordinaryRenderer.drainCommandSnapshot();
    ordinaryCommandCount += frameCommands.length;
    for (const command of frameCommands) {
      ordinaryCommandDigest.update(`${command.kind}|${command.renderObjectId}|${command.frame}|${command.substep}\n`);
    }
  }
  if (ordinaryFailure !== null) {
    const ordinaryFailureSnapshot = ok(ordinaryEngine.snapshot(), "ordinary failure snapshot");
    const blockedBatch = ordinaryChart.value.noteBatches[ordinaryFailureSnapshot.managers.noteManager.nextBatchIndex];
    const blockedSummary = blockedBatch?.informationList.map((note) => `${note.index}:${note.buttonType}:${note.halfButtonIndex}:${note.fireNoteType}`).join("|") ?? "missing";
    throw new Error(`ordinary production blocker ${ordinaryFailure.capability}: ${blockedSummary}`);
  }
  const ordinarySnapshot = ok(ordinaryEngine.snapshot(), "ordinary completed snapshot");
  equal(ordinarySnapshot.managers.noteManager.nextBatchIndex, ordinaryChart.value.noteBatches.length, "ordinary consumed all production batches");
  ok(ordinaryEngine.dispose(), "dispose ordinary production audit engine");
  equal(ordinaryRenderer.snapshot().objectCount, 0, "ordinary replay releases every render owner");
  const ordinaryDigest = ordinaryCommandDigest.digest("hex");
  equal(ordinaryCommandCount, 159832, "ordinary exact command count");
  equal(ordinaryDigest, "e174b8f0ab2e943ba84ab45a2ee8ecaca9fbcdc235fb32176c7cf6c18834a0ec",
    "ordinary exact command identity digest");
  console.log(`render ordinary exact production replay passed: batches=${ordinaryChart.value.noteBatches.length} commands=${ordinaryCommandCount} digest=${ordinaryDigest}`);
}
function ok(result,message){if(result.status!=="ok")throw new Error(`${message}: ${result.capability}`);return result.value;}
function equal(actual,expected,message){if(!Object.is(actual,expected))throw new Error(`${message}: ${actual} !== ${expected}`);}
function run(command,args){const r=spawnSync(command,args,{cwd:repositoryRoot,encoding:"utf8",stdio:"inherit"});if(r.status!==0)throw new Error(`command failed: ${command} ${args.join(" ")}`);}
