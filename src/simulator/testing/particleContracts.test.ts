declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import type {
  ParticleCommand,
  ParticleOperationResult,
  ParticlePixiSceneProfile,
  ParticleRenderSample,
  ParticleRendererBackendSnapshot,
  ParticleRendererFrameBatch,
  ParticleRendererFrameRequest,
  ParticleResourceProvider,
  ParticleRootId,
  SimulatorParticleRendererBackend,
} from "../backends/particleContracts";
import {
  particleAccepted,
  particleFloat32FromBits,
  particleFloat32ToBits,
  particleRejected,
} from "../backends/particleValidation";
import { DeterministicSimulatorParticleBackend } from "../backends/particles/deterministicParticleBackend";
import { BrowserPixiParticleTextureDecoder } from "../backends/pixi/browserPixiParticleTextureDecoder";
import { createPixiCombinedScene } from "../backends/pixi/pixiCombinedScene";
import {
  PixiParticleRendererBackend,
  type ParticlePixiTextureDecoder,
} from "../backends/pixi/pixiParticleRendererBackend";
import { RecordingSimulatorParticleBackend } from "../backends/recordingParticleBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import {
  ImmutableLocalParticleResourceProvider,
  PortableParticleResourcePreflightAdapter,
} from "../backends/resources/localParticleResourceProvider";
import { prepareCurrentParticleResources } from "../backends/resources/particleResourcePreparation";
import { GameNoteType } from "../engine/chart/types";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { NoteResultType } from "../engine/data/manualJudgement";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import { ParticleFrameCoordinator } from "../engine/particles/particleFrameCoordinator";
import {
  resolveParticleJudgementRoot,
} from "../engine/particles/particleRouteResolver";
import { DeterministicParticleSimulation } from "../engine/particles/particleSimulation";
import type { SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createPortableReplaySimulatorEngine } from "../host/portableReplaySession";
import { observePixiWorld } from "./pixiWorldObserver";

const fixtureBase = join(
  process.cwd(), "src", "simulator", "testing", "fixtures", "reverse-snapshots",
);
const fixtureRoot = join(
  fixtureBase, "device-closure", "artifacts", "investigations", "device-runtime-closure-10-1-4",
);
const commandOracle = fixtureJson("particle_command_oracle.json");
const simulationOracle = fixtureJson("particle_simulation_oracle.json");
const semanticOracle = fixtureJson("particle_semantic_frame_oracle.json");
const closure = fixtureJson("particle_portable_closure.json");
const totalReauditFixture = JSON.parse(readFileSync(join(
  fixtureBase,
  "ordinary-rendering-total-reaudit", "artifacts", "investigations",
  "ordinary-single-rendering-total-reaudit-10-1-4", "ordinary_rendering_candidate_fixture.json",
), "utf8"));

const resourceFiles = Object.freeze({
  "particle/profile/current-portable-v1": "particle_portable_profile.json",
  "particle/textures/current-portable-v1": "particle_portable_texture_manifest.json",
  "particle-texture:directional:Default-ParticleSystem": "particle-portable-textures/directional/Default-ParticleSystem.png",
  "particle-texture:directional:tex_parSet_1": "particle-portable-textures/directional/tex_parSet_1.png",
  "particle-texture:ordinary:Default-Particle": "particle-portable-textures/ordinary/Default-Particle.png",
  "particle-texture:ordinary:Tex_parSet_1": "particle-portable-textures/ordinary/Tex_parSet_1.png",
  "particle-texture:ordinary:Tex_parSet_2": "particle-portable-textures/ordinary/Tex_parSet_2.png",
  "particle-texture:ordinary:effect_circle": "particle-portable-textures/ordinary/effect_circle.png",
  "particle-texture:ordinary:light": "particle-portable-textures/ordinary/light.png",
});
const resourceRows = Object.entries(resourceFiles).map(([logicalAssetId, relative]) => ({
  logicalAssetId,
  bytes: new Uint8Array(readFileSync(join(fixtureRoot, relative))),
}));
const preflight = new PortableParticleResourcePreflightAdapter();
const chart = requireOk(createNoteBatchInformationList({
  musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n",
}), "construct particle chart");

async function main(): Promise<void> {
  verifyClosureAndOracleIdentity();
  const prepared = await testResourcesAndPrepare();
  testCommandOracle();
  testSimulationOracle(prepared.profile);
  await testBackends();
  await testPixiMapping(prepared.profile);
  await testOuterFrameAndFailure();
  await testWholeEngineReplay();
  console.log("particle DC-C01-C46 contracts passed: routes=32 simulation=5 corpus=17 semantic=4");
}

function verifyClosureAndOracleIdentity(): void {
  assert.equal(commandOracle.generatedBeforeTypescript, true);
  assert.equal(commandOracle.caseCount, 32);
  assert.equal(commandOracle.projectionSha256, "3A04C1042AA0CBEECDFB8480EA30E9B02A3E83FE50D4C704A28FC61C67D162D3");
  assert.equal(simulationOracle.generatedBeforeTypescript, true);
  assert.equal(simulationOracle.caseCount, 5);
  assert.equal(simulationOracle.corpusRootCount, 17);
  assert.equal(simulationOracle.projectionSha256, "B874672BDFA53B65D4C406C91E16F7775B365B4CC1DA8FF44447F1EAC758568D");
  assert.equal(simulationOracle.corpusProjectionSha256, "96D1CABE8ED5AD65B9BBAAAE81230C47BE5F905E30C8C82E975A2C6987107246");
  assert.equal(semanticOracle.generatedBeforeTypescript, true);
  assert.equal(semanticOracle.physicalOrderingClaimed, false);
  assert.deepEqual(semanticOracle.commitOrder, [
    "OneFrame", "business-state", "particle-command-and-simulation",
    "audio-command", "render-command-and-particle-sample",
  ]);
  assert.equal(semanticOracle.projectionSha256, "4EF7A236BA19B73C44087BB9A11C77F8CF9DA9C73CCD97E5E087FC66DA7BC954");
  assert.equal(closure.ledgerCount, 97);
  assert.equal(closure.ledger.length, 97);
  assert.equal(new Set(closure.ledger.map((row: any) => row.id)).size, 97, "particle raw ledger identities are unique; legacy gate/authorization fields are ignored");
  assert.deepEqual(closure.exactOpenClaims, [
    "real 120/adaptive cadence",
    "GPU/driver framebuffer",
    "visible onset/peak",
    "CRI/Android/speaker output",
  ]);
}

async function testResourcesAndPrepare() {
  const provider = localProvider();
  const prepared = await prepareCurrentParticleResources(provider, preflight);
  assert.equal(prepared.status, "accepted");
  if (prepared.status !== "accepted") throw new Error(prepared.failure.capability);
  assert.equal(prepared.value.profile.systemCount, 120);
  assert.equal(prepared.value.profile.profileCount, 100);
  assert.equal(prepared.value.profile.bundles.length, 2);
  assert.equal(prepared.value.pngBytes.size, 7);
  assert.equal(prepared.value.textures.logicalTextureCount, 8);
  assert.equal(prepared.value.textures.uniquePngCount, 7);
  assert.ok(Object.isFrozen(prepared.value.profile));

  const missingRows = resourceRows.slice(0, -1);
  const missing = await prepareCurrentParticleResources(localProvider(missingRows), preflight);
  assert.notEqual(missing.status, "accepted");

  const corruptRows = resourceRows.map((row, index) => ({
    logicalAssetId: row.logicalAssetId,
    bytes: index === resourceRows.length - 1
      ? Uint8Array.from([...row.bytes.slice(0, -1), row.bytes[row.bytes.length - 1]! ^ 1])
      : row.bytes,
  }));
  const corruptBackend = new RecordingSimulatorParticleBackend();
  const corrupt = await corruptBackend.prepare("corrupt", localProvider(corruptRows), preflight);
  assert.notEqual(corrupt.status, "accepted");
  assert.equal(corruptBackend.snapshot().state, "unprepared");
  assert.equal(corruptBackend.snapshot().resourceCount, 0);
  assert.equal(corruptBackend.snapshot().nextSequence, 0);
  return prepared.value;
}

function testCommandOracle(): void {
  const actual: unknown[] = [];
  for (const entry of commandOracle.cases) {
    const input = entry.case;
    if (input.route === "tap-keep-start" || input.route === "tap-keep-stop" || input.route === "movetime") {
      actual.push({ case: input, expected: producerExpected(input) });
      continue;
    }
    if (input.route === "unknown-enum") {
      const result = resolveParticleJudgementRoot({
        result: 99 as never,
        judgeNoteType: 0,
        gameNoteType: GameNoteType.Normal,
        isSkillNote: false,
        multipleDirectionalFlickNoteCount: 0,
        rangeLength: 1,
      });
      actual.push({ case: input, expected: { error: result.status } });
      continue;
    }
    const resultName = input.result as keyof typeof NoteResultType;
    const result = NoteResultType[resultName];
    const isDirectional = input.route === "directional";
    const routed = resolveParticleJudgementRoot({
      result,
      judgeNoteType: isDirectional ? 6 : input.route === "flick" ? 3 : 0,
      gameNoteType: isDirectional
        ? input.side === "left" ? GameNoteType.DirectionalFlickLeft : GameNoteType.DirectionalFlickRight
        : GameNoteType.Normal,
      isSkillNote: input.route === "skill",
      multipleDirectionalFlickNoteCount: input.count ?? 0,
      rangeLength: input.rangeLength ?? 1,
    });
    if (routed.status !== "ok") {
      actual.push({ case: input, expected: { error: routed.status } });
    } else {
      actual.push({
        case: input,
        expected: routed.value === null ? [] : [{
          kind: "play-root",
          root: routed.value,
          restartIfActive: true,
        }],
      });
    }
  }
  assert.deepEqual(actual, commandOracle.cases);
  assert.equal(sha256Canonical(actual), commandOracle.projectionSha256);
}

function producerExpected(input: any): unknown {
  const producer = new ParticleCommandProducer(chart);
  if (input.route === "tap-keep-start") {
    const transaction = requireOk(producer.preflightButtonTapKeepStart(0, input.rangeLength), "TapKeep start");
    return projectCommands(transaction.commands);
  }
  if (input.route === "tap-keep-stop") {
    const start = requireOk(producer.preflightButtonTapKeepStart(0, 1), "TapKeep stop setup");
    requireOk(start.commit(), "TapKeep setup commit");
    return projectCommands(requireOk(producer.preflightButtonTapKeepStop(0), "TapKeep stop").commands);
  }
  return projectCommands(requireOk(producer.preflightMoveTime(), "MoveTime").commands);
}

function testSimulationOracle(profile: any): void {
  for (const entry of simulationOracle.cases.slice(0, 4)) {
    const simulation = new DeterministicParticleSimulation(profile);
    simulation.playRoot("button:0", buttonInstance(entry.root, 1), entry.root);
    for (const expectedFrame of entry.frames) {
      const delta = particleFloat32FromBits(expectedFrame.deltaBits);
      assert.notEqual(delta, null);
      simulation.step(delta!, expectedFrame.paused);
      const projected = simulation.samples().map(projectSample);
      assert.equal(projected.length, expectedFrame.sampleCount, `${entry.case} frame ${expectedFrame.frame} count`);
      assert.equal(sha256Canonical(projected), expectedFrame.sampleSha256, `${entry.case} frame ${expectedFrame.frame} digest`);
    }
    const final = simulation.samples().map(projectSample);
    assert.equal(final.length, entry.finalSampleCount);
    assert.deepEqual(final.slice(0, 32), entry.finalSamples);
    assert.equal(sha256Canonical(final), entry.finalSampleSha256);
    const rootSystems = rootSystemIds(profile, entry.root);
    const random = simulation.randomStateSnapshot()
      .filter((state) => rootSystems.has(state.systemId))
      .map((state) => ({ systemId: state.systemId, stateU32: [...state.stateU32] }));
    assert.deepEqual(random, entry.randomState);
  }

  const restart = simulationOracle.cases[4];
  const simulation = new DeterministicParticleSimulation(profile);
  simulation.playRoot("button:0", buttonInstance(restart.root, 1), restart.root);
  simulation.step(Math.fround(1 / 60), false);
  assert.equal(sha256Canonical(simulation.samples().map(projectSample)), restart.beforeSha256);
  simulation.playRoot("button:0", buttonInstance(restart.root, 1), restart.root);
  simulation.step(Math.fround(1 / 60), false);
  const restarted = simulation.samples().map(projectSample);
  assert.equal(restarted.length, restart.afterSampleCount);
  assert.deepEqual(restarted.slice(0, 32), restart.afterSamples);
  assert.equal(sha256Canonical(restarted), restart.afterSha256);

  const corpusActual: unknown[] = [];
  for (const expected of simulationOracle.corpusSmoke) {
    const world = new DeterministicParticleSimulation(profile);
    world.playRoot("button:0", buttonInstance(expected.root, null), expected.root);
    world.step(Math.fround(1 / 120), false);
    world.step(Math.fround(1 / 60), false);
    world.step(Math.fround(0.023), false);
    const samples = world.samples().map(projectSample);
    const roots = rootSystemIds(profile, expected.root);
    const random = world.randomStateSnapshot()
      .filter((state) => roots.has(state.systemId))
      .map((state) => ({ systemId: state.systemId, stateU32: [...state.stateU32] }));
    corpusActual.push({
      root: expected.root,
      sampleCount: samples.length,
      sampleSha256: sha256Canonical(samples),
      randomStateSha256: sha256Canonical(random),
    });
  }
  assert.deepEqual(corpusActual, simulationOracle.corpusSmoke);
  assert.equal(sha256Canonical(corpusActual), simulationOracle.corpusProjectionSha256);
}

async function testBackends(): Promise<void> {
  const backend = await readyDeterministic("deterministic-contract");
  const initialRandom = backend.snapshot().randomState;
  const command = playCommand("owner", "ordinary:effect_tap_good", 0, 1);
  const pending = accepted(backend.preflightFrame({
    frame: 17,
    deltaTimeBits: "0x3C888889",
    paused: false,
    commands: [command],
  }), "deterministic preflight");
  assert.equal(accepted(backend.previewFrame(pending), "preview").length, 9);
  assert.equal(backend.snapshot().frames.length, 0);
  assert.equal(backend.discardFrame(pending).status, "accepted");
  assert.deepEqual(backend.snapshot().randomState, initialRandom);
  assert.equal(backend.snapshot().nextSequence, 0);

  const committed = accepted(backend.preflightFrame({
    frame: 17,
    deltaTimeBits: "0x3C888889",
    paused: false,
    commands: [command],
  }), "deterministic recommit preflight");
  assert.equal(backend.commitFrame(committed).status, "accepted");
  assert.notEqual(backend.commitFrame(committed).status, "accepted");
  assert.equal(backend.snapshot().nextFrame, 18);
  assert.equal(backend.snapshot().nextSequence, 1);
  assert.equal(backend.snapshot().activeOwners[0]?.restartCount, 0);

  const randomBeforePause = backend.snapshot().randomState;
  const paused = accepted(backend.preflightFrame({
    frame: 18,
    deltaTimeBits: "0x3C888889",
    paused: true,
    commands: [],
  }), "paused preflight");
  assert.equal(backend.commitFrame(paused).status, "accepted");
  assert.deepEqual(backend.snapshot().randomState, randomBeforePause);
  assert.deepEqual(
    backend.snapshot().frames[1]?.samples,
    backend.snapshot().frames[0]?.samples,
  );
  assert.equal(backend.recordTerminalFault("first", "first-boundary").status, "particle-backend-fault");
  const firstFault = backend.snapshot().fault;
  backend.recordTerminalFault("second", "second-boundary");
  assert.deepEqual(backend.snapshot().fault, firstFault);
  assert.equal(backend.dispose().status, "accepted");
  assert.equal(backend.dispose().status, "accepted");
  assert.equal(backend.snapshot().state, "disposed");
  assert.equal(backend.snapshot().activeOwners.length, 0);

  const recording = await readyRecording("recording-contract");
  const move = accepted(recording.preflightFrame({
    frame: 0,
    deltaTimeBits: "0x00000000",
    paused: false,
    commands: [
      { kind: "clear-all", reason: "movetime" },
      { kind: "suppress-until-replay", reason: "movetime" },
    ],
  }), "recording MoveTime");
  assert.equal(recording.commitFrame(move).status, "accepted");
  assert.equal(recording.snapshot().suppressedUntilReplay, true);
  assert.notEqual(recording.preflightFrame({
    frame: 1,
    deltaTimeBits: "0x00000000",
    paused: false,
    commands: [playCommand("foreign", "ordinary:effect_tap", 0, 1)],
  }).status, "accepted");
  assert.equal(recording.dispose().status, "accepted");
}

async function testPixiMapping(profile: any): Promise<void> {
  const decoder: ParticlePixiTextureDecoder = {
    async decodePng(asset) {
      const source = new TextureSource({
        width: asset.width!,
        height: asset.height!,
        resource: { width: asset.width!, height: asset.height! },
        resolution: 1,
        autoGarbageCollect: false,
      });
      return particleAccepted(new Texture({ source, label: asset.logicalAssetId }));
    },
  };
  const renderer = new PixiParticleRendererBackend(decoder);
  assert.equal((await renderer.prepare("pixi-particle", particleScene(), localProvider(), preflight)).status, "accepted");
  assert.equal(renderer.snapshot().resourceCount, 7);
  const backend = await readyDeterministic("pixi-particle");
  const frame = accepted(backend.preflightFrame({
    frame: 0,
    deltaTimeBits: "0x3C888889",
    paused: false,
    commands: [playCommand("pixi-owner", "ordinary:effect_tap_good", 3, 1)],
  }), "Pixi source frame");
  const samples = accepted(backend.previewFrame(frame), "Pixi source preview");
  const renderFrame = accepted(renderer.preflightFrame({
    sessionId: "pixi-particle",
    frame: 0,
    samples,
  }), "Pixi frame preflight");
  assert.equal(renderer.snapshot().nodeCount, 0);
  assert.equal(backend.commitFrame(frame).status, "accepted");
  assert.equal(renderer.commitFrame(renderFrame).status, "accepted");
  assert.equal(renderer.snapshot().nodeCount, samples.length);
  assert.equal(renderer.sceneSnapshot().length, samples.length);
  assert.ok(renderer.sceneSnapshot().every((entry) => Number.isFinite(entry.position[0]) && Number.isFinite(entry.position[1])));
  assert.ok((renderer.stage.children as Sprite[]).every((sprite) =>
    sprite.texture.source.alphaMode === "no-premultiply-alpha" && sprite.blendMode === "add"),
  "current enabled Mobile/Particles/Additive sprites retain straight-alpha upload and Pixi's add→add-npm adjustment inputs");

  const visibleWorld = new DeterministicParticleSimulation(profile);
  visibleWorld.playRoot("visible-owner", buttonInstance("ordinary:effect_tap_perfect", 1, 3), "ordinary:effect_tap_perfect");
  visibleWorld.step(Math.fround(1 / 30), false);
  const visibleSamples = visibleWorld.samples();
  const visibleFrame = accepted(renderer.preflightFrame({
    sessionId: "pixi-particle",
    frame: 1,
    samples: visibleSamples,
  }), "Pixi visible composition frame");
  assert.equal(renderer.commitFrame(visibleFrame).status, "accepted");
  const sprites = renderer.stage.children as Sprite[];
  assert.equal(sprites.length, visibleSamples.length);
  const uvSample = visibleSamples.find((sample) => sample.uvFrame !== 0 && uvProfile(profile, sample.systemId) !== null)!;
  assert.ok(uvSample, "visible particle frame contains one non-zero texture-sheet frame");
  const uvSprite = sprites.find((sprite) => sprite.label === uvSample.particleId)!;
  const uv = uvProfile(profile, uvSample.systemId)!;
  const uvTileWidth = uv.textureWidth / uv.tilesX;
  const uvTileHeight = uv.textureHeight / uv.tilesY;
  assert.equal(uvSprite.texture.frame.x, (uvSample.uvFrame % uv.tilesX) * uvTileWidth);
  assert.equal(
    uvSprite.texture.frame.y,
    (uv.tilesY - 1 - Math.floor(uvSample.uvFrame / uv.tilesX)) * uvTileHeight,
    "Unity bottom-up texture-sheet row maps to the corresponding top-down Pixi frame",
  );
  assert.equal(uvSprite.texture.frame.width, uvTileWidth);
  assert.equal(uvSprite.texture.frame.height, uvTileHeight);
  const uvWorldObservation = observePixiWorld(renderer.stage);
  verifyObservedUvRow(uvWorldObservation, uvSample.particleId, uvSprite.texture.frame.y);
  const uvRowMutation = structuredClone(uvWorldObservation) as any;
  uvRowMutation.records.find((record: any) => record.label === uvSample.particleId).texture.frame[1] += uvTileHeight;
  assert.throws(() => verifyObservedUvRow(uvRowMutation, uvSample.particleId, uvSprite.texture.frame.y),
    "particle UV-row mutation sentinel must fail");

  const localSample = visibleSamples.find((sample) => sample.renderAlignment === 2)!;
  assert.ok(localSample, "visible particle frame contains local-aligned geometry");
  const localSprite = sprites.find((sprite) => sprite.label === localSample.particleId)!;
  const localMatrix = localSprite.localTransform;
  assert.ok([localMatrix.a, localMatrix.b, localMatrix.c, localMatrix.d].every(Number.isFinite));
  const naiveCameraFacingD = particleFloat32FromBits(localSample.size.yBits)! * 360 / localSprite.texture.height;
  assert.ok(Math.abs(Math.abs(localMatrix.d) - Math.abs(naiveCameraFacingD)) > 1e-6,
    "local-aligned particle consumes the authored projected 3D system basis rather than a camera-facing fallback");

  const rotatingSample = visibleSamples.find((sample) => sample.renderMode === 0 && sample.renderAlignment === 0 &&
    Math.abs(particleFloat32FromBits(sample.rotation.zBits)!) > 1e-5)!;
  assert.ok(rotatingSample, "visible particle frame contains a rotating camera-facing billboard");
  const rotatingSprite = sprites.find((sprite) => sprite.label === rotatingSample.particleId)!;
  assert.ok(angleClose(
    rotatingSprite.rotation,
    -particleFloat32FromBits(rotatingSample.rotation.zBits)!,
  ), "Unity counter-clockwise billboard rotation is reflected into Pixi's Y-down scene");

  const stretchedSample = visibleSamples.find((sample) => sample.renderMode === 1 &&
    (particleFloat32FromBits(sample.velocity.xBits) !== 0 || particleFloat32FromBits(sample.velocity.yBits) !== 0))!;
  assert.ok(stretchedSample, "visible particle frame contains velocity-stretched geometry");
  const stretchedSprite = sprites.find((sprite) => sprite.label === stretchedSample.particleId)!;
  const velocityX = particleFloat32FromBits(stretchedSample.velocity.xBits)!;
  const velocityY = particleFloat32FromBits(stretchedSample.velocity.yBits)!;
  assert.ok(angleClose(stretchedSprite.rotation, Math.atan2(-velocityY, velocityX) - Math.PI / 2),
    "stretched major axis follows the projected velocity after Unity Y-up to Pixi Y-down reflection");

  const routeRoots = [...new Set<string>(profile.bundles.flatMap((bundle: any) =>
    bundle.systems.map((system: any) => system.root)))].sort();
  assert.equal(routeRoots.length, 17);
  const observedTextures = new Set<string>();
  let nextPixiFrame = 2;
  let lastCorpusSampleCount = 0;
  for (const root of routeRoots) {
    const world = new DeterministicParticleSimulation(profile);
    world.playRoot(`visible-corpus:${root}`, buttonInstance(root, 1, 3), root as ParticleRootId);
    world.step(Math.fround(1 / 120), false);
    world.step(Math.fround(1 / 60), false);
    world.step(Math.fround(0.023), false);
    const routeSamples = world.samples();
    assert.ok(routeSamples.length > 0, `${root} emits visible samples`);
    const routeFrame = accepted(renderer.preflightFrame({
      sessionId: "pixi-particle",
      frame: nextPixiFrame,
      samples: routeSamples,
    }), `${root} actual Pixi frame`);
    assert.equal(renderer.commitFrame(routeFrame).status, "accepted");
    nextPixiFrame += 1;
    lastCorpusSampleCount = routeSamples.length;
    const routeSprites = renderer.stage.children as Sprite[];
    assert.deepEqual(routeSprites.map((sprite) => sprite.label), routeSamples.map((sample) => sample.particleId),
      `${root} preserves sortingOrder/system/creation sample order in the non-sortable stage`);
    assert.ok(routeSprites.every((sprite) => {
      observedTextures.add(sprite.texture.label ?? "");
      const matrix = sprite.localTransform;
      return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty,
        sprite.alpha, Number(sprite.tint)].every(Number.isFinite) &&
        sprite.texture.source.alphaMode === "no-premultiply-alpha" && sprite.blendMode === "add";
    }), `${root} creates finite actual Pixi sprites with the prepared straight-alpha additive resources`);
    assert.ok(routeSprites.some((sprite) => {
      const bounds = sprite.getBounds();
      return bounds.maxX > 0 && bounds.minX < 1600 && bounds.maxY > 0 && bounds.minY < 720;
    }), `${root} has at least one actual Sprite world bound intersecting the fixed viewport`);
  }
  assert.ok(observedTextures.size >= 3, "the 17-root actual Pixi corpus consumes multiple prepared base/UV texture identities");

  const ordinaryStage = new Container({ label: "GarupaSimulatorRoot" });
  const combined = requireOk(createPixiCombinedScene(renderer.stage, ordinaryStage), "combined particle scene");
  assert.deepEqual(combined.root.children.map((child) => child.label), [
    "GarupaSimulatorParticles",
    "GarupaSimulatorRoot",
  ]);
  assert.equal(combined.root.children[0], renderer.stage);
  assert.equal(combined.root.children[1], ordinaryStage);
  const combinedWorld = observePixiWorld(combined.root);
  verifyCombinedStageWorld(combinedWorld, totalReauditFixture.combinedRoot);
  const particleStage = combinedWorld.records.find((record) =>
    record.label === totalReauditFixture.combinedRoot.particleStageLabel)!;
  assert.ok(combinedWorld.records.filter((record) => record.parent === particleStage.path).every((record) =>
    record.localMatrix.length === 6 && record.worldMatrix.length === 6 &&
    record.localBounds !== null && record.worldBounds !== null && record.texture !== null));
  const stageOrderMutation = structuredClone(combinedWorld) as any;
  stageOrderMutation.records.find((record: any) =>
    record.label === totalReauditFixture.combinedRoot.particleStageLabel).order[0] = 1;
  stageOrderMutation.records.find((record: any) =>
    record.label === totalReauditFixture.combinedRoot.ordinaryStageLabel).order[0] = 0;
  assert.throws(() => verifyCombinedStageWorld(stageOrderMutation, totalReauditFixture.combinedRoot),
    "combined-stage order mutation sentinel must fail");
  assert.equal(combined.dispose().status, "ok");

  const badSample = { ...samples[0]!, material: "foreign" } as ParticleRenderSample;
  assert.notEqual(renderer.preflightFrame({
    sessionId: "pixi-particle",
    frame: nextPixiFrame,
    samples: [badSample],
  }).status, "accepted");
  assert.equal(renderer.snapshot().nodeCount, lastCorpusSampleCount);
  assert.equal(renderer.dispose().status, "accepted");
  assert.equal(renderer.snapshot().nodeCount, 0);
  assert.equal(renderer.snapshot().resourceCount, 0);
  assert.equal(backend.dispose().status, "accepted");

  const browser = new BrowserPixiParticleTextureDecoder();
  const original = (globalThis as any).createImageBitmap;
  (globalThis as any).createImageBitmap = undefined;
  try {
    const resource = resourceRows.find((entry) => entry.logicalAssetId.includes("Default-ParticleSystem"))!;
    const manifest = fixtureJson("particle_portable_texture_manifest.json");
    const profile = manifest.entries.find((entry: any) => entry.logicalAssetId === resource.logicalAssetId);
    const result = await browser.decodePng({
      logicalAssetId: resource.logicalAssetId,
      byteLength: resource.bytes.byteLength,
      sha256: sha256Bytes(resource.bytes),
      mime: "image/png",
      width: profile.width,
      height: profile.height,
    }, resource.bytes);
    assert.notEqual(result.status, "accepted");
  } finally {
    (globalThis as any).createImageBitmap = original;
  }
}

async function testOuterFrameAndFailure(): Promise<void> {
  const backend = await readyRecording("coordinator");
  const renderer = new TraceParticleRenderer("coordinator");
  const coordinator = new ParticleFrameCoordinator(
    "coordinator",
    new ParticleCommandProducer(chart),
    backend,
    renderer,
  );
  assert.equal(coordinator.validate().status, "ok");
  let frame = requireOk(coordinator.preflightAdvance(1 / 60, false), "coordinator advance");
  assert.equal(frame.commitDomain().status, "ok");
  assert.equal(frame.commitRender().status, "ok");
  frame = requireOk(coordinator.preflightMoveTime(), "coordinator MoveTime");
  assert.equal(frame.commitDomain().status, "ok");
  assert.equal(frame.commitRender().status, "ok");
  assert.deepEqual(
    backend.snapshot().frames[1]?.commands.map((command) => command.kind),
    ["clear-all", "suppress-until-replay"],
  );
  assert.equal(coordinator.rejectParticleOnlyReturnTime().status, "evidence-required");
  frame = requireOk(coordinator.preflightAdvance(1 / 60, false), "suppressed empty advance");
  assert.equal(frame.commitDomain().status, "ok");
  assert.equal(frame.commitRender().status, "ok");
  frame = requireOk(coordinator.preflightDispose(), "suppressed dispose");
  assert.equal(frame.commitDomain().status, "ok");
  assert.equal(frame.commitRender().status, "ok");
  assert.equal(coordinator.disposeBackends().status, "ok");

  const failingBackend = await readyRecording("later-failure");
  const failingRenderer = new TraceParticleRenderer("later-failure", 0);
  const backends = createRecordingSimulatorBackends(undefined, failingBackend, failingRenderer);
  const created = createSimulatorEngine({
    chart,
    runtime: {
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      playMode: { kind: "auto-live", resultTransform: "identity" },
    },
    particles: { sessionId: "later-failure" },
  }, backends);
  const engine = requireOk(created, "later-failure engine");
  requireOk(engine.initialize(), "later-failure initialize");
  assert.equal(engine.step(1 / 60).status, "evidence-required");
  assert.equal(failingBackend.snapshot().frames.length, 0);
  assert.equal(requireOk(engine.snapshot(), "later-failure snapshot").managers.state, "faulted");
  assert.equal(engine.dispose().status, "ok");
  assert.equal(failingBackend.snapshot().state, "disposed");
  assert.equal(failingRenderer.snapshot().state, "disposed");
  assert.equal(engine.dispose().status, "ok");

  assert.deepEqual(semanticOracle.cases.map((entry: any) => entry.case), [
    "perfect-semantic-frame",
    "miss-no-particle-frame",
    "later-domain-preflight-fault",
    "terminal-cleanup-frame",
  ]);
}

async function testWholeEngineReplay(): Promise<void> {
  let serial = 0;
  const backends: RecordingSimulatorParticleBackend[] = [];
  const fresh = async (): Promise<SimulatorResult<any>> => {
    const sessionId = `replay-${serial}`;
    serial += 1;
    const particle = await readyRecording(sessionId);
    backends.push(particle);
    return createSimulatorEngine({
      chart,
      runtime: {
        highFrequencyMode: false,
        judgeOffsetFrames: 0,
        playMode: { kind: "auto-live", resultTransform: "identity" },
      },
      particles: { sessionId },
    }, createRecordingSimulatorBackends(undefined, particle));
  };
  const initial = requireOk(await fresh(), "fresh initial engine");
  const replay = requireOk(createPortableReplaySimulatorEngine(initial, {
    createFreshEngine: fresh,
  }), "create whole-engine replay");
  for (let frame = 0; frame < 30; frame += 1) requireOk(replay.step(1 / 60), `replay prefix ${frame}`);
  const checkpoint = requireOk(replay.createReplayCheckpoint(), "replay checkpoint");
  const expected = requireOk(replay.snapshot(), "checkpoint snapshot");
  for (let frame = 0; frame < 120; frame += 1) requireOk(replay.step(1 / 60), `replay future ${frame}`);
  assert.equal(requireOk(replay.snapshot(), "future snapshot").particleBackend?.frames.length, 150);
  assert.equal((await replay.returnTime(checkpoint)).status, "ok");
  const restored = requireOk(replay.snapshot(), "restored snapshot");
  assert.equal(restored.adjustedMusicPosition, expected.adjustedMusicPosition);
  assert.deepEqual(restored.managers, expected.managers);
  assert.deepEqual(restored.particleBackend?.frames, expected.particleBackend?.frames);
  assert.equal(backends[0]?.snapshot().state, "disposed");
  const stale = await replay.returnTime(checkpoint);
  assert.equal(stale.status, "evidence-required");
  if (stale.status === "evidence-required") {
    assert.equal(stale.capability, "particle.replay.foreign-or-stale-checkpoint");
  }
  assert.equal(replay.dispose().status, "ok");
  assert.equal(replay.dispose().status, "ok");
  const afterDispose = replay.step(1 / 60);
  assert.equal(afterDispose.status, "evidence-required");
  if (afterDispose.status === "evidence-required") {
    assert.equal(afterDispose.capability, "particle.replay.after-dispose");
  }
}

class TraceParticleRenderer implements SimulatorParticleRendererBackend {
  readonly id = "trace-particle-renderer";
  private state: ParticleRendererBackendSnapshot["state"] = "ready";
  private nextFrame: number | null = null;
  private pending: ParticleRendererFrameBatch | null = null;
  private lastSampleCount = 0;
  private fault: ParticleRendererBackendSnapshot["fault"] = null;

  constructor(
    private readonly sessionId: string,
    private readonly failFrame: number | null = null,
  ) {}

  async prepare(): Promise<ParticleOperationResult<void>> {
    return particleRejected("evidence-required", "test.already-ready", "test renderer is already ready");
  }

  preflightFrame(request: ParticleRendererFrameRequest): ParticleOperationResult<ParticleRendererFrameBatch> {
    if (request.frame === this.failFrame) {
      return particleRejected("evidence-required", "test.later-render-preflight", "fixed later renderer preflight fault");
    }
    if (this.state !== "ready" || request.sessionId !== this.sessionId || this.pending !== null ||
      (this.nextFrame !== null && request.frame !== this.nextFrame)) {
      return particleRejected("evidence-required", "test.invalid-render-frame", "invalid test render frame");
    }
    this.pending = Object.freeze({
      sessionId: this.sessionId,
      frame: request.frame,
      sampleCount: request.samples.length,
    });
    return particleAccepted(this.pending);
  }

  commitFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void> {
    if (batch !== this.pending) return particleRejected("evidence-required", "test.foreign-render-batch", "foreign render batch");
    this.pending = null;
    this.nextFrame = batch.frame + 1;
    this.lastSampleCount = batch.sampleCount;
    return particleAccepted(undefined);
  }

  discardFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void> {
    if (batch !== this.pending) return particleRejected("evidence-required", "test.foreign-render-discard", "foreign render discard");
    this.pending = null;
    return particleAccepted(undefined);
  }

  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.fault === null) this.fault = Object.freeze({ code: "particle-backend-fault", capability, boundary });
    this.state = "faulted";
    return particleRejected("particle-backend-fault", this.fault.capability, this.fault.boundary);
  }

  notifyContextLoss(): ParticleOperationResult<never> {
    return this.recordTerminalFault("test.context-loss", "test context loss");
  }

  snapshot(): ParticleRendererBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.state === "disposed" ? null : this.sessionId,
      nextFrame: this.nextFrame,
      resourceCount: 0,
      nodeCount: 0,
      lastSampleCount: this.lastSampleCount,
      fault: this.fault,
    });
  }

  dispose(): ParticleOperationResult<void> {
    this.pending = null;
    this.state = "disposed";
    return particleAccepted(undefined);
  }
}

function projectCommands(commands: readonly ParticleCommand[]): readonly unknown[] {
  return commands.map((command) => command.kind === "play-root"
    ? { kind: command.kind, root: command.root, restartIfActive: command.restartIfActive }
    : command.kind === "stop-clear-deactivate-root"
      ? { kind: command.kind, root: command.root }
      : { kind: command.kind });
}

function projectSample(sample: ParticleRenderSample): unknown {
  return {
    particleId: sample.particleId,
    systemId: sample.systemId,
    sequence: sample.creationSequence,
    positionBits: [sample.position.xBits, sample.position.yBits, sample.position.zBits],
    velocityBits: [sample.velocity.xBits, sample.velocity.yBits, sample.velocity.zBits],
    sizeBits: [sample.size.xBits, sample.size.yBits, sample.size.zBits],
    rotationBits: [sample.rotation.xBits, sample.rotation.yBits, sample.rotation.zBits],
    colorBits: [sample.color.redBits, sample.color.greenBits, sample.color.blueBits, sample.color.alphaBits],
    ageBits: sample.ageBits,
    lifeBits: sample.lifetimeBits,
    uvFrame: sample.uvFrame,
    sortingOrder: sample.sortingOrder,
    renderMode: sample.renderMode,
    renderAlignment: sample.renderAlignment,
    material: sample.material,
  };
}

function rootSystemIds(profile: any, root: string): Set<string> {
  return new Set(profile.bundles.flatMap((bundle: any) =>
    bundle.systems.filter((system: any) => system.root === root).map((system: any) => system.identity)));
}

function verifyObservedUvRow(
  observation: ReturnType<typeof observePixiWorld>,
  particleId: string,
  expectedY: number,
): void {
  const rows = observation.records.filter((record) => record.label === particleId);
  assert.equal(rows.length, 1, "UV observer resolves one particle Sprite");
  assert.equal(rows[0]!.texture?.frame[1], expectedY, "observer exposes the expected Pixi UV row");
}

function verifyCombinedStageWorld(observation: ReturnType<typeof observePixiWorld>, expected: any): void {
  const roots = observation.records.filter((record) => record.parent === null);
  assert.equal(roots.length, 1);
  assert.equal(roots[0]!.label, expected.label);
  const particle = observation.records.filter((record) => record.label === expected.particleStageLabel);
  const ordinary = observation.records.filter((record) => record.label === expected.ordinaryStageLabel);
  assert.equal(particle.length, 1);
  assert.equal(ordinary.length, 1);
  assert.equal(particle[0]!.parent, roots[0]!.path);
  assert.equal(ordinary[0]!.parent, roots[0]!.path);
  assert.deepEqual([particle[0]!.order[0], ordinary[0]!.order[0]], [0, 1]);
}

function uvProfile(profile: any, systemId: string): {
  readonly tilesX: number;
  readonly tilesY: number;
  readonly textureWidth: number;
  readonly textureHeight: number;
} | null {
  for (const bundle of profile.bundles) {
    const system = bundle.systems.find((candidate: any) => candidate.identity === systemId);
    if (system === undefined) continue;
    const definition = bundle.profiles[system.profile];
    const key = definition.modules.UVModule;
    if (key === undefined) return null;
    const uv = bundle.moduleProfiles.UVModule[key];
    const renderer = bundle.rendererProfiles[definition.renderer];
    const materialRef = renderer.m_Materials.find((candidate: any) => candidate !== null);
    const material = bundle.materials.find((candidate: any) => candidate.name === materialRef.name);
    const texture = bundle.textures.find((candidate: any) => candidate.name === material.texture);
    return Object.freeze({
      tilesX: uv.tilesX,
      tilesY: uv.tilesY,
      textureWidth: texture.width,
      textureHeight: texture.height,
    });
  }
  throw new Error(`unknown particle system ${systemId}`);
}

function angleClose(actual: number, expected: number): boolean {
  const difference = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
  return Math.abs(difference) < 1e-5;
}

function playCommand(
  ownerKey: string,
  root: ParticleRootId,
  buttonType: number,
  rangeLength: number | null,
): ParticleCommand {
  return Object.freeze({
    kind: "play-root",
    ownerKey,
    instance: buttonInstance(root, rangeLength, buttonType),
    root,
    restartIfActive: true,
  });
}

function buttonInstance(_root: string, rangeLength: number | null, buttonType = 0) {
  return Object.freeze({ kind: "game-play-button" as const, buttonType, rangeLength });
}

function particleScene(): ParticlePixiSceneProfile {
  const widthRate = Math.fround(Math.fround(1600 / 720) / Math.fround(9.578571319580078));
  const buttonY = Math.fround(Math.fround(-3.450000047683716) * widthRate);
  return Object.freeze({
    viewportWidth: 1600,
    viewportHeight: 720,
    worldCenterXBits: "0x00000000",
    worldCenterYBits: "0x00000000",
    pixelsPerWorldUnitBits: "0x43B40000",
    roundPixels: false,
    buttonAnchors: Object.freeze(Array.from({ length: 16 }, (_, buttonType) => buttonType)
      .filter((buttonType) => buttonType !== 7)
      .map((buttonType) => {
        const lane = buttonType <= 6 ? buttonType : buttonType === 15 ? 6 : buttonType - 8;
        const x = Math.fround(
          Math.fround(Math.fround(lane - 3) * Math.fround(2.200000047683716)) * widthRate,
        );
        return Object.freeze({
          buttonType,
          position: Object.freeze({
            xBits: particleFloat32ToBits(x)!,
            yBits: particleFloat32ToBits(buttonY)!,
            zBits: particleFloat32ToBits(Math.fround(0))!,
          }),
        });
      })),
  });
}

async function readyRecording(sessionId: string): Promise<RecordingSimulatorParticleBackend> {
  const backend = new RecordingSimulatorParticleBackend();
  assert.equal((await backend.prepare(sessionId, localProvider(), preflight)).status, "accepted");
  return backend;
}

async function readyDeterministic(sessionId: string): Promise<DeterministicSimulatorParticleBackend> {
  const backend = new DeterministicSimulatorParticleBackend();
  assert.equal((await backend.prepare(sessionId, localProvider(), preflight)).status, "accepted");
  return backend;
}

function localProvider(rows = resourceRows): ParticleResourceProvider {
  return accepted(ImmutableLocalParticleResourceProvider.create(rows), "create local particle provider");
}

function fixtureJson(name: string): any {
  return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8"));
}

function accepted<T>(result: ParticleOperationResult<T>, message: string): T {
  if (result.status !== "accepted") throw new Error(`${message}: ${result.failure.capability}`);
  return result.value;
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").toUpperCase();
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
