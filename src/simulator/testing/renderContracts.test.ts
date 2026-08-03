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
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
} from "../engine/chart/types";
import type { ScoreLifeStateProfile } from "../engine/data/scoreLifeState";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { InGameRecord } from "../engine/managers/inGameRecord";
import type { SituationSkillSnapshot } from "../engine/managers/situationSkillManager";
import { validateOrdinaryRenderedBatchAuthorization } from "../engine/managers/noteManager";
import {
  RenderCommandProducer,
  resolveFrontSpriteBinding,
} from "../engine/rendering/renderCommandProducer";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { engineInput, noteBatch } from "./firstSliceFixtures";

const HASH_A = "A".repeat(64);
const HASH_B = "B".repeat(64);
const SESSION = "render-contract-session";
const RESOURCES = Object.freeze({
  noteAtlasLogicalAssetId: "asset.note",
  directionalAtlasLogicalAssetId: "asset.directional",
});
const SYNC_RESOURCES = Object.freeze({
  ...RESOURCES,
  syncLineLogicalAssetId: "asset.sync-line",
});
const R4_RESOURCES = Object.freeze({
  ...RESOURCES,
  multipleDirectionalLineLeftLogicalAssetId: "asset.multiple-directional-line-left",
  multipleDirectionalLineRightLogicalAssetId: "asset.multiple-directional-line-right",
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
    if (
      this.mode === "reject" ||
      ![
        "asset.note",
        "asset.directional",
        "asset.sync-line",
        "asset.multiple-directional-line-left",
        "asset.multiple-directional-line-right",
      ].includes(logicalAssetId)
    ) {
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
      atlasRows: ["note_normal_0", "note_normal_1"].map((exactKey) => ({
        exactKey,
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        pivotX: 0.5,
        pivotY: 0.5,
        pixelsPerUnit: 100,
      })),
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
      projection: {
        mode: fidelity.mode === "ordinary"
          ? "current-ordinary-rhythmgame-orthographic"
          : "degraded-habahiro-ordinary-projection-proxy",
        viewportWidth: 1600,
        viewportHeight: 720,
        pixiOrigin: "top-left",
        worldCenterX: 0,
        worldCenterY: 0,
        cameraPositionZ: -15,
        nearClip: 0,
        farClip: 25,
        pixelsPerWorldUnit: 360,
        clampAllowed: false,
      },
      roundPixels: false,
      resolution: 1,
      antialias: false,
    },
  };
}

function longProfile(): RenderResourceProfile {
  const base = profile();
  return {
    ...base,
    assets: Object.freeze(base.assets.map((asset) => Object.freeze({
      ...asset,
      atlasRows: Object.freeze([
        ...asset.atlasRows,
        Object.freeze({ ...asset.atlasRows[0], exactKey: "note_long_0" }),
      ]),
    }))),
  };
}

function r4Profile(): RenderResourceProfile {
  const base = profile();
  const row = base.assets[0]!.atlasRows[0]!;
  return {
    ...base,
    assets: Object.freeze([
      Object.freeze({
        ...base.assets[0]!,
        atlasRows: Object.freeze([
          ...base.assets[0]!.atlasRows,
          Object.freeze({ ...row, exactKey: "note_flick_0" }),
        ]),
      }),
      Object.freeze({
        ...base.assets[0]!,
        logicalAssetId: "asset.directional",
        role: "directional-atlas" as const,
        atlasRows: Object.freeze([
          Object.freeze({ ...row, exactKey: "note_flick_l_0" }),
          Object.freeze({ ...row, exactKey: "note_flick_l_1" }),
          Object.freeze({ ...row, exactKey: "note_flick_r_0" }),
          Object.freeze({ ...row, exactKey: "note_flick_r_1" }),
        ]),
      }),
      Object.freeze({
        ...base.assets[0]!,
        logicalAssetId: "asset.multiple-directional-line-left",
        role: "material-texture" as const,
        atlasRows: Object.freeze([]),
        materialRole: "multiple-directional-line" as const,
        animationRole: "none" as const,
      }),
      Object.freeze({
        ...base.assets[0]!,
        logicalAssetId: "asset.multiple-directional-line-right",
        role: "material-texture" as const,
        atlasRows: Object.freeze([]),
        materialRole: "multiple-directional-line" as const,
        animationRole: "none" as const,
      }),
    ]),
  };
}

function syncProfile(): RenderResourceProfile {
  const base = profile();
  return {
    ...base,
    assets: Object.freeze([
      Object.freeze({
        ...base.assets[0],
        atlasRows: Object.freeze([
          ...base.assets[0].atlasRows,
          Object.freeze({
            ...base.assets[0].atlasRows[0],
            exactKey: "note_normal_6",
          }),
        ]),
      }),
      Object.freeze({
        ...base.assets[0],
        logicalAssetId: "asset.sync-line",
        role: "material-texture" as const,
        atlasRows: Object.freeze([]),
        materialRole: "sync-line" as const,
        animationRole: "none" as const,
      }),
    ]),
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
      projection: { ...value.scene.projection },
    },
  };
}

function f32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)), "create Float32");
}

function vector3(x: number, y: number, z: number) {
  return Object.freeze({ x: f32(x), y: f32(y), z: f32(z) });
}

const ORDINARY_NOTE_SCENE = Object.freeze({
  specificSpeed: f32(11),
  noteSettingScale: f32(1),
  launcherY: f32(5.420000076293945),
  targetCenterY: f32(-3.450000047683716),
  highAspectRatio: f32(1),
  noteStartPositions: Object.freeze(Array.from(
    { length: 7 },
    (_, lane) => vector3(Math.fround((lane - 3) * 0.11), 4.976500511169434, -13.5),
  )),
  goalPositions: Object.freeze(Array.from(
    { length: 7 },
    (_, lane) => vector3(Math.fround((lane - 3) * 2.2), -3.450000047683716, -13.5),
  )),
  noteColor: Object.freeze({
    red: f32(1),
    green: f32(1),
    blue: f32(1),
    alpha: f32(1),
  }),
  noteDomainLayer: 3,
});
const ORDINARY_SYNC_NOTE_SCENE = Object.freeze({
  ...ORDINARY_NOTE_SCENE,
  syncLineEdgeMargin: f32(0.2),
});
const ORDINARY_LONG_NOTE_SCENE = Object.freeze({
  ...ORDINARY_NOTE_SCENE,
  screenToSafeAreaRatio: f32(1),
  longMeshColor: Object.freeze({
    red: f32(0.8),
    green: f32(0.8),
    blue: f32(0.8),
    alpha: f32(0.6),
  }),
});

const RENDERING = Object.freeze({
  sessionId: SESSION,
  resources: RESOURCES,
  ordinaryNoteScene: ORDINARY_NOTE_SCENE,
});
const SYNC_RENDERING = Object.freeze({
  sessionId: SESSION,
  resources: SYNC_RESOURCES,
  ordinaryNoteScene: ORDINARY_SYNC_NOTE_SCENE,
});
const LONG_RENDERING = Object.freeze({
  sessionId: SESSION,
  resources: RESOURCES,
  ordinaryNoteScene: ORDINARY_LONG_NOTE_SCENE,
});
const R4_RENDERING = Object.freeze({
  sessionId: SESSION,
  resources: R4_RESOURCES,
  ordinaryNoteScene: ORDINARY_NOTE_SCENE,
});
const R4_SLIDE_RENDERING = Object.freeze({
  sessionId: SESSION,
  resources: RESOURCES,
  ordinaryNoteScene: ORDINARY_LONG_NOTE_SCENE,
});

function renderedNoteBatch(testingId: string, absolutePos: number) {
  const batch = noteBatch([testingId], absolutePos);
  return Object.freeze({
    ...batch,
    informationList: Object.freeze(batch.informationList.map((information) => Object.freeze({
      ...information,
      barIndex: Math.trunc(absolutePos / 192),
      numerator: absolutePos % 192,
      denominator: 192,
      absolutePos,
      storedAbsolutePos: absolutePos,
      buttonType: ButtonType.Button_00_BMS_1P_SC,
      buttonTypes: Object.freeze([ButtonType.Button_00_BMS_1P_SC]),
      buttonTypesArray: Object.freeze([ButtonType.Button_00_BMS_1P_SC]),
      bpm: 120,
      bpmString: "120",
    }))),
  });
}

function renderedLongNoteBatch(absolutePos: number, afterAbsolutePos: number) {
  const batch = renderedNoteBatch("render-long", absolutePos);
  return Object.freeze({
    ...batch,
    informationList: Object.freeze(batch.informationList.map((information) => Object.freeze({
      ...information,
      fireNoteType: FrontNoteType.Long,
      gameNoteType: GameNoteType.Long,
      afterNoteType: AfterNoteType.Normal,
      afterNoteAbsolutePos: afterAbsolutePos,
    }))),
  });
}

function renderedSlideNoteBatch(absolutePos: number) {
  const batch = renderedNoteBatch("render-slide-r4", absolutePos);
  const root = batch.informationList[0]!;
  const child = (
    index: number,
    childAbsolutePos: number,
    isInvisible: boolean,
    terminal: boolean,
  ) => Object.freeze({
    ...root,
    index,
    isSlideNoteHead: false,
    isInvisible,
    absolutePos: childAbsolutePos,
    storedAbsolutePos: childAbsolutePos,
    gameNoteType: terminal ? GameNoteType.SlideEndA : GameNoteType.SlideA,
    fireNoteType: terminal ? FrontNoteType.None : FrontNoteType.SlideA,
    afterNoteType: AfterNoteType.None,
    slideNoteList: Object.freeze([]),
  });
  const children = Object.freeze([
    child(root.index + 1, absolutePos + 48, true, false),
    child(root.index + 2, absolutePos + 96, false, true),
  ]);
  return Object.freeze({
    ...batch,
    informationList: Object.freeze([Object.freeze({
      ...root,
      isSlideNoteHead: true,
      gameNoteType: GameNoteType.SlideA,
      fireNoteType: FrontNoteType.SlideA,
      afterNoteType: AfterNoteType.None,
      afterNoteAbsolutePos: absolutePos + 96,
      slideNoteList: children,
    })]),
  });
}

function renderedSyncNoteBatch(absolutePos: number) {
  const batch = renderedNoteBatch("sync-left", absolutePos);
  const second = renderedNoteBatch("sync-right", absolutePos).informationList[0]!;
  return Object.freeze({
    ...batch,
    informationList: Object.freeze([
      batch.informationList[0]!,
      Object.freeze({
        ...second,
        index: 1,
        buttonType: ButtonType.Button_06_BMS_1P_06,
        buttonTypes: Object.freeze([ButtonType.Button_06_BMS_1P_06]),
        buttonTypesArray: Object.freeze([ButtonType.Button_06_BMS_1P_06]),
      }),
    ]),
  });
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
  assert(Object.isFrozen(frozen.scene.projection), "projection profile frozen");
  (mutable.assets[0] as { logicalAssetId: string }).logicalAssetId = "mutated";
  (mutable.scene.components[0] as { component: string }).component = "mutated";
  (mutable.scene.projection as { pixelsPerWorldUnit: number }).pixelsPerWorldUnit = 1;
  equal(frozen.assets[0].logicalAssetId, "asset.note", "asset alias detached");
  equal(frozen.scene.components[0].component, "sprite", "scene alias detached");
  equal(frozen.scene.projection.pixelsPerWorldUnit, 360, "projection alias detached");

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

  const implicitProjection = cloneProfile(profile());
  (implicitProjection.scene.projection as { pixelsPerWorldUnit: number }).pixelsPerWorldUnit = 1;
  equal(validateAndFreezeRenderProfile(implicitProjection).status, "evidence-required",
    "implicit or mismatched projection rejected before resource reads");

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
  const baseInput = engineInput([renderedNoteBatch("hud-normal", 96)]);
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
    rendering: RENDERING,
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
  let reflectStart = -1;
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index]!;
    if (command.kind === "set-hud" && Object.prototype.hasOwnProperty.call(command.state, "addScore")) {
      reflectStart = index;
      break;
    }
  }
  const reflected = commands.slice(reflectStart);
  equal(reflected.length, 8, "Reflect emits the visible ordinary HUD transaction");
  equal(reflected[0]?.kind, "set-hud", "AddScore first");
  equal(reflected[1]?.kind, "activate-object", "AddScore visibility follows its state");
  equal(reflected[2]?.kind, "set-hud", "Combo update follows AddScore");
  equal(reflected[3]?.kind, "activate-object", "Combo show follows Combo state");
  equal(reflected[4]?.kind, "activate-object", "Result show precedes Result state");
  equal(reflected[5]?.kind, "set-hud", "Result route follows visibility");
  equal(reflected[6]?.kind, "set-hud", "Score update follows Result");
  equal(reflected[7]?.kind, "set-hud", "Life update closes Reflect");
  if (reflected[6]?.kind === "set-hud") {
    equal(reflected[6].state.score, after.managers.scoreLifeState?.record.score,
      "HUD score equals committed owner plan");
  }
  if (reflected[7]?.kind === "set-hud") {
    equal(reflected[7].state.primaryFill, 1, "Life primary fill uses min(current/1000, 1)");
    equal(reflected[7].state.secondaryFill, 0, "Life secondary fill uses max(current/1000 - 1, 0)");
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
  const healRenderer = new RecordingSimulatorRendererBackend();
  const baseProfile = profile();
  const healProfile: RenderResourceProfile = {
    ...baseProfile,
    assets: baseProfile.assets.map((asset) => ({ ...asset, animationRole: "life-heal" as const })),
  };
  requireOk(await healRenderer.prepare(SESSION, healProfile, new LocalProvider(), preflight()),
    "life-heal renderer prepare");
  const producer = new RenderCommandProducer(SESSION, healRenderer, RESOURCES);
  const healRecord = new InGameRecord(1000, 1000, 2000);
  const hudSetup = requireOk(producer.preflightHudSetup(healRecord.snapshot()), "life-heal HUD setup");
  requireOk(hudSetup.commit(), "commit life-heal HUD setup");
  const healReflect = requireOk(producer.preflightHudReflect({
    batchIndex: 0,
    entryCount: 1,
    lifeHealAnimation: true,
    reflect: {
      batchIndex: 0,
      entries: [{ slot: 0, ordinaryScore: 100, freeLiveEventBonusScore: 0, lifeDelta: 300, comboAfter: 1, stageEffectLevel: 0, scoreUpType: 0 }],
      totalOrdinaryScore: 100,
      totalFreeLiveEventBonusScore: 0,
      representativeSlot: 0,
      representativeRawResult: 4,
      representativeScoreUpType: 0,
    },
    record: healRecord.snapshot(),
  }), "preflight life-heal HUD reflect");
  requireOk(healReflect.commit(), "commit life-heal HUD reflect");
  const healCommands = healRenderer.commandSnapshot().slice(-9);
  equal(healCommands[7]?.kind, "play-animation", "life-heal plays before Life UpdateView");
  if (healCommands[7]?.kind !== "play-animation") throw new Error("missing life-heal command");
  equal(healCommands[7].animationRole, "life-heal", "life-heal exact animation role");
  equal(healCommands[7].restart, true, "life-heal restarts current non-loop clip");
  equal(healCommands[8]?.kind, "set-hud", "Life UpdateView follows heal animation");
  const healAdvance = requireOk(
    producer.preflightHudAnimationAdvance(0.25),
    "preflight life-heal engine-clock sample",
  );
  requireOk(healAdvance.commit(), "commit life-heal engine-clock sample");
  const healSnapshot = healRenderer.commandSnapshot();
  const sample = healSnapshot[healSnapshot.length - 1];
  equal(sample?.kind, "sample-animation", "life-heal advances by explicit sample command");
  if (sample?.kind !== "sample-animation") throw new Error("missing life-heal sample");
  equal(sample.elapsedSeconds.bits, "3E800000", "life-heal elapsed preserves Float32 bits");
  const scoreUpPlan = {
    batchIndex: 1,
    entryCount: 1,
    lifeHealAnimation: false,
    reflect: {
      batchIndex: 1,
      entries: [{ slot: 0, ordinaryScore: 100, freeLiveEventBonusScore: 0, lifeDelta: 0, comboAfter: 2, stageEffectLevel: 0, scoreUpType: 2 }],
      totalOrdinaryScore: 100,
      totalFreeLiveEventBonusScore: 0,
      representativeSlot: 0,
      representativeRawResult: 4 as const,
      representativeScoreUpType: 2,
    },
    record: healRecord.snapshot(),
  };
  requireOk(requireOk(producer.preflightHudReflect(scoreUpPlan),
    "preflight R6 ScoreUp type 2").commit(), "commit R6 ScoreUp type 2");
  const scoreUpResult = [...healRenderer.commandSnapshot()].reverse().find((command) =>
    command.kind === "set-hud" && command.renderObjectId === "render:hud:result"
  );
  if (scoreUpResult?.kind !== "set-hud") throw new Error("missing ScoreUp Result state");
  equal(scoreUpResult.state.scoreUpType, 2, "R6 Result carries owner-frozen ScoreUpType 2");
  const beforeCrescendoReject = healRenderer.commandSnapshot().length;
  equal(producer.preflightHudReflect({
    ...scoreUpPlan,
    reflect: { ...scoreUpPlan.reflect, representativeScoreUpType: 5 },
  }).status, "evidence-required", "unobserved Crescendo text route stays closed");
  equal(healRenderer.commandSnapshot().length, beforeCrescendoReject,
    "Crescendo rejection has zero renderer mutation");
  requireOk(requireOk(producer.preflightHudAnimationAdvance(0.75),
    "preflight Result one-second lifetime").commit(), "commit Result one-second lifetime");
  equal(healRenderer.commandSnapshot().some((command) =>
    command.kind === "hide-object" && command.renderObjectId === "render:hud:result"
  ), true, "R5 Result lifetime hides at one owner-local second");
  requireOk(healRenderer.dispose(), "dispose life-heal renderer");

  const skillRenderer = new RecordingSimulatorRendererBackend();
  const skillProfile: RenderResourceProfile = {
    ...baseProfile,
    assets: baseProfile.assets.map((asset) => ({ ...asset, animationRole: "score-skill" as const })),
  };
  requireOk(await skillRenderer.prepare(SESSION, skillProfile, new LocalProvider(), preflight()),
    "R5 score-skill renderer prepare");
  const skillProducer = new RenderCommandProducer(SESSION, skillRenderer, {
    ...RESOURCES,
    scoreSkillAnimationLogicalAssetId: "asset.note",
  });
  requireOk(requireOk(skillProducer.preflightHudSetup(healRecord.snapshot()),
    "R5 skill HUD setup").commit(), "commit R5 skill HUD setup");
  const skillSnapshot = (
    state: 0 | 1 | 2 | 3,
    activeEffectTypes: readonly number[],
  ): SituationSkillSnapshot => Object.freeze({
    state,
    queue: Object.freeze(state === 0 ? [] : [0]),
    currentSkillNoteIndex: state === 0 ? null : 0,
    activeEffectTypes: Object.freeze([...activeEffectTypes]),
    skillTimer: 5,
    finishingTimer: 0,
    reservationFrame: 0x7fffffff,
    reservationEncore: false,
    stockSize: 8,
    continuousWorstResult: 4,
    crescendoRate: 1,
    trace: Object.freeze([]),
  });
  requireOk(requireOk(skillProducer.preflightHudSkillTransition(
    skillSnapshot(1, []),
    skillSnapshot(2, [0]),
  ), "R5 score-skill start").commit(), "commit R5 score-skill start");
  const skillStart = skillRenderer.commandSnapshot().slice(-3);
  equal(skillStart.map((command) => command.kind).join(","),
    "set-hud,activate-object,play-animation", "R5 skill start freezes display/gauge/Animator order");
  if (skillStart[0]?.kind === "set-hud") {
    equal(skillStart[0].state.scoreSkill, true, "R5 active score effect selects Score overlay");
    equal(skillStart[0].state.scoreGaugeActive, true, "R5 ScoreGauge On follows score effect");
  }
  requireOk(requireOk(skillProducer.preflightHudSkillTransition(
    skillSnapshot(2, [0]),
    skillSnapshot(3, [0]),
  ), "R5 score-skill finish").commit(), "commit R5 score-skill finish");
  equal(skillRenderer.commandSnapshot().slice(-2).map((command) => command.kind).join(","),
    "stop-animation,hide-object", "R5 skill finish stops Animator then hides generic display");
  requireOk(skillRenderer.dispose(), "dispose R5 score-skill renderer");
  console.log("ok 5 - Score/Life HUD, R5 Result lifetime and Skill/ScoreGauge transitions are atomic");
}

async function testOrdinaryLongLifecycle(): Promise<void> {
  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(
    SESSION,
    longProfile(),
    new LocalProvider(),
    preflight(),
  ), "Long renderer prepare");
  const baseInput = engineInput([renderedLongNoteBatch(96, 192)]);
  const input = {
    ...baseInput,
    runtime: {
      ...baseInput.runtime,
      playMode: {
        kind: "auto-live" as const,
        resultTransform: "identity-no-active-situation-skill" as const,
      },
    },
    rendering: LONG_RENDERING,
  };
  const engine = requireOk(
    createSimulatorEngine(input, createRecordingSimulatorBackends(renderer)),
    "Long engine create",
  );
  requireOk(engine.initialize(), "Long engine initialize");
  equal(renderer.snapshot().objectCount, 3, "Long pool owns root, after and mesh");
  equal(renderer.snapshot().nextSequence, 6, "Long pool setup has three create-hide pairs");
  requireOk(engine.step(0), "Long activation frame");
  const activation = renderer.commandSnapshot();
  equal(activation.length, 14, "Long activation commits root, hidden after and visible mesh atomically");
  equal(
    activation.slice(6).map((command) => `${command.kind}:${command.renderObjectId}`).join(","),
    "set-transform:render:long:0:root,activate-object:render:long:0:root," +
      "bind-resource:render:long:0:root,set-transform:render:long:0:after," +
      "set-transform:render:long:0:mesh,set-mesh:render:long:0:mesh," +
      "activate-object:render:long:0:mesh,bind-resource:render:long:0:after",
    "Long Activate preserves front then after/mesh/setupNoteType owner order",
  );
  let afterActivationIndex = -1;
  for (let frame = 0; frame < 60 && afterActivationIndex < 0; frame += 1) {
    requireOk(engine.step(1 / 60), `Long child frame ${frame}`);
    afterActivationIndex = renderer.commandSnapshot().findIndex((command) =>
      command.kind === "activate-object" && command.renderObjectId === "render:long:0:after"
    );
  }
  assert(afterActivationIndex > 14, "Long after becomes visible at LauncherMusicPos tail equality");
  const moved = renderer.commandSnapshot();
  equal(moved[afterActivationIndex - 1]?.kind, "set-transform", "after equality writes transform before visibility");
  equal(moved[afterActivationIndex + 1]?.kind, "set-mesh", "mesh refresh follows after visibility transition");
  assert(
    moved.slice(14, afterActivationIndex).some((command) =>
      command.kind === "set-mesh" && command.renderObjectId === "render:long:0:mesh"),
    "Long mesh refreshes while after waits at launcher",
  );
  requireOk(engine.dispose(), "dispose active Long");
  const disposed = renderer.commandSnapshot();
  for (const renderObjectId of ["render:long:0:root", "render:long:0:after", "render:long:0:mesh"]) {
    equal(disposed.filter((command) =>
      command.kind === "deactivate-object" && command.renderObjectId === renderObjectId
    ).length, 1, `${renderObjectId} deactivates exactly once`);
  }
  equal(renderer.snapshot().objectCount, 0, "Long session release clears all three owners");
  console.log("ok 7 - ordinary Long normal-tail after and base mesh production lifecycle");
}

async function testOrdinarySyncLineLifecycle(): Promise<void> {
  const renderer = new RecordingSimulatorRendererBackend();
  requireOk(await renderer.prepare(
    SESSION,
    syncProfile(),
    new LocalProvider(),
    preflight(),
  ), "sync-line renderer prepare");
  const baseInput = engineInput([renderedSyncNoteBatch(96)]);
  const input = {
    ...baseInput,
    runtime: {
      ...baseInput.runtime,
      playMode: {
        kind: "auto-live" as const,
        resultTransform: "identity-no-active-situation-skill" as const,
      },
    },
    rendering: SYNC_RENDERING,
  };
  const engine = requireOk(
    createSimulatorEngine(input, createRecordingSimulatorBackends(renderer)),
    "sync-line engine create",
  );
  requireOk(engine.initialize(), "sync-line engine initialize");
  equal(renderer.snapshot().objectCount, 82, "two Note roots plus recovered 80-slot line pool");
  equal(renderer.snapshot().nextSequence, 244, "pool setup emits roots then 80 create-bind-hide triples");
  const setupCommands = renderer.commandSnapshot();
  const firstLineCreate = setupCommands[4];
  equal(firstLineCreate?.kind, "create-object", "first sync owner created after roots");
  if (firstLineCreate?.kind !== "create-object") throw new Error("missing sync create command");
  equal(firstLineCreate.renderObjectId, "render:sync-line:0", "stable first sync pool identity");
  equal(firstLineCreate.parentObjectId, null, "sync line is a global sibling, not a transformed Note child");
  equal(setupCommands[5]?.kind, "bind-resource", "sync material binds at pool setup");
  if (setupCommands[5]?.kind !== "bind-resource") throw new Error("missing sync material binding");
  equal(setupCommands[5].logicalAssetId, "asset.sync-line", "explicit sync material asset route");

  requireOk(engine.step(0), "activate simultaneous ordinary Notes");
  const activated = renderer.commandSnapshot();
  equal(activated.length, 252, "two roots and one sync line activate in one scheduler group");
  equal(activated[250]?.kind, "set-line", "line geometry follows both Note activations");
  equal(activated[251]?.kind, "activate-object", "line visibility follows initial geometry");
  if (activated[250]?.kind !== "set-line") throw new Error("missing initial sync geometry");
  equal(activated[250].renderObjectId, "render:sync-line:0", "first inactive pool slot acquired");
  equal(activated[250].width.bits, f32(0.2800000011920929).bits, "current width factor uses initial scale one");

  requireOk(engine.step(1 / 60), "advance simultaneous ordinary Notes");
  const moved = renderer.commandSnapshot();
  equal(moved[moved.length - 1]?.kind, "set-line", "line updates after both root transforms");
  if (moved[moved.length - 1]?.kind !== "set-line") throw new Error("missing moving sync geometry");
  equal(moved[moved.length - 1].substep, 0, "line preserves adaptive substep identity");

  requireOk(engine.dispose(), "dispose active simultaneous Notes");
  const disposed = renderer.commandSnapshot();
  const lineDeactivations = disposed.filter((command) =>
    command.kind === "deactivate-object" && command.renderObjectId === "render:sync-line:0"
  );
  equal(lineDeactivations.length, 1, "first endpoint teardown returns shared line exactly once");
  const lineDeactivationIndex = disposed.findIndex((command) => command === lineDeactivations[0]);
  equal(disposed[lineDeactivationIndex - 1]?.kind, "hide-object", "line hide precedes deactivation");
  equal(renderer.snapshot().objectCount, 0, "session release removes roots and all fixed line owners");
  console.log("ok 6 - ordinary simultaneous line fixed pool, motion and shared teardown lifecycle");
}

async function testHostReadyGate(): Promise<void> {
  const unprepared = new RecordingSimulatorRendererBackend();
  const backends = createRecordingSimulatorBackends(unprepared);
  const baseInput = engineInput([renderedNoteBatch("render-normal", 96)]);
  const input = {
    ...baseInput,
    runtime: {
      ...baseInput.runtime,
      playMode: {
        kind: "auto-live" as const,
        resultTransform: "identity-no-active-situation-skill" as const,
      },
    },
    rendering: RENDERING,
  };
  equal(createSimulatorEngine(input, backends).status, "evidence-required", "unprepared host rejected");
  equal(backends.snapshot().length, 0, "host rejection precedes backend/domain mutation");

  requireOk(await unprepared.prepare(SESSION, profile(), new LocalProvider(), preflight()), "host renderer prepare");
  const engine = requireOk(createSimulatorEngine(input, backends), "prepared host create");
  requireOk(engine.initialize(), "prepared host initialize");
  equal(unprepared.snapshot().objectCount, 1, "pool setup creates stable render root");
  equal(unprepared.snapshot().nextSequence, 2, "pool setup create then hide order");
  requireOk(engine.step(0), "rendered note activation frame");
  equal(unprepared.snapshot().nextSequence, 5, "initial transform, activation and exact bind order");
  const produced = unprepared.commandSnapshot();
  equal(produced[0]?.kind, "create-object", "setup create command");
  equal(produced[1]?.kind, "hide-object", "setup hide command");
  equal(produced[2]?.kind, "set-transform", "current Activate writes initial transform first");
  equal(produced[3]?.kind, "activate-object", "SetSpriteEnabled follows initial transform");
  equal(produced[4]?.kind, "bind-resource", "setupNoteType binds after visibility");
  if (produced[2]?.kind === "set-transform") {
    equal(produced[2].ordering.sourceDepthOrSortingOrder, 70, "current Note root sorting order");
    equal(produced[2].position.z.bits, f32(-13.5).bits, "initial transform preserves typed scene Z");
  }
  if (produced[4]?.kind === "bind-resource") {
    equal(produced[4].exactKey, "note_normal_0", "owner-authored exact Sprite key");
  }
  for (let frame = 0; frame < 120; frame += 1) {
    if (unprepared.commandSnapshot().some((command) => command.kind === "deactivate-object")) break;
    requireOk(engine.step(1 / 60), `rendered note lifecycle frame ${frame}`);
  }
  const lifecycle = unprepared.commandSnapshot();
  const deactivationIndex = lifecycle.findIndex((command) => command.kind === "deactivate-object");
  assert(deactivationIndex > 0, "rendered note reaches deactivation");
  equal(lifecycle[deactivationIndex - 1]?.kind, "hide-object", "deactivation hide command");
  equal(lifecycle[deactivationIndex]?.kind, "deactivate-object", "deactivation state command");
  assert(
    lifecycle.slice(5, deactivationIndex - 1).every((command) => command.kind === "set-transform"),
    "every active Move substep emits one typed transform before judgement",
  );
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
    { ...engineInput(), rendering: { ...RENDERING, sessionId: "foreign" } },
    createRecordingSimulatorBackends(unprepared),
  );
  equal(mismatch.status, "evidence-required", "cross-session host rejected");
  equal(createSimulatorEngine(engineInput(), createRecordingSimulatorBackends(unprepared)).status,
    "evidence-required", "typed backend requires explicit host session");
  console.log("ok 8 - host ready and exact-session gate precedes owner mutation");
}

async function testR4NoteFamilyBoundaries(): Promise<void> {
  const normal = renderedNoteBatch("render-family-boundary", 96).informationList[0]!;
  const cases = [
    {
      label: "virtual Long",
      information: { ...normal, fireNoteType: FrontNoteType.Long, afterNoteType: AfterNoteType.Normal, afterNoteAbsolutePos: 192, virtualLaneDirection: 1 },
      capability: "render.note.virtual-lane-child-evidence-required",
    },
    {
      label: "Long Flick tail",
      information: { ...normal, fireNoteType: FrontNoteType.Long, afterNoteType: AfterNoteType.Flick, afterNoteAbsolutePos: 192 },
      capability: "render.note.long-non-normal-tail-evidence-required",
    },
    {
      label: "Slide",
      information: { ...normal, fireNoteType: FrontNoteType.SlideA },
      capability: "render.note.slide-child-chain-evidence-required",
    },
    {
      label: "Multiple side visual",
      information: { ...normal, fireNoteType: FrontNoteType.LongMultipleDirectionalFlickAdd },
      capability: "render.note.multiple-directional-lifecycle-evidence-required",
    },
  ] as const;
  for (const testCase of cases) {
    const result = validateOrdinaryRenderedBatchAuthorization([testCase.information]);
    equal(result.status, "evidence-required", `${testCase.label} remains fail-closed`);
    equal(result.status === "evidence-required" ? result.capability : null,
      testCase.capability, `${testCase.label} reports its exact missing authorization`);
  }
  equal(validateOrdinaryRenderedBatchAuthorization([normal]).status, "ok",
    "ordinary Normal remains authorized");
  equal(validateOrdinaryRenderedBatchAuthorization([
    { ...normal, fireNoteType: FrontNoteType.Long, afterNoteType: AfterNoteType.Normal, afterNoteAbsolutePos: 192 },
  ]).status, "ok", "ordinary Long+Normal tail remains authorized");
  equal(validateOrdinaryRenderedBatchAuthorization([
    { ...normal, fireNoteType: FrontNoteType.Flick, gameNoteType: GameNoteType.Flick },
  ]).status, "ok", "R4 front Flick is authorized");
  equal(validateOrdinaryRenderedBatchAuthorization([
    { ...normal, fireNoteType: FrontNoteType.DirectionalFlick, gameNoteType: GameNoteType.DirectionalFlickLeft },
  ]).status, "ok", "R4 front Directional is authorized");
  equal(validateOrdinaryRenderedBatchAuthorization([
    { ...normal, fireNoteType: FrontNoteType.MultipleDirectionalFlick, gameNoteType: GameNoteType.DirectionalFlickLeft },
  ]).status, "ok", "R4 MultipleDirectional root is authorized");
  const laneButtons = Object.freeze([
    ButtonType.Button_00_BMS_1P_SC,
    ButtonType.Button_01_BMS_1P_01,
    ButtonType.Button_02_BMS_1P_02,
    ButtonType.Button_03_BMS_1P_03,
    ButtonType.Button_04_BMS_1P_04,
    ButtonType.Button_05_BMS_1P_05,
    ButtonType.Button_06_BMS_1P_06,
  ]);
  for (let width = 1; width <= 7; width += 1) {
    const range = Object.freeze(laneButtons.slice(0, width));
    const center = range[Math.floor((width - 1) / 2)]!;
    const binding = requireOk(resolveFrontSpriteBinding({
      ...normal,
      fireNoteType: FrontNoteType.SlideA,
      gameNoteType: GameNoteType.SlideA,
      buttonType: center,
      buttonTypes: range,
      buttonTypesArray: range,
    }, false, RESOURCES), `R4 Slide width ${width} binding`);
    equal(binding.exactKey, `note_long_${center}`,
      `R4 Slide width ${width} uses its authored center lane key`);
  }

  const flickRenderer = new RecordingSimulatorRendererBackend();
  requireOk(await flickRenderer.prepare(SESSION, r4Profile(), new LocalProvider(), preflight()),
    "R4 Flick renderer prepare");
  const flickBatch = renderedNoteBatch("render-flick-r4", 96);
  const renderedFlickBatch = Object.freeze({
    ...flickBatch,
    informationList: Object.freeze(flickBatch.informationList.map((information) => Object.freeze({
      ...information,
      fireNoteType: FrontNoteType.Flick,
      gameNoteType: GameNoteType.Flick,
    }))),
  });
  const flickInput = engineInput([renderedFlickBatch]);
  const flickEngine = requireOk(createSimulatorEngine(
    {
      ...flickInput,
      runtime: {
        ...flickInput.runtime,
        playMode: {
          kind: "auto-live" as const,
          resultTransform: "identity-no-active-situation-skill" as const,
        },
      },
      rendering: R4_RENDERING,
    },
    createRecordingSimulatorBackends(flickRenderer),
  ), "R4 Flick engine create");
  requireOk(flickEngine.initialize(), "R4 Flick engine initialize");
  requireOk(flickEngine.step(0), "R4 Flick activates");
  const flickCommands = flickRenderer.commandSnapshot();
  equal(flickCommands.some((command) =>
    command.kind === "bind-resource" && command.exactKey === "note_flick_0"),
  true, "R4 Flick binds the exact current key");
  equal(flickCommands.some((command) =>
    command.kind === "set-transform" && command.ordering.sourceDepthOrSortingOrder === 70),
  true, "R4 Flick retains ordinary root ordering");
  requireOk(flickEngine.dispose(), "dispose R4 Flick engine");

  const slideRenderer = new RecordingSimulatorRendererBackend();
  requireOk(await slideRenderer.prepare(SESSION, longProfile(), new LocalProvider(), preflight()),
    "R4 Slide renderer prepare");
  const slideInput = engineInput([renderedSlideNoteBatch(96)]);
  const slideEngine = requireOk(createSimulatorEngine(
    {
      ...slideInput,
      runtime: {
        ...slideInput.runtime,
        playMode: {
          kind: "auto-live" as const,
          resultTransform: "identity-no-active-situation-skill" as const,
        },
      },
      rendering: R4_SLIDE_RENDERING,
    },
    createRecordingSimulatorBackends(slideRenderer),
  ), "R4 Slide engine create");
  requireOk(slideEngine.initialize(), "R4 Slide engine initialize");
  equal(slideRenderer.snapshot().objectCount, 5,
    "R4 two-child Slide owns one root plus two child/segment pairs");
  requireOk(slideEngine.step(0), "R4 Slide activates");
  const slideCommands = slideRenderer.commandSnapshot();
  equal(slideCommands.filter((command) =>
    command.kind === "set-mesh" && command.renderObjectId.includes(":slide-mesh:")
  ).length, 2, "R4 Slide N children emit exactly N base-mesh segments");
  equal(slideCommands.filter((command) =>
    command.kind === "activate-object" && command.renderObjectId.includes(":slide-child:")
  ).length, 1, "R4 Slide preserves one visible and one invisible child owner");
  requireOk(slideEngine.step(1 / 60), "R4 Slide child chain updates");
  equal(slideRenderer.commandSnapshot().filter((command) =>
    command.kind === "set-mesh" && command.renderObjectId.includes(":slide-mesh:")
  ).length, 4, "R4 Slide refreshes every child-owned segment after root motion");
  requireOk(slideEngine.dispose(), "dispose R4 Slide engine");
  for (const renderObjectId of [
    "render:slide:0:root",
    "render:slide:0:slide-child:0",
    "render:slide:0:slide-mesh:0",
    "render:slide:0:slide-child:1",
    "render:slide:0:slide-mesh:1",
  ]) {
    equal(slideRenderer.commandSnapshot().filter((command) =>
      command.kind === "deactivate-object" && command.renderObjectId === renderObjectId
    ).length, 1, `${renderObjectId} deactivates exactly once`);
  }

  const multipleRenderer = new RecordingSimulatorRendererBackend();
  requireOk(await multipleRenderer.prepare(
    SESSION,
    r4Profile(),
    new LocalProvider(),
    preflight(),
  ), "R4 Multiple renderer prepare");
  const multipleBatch = renderedNoteBatch("render-multiple-r4", 96);
  const multipleBase = multipleBatch.informationList[0]!;
  const multipleInformation = ([
    [ButtonType.Button_00_BMS_1P_SC, 0],
    [ButtonType.Button_01_BMS_1P_01, 1],
  ] as const).map(([buttonType, index]) => Object.freeze({
    ...multipleBase,
    index: multipleBase.index + index,
    buttonType,
    buttonTypes: Object.freeze([buttonType]),
    buttonTypesArray: Object.freeze([buttonType]),
    fireNoteType: FrontNoteType.MultipleDirectionalFlick,
    gameNoteType: GameNoteType.DirectionalFlickLeft,
  }));
  const renderedMultipleBatch = Object.freeze({
    ...multipleBatch,
    informationList: Object.freeze(multipleInformation),
  });
  const multipleInput = engineInput([renderedMultipleBatch]);
  const multipleEngine = requireOk(createSimulatorEngine(
    {
      ...multipleInput,
      runtime: {
        ...multipleInput.runtime,
        playMode: {
          kind: "auto-live" as const,
          resultTransform: "identity-no-active-situation-skill" as const,
        },
      },
      rendering: R4_RENDERING,
    },
    createRecordingSimulatorBackends(multipleRenderer),
  ), "R4 Multiple engine create");
  requireOk(multipleEngine.initialize(), "R4 Multiple engine initialize");
  requireOk(multipleEngine.step(0), "R4 Multiple activates");
  const multipleCommands = multipleRenderer.commandSnapshot();
  equal(multipleCommands.filter((command) =>
    command.kind === "bind-resource" &&
    (command.exactKey === "note_flick_l_0" || command.exactKey === "note_flick_l_1")
  ).length, 2, "R4 Multiple roots bind both exact directional keys");
  equal(multipleCommands.filter((command) =>
    command.kind === "set-transform" && command.ordering.sourceDepthOrSortingOrder === 71
  ).length >= 2, true, "R4 Directional roots use observed sorting order 71");
  equal(multipleCommands.some((command) =>
    command.kind === "bind-resource" &&
    command.renderObjectId === "render:multiple-directional-line:0" &&
    command.logicalAssetId === "asset.multiple-directional-line-left"
  ), true, "R4 Multiple left group selects its explicit left material at activation");
  equal(multipleCommands.some((command) =>
    command.kind === "set-line" && command.materialRole === "multiple-directional-line"
  ), true, "R4 Multiple group emits one dedicated back line");
  requireOk(multipleEngine.dispose(), "dispose R4 Multiple engine");
  console.log("ok 9 - R4 Flick/Directional, standard Slide chain and Multiple back line are positive while unobserved routes remain closed");
}

async function main(): Promise<void> {
  await testPortableLocalResources();
  await testProfileValidationAndAliases();
  await testAtomicPrepare();
  await testCommandsAndTerminalFault();
  await testHudReflectAtomic();
  await testOrdinarySyncLineLifecycle();
  await testOrdinaryLongLifecycle();
  await testHostReadyGate();
  await testR4NoteFamilyBoundaries();
  console.log("render contract tests passed: 9");
}

void main().catch((error: unknown) => {
  throw error;
});
