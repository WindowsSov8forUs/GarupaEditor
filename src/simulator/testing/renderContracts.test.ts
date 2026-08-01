import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { RecordingSimulatorRendererBackend } from "../backends/recordingRendererBackend";
import {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "../backends/resources/localResourceProvider";
import { sha256UpperHex } from "../backends/resources/sha256";
import {
  RenderFidelityLabel,
  type RenderCommand,
  type RenderCommandBatch,
  type RenderResourcePreflightAdapter,
  type RenderResourceProfile,
  type SimulatorResourceProvider,
} from "../backends/renderingContracts";
import {
  createRenderFloat32,
  validateAndFreezeRenderProfile,
} from "../backends/renderingValidation";
import type { ScoreLifeStateProfile } from "../engine/data/scoreLifeState";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { engineInput, noteBatch } from "./firstSliceFixtures";

const HASH_A = "A".repeat(64);
const HASH_B = "B".repeat(64);
const SESSION = "render-contract-session";
const RESOURCES = Object.freeze({
  noteAtlasLogicalAssetId: "asset.note",
  directionalAtlasLogicalAssetId: "asset.directional",
});
const BYTES = Uint8Array.from([1, 2, 3, 4]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
  }
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") {
    throw new Error(`${message}: ${result.capability}`);
  }
  return result.value;
}

class RejectingHudRenderer extends RecordingSimulatorRendererBackend {
  override preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch> {
    if (commands.some((command) =>
      command.kind === "set-hud" &&
      Object.prototype.hasOwnProperty.call(command.state, "addScore"))) {
      return evidenceRequired(
        "test.render-hud-rejected",
        ["PR36"],
        "The test renderer rejects the Reflect HUD batch before scene mutation.",
      );
    }
    return super.preflight(commands);
  }
}

class LocalProvider implements SimulatorResourceProvider {
  constructor(
    private readonly bytes: Uint8Array = BYTES,
    private readonly mode: "ok" | "reject" | "throw" = "ok",
  ) {}

  async read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>> {
    if (this.mode === "throw") throw new Error("provider failure");
    if (this.mode === "reject" || logicalAssetId !== "asset.note") {
      return evidenceRequired(
        "test.provider.missing",
        ["PR35"],
        "The test provider has no requested local bytes.",
      );
    }
    return ok(this.bytes);
  }
}

function preflight(
  hash = HASH_A,
  dimensions: readonly [number, number] = [4, 4],
): RenderResourcePreflightAdapter {
  return {
    async sha256() {
      return ok(hash);
    },
    async inspect(_bytes, mime) {
      return ok(mime === "image/png"
        ? Object.freeze({ width: dimensions[0], height: dimensions[1] })
        : null);
    },
  };
}

function profile(
  fidelity: RenderResourceProfile["fidelity"] = {
    mode: "ordinary",
    fidelity: "exact-current",
  },
  provenance: RenderResourceProfile["assets"][number]["provenance"] = "current-apk",
): RenderResourceProfile {
  return {
    schemaVersion: 1,
    sample: {
      package: "jp.co.craftegg.band",
      versionName: "10.1.4",
      versionCode: 230,
      abi: "arm64-v8a",
    },
    packIdentity: "test-pack-10.1.4",
    fidelity,
    networkAllowed: false,
    automaticFallbackAllowed: false,
    assets: [{
      logicalAssetId: "asset.note",
      role: "note-atlas",
      byteLength: 4,
      sha256: HASH_A,
      mime: "image/png",
      width: 4,
      height: 4,
      textureSettings: {
        scaleMode: "linear",
        wrapModeU: "clamp",
        wrapModeV: "clamp",
        mipmap: "off",
        premultiplyAlpha: true,
        blendMode: "normal",
      },
      atlasRows: [{
        exactKey: "note_normal_0",
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        pivotX: 0.5,
        pivotY: 0.5,
        pixelsPerUnit: 100,
      }],
      materialRole: "sprite",
      animationRole: "note-flick",
      provenance,
    }],
    scene: {
      profileId: "scene.test",
      components: [
        { component: "sprite", support: "semantic-exact" },
        { component: "atlas-sprite", support: "portable-equivalent" },
        { component: "mesh", support: "portable-equivalent" },
        { component: "line", support: "portable-equivalent" },
        { component: "mask", support: "portable-equivalent" },
        { component: "text", support: "portable-equivalent" },
        { component: "slider", support: "portable-equivalent" },
        { component: "animation", support: "portable-equivalent" },
      ],
      ordering: {
        tuple: [
          "domain-layer",
          "source-depth-or-sorting-order",
          "source-z",
          "creation-sequence",
        ],
        pixiDefaultZIndexAllowed: false,
      },
      roundPixels: false,
      resolution: 1,
      antialias: false,
    },
  };
}

function cloneProfile(value: RenderResourceProfile): RenderResourceProfile {
  return {
    ...value,
    sample: { ...value.sample },
    fidelity: { ...value.fidelity },
    assets: value.assets.map((asset) => ({
      ...asset,
      textureSettings: asset.textureSettings === null
        ? null
        : { ...asset.textureSettings },
      atlasRows: asset.atlasRows.map((row) => ({ ...row })),
    })),
    scene: {
      ...value.scene,
      components: value.scene.components.map((entry) => ({ ...entry })),
      ordering: {
        tuple: [
          "domain-layer",
          "source-depth-or-sorting-order",
          "source-z",
          "creation-sequence",
        ],
        pixiDefaultZIndexAllowed: false,
      },
    },
  };
}

function f32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)), "create Float32");
}

function scoreProfile(): ScoreLifeStateProfile {
  return {
    schemaVersion: 1,
    sessionId: SESSION,
    scoreLevel: 5,
    deckTotalParameter: Math.fround(1000),
    freeLiveEventBonusDeckTotalParameter: Math.fround(0),
    life: {
      initialLife: 1000,
      playerMaxLife: 1000,
      lifeUpperLimit: 2000,
      missDamage: -100,
      badDamage: -50,
    },
    mode: { kind: "auto-live", comboCoefficient: Math.fround(1) },
    skills: [],
    fever: { difficulty: "special", ownTeamMemberCount: 1 },
  };
}

function createObject(sequence: number, objectId = "object.root"): RenderCommand {
  return {
    kind: "create-object",
    sessionId: SESSION,
    sequence,
    frame: 0,
    substep: 0,
    renderObjectId: objectId,
    poolFamily: "note-normal",
    role: "note-root",
    parentObjectId: null,
  };
}

async function testPortableLocalResources(): Promise<void> {
  const original = Uint8Array.from([0x61, 0x62, 0x63]);
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create([
    { logicalAssetId: "local.abc", bytes: original },
  ]), "create immutable local provider");
  original[0] = 0;
  const first = requireOk(await provider.read("local.abc"), "read copied local bytes");
  equal(first[0], 0x61, "constructor detaches caller bytes");
  first[1] = 0;
  const second = requireOk(await provider.read("local.abc"), "read second byte copy");
  equal(second[1], 0x62, "each read returns detached bytes");
  equal((await provider.read("missing")).status, "evidence-required", "unknown local ID rejected");
  equal(ImmutableLocalRenderResourceProvider.create([
    { logicalAssetId: "duplicate", bytes: BYTES },
    { logicalAssetId: "duplicate", bytes: BYTES },
  ]).status, "evidence-required", "duplicate local ID rejected");
  equal(sha256UpperHex(Uint8Array.from([0x61, 0x62, 0x63])),
    "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
    "portable SHA-256 abc vector");

  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  png.set([0, 0, 0, 4, 0, 0, 0, 4], 16);
  const adapter = new PortableRenderResourcePreflightAdapter();
  const metadata = requireOk(await adapter.inspect(png, "image/png"), "inspect PNG IHDR");
  assert(metadata !== null, "PNG metadata present");
  equal(metadata.width, 4, "PNG width");
  equal(metadata.height, 4, "PNG height");
  equal((await adapter.inspect(Uint8Array.from([1]), "image/png")).status,
    "evidence-required", "invalid PNG rejected");

  const actualProfile = cloneProfile(profile());
  (actualProfile.assets[0] as { byteLength: number }).byteLength = png.byteLength;
  (actualProfile.assets[0] as { sha256: string }).sha256 = sha256UpperHex(png);
  const pngProvider = requireOk(ImmutableLocalRenderResourceProvider.create([
    { logicalAssetId: "asset.note", bytes: png },
  ]), "create PNG provider");
  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(SESSION, actualProfile, pngProvider, adapter),
    "prepare with portable provider and adapter");
  equal(renderer.snapshot().state, "ready", "portable resource stack ready");
  console.log("ok 1 - immutable local bytes, SHA-256 and strict PNG preflight");
}

async function testProfileValidationAndAliases(): Promise<void> {
  const mutable = profile();
  const frozen = requireOk(validateAndFreezeRenderProfile(mutable), "valid profile");
  assert(Object.isFrozen(frozen), "profile frozen");
  assert(Object.isFrozen(frozen.assets), "asset list frozen");
  assert(Object.isFrozen(frozen.assets[0].atlasRows[0]), "atlas row frozen");
  (mutable.assets[0] as { logicalAssetId: string }).logicalAssetId = "mutated";
  (mutable.scene.components[0] as { component: string }).component = "mutated";
  equal(frozen.assets[0].logicalAssetId, "asset.note", "asset alias detached");
  equal(frozen.scene.components[0].component, "sprite", "scene alias detached");

  const duplicate = cloneProfile(profile());
  (duplicate.assets as unknown as RenderResourceProfile["assets"][number][]).push({
    ...duplicate.assets[0],
    atlasRows: duplicate.assets[0].atlasRows.map((row) => ({ ...row })),
  });
  equal(validateAndFreezeRenderProfile(duplicate).status, "evidence-required", "duplicate asset rejected");

  const outOfBounds = cloneProfile(profile());
  (outOfBounds.assets[0].atlasRows[0] as { width: number }).width = 5;
  equal(validateAndFreezeRenderProfile(outOfBounds).status, "evidence-required", "atlas bounds rejected");

  const incomplete = cloneProfile(profile());
  (incomplete.scene.components as unknown as { component: string; support: string }[]).pop();
  equal(validateAndFreezeRenderProfile(incomplete).status, "evidence-required", "component omission rejected");

  const badLabel = profile({
    mode: "habahiro",
    fidelity: "degraded",
    profile: "current-external-portable-atlas",
    visibleLabel: "wrong" as typeof RenderFidelityLabel,
  }, "current-external-portable");
  equal(validateAndFreezeRenderProfile(badLabel).status, "evidence-required", "degraded label rejected");
  console.log("ok 2 - profile shape, deep freeze and fidelity gates");
}

async function testAtomicPrepare(): Promise<void> {
  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(SESSION, profile(), new LocalProvider(), preflight()), "prepare renderer");
  const ready = renderer.snapshot();
  equal(ready.state, "ready", "ready state");
  equal(ready.sessionId, SESSION, "ready session");
  equal(ready.resourceCount, 1, "resource count");
  equal(renderer.commandSnapshot().length, 0, "prepare creates no commands");
  equal((await renderer.prepare(SESSION, profile(), new LocalProvider(), preflight())).status,
    "evidence-required", "duplicate prepare rejected");

  const failures: readonly [string, SimulatorResourceProvider, RenderResourcePreflightAdapter][] = [
    ["byte length", new LocalProvider(Uint8Array.from([1])), preflight()],
    ["hash", new LocalProvider(), preflight(HASH_B)],
    ["dimensions", new LocalProvider(), preflight(HASH_A, [8, 4])],
    ["provider rejection", new LocalProvider(BYTES, "reject"), preflight()],
    ["provider throw", new LocalProvider(BYTES, "throw"), preflight()],
  ];
  for (const [label, provider, adapter] of failures) {
    const failed = new RecordingSimulatorRendererBackend();
    equal((await failed.prepare(SESSION, profile(), provider, adapter)).status,
      "evidence-required", `${label} rejected`);
    equal(failed.snapshot().state, "unprepared", `${label} atomic state`);
    equal(failed.snapshot().resourceCount, 0, `${label} resource count`);
    equal(failed.snapshot().objectCount, 0, `${label} object count`);
  }

  const exactExternal = new RecordingSimulatorRendererBackend();
  equal((await exactExternal.prepare(
    SESSION,
    profile({ mode: "habahiro", fidelity: "exact-current-unityfs" }, "current-external-portable"),
    new LocalProvider(),
    preflight(),
  )).status, "evidence-required", "external bytes cannot claim exact HAB");

  const degraded = new RecordingSimulatorRendererBackend();
  requireOk(await degraded.prepare(
    SESSION,
    profile({
      mode: "habahiro",
      fidelity: "degraded",
      profile: "current-external-portable-atlas",
      visibleLabel: RenderFidelityLabel,
    }, "current-external-portable"),
    new LocalProvider(),
    preflight(),
  ), "explicit degraded prepare");
  equal(degraded.snapshot().fidelity?.mode, "habahiro", "degraded fidelity exposed");
  console.log("ok 3 - atomic resource preflight and provenance gates");
}

async function testCommandsAndTerminalFault(): Promise<void> {
  const staged = new RecordingSimulatorRendererBackend();
  requireOk(await staged.prepare(SESSION, profile(), new LocalProvider(), preflight()), "staged renderer prepare");
  const discarded = requireOk(staged.preflight([createObject(0)]), "preflight create batch");
  equal(staged.snapshot().objectCount, 0, "preflight does not mutate objects");
  equal(staged.snapshot().nextSequence, 0, "preflight does not advance sequence");
  requireOk(staged.discard(discarded), "discard owner-aborted batch");
  equal(staged.snapshot().objectCount, 0, "discard keeps scene unchanged");
  const committed = requireOk(staged.preflight([createObject(0)]), "preflight committed batch");
  requireOk(staged.commit(committed), "commit exact batch capability");
  equal(staged.snapshot().objectCount, 1, "commit applies validated scene");
  equal(staged.snapshot().nextSequence, 1, "commit advances full batch");

  const forged = new RecordingSimulatorRendererBackend();
  requireOk(await forged.prepare(SESSION, profile(), new LocalProvider(), preflight()), "forged renderer prepare");
  equal(forged.commit({ sessionId: SESSION, firstSequence: 0, commandCount: 1 }).status,
    "evidence-required", "forged batch rejected");
  equal(forged.snapshot().objectCount, 0, "forged batch has no mutation");

  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(SESSION, profile(), new LocalProvider(), preflight()), "command renderer prepare");
  requireOk(renderer.execute(createObject(0)), "create object");
  requireOk(renderer.execute({
    kind: "bind-resource",
    sessionId: SESSION,
    sequence: 1,
    frame: 0,
    substep: 0,
    renderObjectId: "object.root",
    binding: "sprite",
    logicalAssetId: "asset.note",
    exactKey: "note_normal_0",
  }), "bind exact Sprite");
  requireOk(renderer.execute({
    kind: "set-transform",
    sessionId: SESSION,
    sequence: 2,
    frame: 1,
    substep: 0,
    renderObjectId: "object.root",
    position: { x: f32(1), y: f32(2), z: f32(3) },
    scale: { x: f32(1), y: f32(1) },
    rotationDegrees: f32(0),
    color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
    ordering: {
      domainLayer: 1,
      sourceDepthOrSortingOrder: 70,
      sourceZ: f32(0),
      creationSequence: 0,
    },
    maskObjectId: null,
  }), "set transform");
  equal(renderer.snapshot().nextSequence, 3, "contiguous sequence");
  equal(renderer.snapshot().objectCount, 1, "object identity count");
  assert(Object.isFrozen(renderer.commandSnapshot()), "command snapshot frozen");
  assert(Object.isFrozen(renderer.commandSnapshot()[2]), "command frozen");

  const firstFault = renderer.execute({ ...createObject(4), sessionId: "foreign" });
  equal(firstFault.status, "evidence-required", "foreign session rejected");
  const fault = renderer.snapshot().fault;
  equal(renderer.snapshot().state, "faulted", "terminal fault state");
  assert(fault !== null, "fault snapshot present");
  renderer.execute(createObject(3, "object.second"));
  equal(renderer.snapshot().fault?.capability, fault.capability, "first fault preserved");
  equal(renderer.snapshot().objectCount, 1, "fault command has no object mutation");
  requireOk(renderer.dispose(), "dispose faulted renderer");
  requireOk(renderer.dispose(), "duplicate dispose");
  equal(renderer.snapshot().state, "disposed", "disposed terminal state");
  equal(renderer.snapshot().objectCount, 0, "dispose clears objects");
  equal(renderer.snapshot().resourceCount, 0, "dispose clears resources");

  const unknown = new RecordingSimulatorRendererBackend();
  requireOk(await unknown.prepare(SESSION, profile(), new LocalProvider(), preflight()), "unknown renderer prepare");
  requireOk(unknown.execute(createObject(0)), "unknown create");
  equal(unknown.execute({
    kind: "bind-resource",
    sessionId: SESSION,
    sequence: 1,
    frame: 0,
    substep: 0,
    renderObjectId: "object.root",
    binding: "sprite",
    logicalAssetId: "asset.note",
    exactKey: "missing",
  }).status, "evidence-required", "missing exact key rejected");
  equal(unknown.snapshot().state, "faulted", "binding fault terminal");
  console.log("ok 4 - session, sequence, identity, exact resource and terminal fault");
}

async function testHudReflectAtomic(): Promise<void> {
  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(SESSION, profile(), new LocalProvider(), preflight()), "HUD renderer prepare");
  const baseInput = engineInput([noteBatch(["hud-normal"], 96)]);
  const input = {
    ...baseInput,
    runtime: {
      ...baseInput.runtime,
      playMode: {
        kind: "auto-live" as const,
        resultTransform: "identity-no-active-situation-skill" as const,
      },
    },
    scoreLifeState: scoreProfile(),
    rendering: { sessionId: SESSION, resources: RESOURCES },
  };
  const engine = requireOk(
    createSimulatorEngine(input, createRecordingSimulatorBackends(renderer)),
    "HUD engine create",
  );
  requireOk(engine.initialize(), "HUD engine initialize");
  equal(renderer.snapshot().objectCount, 7, "six HUD objects plus one Note root");
  const before = requireOk(engine.snapshot(), "HUD before snapshot");
  equal(before.managers.scoreLifeState?.record.score, 0, "score before judgement");
  requireOk(engine.step(0), "HUD activation frame");
  for (let frame = 0; frame < 120; frame += 1) {
    const snapshot = requireOk(engine.snapshot(), `HUD snapshot ${frame}`);
    if ((snapshot.managers.scoreLifeState?.record.score ?? 0) > 0) break;
    requireOk(engine.step(1 / 60), `HUD judgement frame ${frame}`);
  }
  const after = requireOk(engine.snapshot(), "HUD after snapshot");
  assert((after.managers.scoreLifeState?.record.score ?? 0) > 0, "score owner committed");
  const commands = renderer.commandSnapshot();
  const reflected = commands.slice(-7);
  equal(reflected[0]?.kind, "set-hud", "AddScore first");
  equal(reflected[1]?.kind, "set-hud", "Combo update second");
  equal(reflected[2]?.kind, "activate-object", "Combo show third");
  equal(reflected[3]?.kind, "activate-object", "Result show fourth");
  equal(reflected[4]?.kind, "set-hud", "Result route fifth");
  equal(reflected[5]?.kind, "set-hud", "Score update sixth");
  equal(reflected[6]?.kind, "set-hud", "Life update seventh");
  if (reflected[5]?.kind === "set-hud") {
    equal(reflected[5].state.score, after.managers.scoreLifeState?.record.score,
      "HUD score equals committed owner plan");
  }
  requireOk(engine.dispose(), "HUD engine dispose");

  const rejecting = new RejectingHudRenderer();
  requireOk(await rejecting.prepare(SESSION, profile(), new LocalProvider(), preflight()),
    "rejecting HUD renderer prepare");
  const rejectedEngine = requireOk(
    createSimulatorEngine(input, createRecordingSimulatorBackends(rejecting)),
    "rejecting HUD engine create",
  );
  requireOk(rejectedEngine.initialize(), "rejecting HUD engine initialize");
  requireOk(rejectedEngine.step(0), "rejecting HUD activation");
  let rejection: SimulatorResult<void> = ok(undefined);
  for (let frame = 0; frame < 120 && rejection.status === "ok"; frame += 1) {
    rejection = rejectedEngine.step(1 / 60);
  }
  equal(rejection.status, "evidence-required", "HUD renderer rejection reaches owner");
  const rejectedSnapshot = requireOk(rejectedEngine.snapshot(), "rejected HUD snapshot");
  equal(rejectedSnapshot.managers.scoreLifeState?.record.score, 0,
    "renderer rejection leaves Record score unchanged");
  equal(rejectedSnapshot.managers.scoreLifeState?.record.currentCombo, 0,
    "renderer rejection leaves Record combo unchanged");
  equal(rejecting.commandSnapshot().some((command) =>
    command.kind === "set-hud" &&
    Object.prototype.hasOwnProperty.call(command.state, "addScore")), false,
  "rejected HUD batch has zero scene mutation");
  console.log("ok 5 - Score/Life plan commits HUD in R1 order and rejects atomically");
}

async function testHostReadyGate(): Promise<void> {
  const unprepared = new RecordingSimulatorRendererBackend();
  const backends = createRecordingSimulatorBackends(unprepared);
  const baseInput = engineInput([noteBatch(["render-normal"], 96)]);
  const input = {
    ...baseInput,
    runtime: {
      ...baseInput.runtime,
      playMode: {
        kind: "auto-live" as const,
        resultTransform: "identity-no-active-situation-skill" as const,
      },
    },
    rendering: { sessionId: SESSION, resources: RESOURCES },
  };
  equal(createSimulatorEngine(input, backends).status, "evidence-required", "unprepared host rejected");
  equal(backends.snapshot().length, 0, "host rejection precedes backend/domain mutation");

  requireOk(await unprepared.prepare(SESSION, profile(), new LocalProvider(), preflight()), "host renderer prepare");
  const engine = requireOk(createSimulatorEngine(input, backends), "prepared host create");
  requireOk(engine.initialize(), "prepared host initialize");
  equal(unprepared.snapshot().objectCount, 1, "pool setup creates stable render root");
  equal(unprepared.snapshot().nextSequence, 2, "pool setup create then hide order");
  requireOk(engine.step(0), "rendered note activation frame");
  equal(unprepared.snapshot().nextSequence, 4, "activation then exact bind order");
  const produced = unprepared.commandSnapshot();
  equal(produced[0]?.kind, "create-object", "setup create command");
  equal(produced[1]?.kind, "hide-object", "setup hide command");
  equal(produced[2]?.kind, "activate-object", "activation command");
  equal(produced[3]?.kind, "bind-resource", "exact bind command");
  if (produced[3]?.kind === "bind-resource") {
    equal(produced[3].exactKey, "note_normal_0", "owner-authored exact Sprite key");
  }
  for (let frame = 0; frame < 120 && unprepared.snapshot().nextSequence === 4; frame += 1) {
    requireOk(engine.step(1 / 60), `rendered note lifecycle frame ${frame}`);
  }
  equal(unprepared.snapshot().nextSequence, 6, "deactivation hide then deactivate order");
  const lifecycle = unprepared.commandSnapshot();
  equal(lifecycle[4]?.kind, "hide-object", "deactivation hide command");
  equal(lifecycle[5]?.kind, "deactivate-object", "deactivation state command");
  requireOk(engine.dispose(), "prepared host dispose");
  equal(unprepared.snapshot().state, "disposed", "typed renderer disposed with host");
  equal(unprepared.snapshot().objectCount, 0, "host dispose releases render objects");
  equal(unprepared.snapshot().resourceCount, 0, "host dispose releases resources");
  const disposedTrace = unprepared.commandSnapshot();
  equal(disposedTrace[disposedTrace.length - 1]?.kind, "release-object",
    "release command retained in recording trace");
  const traceLength = disposedTrace.length;
  requireOk(engine.dispose(), "duplicate host dispose");
  equal(unprepared.commandSnapshot().length, traceLength, "duplicate dispose adds no commands");

  const faultedRenderer = new RecordingSimulatorRendererBackend();
  requireOk(await faultedRenderer.prepare(
    SESSION,
    profile(),
    new LocalProvider(),
    preflight(),
  ), "fault-dispose renderer prepare");
  const faultedEngine = requireOk(
    createSimulatorEngine(input, createRecordingSimulatorBackends(faultedRenderer)),
    "fault-dispose engine create",
  );
  requireOk(faultedEngine.initialize(), "fault-dispose engine initialize");
  requireOk(faultedEngine.step(0), "fault-dispose active Note");
  const beforeFaultDisposeCommands = faultedRenderer.commandSnapshot().length;
  faultedRenderer.recordTerminalFault(
    "test.renderer-terminal-fault",
    "Synthetic terminal renderer fault for host cleanup priority.",
  );
  requireOk(faultedEngine.dispose(), "host disposes terminal-faulted renderer");
  equal(faultedRenderer.snapshot().state, "disposed", "faulted host renderer disposed");
  equal(faultedRenderer.snapshot().resourceCount, 0, "faulted host resources released");
  equal(faultedRenderer.snapshot().objectCount, 0, "faulted host objects released");
  equal(
    faultedRenderer.commandSnapshot().length,
    beforeFaultDisposeCommands,
    "terminal cleanup emits no impossible renderer commands",
  );
  equal(
    requireOk(faultedEngine.snapshot(), "fault-dispose engine snapshot").managers.state,
    "disposed",
    "domain owners clear after renderer terminal fault",
  );

  const mismatch = createSimulatorEngine(
    { ...engineInput(), rendering: { sessionId: "foreign", resources: RESOURCES } },
    createRecordingSimulatorBackends(unprepared),
  );
  equal(mismatch.status, "evidence-required", "cross-session host rejected");
  equal(createSimulatorEngine(engineInput(), createRecordingSimulatorBackends(unprepared)).status,
    "evidence-required", "typed backend requires explicit host session");
  console.log("ok 6 - host ready and exact-session gate precedes owner mutation");
}

async function main(): Promise<void> {
  await testPortableLocalResources();
  await testProfileValidationAndAliases();
  await testAtomicPrepare();
  await testCommandsAndTerminalFault();
  await testHudReflectAtomic();
  await testHostReadyGate();
  console.log("render contract tests passed: 6");
}

void main().catch((error: unknown) => {
  throw error;
});
