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
  await verifyHabahiroCompleteReplay();
  await verifyLegacyRejectionAndOrdinaryReplay();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

async function verifyHabahiroCompleteReplay() {
  const compiled = join(outputRoot, "src", "simulator");
  const { createNoteBatchInformationList } = require(join(compiled, "engine", "chart", "construction.js"));
  const { createRenderFloat32 } = require(join(compiled, "backends", "renderingValidation.js"));
  const { RecordingSimulatorRendererBackend } = require(join(compiled, "backends", "recordingRendererBackend.js"));
  const { createRecordingSimulatorBackends } = require(join(compiled, "backends", "recordingBackend.js"));
  const { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } = require(join(compiled, "backends", "resources", "localResourceProvider.js"));
  const { createSimulatorEngine } = require(join(compiled, "host", "createSimulatorEngine.js"));
  const fixtureRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots", "chart-construction", "fixtures");
  const chartResult = createNoteBatchInformationList({
    musicScoreData: readFileSync(join(fixtureRoot, "786_miracle_april_habahiro_special.txt"), "utf8"),
  });
  ok(chartResult, "construct complete HABAHIRO chart");
  equal(chartResult.value.habahiroChangeAbsolutePos, 1728, "complete lane-change position");

  const atlasEvidence = JSON.parse(readFileSync(join(
    repositoryRoot, "src", "simulator", "testing", "fixtures", "habahiro-snapshots", "bestdori-atlas-profile.json",
  ), "utf8"));
  equal(atlasEvidence.atlas_row_count, 179, "frozen external Sprite row count");
  const png = new Uint8Array(24);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52], 0);
  png.set([0,0,0,1,0,0,0,1], 16);
  const hash = createHash("sha256").update(png).digest("hex").toUpperCase();
  const logical = (name) => `oracle.habahiro.${name.toLowerCase()}`;
  const textureGroups = new Map();
  for (const row of atlasEvidence.atlas_rows) {
    const rows = textureGroups.get(row.technical_name) ?? [];
    rows.push({
      exactKey: row.exact_key, x: 0, y: 0, width: 1, height: 1,
      pivotX: row.pivot_x, pivotY: row.pivot_y, pixelsPerUnit: row.pixels_per_unit,
    });
    textureGroups.set(row.technical_name, rows);
  }
  const flickRows = textureGroups.get("RhythmGameSprites1.png");
  const aliasSource = flickRows.find((row) => row.exactKey === "note_flick_top");
  for (const direction of ["l", "r"]) for (let lane=0; lane<7; lane++) {
    flickRows.push({ ...aliasSource, exactKey: `note_flick_${direction}_${lane}` });
  }
  const atlasAsset = (technicalName) => ({
    logicalAssetId: logical(technicalName), role: "note-atlas", byteLength: png.byteLength,
    sha256: hash, mime: "image/png", width: 1, height: 1,
    textureSettings: { scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "normal" },
    atlasRows: textureGroups.get(technicalName), materialRole: "sprite", animationRole: "none",
    provenance: "current-external-portable",
  });
  const materialAsset = (name, role) => ({
    logicalAssetId: logical(name), role: "material-texture", byteLength: png.byteLength,
    sha256: hash, mime: "image/png", width: 1, height: 1,
    textureSettings: { scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "normal" },
    atlasRows: [], materialRole: role, animationRole: "none", provenance: "current-external-portable",
  });
  const profile = {
    schemaVersion: 1,
    sample: { package: "jp.co.craftegg.band", versionName: "10.1.4", versionCode: 230, abi: "arm64-v8a" },
    packIdentity: "habahiro-static-bestdori-complete-oracle",
    fidelity: { mode: "habahiro", fidelity: "current-external-complete" },
    networkAllowed: false, automaticFallbackAllowed: false,
    assets: [
      atlasAsset("RhythmGameSprites1.png"), atlasAsset("RhythmGameSprites2.png"),
      atlasAsset("RhythmGameSprites3.png"), atlasAsset("RhythmGameSprites4.png"),
      atlasAsset("RhythmGameSprites5.png"), atlasAsset("RhythmGameSprites16.png"),
      materialAsset("sync", "sync-line"), materialAsset("long", "long-note"),
      materialAsset("curve", "curve-note"), materialAsset("multiple-left", "multiple-directional-line"),
      materialAsset("multiple-right", "multiple-directional-line"),
    ],
    scene: {
      profileId: "habahiro-complete-oracle",
      components: ["sprite","atlas-sprite","mesh","line","mask","text","slider","animation"].map((component) => ({ component, support: "portable-equivalent" })),
      ordering: { tuple: ["domain-layer","source-depth-or-sorting-order","source-z","creation-sequence"], pixiDefaultZIndexAllowed: false },
      projection: { mode: "habahiro-current-external", viewportWidth: 1600, viewportHeight: 720, pixiOrigin: "top-left", worldCenterX: 0, worldCenterY: 0, cameraPositionZ: -15, nearClip: 0, farClip: 25, pixelsPerWorldUnit: 360, clampAllowed: false },
      roundPixels: false, resolution: 1, antialias: false,
    },
  };
  const renderer = new RecordingSimulatorRendererBackend();
  const resources = profile.assets.map((asset) => ({ logicalAssetId: asset.logicalAssetId, bytes: png }));
  ok(await renderer.prepare("habahiro-complete-oracle", profile,
    ok(ImmutableLocalRenderResourceProvider.create(resources), "create complete provider"),
    new PortableRenderResourcePreflightAdapter()), "prepare complete renderer");
  const completeFidelity = renderer.snapshot().fidelity;
  equal(completeFidelity?.fidelity, "current-external-complete", "runtime exposes complete HABAHIRO fidelity");
  if (completeFidelity != null && ("visibleLabel" in completeFidelity || "machineReadableFlag" in completeFidelity || "differenceProfile" in completeFidelity)) {
    throw new Error("complete HABAHIRO fidelity leaked documentation-only approximation metadata");
  }
  const f32 = (value) => ok(createRenderFloat32(Math.fround(value)), `Float32 ${value}`);
  const v2 = (x,y) => Object.freeze({ x:f32(x), y:f32(y) });
  const v3 = (x,y,z) => Object.freeze({ x:f32(x), y:f32(y), z:f32(z) });
  const white = Object.freeze({ red:f32(1), green:f32(1), blue:f32(1), alpha:f32(1) });
  const ordering = (sequence, depth) => Object.freeze({ domainLayer:1, sourceDepthOrSortingOrder:depth, sourceZ:f32(0), creationSequence:sequence });
  const fieldBefore = Object.freeze([
    Object.freeze({ renderObjectId:"render:habahiro:field", poolFamily:"habahiro-field", role:"field-line", parentObjectId:null, logicalAssetId:logical("RhythmGameSprites4.png"), exactKey:"note_normal_0", position:v3(0,0,0), scale:v2(1,1), rotationDegrees:f32(0), color:white, ordering:ordering(1,0), maskObjectId:"render:habahiro:field-mask" }),
    Object.freeze({ renderObjectId:"render:habahiro:judge-line", poolFamily:"habahiro-judge", role:"judge-line", parentObjectId:null, logicalAssetId:logical("RhythmGameSprites4.png"), exactKey:"note_normal_0", position:v3(0,-3.45,0), scale:v2(1,1), rotationDegrees:f32(0), color:white, ordering:ordering(2,1), maskObjectId:null }),
  ]);
  const fieldAfter = Object.freeze([
    Object.freeze({ ...fieldBefore[0], position:v3(0,-0.25,0), scale:v2(1.05,1) }),
    Object.freeze({ ...fieldBefore[1], position:v3(0,-3.2,0), scale:v2(1.05,1) }),
  ]);
  const scene = Object.freeze({
    specificSpeed:f32(11), noteSettingScale:f32(1), launcherY:f32(5.420000076293945), targetCenterY:f32(-3.450000047683716), highAspectRatio:f32(1),
    noteStartPositions:Object.freeze(Array.from({length:7},(_,lane)=>v3(Math.fround((lane-3)*0.11),4.976500511169434,-13.5))),
    goalPositions:Object.freeze(Array.from({length:7},(_,lane)=>v3(Math.fround((lane-3)*2.2),-3.450000047683716,-13.5))),
    noteColor:white, noteDomainLayer:3, screenToSafeAreaRatio:f32(1), syncLineEdgeMargin:f32(.2),
    longMeshColor:Object.freeze({red:f32(.8),green:f32(.8),blue:f32(.8),alpha:f32(.6)}),
    habahiro:Object.freeze({
      meshWidthSetting:f32(1), flashDurationSeconds:f32(.25), fieldBefore, fieldAfter,
      fieldMasks:Object.freeze([Object.freeze({ renderObjectId:"render:habahiro:field-mask", parentObjectId:null,
        polygon:Object.freeze([v2(-4,-5),v2(4,-5),v2(4,5),v2(-4,5)]), position:v3(0,0,0), scale:v2(1,1),
        rotationDegrees:f32(0), ordering:ordering(0,-1) })]),
    }),
  });
  const atlasIds = {
    normal:logical("RhythmGameSprites4.png"), normal16:logical("RhythmGameSprites16.png"),
    skill:logical("RhythmGameSprites5.png"), flick:logical("RhythmGameSprites1.png"),
    long:logical("RhythmGameSprites2.png"), longFlash:logical("RhythmGameSprites3.png"),
    slideAmong:logical("RhythmGameSprites2.png"),
  };
  const engine = ok(createSimulatorEngine({
    chart: chartResult.value,
    runtime: { highFrequencyMode:false, judgeOffsetFrames:0, playMode:{ kind:"auto-live", resultTransform:"identity" } },
    rendering: { sessionId:"habahiro-complete-oracle", resources: {
      noteAtlasLogicalAssetId:atlasIds.normal, directionalAtlasLogicalAssetId:atlasIds.flick,
      habahiroAtlasLogicalAssetIds:atlasIds, syncLineLogicalAssetId:logical("sync"),
      longNoteMaterialLogicalAssetId:logical("long"), curveNoteMaterialLogicalAssetId:logical("curve"),
      multipleDirectionalLineLeftLogicalAssetId:logical("multiple-left"),
      multipleDirectionalLineRightLogicalAssetId:logical("multiple-right"),
    }, ordinaryNoteScene:scene },
  }, createRecordingSimulatorBackends(renderer)), "create complete HABAHIRO engine");
  ok(engine.initialize(), "initialize complete HABAHIRO engine");
  let failure = null;
  let snapshot = ok(engine.snapshot(), "complete initial snapshot");
  const digest = createHash("sha256");
  let commandCount = 0;
  let flashStartCommandIndex = -1;
  let fieldChangeCommandIndex = -1;
  let flashStopCommandIndex = -1;
  let sawAdvancedMesh = false;
  let sawLongFlash = false;
  let sawFieldMask = false;
  let sawRuntimeModeLabel = false;
  let frames = 0;
  for (; frames<12000 && failure===null; frames++) {
    const result = engine.step(1/60);
    if (result.status === "evidence-required") failure = result;
    const commands = renderer.drainCommandSnapshot();
    commandCount += commands.length;
    for (const [localIndex, command] of commands.entries()) {
      digest.update(`${command.kind}|${command.renderObjectId}|${command.frame}|${command.substep}\n`);
      const commandIndex = commandCount - commands.length + localIndex;
      if (command.kind === "play-animation" && command.animationRole === "habahiro-lane-change") flashStartCommandIndex = commandIndex;
      if (flashStartCommandIndex >= 0 && fieldChangeCommandIndex < 0 && command.kind === "set-transform" && command.renderObjectId === "render:habahiro:field") fieldChangeCommandIndex = commandIndex;
      if (command.kind === "stop-animation" && command.animationRole === "habahiro-lane-change") flashStopCommandIndex = commandIndex;
      if (command.kind === "set-mesh" && command.vertices.length === 42 && command.indices.length === 120) sawAdvancedMesh = true;
      if (command.kind === "bind-resource" && command.exactKey?.startsWith("note_long_flash_")) sawLongFlash = true;
      if (command.kind === "set-mask" && command.renderObjectId === "render:habahiro:field-mask") sawFieldMask = true;
      if (command.renderObjectId === "render:hud:fidelity-label" || command.renderObjectId === "render:habahiro:lane-change") sawRuntimeModeLabel = true;
    }
    snapshot = ok(engine.snapshot(), `complete snapshot ${frames}`);
    if (snapshot.managers.noteManager.nextBatchIndex === chartResult.value.noteBatches.length && snapshot.adjustedMusicPosition > 1730) break;
  }
  if (failure === null) throw new Error("HABAHIRO external Note animation route did not fail closed");
  equal(failure.capability, "render.habahiro.external-note-animation-evidence-required",
    "HABAHIRO external atlas cannot consume ordinary Note clips");
  ok(engine.dispose(), "dispose fail-closed HABAHIRO engine");
  equal(renderer.snapshot().objectCount, 0, "fail-closed HABAHIRO replay releases all owners");
  console.log(`render HABAHIRO external animation route failed closed as contracted: frame=${frames} capability=${failure.capability}`);

}

async function verifyLegacyRejectionAndOrdinaryReplay() {
  const compiled = join(outputRoot, "src", "simulator");
  const { createNoteBatchInformationList } = require(join(compiled, "engine", "chart", "construction.js"));
  const { createRenderFloat32 } = require(join(compiled, "backends", "renderingValidation.js"));
  const { RecordingSimulatorRendererBackend } = require(join(compiled, "backends", "recordingRendererBackend.js"));
  const { createRecordingSimulatorBackends } = require(join(compiled, "backends", "recordingBackend.js"));
  const { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } = require(join(compiled, "backends", "resources", "localResourceProvider.js"));
  const { createSimulatorEngine } = require(join(compiled, "host", "createSimulatorEngine.js"));
  const fixtureRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots", "chart-construction", "fixtures");
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
    fidelity: { mode: "habahiro", fidelity: "degraded", profile: "current-external-portable-atlas", visibleLabel: "HABAHIRO" },
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
  const legacyCreation = createSimulatorEngine({
    chart: chartResult.value,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, playMode: { kind: "auto-live", resultTransform: "identity" } },
    rendering: { sessionId: "habahiro-production-replay", resources: { noteAtlasLogicalAssetId: assetId, directionalAtlasLogicalAssetId: assetId }, ordinaryNoteScene: scene },
  }, createRecordingSimulatorBackends(renderer));
  equal(legacyCreation.status, "evidence-required", "legacy degraded profile is not a production engine mode");
  equal(legacyCreation.status === "evidence-required" ? legacyCreation.capability : null,
    "render.note.non-ordinary-scene-lifecycle-unimplemented", "legacy rejection capability");
  equal(renderer.snapshot().objectCount, 0, "legacy rejection creates no render owner");
  ok(renderer.dispose(), "dispose rejected legacy renderer");
  console.log("render HABAHIRO legacy degraded production profile rejected before engine creation");

  console.log("ordinary actual Pixi full-chart replay is owned by renderPixi.test.ts with real Score/Life resources");

}
function ok(result,message){if(result.status!=="ok")throw new Error(`${message}: ${result.capability}`);return result.value;}
function equal(actual,expected,message){if(!Object.is(actual,expected))throw new Error(`${message}: ${actual} !== ${expected}`);}
function run(command,args){const r=spawnSync(command,args,{cwd:repositoryRoot,encoding:"utf8",stdio:"inherit"});if(r.status!==0)throw new Error(`command failed: ${command} ${args.join(" ")}`);}
