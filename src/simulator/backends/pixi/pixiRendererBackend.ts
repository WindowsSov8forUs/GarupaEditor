import {
  Container,
  Graphics,
  Mesh,
  NineSliceSprite,
  MeshGeometry,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type DestroyOptions,
} from "pixi.js";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../../engine/evidence";
import { RecordingSimulatorRendererBackend } from "../recordingRendererBackend";
import { validateAndFreezeRenderProfile } from "../renderingValidation";
import type { OrdinaryVisibleClip } from "../resources/currentOrdinaryVisibleProfile";
import type { SimulatorModeIdentity } from "../../engine/data/inGameCalculatedData";
import {
  createRehearsalControlSceneLayout,
  formatRehearsalTimeLabel,
  type RehearsalControlBounds,
  type RehearsalControlSceneLayout,
} from "../../scene/rehearsalControlScene";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import type { PauseControlSceneSnapshot, PauseControlBounds } from "../../scene/pauseControlScene";
import {
  COMMON_ORDINARY_VISIBLE_BINDINGS as CURRENT_ORDINARY_VISIBLE_BINDINGS,
  COMMON_PAUSE_CONTROL_BINDINGS as CURRENT_PAUSE_CONTROL_BINDINGS,
  COMMON_SCORE_HUD_BINDINGS as CURRENT_SCORE_HUD_BINDINGS,
  COMMON_STARTUP_DIRECTION_BINDINGS as CURRENT_STARTUP_DIRECTION_BINDINGS,
} from "../../engine/rendering/commonResourceBindings";
import { CURRENT_ORDINARY_HUD_PROFILE } from "../resources/currentOrdinaryHudProfile";
import {
  CURRENT_SCORE_HUD_BITMAP_GLYPHS,
  CURRENT_SCORE_HUD_NINE_SLICE_BORDERS,
  CURRENT_SCORE_HUD_SCENE_PROFILE,
} from "../../engine/rendering/currentScoreHudSemanticProfile";
import {
  animationBindingMatchesProfile,
  animationRoleMatchesObject,
  validateTypedRenderHudCommand,
  validateTypedRenderResourceBinding,
} from "../renderingCommandValidation";
import type {
  RenderBackendSnapshot,
  RenderCommand,
  RenderCommandBatch,
  RenderAtlasRow,
  RenderOrthographicProjectionProfile,
  RenderObjectRole,
  RenderResourceAssetProfile,
  RenderResourcePreflightAdapter,
  RenderScoreHudState,
  RenderResourceProfile,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "../renderingContracts";

export interface PixiDecodedFont {
  readonly family: string;
  dispose(): void;
}

export interface PixiTextureDecoder {
  decodePng(
    asset: RenderResourceAssetProfile,
    bytes: Uint8Array,
  ): Promise<SimulatorResult<Texture>>;
  decodeFont?(
    asset: RenderResourceAssetProfile,
    bytes: Uint8Array,
  ): Promise<SimulatorResult<PixiDecodedFont>>;
}

export interface PixiSceneObjectFactory {
  create(role: string, renderObjectId: string, roundPixels: boolean): Container;
}

export interface PixiInGameControlOverlay {
  readonly root: Container;
  updateTimeline(timelineSeconds: number): SimulatorResult<void>;
  setMoveTimeInProgress(active: boolean): SimulatorResult<void>;
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void>;
  dispose(): SimulatorResult<void>;
}

interface PendingPixiBatch {
  readonly recordingBatch: RenderCommandBatch;
  readonly commands: readonly RenderCommand[];
  readonly reservedNodes: ReadonlyMap<number, Container>;
  readonly reservedGeometry: ReadonlyMap<number, Mesh>;
  readonly reservedMasks: ReadonlyMap<number, Graphics>;
}

interface PixiHudVisual {
  readonly kind: "score" | "combo" | "result" | "life" | "add-score" | "habahiro-flash" | "fidelity-label";
  readonly content: Container;
  readonly text: Text | null;
  readonly gameOverText: Text | null;
  readonly primaryFill: Graphics | null;
  readonly secondaryFill: Graphics | null;
  readonly animationLayer: Container;
  readonly digitSprites: Sprite[];
  readonly fillMasks: Graphics[];
  readonly scoreDigitTexts: Sprite[];
  readonly scoreGaugeSprites: Container[];
  readonly scoreRankSprites: Container[];
  readonly scoreHighRankSprites: Sprite[];
  readonly scoreHighRankNodeNames: string[];
  readonly scoreHighRankPanelMask: Graphics | null;
  scoreHighRankPanelMaskGeneration: number;
  scoreHighRankPanelMaskBounds: readonly [number, number, number, number] | null;
  scoreHighRankGeneration: number;
  fillRatios: readonly [number, number];
}

type EvidenceAnimationRole =
  | "combo"
  | "all-perfect"
  | "add-score"
  | "result"
  | "life-warning"
  | "life-game-over"
  | "score-gauge-ss"
  | "habahiro-lane-change"
  | "note-flick"
  | "note-directional-flick"
  | "note-long-flash";

interface PixiObjectRecord {
  readonly role: RenderObjectRole;
  readonly parentObjectId: string | null;
  readonly node: Container;
  ordering: readonly [number, number, number, number];
  hudState: Readonly<object> | null;
  spriteBindingKey: string | null;
  spritePixelsPerUnit: number | null;
  hudBindingKeys: string[];
  scoreHighRankBindingKeys: string[];
  spriteContent: Sprite | null;
  materialTexture: Texture | null;
  materialLogicalAssetId: string | null;
  geometryContent: Mesh | null;
  maskContent: Graphics | null;
  thresholdMaskContent: Graphics | null;
  threshold: number | null;
  maskVertexCount: number | null;
  hudVisual: PixiHudVisual | null;
  readonly resourceProfile: RenderResourceProfile;
  readonly scoreGaugeSsAnimation: RenderResourceProfile["scoreGaugeSsAnimation"];
  readonly ordinaryVisibleProfile: RenderResourceProfile["ordinaryVisibleProfile"];
  readonly surfaceLayout: OriginalSurfaceLayout;
  activeAnimationRole: EvidenceAnimationRole | null;
  readonly activeAnimationRoles: Set<EvidenceAnimationRole>;
  readonly animationElapsedByRole: Map<EvidenceAnimationRole, number>;
  animationElapsedSeconds: number | null;
  lastTransform: SetTransformCommand | null;
}

interface PixiShadowObject {
  readonly role: RenderObjectRole;
  readonly parentObjectId: string | null;
  readonly materialBound: boolean;
  readonly spriteBindingKey: string | null;
  readonly maskConfigured: boolean;
  readonly activeAnimationRoles: ReadonlySet<EvidenceAnimationRole>;
}

export class PixiRendererBackend implements SimulatorRendererBackend {
  readonly id = "pixi-v8-renderer";

  readonly stage: Container;
  private readonly recording = new RecordingSimulatorRendererBackend();
  private readonly objects = new Map<string, PixiObjectRecord>();
  private readonly objectIdsByNode = new Map<Container, string>();
  private readonly baseTextures = new Map<string, Texture>();
  private readonly spriteTextures = new Map<string, Texture>();
  private readonly spriteReferenceCounts = new Map<string, number>();
  private readonly decodedFonts = new Map<string, PixiDecodedFont>();
  private readonly pending = new Map<RenderCommandBatch, PendingPixiBatch>();
  private controlOverlayRoot: Container | null = null;
  private profile: RenderResourceProfile | null = null;
  private surfaceLayout: OriginalSurfaceLayout | null = null;

  constructor(
    private readonly decoder: PixiTextureDecoder,
    private readonly objectFactory: PixiSceneObjectFactory = defaultObjectFactory,
  ) {
    this.stage = new Container({ label: "GarupaSimulatorRoot", sortableChildren: true });
    this.stage.sortableChildren = true;
  }

  bindOriginalSurfaceLayout(layout: OriginalSurfaceLayout): SimulatorResult<void> {
    const projection = this.profile?.scene.projection;
    if (
      this.recording.snapshot().state !== "ready" || this.surfaceLayout !== null ||
      this.objects.size !== 0 || this.pending.size !== 0 ||
      projection === undefined ||
      layout.surface.viewportWidth !== projection.viewportWidth ||
      layout.surface.viewportHeight !== projection.viewportHeight ||
      layout.camera.pixelsPerWorldUnit !== projection.pixelsPerWorldUnit
    ) {
      return integrityFailure(
        "render.pixi.invalid-surface-layout-binding",
        ["ML-E01", "ML-E03"],
        "The renderer binds exactly one original surface layout after resource prepare and before any scene object, command batch or overlay.",
      );
    }
    this.surfaceLayout = layout;
    return ok(undefined);
  }

  getStartupDirectionCommonResources(): SimulatorResult<{
    readonly lineStar: Texture;
    readonly jacketFrame: Texture;
    readonly difficultyFrames: Readonly<Record<"EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL", Texture>>;
    readonly fullLiveLabel: Texture;
    readonly fontFamily: string;
  }> {
    const lineStar = this.baseTextures.get(CURRENT_STARTUP_DIRECTION_BINDINGS.lineStarLogicalAssetId);
    const jacketFrame = this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_base_jacket_frame"));
    const fullLiveLabel = this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "icon_fullmusic_gray"));
    const font = this.decodedFonts.get(CURRENT_STARTUP_DIRECTION_BINDINGS.fontLogicalAssetId);
    const difficultyFrames = Object.freeze({
      EASY: this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_jacket_frame_rank_1_easy")),
      NORMAL: this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_jacket_frame_rank_1_normal")),
      HARD: this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_jacket_frame_rank_1_hard")),
      EXPERT: this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_jacket_frame_rank_1_expert")),
      SPECIAL: this.spriteTextures.get(spriteKey(CURRENT_STARTUP_DIRECTION_BINDINGS.uiCommonLogicalAssetId, "bg_jacket_frame_rank_1_special")),
    });
    if (lineStar === undefined || jacketFrame === undefined || fullLiveLabel === undefined || font === undefined ||
      Object.values(difficultyFrames).some((texture) => texture === undefined)) {
      return integrityFailure(
        "render.startup-direction.common-resources-unavailable",
        ["SD02", "SD16"],
        "The startup scene requires the hash-validated line-star, current UICommon rows and current sgm font without a texture or system-font fallback.",
      );
    }
    return ok(Object.freeze({
      lineStar,
      jacketFrame,
      difficultyFrames: difficultyFrames as Readonly<Record<"EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL", Texture>>,
      fullLiveLabel,
      fontFamily: font.family,
    }));
  }

  createInGameControlOverlay(
    mode: SimulatorModeIdentity,
    durationSeconds: number,
    surfaceLayout: OriginalSurfaceLayout,
  ): SimulatorResult<PixiInGameControlOverlay> {
    if (this.surfaceLayout !== surfaceLayout) {
      return integrityFailure(
        "render.rehearsal-control.surface-layout-mismatch",
        ["ML-E03"],
        "Rehearsal controls must consume the exact original surface layout already bound to the renderer session.",
      );
    }
    if (this.controlOverlayRoot !== null) {
      return integrityFailure(
        "render.rehearsal-control.duplicate-owner",
        ["LR-E03"],
        "One renderer session owns at most one Rehearsal control overlay.",
      );
    }
    const snapshot = this.recording.snapshot();
    const returnTexture = this.spriteTextures.get(spriteKey(
      CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
      "btn_ingame_time_back",
    ));
    const advanceTexture = this.spriteTextures.get(spriteKey(
      CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
      "btn_ingame_time_forward",
    ));
    const timeBackgroundTexture = this.spriteTextures.get(spriteKey(
      CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
      "bg_base_r6_inside_rhythm",
    ));
    const demoBackgroundTexture = this.spriteTextures.get(spriteKey(
      CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
      "label_round_white",
    ));
    const pauseTexture = this.spriteTextures.get(spriteKey(CURRENT_PAUSE_CONTROL_BINDINGS.rhythmGameUiLogicalAssetId, "button_pause"));
    const windowTexture = this.spriteTextures.get(spriteKey(CURRENT_PAUSE_CONTROL_BINDINGS.uiCommonLogicalAssetId, "bg_base_r12"));
    const headerTexture = this.spriteTextures.get(spriteKey(CURRENT_PAUSE_CONTROL_BINDINGS.uiCommonLogicalAssetId, "bg_header_dialog"));
    const grayButtonTexture = this.spriteTextures.get(spriteKey(CURRENT_PAUSE_CONTROL_BINDINGS.uiCommonLogicalAssetId, "button_gray"));
    const pinkButtonTexture = this.spriteTextures.get(spriteKey(CURRENT_PAUSE_CONTROL_BINDINGS.uiCommonLogicalAssetId, "button_pink"));
    const countdownTextures = CURRENT_PAUSE_CONTROL_BINDINGS.countdownLogicalAssetIds.map((id) => this.baseTextures.get(id));
    const font = this.decodedFonts.get(CURRENT_SCORE_HUD_BINDINGS.rankLabelFontLogicalAssetId);
    if (snapshot.state !== "ready" || returnTexture === undefined ||
      advanceTexture === undefined || timeBackgroundTexture === undefined ||
      demoBackgroundTexture === undefined || pauseTexture === undefined || windowTexture === undefined ||
      headerTexture === undefined || grayButtonTexture === undefined || pinkButtonTexture === undefined ||
      countdownTextures.some((texture) => texture === undefined) || font === undefined ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return integrityFailure(
        "render.rehearsal-control.resources-unavailable",
        ["LR-E03", "LR-E04", "LR-E05"],
        "Rehearsal controls require the ready current rhythm-game-ui atlas, exact sgm font and positive session duration; no fallback is rendered.",
      );
    }
    const overlay = new PixiInGameControlOverlayOwner(
      mode,
      durationSeconds,
      returnTexture,
      advanceTexture,
      timeBackgroundTexture,
      demoBackgroundTexture,
      pauseTexture,
      windowTexture,
      headerTexture,
      grayButtonTexture,
      pinkButtonTexture,
      countdownTextures as [Texture, Texture, Texture],
      font.family,
      createRehearsalControlSceneLayout(surfaceLayout),
      (root) => {
        if (this.controlOverlayRoot === root) this.controlOverlayRoot = null;
      },
    );
    this.controlOverlayRoot = overlay.root;
    this.stage.addChild(overlay.root);
    return ok(overlay);
  }

  async prepare(
    sessionId: string,
    profile: RenderResourceProfile,
    provider: SimulatorResourceProvider,
    preflight: RenderResourcePreflightAdapter,
  ): Promise<SimulatorResult<void>> {
    if (this.recording.snapshot().state !== "unprepared") {
      return reject(
        "render.pixi.prepare-invalid-state",
        "A Pixi renderer session is prepared exactly once and never silently reloaded.",
      );
    }
    if (this.stage.destroyed || this.stage.children.length !== 0) {
      return reject(
        "render.pixi.stage-not-empty-or-destroyed",
        "The injected Pixi stage must be live and empty before atomic prepare.",
      );
    }
    const frozenProfile = validateAndFreezeRenderProfile(profile);
    if (frozenProfile.status !== "ok") return frozenProfile;
    const cache = new CachingProvider(provider);
    const validator = new RecordingSimulatorRendererBackend();
    const validated = await validator.prepare(
      sessionId,
      frozenProfile.value,
      cache,
      preflight,
    );
    if (validated.status !== "ok") return validated;
    validator.dispose();

    const decodedIdentities = new Set<Texture>();
    try {
      for (const asset of frozenProfile.value.assets) {
        if (asset.mime !== "image/png" && asset.mime !== "font/ttf") continue;
        const bytes = cache.get(asset.logicalAssetId);
        if (bytes === undefined) {
          this.resetPreparedTextures();
          return reject(
            "render.pixi.validated-bytes-unavailable",
            "Pixi decode consumes the exact bytes already validated during the same atomic prepare.",
          );
        }
        if (asset.mime === "font/ttf") {
          if (this.decoder.decodeFont === undefined) {
            this.resetPreparedTextures();
            return reject(
              "render.pixi.font-decoder-unavailable",
              "The current Score Rank labels require the hash-validated sgm FontFace and never fall back to a system font.",
            );
          }
          const decodedFont = await this.decoder.decodeFont(asset, bytes);
          if (decodedFont.status !== "ok") {
            this.resetPreparedTextures();
            return decodedFont;
          }
          this.decodedFonts.set(asset.logicalAssetId, decodedFont.value);
          continue;
        }
        const decoded = await this.decoder.decodePng(asset, bytes);
        if (decoded.status !== "ok") {
          this.resetPreparedTextures();
          return decoded;
        }
        const base = decoded.value;
        if (decodedIdentities.has(base)) {
          this.resetPreparedTextures();
          return reject(
            "render.pixi.decoder-texture-alias",
            "Each logical image asset must return one independently owned decoded Texture identity.",
          );
        }
        decodedIdentities.add(base);
        if (base.source.width !== asset.width || base.source.height !== asset.height) {
          base.destroy(true);
          this.resetPreparedTextures();
          return reject(
            "render.pixi.decoded-dimension-mismatch",
            "Decoded Pixi Texture dimensions must match the hash-validated profile.",
          );
        }
        this.baseTextures.set(asset.logicalAssetId, base);
        applyTextureSettings(base, asset);
        for (const row of asset.atlasRows) {
          const texture = new Texture({
            source: base.source,
            frame: new Rectangle(row.x, row.y, row.width, row.height),
            orig: new Rectangle(0, 0, row.width, row.height),
            defaultAnchor: { x: row.pivotX, y: row.pivotY },
            label: `${asset.logicalAssetId}:${row.exactKey}`,
          });
          this.spriteTextures.set(spriteKey(asset.logicalAssetId, row.exactKey), texture);
        }
      }
    } catch {
      this.resetPreparedTextures();
      return reject(
        "render.pixi.decode-or-texture-create-threw",
        "Pixi decode and subtexture construction fail before the backend becomes ready.",
      );
    }

    const ready = await this.recording.prepare(
      sessionId,
      frozenProfile.value,
      cache,
      preflight,
    );
    if (ready.status !== "ok") {
      this.resetPreparedTextures();
      return ready;
    }
    this.profile = frozenProfile.value;
    return ok(undefined);
  }

  preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch> {
    if (this.surfaceLayout === null) {
      return integrityFailure(
        "render.pixi.surface-layout-unbound",
        ["ML-E01", "ML-E03"],
        "Pixi commands cannot mutate scene objects before the session-owned original surface layout is bound.",
      );
    }
    const typed = this.validateTypedPreflight(commands);
    if (typed.status !== "ok") return typed;
    const recordingBatch = this.recording.preflight(commands);
    if (recordingBatch.status !== "ok") {
      if (this.recording.snapshot().state === "faulted") {
        const cleanupFailures = this.resetSceneAfterTerminalMutation();
        this.recording.recordSecondaryCleanupFailures(cleanupFailures);
        this.recording.resetObjectsAfterTerminalRendererMutation();
        return this.recording.recordTerminalFault("", "");
      }
      return recordingBatch;
    }
    const supported = this.validatePixiBatch(commands);
    if (supported.status !== "ok") {
      this.recording.discard(recordingBatch.value);
      return supported;
    }
    const reservedNodes = new Map<number, Container>();
    const reservedGeometry = new Map<number, Mesh>();
    const reservedMasks = new Map<number, Graphics>();
    try {
      for (const command of commands) {
        if (command.kind === "create-object" || command.kind === "acquire-object") {
          const node = this.objectFactory.create(
            command.role,
            command.renderObjectId,
            this.profile!.scene.roundPixels,
          );
          if (
            node.destroyed ||
            node.parent !== null ||
            (spriteRole(command.role) && spriteChild(node) === null)
          ) {
            node.destroy({ children: true } as DestroyOptions);
            throw new Error("invalid reserved Pixi node");
          }
          node.label = command.renderObjectId;
          node.visible = false;
          reservedNodes.set(command.sequence, node);
        } else if (command.kind === "set-mesh") {
          reservedGeometry.set(command.sequence, createEvidenceMesh(
            command,
            this.profile!.scene.projection,
          ));
        } else if (command.kind === "set-line") {
          reservedGeometry.set(command.sequence, createEvidenceLine(
            command,
            this.profile!.scene.projection,
          ));
        } else if (command.kind === "set-mask") {
          reservedMasks.set(command.sequence, createEvidenceMask(command));
        } else if (command.kind === "set-threshold") {
          reservedMasks.set(command.sequence, createThresholdMask(
            command.threshold.value,
            this.profile!.scene.projection,
          ));
        }
      }
    } catch {
      for (const node of reservedNodes.values()) {
        node.destroy({ children: true } as DestroyOptions);
      }
      for (const mesh of reservedGeometry.values()) destroyMesh(mesh);
      for (const mask of reservedMasks.values()) mask.destroy();
      this.recording.discard(recordingBatch.value);
      return reject(
        "render.pixi.preflight-object-create-threw",
        "Pixi object and geometry allocation is reserved during preflight so allocation failure precedes domain mutation.",
      );
    }
    const capability = Object.freeze({ ...recordingBatch.value });
    this.pending.set(capability, Object.freeze({
      recordingBatch: recordingBatch.value,
      commands: Object.freeze(commands.map(copyPixiCommand)),
      reservedNodes,
      reservedGeometry,
      reservedMasks,
    }));
    return ok(capability);
  }

  commit(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pending.get(batch);
    if (pending === undefined) {
      this.recording.recordTerminalFault(
        "render.pixi.invalid-batch-capability",
        "Pixi accepts only its own one-use preflight capability.",
      );
      const cleanupFailures = this.resetSceneAfterTerminalMutation();
      this.recording.recordSecondaryCleanupFailures(cleanupFailures);
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return this.recording.recordTerminalFault("", "");
    }
    try {
      for (const command of pending.commands) {
        this.apply(command, pending.reservedNodes, pending.reservedGeometry, pending.reservedMasks);
      }
    } catch (error) {
      this.pending.delete(batch);
      this.recording.discard(pending.recordingBatch);
      this.recording.recordTerminalFault(
        "render.pixi.scene-mutation-threw",
        `A Pixi scene exception terminates the renderer and is never converted to a no-op. ${error instanceof Error ? error.message : String(error)}`,
      );
      const cleanupFailures = this.resetSceneAfterTerminalMutation(pending);
      this.recording.recordSecondaryCleanupFailures(cleanupFailures);
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return this.recording.recordTerminalFault("", "");
    }
    const committed = this.recording.commit(pending.recordingBatch);
    this.pending.delete(batch);
    return committed;
  }

  discard(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pending.get(batch);
    if (pending === undefined) {
      this.recording.recordTerminalFault(
        "render.pixi.invalid-discard-capability",
        "Pixi discards only its exact pending batch capability.",
      );
      const cleanupFailures = this.resetSceneAfterTerminalMutation();
      this.recording.recordSecondaryCleanupFailures(cleanupFailures);
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return this.recording.recordTerminalFault("", "");
    }
    this.pending.delete(batch);
    this.destroyUnownedReservations(
      pending.reservedNodes,
      pending.reservedGeometry,
      pending.reservedMasks,
    );
    return this.recording.discard(pending.recordingBatch);
  }

  execute(command: RenderCommand): SimulatorResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "ok" ? this.commit(batch.value) : batch;
  }

  snapshot(): RenderBackendSnapshot {
    return this.recording.snapshot();
  }

  notifyContextLoss(): SimulatorResult<void> {
    const state = this.recording.snapshot().state;
    if (state !== "ready" && state !== "faulted") {
      return reject(
        "render.pixi.context-loss-outside-ready-session",
        "Context-loss notification is valid only for an active or already faulted Pixi session.",
      );
    }
    this.recording.recordTerminalFault(
      "render.pixi.context-lost",
      "WebGL/WebGPU context loss is terminal for the current renderer session and never auto-reloads resources.",
    );
    const cleanupFailures = this.resetSceneAfterTerminalMutation();
    this.recording.recordSecondaryCleanupFailures(cleanupFailures);
    this.recording.resetObjectsAfterTerminalRendererMutation();
    return this.recording.recordTerminalFault("", "");
  }

  resourceSnapshot(): readonly {
    readonly logicalAssetId: string;
    readonly decoded: boolean;
    readonly atlasTextureCount: number;
    readonly spriteReferenceCount: number;
  }[] {
    return Object.freeze((this.profile?.assets ?? []).map((asset) => Object.freeze({
      logicalAssetId: asset.logicalAssetId,
      decoded: this.baseTextures.has(asset.logicalAssetId) || this.decodedFonts.has(asset.logicalAssetId),
      atlasTextureCount: asset.atlasRows.length,
      spriteReferenceCount: [...this.spriteReferenceCounts].reduce(
        (total, [key, count]) => key.startsWith(`${asset.logicalAssetId}\u0000`)
          ? total + count
          : total,
        0,
      ),
    })));
  }

  sceneSnapshot(): readonly {
    readonly renderObjectId: string;
    readonly role: string;
    readonly visible: boolean;
    readonly alpha: number;
    readonly position: readonly [number, number];
    readonly scale: readonly [number, number];
    readonly rotation: number;
    readonly parent: string | null;
    readonly ordering: readonly [number, number, number, number];
    readonly hudState: Readonly<object> | null;
    readonly geometryVertexCount: number | null;
    readonly geometryIndexCount: number | null;
    readonly geometryPositions: readonly number[] | null;
    readonly geometryTextureLabel: string | null;
    readonly geometryMaterialLogicalAssetId: string | null;
    readonly geometryBlendMode: string | null;
    readonly maskVertexCount: number | null;
    readonly threshold: number | null;
    readonly hudText: string | null;
    readonly hudFontFamily: string | null;
    readonly spriteBindingKey: string | null;
    readonly spriteAlpha: number | null;
    readonly spriteTint: number | null;
    readonly hudSpriteLabels: readonly string[] | null;
    readonly hudSpriteAlphas: readonly number[] | null;
    readonly hudSpriteCount: number | null;
    readonly hudSpriteNodes: readonly {
      readonly label: string;
      readonly position: readonly [number, number];
      readonly scale: readonly [number, number];
      readonly width: number;
      readonly height: number;
      readonly visible: boolean;
      readonly alpha: number;
      readonly blend: string;
      readonly zIndex: number;
      readonly maskLabel: string | null;
    }[] | null;
    readonly hudTextNodes: readonly {
      readonly label: string;
      readonly text: string;
      readonly position: readonly [number, number];
      readonly anchor: readonly [number, number];
      readonly fontSize: number;
      readonly visible: boolean;
      readonly alpha: number;
      readonly tint: number;
      readonly zIndex: number;
    }[] | null;
    readonly hudFillMasks: readonly {
      readonly label: string;
      readonly bounds: readonly [number, number, number, number];
    }[] | null;
    readonly hudScoreDigitCount: number | null;
    readonly hudScoreRankVisualCount: number | null;
    readonly hudScoreHighRankGeneration: number | null;
    readonly hudScoreLayerNodes: readonly { readonly label: string; readonly zIndex: number }[] | null;
    readonly hudScoreNineSliceBorders: readonly {
      readonly label: string;
      readonly left: number;
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
    }[] | null;
    readonly hudScoreIndicatorMask: {
      readonly owner: "score-high-rank-panel-mask";
      readonly consumer: "score-high-rank-animation-layer";
      readonly generation: number;
      readonly position: readonly [number, number];
      readonly bounds: readonly [number, number, number, number];
      readonly softness: readonly [20, 3];
    } | null;
    readonly hudFillRatios: readonly [number, number] | null;
    readonly hudScoreHighRankNodes: readonly {
      readonly name: string;
      readonly visible: boolean;
      readonly position: readonly [number, number];
      readonly scale: readonly [number, number];
      readonly rotation: number;
    }[] | null;
    readonly activeAnimationRole: EvidenceAnimationRole | null;
    readonly animationElapsedSeconds: number | null;
  }[] {
    return Object.freeze([...this.objects].map(([renderObjectId, value]) => Object.freeze({
      renderObjectId,
      role: value.role,
      visible: value.node.visible,
      alpha: value.node.alpha,
      position: Object.freeze([value.node.position.x, value.node.position.y] as const),
      scale: Object.freeze([value.node.scale.x, value.node.scale.y] as const),
      rotation: value.node.rotation,
      parent: value.node.parent === this.stage
        ? null
        : this.objectIdsByNode.get(value.node.parent as Container) ?? null,
      ordering: value.ordering,
      hudState: value.hudState,
      geometryVertexCount: value.geometryContent?.geometry.positions.length
        ? value.geometryContent.geometry.positions.length / 2
        : null,
      geometryIndexCount: value.geometryContent?.geometry.indices.length ?? null,
      geometryPositions: value.geometryContent === null
        ? null
        : Object.freeze(Array.from(value.geometryContent.geometry.positions)),
      geometryTextureLabel: value.geometryContent?.texture.label ?? null,
      geometryMaterialLogicalAssetId: value.geometryContent === null ? null : value.materialLogicalAssetId,
      geometryBlendMode: value.geometryContent === null ? null : String(value.geometryContent.blendMode),
      maskVertexCount: value.maskVertexCount,
      threshold: value.threshold,
      hudText: value.hudVisual?.text?.text ?? null,
      hudFontFamily: value.hudVisual?.text?.style.fontFamily == null
        ? null
        : String(value.hudVisual.text.style.fontFamily),
      spriteBindingKey: value.spriteBindingKey,
      spriteAlpha: value.spriteContent?.alpha ?? null,
      spriteTint: value.spriteContent?.tint ?? null,
      hudSpriteLabels: value.hudVisual === null
        ? null
        : Object.freeze(value.hudVisual.digitSprites.map((sprite) => sprite.label)),
      hudSpriteAlphas: value.hudVisual === null
        ? null
        : Object.freeze(value.hudVisual.digitSprites.map((sprite) => sprite.alpha)),
      hudSpriteCount: value.hudVisual?.digitSprites.length ?? null,
      hudSpriteNodes: value.hudVisual === null
        ? null
        : Object.freeze(value.hudVisual.digitSprites.map((sprite) => Object.freeze({
            label: sprite.label,
            position: Object.freeze([sprite.position.x, sprite.position.y] as const),
            scale: Object.freeze([sprite.scale.x, sprite.scale.y] as const),
            width: sprite.width,
            height: sprite.height,
            visible: sprite.visible,
            alpha: sprite.alpha,
            blend: String(sprite.blendMode),
            zIndex: sprite.zIndex,
            maskLabel: sprite.mask instanceof Container ? sprite.mask.label : null,
          }))),
      hudTextNodes: value.hudVisual === null
        ? null
        : Object.freeze([value.hudVisual.text, value.hudVisual.gameOverText]
            .filter((text): text is Text => text !== null)
            .map((text) => Object.freeze({
              label: text.label,
              text: text.text,
              position: Object.freeze([text.position.x, text.position.y] as const),
              anchor: Object.freeze([text.anchor.x, text.anchor.y] as const),
              fontSize: Number(text.style.fontSize),
              visible: text.visible,
              alpha: text.alpha,
              tint: text.tint,
              zIndex: text.zIndex,
            }))),
      hudFillMasks: value.hudVisual === null
        ? null
        : Object.freeze(value.hudVisual.fillMasks.map((mask) => {
            const bounds = mask.getLocalBounds();
            return Object.freeze({
              label: mask.label,
              bounds: Object.freeze([bounds.x, bounds.y, bounds.width, bounds.height] as const),
            });
          })),
      hudScoreDigitCount: value.hudVisual?.scoreDigitTexts.length ?? null,
      hudScoreRankVisualCount: value.hudVisual?.scoreRankSprites.length ?? null,
      hudScoreHighRankGeneration: value.hudVisual?.scoreHighRankGeneration ?? null,
      hudScoreLayerNodes: value.hudVisual?.kind !== "score"
        ? null
        : Object.freeze(scoreHudDescendants(value.hudVisual.content).map((node) => Object.freeze({
            label: node.label,
            zIndex: node.zIndex,
          }))),
      hudScoreNineSliceBorders: value.hudVisual?.kind !== "score"
        ? null
        : Object.freeze(scoreHudDescendants(value.hudVisual.content)
            .filter((node): node is NineSliceSprite => node instanceof NineSliceSprite)
            .map((node) => Object.freeze({
              label: node.label,
              left: node.leftWidth,
              top: node.topHeight,
              right: node.rightWidth,
              bottom: node.bottomHeight,
            }))),
      hudScoreIndicatorMask: value.hudVisual?.kind !== "score" ||
          value.hudVisual.scoreHighRankPanelMask === null ||
          value.hudVisual.scoreHighRankPanelMaskBounds === null
        ? null
        : Object.freeze({
            owner: "score-high-rank-panel-mask" as const,
            consumer: "score-high-rank-animation-layer" as const,
            generation: value.hudVisual.scoreHighRankPanelMaskGeneration,
            position: Object.freeze([
              value.hudVisual.scoreHighRankPanelMask.position.x,
              value.hudVisual.scoreHighRankPanelMask.position.y,
            ] as const),
            bounds: value.hudVisual.scoreHighRankPanelMaskBounds,
            softness: Object.freeze([20, 3] as const),
          }),
      hudFillRatios: value.hudVisual?.fillRatios ?? null,
      hudScoreHighRankNodes: value.hudVisual === null
        ? null
        : Object.freeze(value.hudVisual.scoreHighRankSprites.map((sprite, index) => Object.freeze({
            name: value.hudVisual!.scoreHighRankNodeNames[index]!,
            visible: sprite.visible,
            position: Object.freeze([sprite.position.x, sprite.position.y] as const),
            scale: Object.freeze([sprite.scale.x, sprite.scale.y] as const),
            rotation: sprite.rotation,
          }))),
      activeAnimationRole: value.activeAnimationRole,
      animationElapsedSeconds: value.animationElapsedSeconds,
    })));
  }

  dispose(): SimulatorResult<void> {
    const cleanupFailures: string[] = [];
    const release = (identity: string, action: () => void): void => {
      try {
        action();
      } catch {
        cleanupFailures.push(identity);
      }
    };
    const records = [...this.objects].reverse();
    this.objects.clear();
    this.objectIdsByNode.clear();
    for (const [renderObjectId, value] of records) {
      if (value.geometryContent !== null) {
        release(`${renderObjectId}:geometry`, () => destroyMesh(value.geometryContent!));
      }
      release(`${renderObjectId}:node`, () => {
        value.node.removeFromParent();
        value.node.destroy({ children: true } as DestroyOptions);
      });
    }
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const [batchIndex, value] of pending.entries()) {
      for (const [sequence, mesh] of value.reservedGeometry) {
        release(`pending:${batchIndex}:geometry:${sequence}`, () => destroyMesh(mesh));
      }
      for (const [sequence, mask] of value.reservedMasks) {
        release(`pending:${batchIndex}:mask:${sequence}`, () => mask.destroy());
      }
      for (const [sequence, node] of value.reservedNodes) {
        release(`pending:${batchIndex}:node:${sequence}`, () => node.destroy({ children: true } as DestroyOptions));
      }
    }
    for (const [bindingKey, texture] of this.spriteTextures) {
      release(`sprite-texture:${bindingKey}`, () => texture.destroy(false));
    }
    this.spriteTextures.clear();
    this.spriteReferenceCounts.clear();
    for (const [logicalAssetId, texture] of this.baseTextures) {
      release(`base-texture:${logicalAssetId}`, () => texture.destroy(true));
    }
    this.baseTextures.clear();
    for (const [logicalAssetId, font] of this.decodedFonts) {
      release(`font:${logicalAssetId}`, () => font.dispose());
    }
    this.decodedFonts.clear();
    this.controlOverlayRoot = null;
    this.profile = null;
    const failure = cleanupFailures.length === 0
      ? null
      : this.recording.recordTerminalFault(
          "render.pixi.dispose-owner-threw",
          `Pixi disposal continued across every owner; failed cleanup identities: ${cleanupFailures.join(",")}.`,
        );
    const disposed = this.recording.dispose();
    return failure ?? disposed;
  }

  private validateTypedPreflight(commands: readonly RenderCommand[]): SimulatorResult<void> {
    if (this.profile === null) return ok(undefined);
    const shadow = new Map<string, { role: RenderObjectRole; spriteExactKey: string | null }>(
      [...this.objects].map(([id, value]) => [id, {
        role: value.role,
        spriteExactKey: boundSpriteExactKey(value.spriteBindingKey),
      }]),
    );
    for (const command of commands) {
      if (command.kind === "create-object" || command.kind === "acquire-object") {
        shadow.set(command.renderObjectId, { role: command.role, spriteExactKey: null });
        continue;
      }
      if (command.kind === "release-object") {
        shadow.delete(command.renderObjectId);
        continue;
      }
      const object = shadow.get(command.renderObjectId);
      if (object === undefined) continue;
      if (command.kind === "bind-resource") {
        if (!validateTypedRenderResourceBinding(command, object.role, this.profile)) {
          return integrityFailure(
            "render.pixi.invalid-typed-resource-binding",
            ["RPR-D14", "RPR-D17", "PR35"],
            "Pixi rejects a mismatched logical asset, exact atlas key or object role before backend preflight or scene mutation.",
          );
        }
        if (command.binding === "sprite") object.spriteExactKey = command.exactKey;
      } else if (command.kind === "set-hud") {
        if (!validateTypedRenderHudCommand(command, object.role)) {
          return integrityFailure(
            "render.pixi.invalid-typed-hud-state",
            ["RPR-D14", "RPR-D17", "PR35"],
            "Pixi rejects a malformed discriminated HUD payload before backend preflight or scene mutation.",
          );
        }
      } else if (
        command.kind === "play-animation" || command.kind === "stop-animation" ||
        command.kind === "sample-animation"
      ) {
        if (!animationRoleMatchesObject(command.animationRole, object.role) ||
          !animationBindingMatchesProfile(
            command.animationRole,
            object.spriteExactKey,
            this.profile.ordinaryVisibleProfile,
          )) {
          return integrityFailure(
            "render.pixi.invalid-typed-animation-route",
            ["RPR-D14", "RPR-D17", "PR35"],
            "Pixi rejects a mismatched animation owner or Sprite binding before backend preflight or scene mutation.",
          );
        }
      }
    }
    return ok(undefined);
  }

  private supports(command: RenderCommand): boolean {
    switch (command.kind) {
      case "create-object":
      case "acquire-object":
      case "activate-object":
      case "hide-object":
      case "deactivate-object":
      case "release-object":
        return true;
      case "set-transform":
      case "set-mask":
      case "set-hud":
        return true;
      case "bind-resource":
        if (command.binding === "sprite") {
          return command.exactKey !== null &&
            this.spriteTextures.has(spriteKey(command.logicalAssetId, command.exactKey));
        }
        if (command.binding === "material" && command.exactKey === null) {
          const asset = this.profile?.assets.find(
            (candidate) => candidate.logicalAssetId === command.logicalAssetId,
          );
          return (asset?.materialRole === "sync-line" ||
            asset?.materialRole === "multiple-directional-line" ||
            asset?.materialRole === "long-note" || asset?.materialRole === "curve-note") &&
            this.baseTextures.has(command.logicalAssetId);
        }
        return false;
      case "set-mesh":
        return command.materialRole === "long-note" || command.materialRole === "curve-note";
      case "set-line":
        return command.materialRole === "sync-line" ||
          command.materialRole === "multiple-directional-line";
      case "play-animation":
      case "stop-animation":
      case "sample-animation":
        return isEvidenceAnimationRole(command.animationRole);
      case "set-threshold":
        return command.threshold.value >= 0 && Number.isFinite(command.threshold.value);
    }
  }

  private validatePixiBatch(
    commands: readonly RenderCommand[],
  ): SimulatorResult<void> {
    const shadow = new Map<string, PixiShadowObject>();
    for (const [id, value] of this.objects) {
      shadow.set(id, {
        role: value.role,
        parentObjectId: value.node.parent === this.stage
          ? null
          : this.objectIdsByNode.get(value.node.parent as Container) ?? null,
        materialBound: value.materialTexture !== null,
        spriteBindingKey: value.spriteBindingKey,
        maskConfigured: value.maskContent !== null,
        activeAnimationRoles: new Set(value.activeAnimationRoles),
      });
    }
    for (const command of commands) {
      if (!this.supports(command)) {
        return reject(
          "render.pixi.unsupported-semantic-command",
          "Pixi rejects unimplemented mesh, line, mask, HUD and animation mappings instead of applying defaults.",
        );
      }
      switch (command.kind) {
        case "create-object":
        case "acquire-object":
          shadow.set(command.renderObjectId, {
            role: command.role,
            parentObjectId: command.parentObjectId,
            materialBound: false,
            spriteBindingKey: null,
            maskConfigured: false,
            activeAnimationRoles: new Set(),
          });
          break;
        case "release-object":
          if ([...shadow.values()].some(
            (candidate) => candidate.parentObjectId === command.renderObjectId,
          )) {
            return reject(
              "render.pixi.release-object-with-live-children",
              "Pixi child identities must be released before their parent identity.",
            );
          }
          shadow.delete(command.renderObjectId);
          break;
        case "bind-resource": {
          const role = shadow.get(command.renderObjectId)!.role;
          if (!validateTypedRenderResourceBinding(command, role, this.profile!)) {
            return reject(
              "render.pixi.resource-binding-role-mismatch",
              "Sprite and Note/line material bindings require their exact engine-authored object roles.",
            );
          }
          shadow.set(command.renderObjectId, {
            ...shadow.get(command.renderObjectId)!,
            materialBound: command.binding === "material"
              ? true
              : shadow.get(command.renderObjectId)!.materialBound,
            spriteBindingKey: command.binding === "sprite"
              ? spriteKey(command.logicalAssetId, command.exactKey!)
              : shadow.get(command.renderObjectId)!.spriteBindingKey,
          });
          break;
        }
        case "activate-object":
        case "hide-object":
        case "deactivate-object":
          break;
        case "set-transform":
          if (
            command.maskObjectId !== null &&
            (shadow.get(command.maskObjectId)?.role !== "mask" ||
              !shadow.get(command.maskObjectId)?.maskConfigured)
          ) {
            return reject(
              "render.pixi.invalid-mask-reference",
              "A transform may reference only one configured visible-inside mask identity from the same session.",
            );
          }
          break;
        case "set-mask":
          if (shadow.get(command.renderObjectId)!.role !== "mask") {
            return reject(
              "render.pixi.mask-role-mismatch",
              "Only an explicit mask object may receive portable polygon geometry.",
            );
          }
          shadow.set(command.renderObjectId, {
            ...shadow.get(command.renderObjectId)!,
            maskConfigured: true,
          });
          break;
        case "set-mesh":
          if (
            shadow.get(command.renderObjectId)!.role !== "note-mesh" ||
            !shadow.get(command.renderObjectId)!.materialBound ||
            !isEvidenceMesh(command)
          ) {
            return reject(
              "render.pixi.mesh-outside-r7-profile",
              "Pixi accepts the current ordinary R7 base/advanced uniform-color NoteMesh profiles.",
            );
          }
          break;
        case "set-line":
          if (
            (shadow.get(command.renderObjectId)!.role === "sync-line"
              ? command.materialRole !== "sync-line"
              : shadow.get(command.renderObjectId)!.role === "multiple-directional-line"
              ? command.materialRole !== "multiple-directional-line"
              : true) ||
            !shadow.get(command.renderObjectId)!.materialBound ||
            !isEvidenceLine(command)
          ) {
            return reject(
              "render.pixi.line-outside-r2-r4-profile",
              "Pixi accepts only positive-width non-degenerate ordinary R2 sync or R4 MultipleDirectional line segments.",
            );
          }
          break;
        case "set-hud":
          if (!isEvidenceHud(
            command,
            shadow.get(command.renderObjectId)!.role,
            this.spriteTextures,
            this.decodedFonts,
          )) {
            return reject(
              "render.pixi.hud-outside-r3-profile",
              `Pixi accepts only the current ordinary R3 bitmap/text/fill HUD state shapes and exact combo digit keys. role=${shadow.get(command.renderObjectId)!.role} command=${JSON.stringify(command)}.`,
            );
          }
          break;
        case "play-animation": {
          const object = shadow.get(command.renderObjectId)!;
          if (
            !animationRoleMatchesObject(command.animationRole, object.role) ||
            !animationBindingMatchesProfile(
              command.animationRole,
              boundSpriteExactKey(object.spriteBindingKey),
              this.profile?.ordinaryVisibleProfile,
            )
          ) {
            return reject(
              "render.pixi.animation-role-mismatch",
              "Portable R7 animation roles require their exact engine-owned HUD/Note owner and frozen Sprite key where applicable.",
            );
          }
          shadow.set(command.renderObjectId, {
            ...object,
            activeAnimationRoles: new Set([
              ...object.activeAnimationRoles,
              requireEvidenceAnimationRole(command.animationRole),
            ]),
          });
          break;
        }
        case "sample-animation":
        case "stop-animation": {
          const object = shadow.get(command.renderObjectId)!;
          if (!object.activeAnimationRoles.has(requireEvidenceAnimationRole(command.animationRole))) {
            return reject(
              "render.pixi.animation-owner-not-playing",
              "Animation sample/stop commands require the same owner-local role to have been started first.",
            );
          }
          if (command.kind === "stop-animation") {
            shadow.set(command.renderObjectId, {
              ...object,
              activeAnimationRoles: new Set(
                [...object.activeAnimationRoles].filter((role) => role !== command.animationRole),
              ),
            });
          }
          break;
        }
        case "set-threshold":
          if (shadow.get(command.renderObjectId)!.role !== "note-mesh") {
            return reject(
              "render.pixi.threshold-role-mismatch",
              "The current bottom-left threshold semantic applies only to a NoteMesh owner.",
            );
          }
          break;
      }
    }
    return ok(undefined);
  }

  private apply(
    command: RenderCommand,
    reservedNodes: ReadonlyMap<number, Container>,
    reservedGeometry: ReadonlyMap<number, Mesh>,
    reservedMasks: ReadonlyMap<number, Graphics>,
  ): void {
    switch (command.kind) {
      case "create-object":
      case "acquire-object": {
        const node = reservedNodes.get(command.sequence)!;
        const parent = command.parentObjectId === null
          ? this.stage
          : this.objects.get(command.parentObjectId)!.node;
        parent.addChild(node);
        this.objects.set(command.renderObjectId, {
          role: command.role,
          parentObjectId: command.parentObjectId,
          node,
          ordering: Object.freeze([0, 0, 0, command.sequence]),
          hudState: null,
          spriteBindingKey: null,
          spritePixelsPerUnit: null,
          hudBindingKeys: [],
          scoreHighRankBindingKeys: [],
          spriteContent: spriteChild(node),
          materialTexture: null,
          materialLogicalAssetId: null,
          geometryContent: null,
          maskContent: null,
          thresholdMaskContent: null,
          threshold: null,
          maskVertexCount: null,
          hudVisual: null,
          resourceProfile: this.profile!,
          scoreGaugeSsAnimation: this.profile?.scoreGaugeSsAnimation,
          ordinaryVisibleProfile: this.profile?.ordinaryVisibleProfile,
          surfaceLayout: this.surfaceLayout!,
          activeAnimationRole: null,
          activeAnimationRoles: new Set(),
          animationElapsedByRole: new Map(),
          animationElapsedSeconds: null,
          lastTransform: null,
        });
        this.objectIdsByNode.set(node, command.renderObjectId);
        return;
      }
      case "activate-object":
        this.objects.get(command.renderObjectId)!.node.visible = true;
        return;
      case "hide-object":
      case "deactivate-object":
        this.objects.get(command.renderObjectId)!.node.visible = false;
        return;
      case "release-object": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.spriteBindingKey !== null) this.decrementSpriteReference(object.spriteBindingKey);
        for (const bindingKey of object.hudBindingKeys) this.decrementSpriteReference(bindingKey);
        for (const bindingKey of object.scoreHighRankBindingKeys) this.decrementSpriteReference(bindingKey);
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        object.node.removeFromParent();
        object.node.destroy({ children: true } as DestroyOptions);
        this.objectIdsByNode.delete(object.node);
        this.objects.delete(command.renderObjectId);
        return;
      }
      case "bind-resource": {
        const object = this.objects.get(command.renderObjectId)!;
        const asset = this.profile!.assets.find(
          (candidate) => candidate.logicalAssetId === command.logicalAssetId,
        )!;
        const bindingKey = command.binding === "sprite"
          ? spriteKey(command.logicalAssetId, command.exactKey!)
          : materialKey(command.logicalAssetId);
        if (command.binding === "sprite") {
          const node = object.spriteContent!;
          node.texture = this.spriteTextures.get(bindingKey)!;
          node.anchor.copyFrom(node.texture.defaultAnchor ?? { x: 0, y: 0 });
          node.blendMode = asset.textureSettings!.blendMode;
          object.spritePixelsPerUnit = asset.atlasRows.find(
            (row) => row.exactKey === command.exactKey,
          )!.pixelsPerUnit;
        } else {
          const texture = this.baseTextures.get(command.logicalAssetId)!;
          object.materialTexture = texture;
          object.materialLogicalAssetId = command.logicalAssetId;
          if (object.geometryContent !== null) {
            object.geometryContent.texture = texture;
            object.geometryContent.blendMode = asset.textureSettings!.blendMode;
          }
        }
        if (command.binding === "sprite" && object.spriteBindingKey !== bindingKey) {
          if (object.spriteBindingKey !== null) {
            this.decrementSpriteReference(object.spriteBindingKey);
          }
          this.spriteReferenceCounts.set(
            bindingKey,
            (this.spriteReferenceCounts.get(bindingKey) ?? 0) + 1,
          );
          object.spriteBindingKey = bindingKey;
        }
        if (command.binding === "sprite" && object.lastTransform !== null && spatialSpriteRole(object.role)) {
          applySpatialSpriteTransform(object, object.lastTransform, this.profile!);
        }
        return;
      }
      case "set-transform": {
        const object = this.objects.get(command.renderObjectId)!;
        const node = object.node;
        object.lastTransform = command;
        if (spatialSpriteRole(object.role)) {
          applySpatialSpriteTransform(object, command, this.profile!);
        } else {
          node.position.set(command.position.x.value, command.position.y.value);
          node.scale.set(command.scale.x.value, command.scale.y.value);
          node.rotation = command.rotationDegrees.value * Math.PI / 180;
        }
        node.alpha = command.color.alpha.value;
        node.tint = rgbTint(command.color.red.value, command.color.green.value, command.color.blue.value);
        node.mask = command.maskObjectId === null
          ? null
          : this.objects.get(command.maskObjectId)!.node;
        object.ordering = Object.freeze([
          command.ordering.domainLayer,
          command.ordering.sourceDepthOrSortingOrder,
          command.ordering.sourceZ.value,
          command.ordering.creationSequence,
        ]);
        node.zIndex = orderingZIndex(object.ordering);
        this.sortSiblings(node.parent as Container);
        return;
      }
      case "set-mask": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.maskContent !== null) object.maskContent.destroy();
        const mask = reservedMasks.get(command.sequence)!;
        object.node.addChild(mask);
        object.maskContent = mask;
        object.maskVertexCount = command.polygon.length;
        return;
      }
      case "set-hud": {
        const object = this.objects.get(command.renderObjectId)!;
        object.hudState = Object.freeze({ ...command.state });
        object.hudVisual = applyEvidenceHud(
          object,
          command,
          this.spriteTextures,
          this.spriteReferenceCounts,
          this.decodedFonts,
        );
        applyHudOrdering(object, command);
        for (const role of object.activeAnimationRoles) {
          applyEvidenceAnimation(object, role, object.animationElapsedByRole.get(role) ?? 0);
        }
        this.sortSiblings(object.node.parent as Container);
        return;
      }
      case "set-mesh": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        const mesh = reservedGeometry.get(command.sequence)!;
        applyGeometryMaterial(mesh, object, this.profile!);
        object.node.addChild(mesh);
        if (object.thresholdMaskContent !== null) mesh.mask = object.thresholdMaskContent;
        object.geometryContent = mesh;
        return;
      }
      case "set-line": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        const mesh = reservedGeometry.get(command.sequence)!;
        applyGeometryMaterial(mesh, object, this.profile!);
        object.node.addChild(mesh);
        object.geometryContent = mesh;
        return;
      }
      case "play-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        object.activeAnimationRoles.add(role);
        object.activeAnimationRole = role;
        object.animationElapsedByRole.set(role, 0);
        object.animationElapsedSeconds = 0;
        applyEvidenceAnimation(object, role, 0);
        return;
      }
      case "sample-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        object.animationElapsedByRole.set(role, command.elapsedSeconds.value);
        object.animationElapsedSeconds = command.elapsedSeconds.value;
        applyEvidenceAnimation(object, role, command.elapsedSeconds.value);
        return;
      }
      case "stop-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        stopEvidenceAnimation(object, role);
        object.activeAnimationRoles.delete(role);
        object.animationElapsedByRole.delete(role);
        object.activeAnimationRole = [...object.activeAnimationRoles][object.activeAnimationRoles.size - 1] ?? null;
        object.animationElapsedSeconds = null;
        return;
      }
      case "set-threshold": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.thresholdMaskContent !== null) object.thresholdMaskContent.destroy();
        const mask = reservedMasks.get(command.sequence)!;
        object.node.addChild(mask);
        if (object.geometryContent !== null) object.geometryContent.mask = mask;
        object.thresholdMaskContent = mask;
        object.threshold = command.threshold.value;
        return;
      }
    }
  }

  private sortSiblings(parent: Container): void {
    parent.children.sort((left, right) => {
      if (left === this.controlOverlayRoot) return right === this.controlOverlayRoot ? 0 : 1;
      if (right === this.controlOverlayRoot) return -1;
      const leftRecord = this.objects.get(this.objectIdsByNode.get(left as Container)!);
      const rightRecord = this.objects.get(this.objectIdsByNode.get(right as Container)!);
      if (leftRecord === undefined || rightRecord === undefined) {
        throw new Error("Pixi sibling ordering encountered an unowned scene object");
      }
      return compareOrdering(leftRecord.ordering, rightRecord.ordering);
    });
  }

  private destroyUnownedReservations(
    reservedNodes: ReadonlyMap<number, Container>,
    reservedGeometry: ReadonlyMap<number, Mesh>,
    reservedMasks: ReadonlyMap<number, Graphics>,
  ): void {
    const ownedNodes = new Set([...this.objects.values()].map((value) => value.node));
    const ownedGeometry = new Set(
      [...this.objects.values()].flatMap((value) =>
        value.geometryContent === null ? [] : [value.geometryContent]),
    );
    const ownedMasks = new Set(
      [...this.objects.values()].flatMap((value) =>
        [value.maskContent, value.thresholdMaskContent].filter(
          (mask): mask is Graphics => mask !== null,
        )),
    );
    for (const node of reservedNodes.values()) {
      if (!ownedNodes.has(node) && !node.destroyed) {
        node.destroy({ children: true } as DestroyOptions);
      }
    }
    for (const mesh of reservedGeometry.values()) {
      if (!ownedGeometry.has(mesh) && !mesh.destroyed) destroyMesh(mesh);
    }
    for (const mask of reservedMasks.values()) {
      if (!ownedMasks.has(mask) && !mask.destroyed) mask.destroy();
    }
  }

  private resetSceneAfterTerminalMutation(pending?: PendingPixiBatch): readonly string[] {
    const cleanupFailures: string[] = [];
    const pendingValues = pending === undefined
      ? [...this.pending.values()]
      : [pending, ...[...this.pending.values()].filter((value) => value !== pending)];
    this.pending.clear();
    const records = [...this.objects].reverse();
    this.objects.clear();
    this.objectIdsByNode.clear();
    this.spriteReferenceCounts.clear();
    try {
      this.stage.removeChildren();
    } catch {
      cleanupFailures.push("stage:remove-children");
    }
    for (const [renderObjectId, value] of records) {
      if (value.geometryContent !== null && !value.geometryContent.destroyed) {
        try {
          destroyMesh(value.geometryContent);
        } catch {
          cleanupFailures.push(`${renderObjectId}:geometry`);
        }
      }
      if (!value.node.destroyed) {
        try {
          value.node.removeFromParent();
          value.node.destroy({ children: true } as DestroyOptions);
        } catch {
          cleanupFailures.push(`${renderObjectId}:node`);
        }
      }
    }
    for (const [batchIndex, pendingValue] of pendingValues.entries()) {
      for (const [sequence, mesh] of pendingValue.reservedGeometry) {
        if (!mesh.destroyed) {
          try {
            destroyMesh(mesh);
          } catch {
            cleanupFailures.push(`pending:${batchIndex}:geometry:${sequence}`);
          }
        }
      }
      for (const [sequence, mask] of pendingValue.reservedMasks) {
        if (!mask.destroyed) {
          try {
            mask.destroy();
          } catch {
            cleanupFailures.push(`pending:${batchIndex}:mask:${sequence}`);
          }
        }
      }
      for (const [sequence, node] of pendingValue.reservedNodes) {
        if (!node.destroyed) {
          try {
            node.removeFromParent();
            node.destroy({ children: true } as DestroyOptions);
          } catch {
            cleanupFailures.push(`pending:${batchIndex}:node:${sequence}`);
          }
        }
      }
    }
    return Object.freeze(cleanupFailures);
  }

  private resetPreparedTextures(): void {
    for (const texture of this.spriteTextures.values()) texture.destroy(false);
    for (const texture of this.baseTextures.values()) texture.destroy(true);
    this.spriteTextures.clear();
    this.spriteReferenceCounts.clear();
    this.baseTextures.clear();
    for (const font of this.decodedFonts.values()) font.dispose();
    this.decodedFonts.clear();
  }

  private decrementSpriteReference(bindingKey: string): void {
    const next = (this.spriteReferenceCounts.get(bindingKey) ?? 0) - 1;
    if (next <= 0) this.spriteReferenceCounts.delete(bindingKey);
    else this.spriteReferenceCounts.set(bindingKey, next);
  }

}

function applyBounds(
  target: { readonly position: { set(x: number, y: number): void }; width: number; height: number },
  value: RehearsalControlBounds,
): void {
  target.position.set(value.x, value.y);
  target.width = value.width;
  target.height = value.height;
}

class PixiInGameControlOverlayOwner implements PixiInGameControlOverlay {
  readonly root = new Container({ label: "in-game-control-root", sortableChildren: true });
  private readonly rehearsalRoot = new Container({ label: "rehearsal-control-root", sortableChildren: true });
  private readonly modalRoot = new Container({ label: "pause-modal-root", sortableChildren: true });
  private readonly pauseButton: Sprite;
  private readonly returnButton: Sprite | null;
  private readonly advanceButton: Sprite | null;
  private readonly timeText: Text | null;
  private readonly pauseTextures: Readonly<{
    window: Texture;
    header: Texture;
    gray: Texture;
    pink: Texture;
    countdown: readonly [Texture, Texture, Texture];
  }>;
  private disposed = false;
  private moveTimeInProgress = false;
  private timelineSeconds = 0;
  private lastPauseState: PauseControlSceneSnapshot["state"] | null = null;
  private lastCountdownNumber: number | null = null;
  private readonly surfaceRevision: number;

  constructor(
    mode: SimulatorModeIdentity,
    private readonly durationSeconds: number,
    returnTexture: Texture,
    advanceTexture: Texture,
    timeBackgroundTexture: Texture,
    demoBackgroundTexture: Texture,
    pauseTexture: Texture,
    windowTexture: Texture,
    headerTexture: Texture,
    grayButtonTexture: Texture,
    pinkButtonTexture: Texture,
    countdownTextures: readonly [Texture, Texture, Texture],
    private readonly fontFamily: string,
    layout: RehearsalControlSceneLayout,
    private readonly releaseOwner: (root: Container) => void,
  ) {
    this.root.zIndex = 2_000_000_000;
    this.root.eventMode = "none";
    this.rehearsalRoot.zIndex = 10;
    this.rehearsalRoot.eventMode = "none";
    this.modalRoot.zIndex = 100;
    this.modalRoot.eventMode = "none";
    this.modalRoot.visible = false;
    this.pauseTextures = Object.freeze({ window: windowTexture, header: headerTexture, gray: grayButtonTexture, pink: pinkButtonTexture, countdown: countdownTextures });
    this.surfaceRevision = layout.surfaceRevision;
    this.pauseButton = new Sprite({ texture: pauseTexture, label: "original-pause-button" });
    this.pauseButton.visible = false;
    this.pauseButton.zIndex = 50;
    this.pauseButton.eventMode = "none";
    this.root.addChild(this.rehearsalRoot, this.pauseButton, this.modalRoot);

    if (mode.sessionMode === "rehearsal") {
      this.returnButton = new Sprite({ texture: returnTexture, label: "rehearsal-return-five" });
      applyBounds(this.returnButton, layout.returnFive.widgetBoundsTopLeft);
      this.returnButton.zIndex = 10;
      this.advanceButton = new Sprite({ texture: advanceTexture, label: "rehearsal-advance-five" });
      applyBounds(this.advanceButton, layout.advanceFive.widgetBoundsTopLeft);
      this.advanceButton.zIndex = 10;
      const timeRegion = layout.timeLabelBoundsTopLeft;
      const timeBackground = new NineSliceSprite({ texture: timeBackgroundTexture, ...CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.rehearsalTime, label: "rehearsal-time-label-background" });
      applyBounds(timeBackground, timeRegion);
      timeBackground.tint = 0xffffff;
      timeBackground.zIndex = 20;
      this.timeText = this.text("", timeRegion.height * 20 / 32, 0xff3b74, "rehearsal-time-label");
      this.timeText.anchor.set(0.5, 0.5);
      this.timeText.position.set(timeRegion.x + timeRegion.width / 2, timeRegion.y + timeRegion.height / 2);
      this.timeText.zIndex = 21;
      this.rehearsalRoot.addChild(this.returnButton, this.advanceButton, timeBackground, this.timeText);
      if (mode.isDemoPlayMode) {
        const demo = layout.demoBadgeBoundsTopLeft;
        const badge = new NineSliceSprite({ texture: demoBackgroundTexture, ...CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.autoLiveCaption, label: "rehearsal-demo-badge-background" });
        applyBounds(badge, demo);
        badge.tint = 0xff3b74;
        badge.zIndex = 20;
        const label = this.text("デモプレイ", demo.height * 24 / 38, 0xffffff, "rehearsal-demo-badge");
        label.anchor.set(0.5, 0.5);
        label.position.set(demo.x + demo.width / 2, demo.y + demo.height / 2);
        label.zIndex = 21;
        this.rehearsalRoot.addChild(badge, label);
      }
      const initialized = this.updateTimeline(0);
      if (initialized.status !== "ok") throw new Error(initialized.capability);
    } else {
      this.returnButton = null;
      this.advanceButton = null;
      this.timeText = null;
      this.rehearsalRoot.visible = false;
    }
    this.root.sortChildren();
  }

  updateTimeline(timelineSeconds: number): SimulatorResult<void> {
    if (this.disposed) return integrityFailure("render.in-game-control.after-dispose", ["LR-C03", "PAU-B01"], "Disposed InGame controls reject timeline publication.");
    if (this.timeText === null) return ok(undefined);
    const formatted = formatRehearsalTimeLabel(timelineSeconds, this.durationSeconds);
    if (formatted.status !== "ok") return formatted;
    this.timelineSeconds = timelineSeconds;
    this.timeText.text = formatted.value;
    this.applyAvailability();
    return ok(undefined);
  }

  setMoveTimeInProgress(active: boolean): SimulatorResult<void> {
    if (this.disposed || typeof active !== "boolean") return integrityFailure("render.in-game-control.invalid-move-state", ["LR-E11"], "Only the live control owner may publish an explicit MoveTime availability state.");
    this.moveTimeInProgress = active;
    this.applyAvailability();
    return ok(undefined);
  }

  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void> {
    if (this.disposed || snapshot.surfaceRevision !== this.surfaceRevision || snapshot.surfaceRevision !== snapshot.layout.surfaceRevision) {
      return integrityFailure("render.pause-control.invalid-state", ["PAU-B01", "PAU-B05"], "Pause visuals consume one live scene snapshot bound to the exact initial surface revision.");
    }
    applyBounds(this.pauseButton, snapshot.layout.pause.visibleBoundsTopLeft);
    this.pauseButton.visible = snapshot.playable && snapshot.state === "playing";
    this.rehearsalRoot.visible = snapshot.playable && snapshot.state === "playing" && snapshot.mode.sessionMode === "rehearsal";
    const countdownNumber = snapshot.state === "resume-countdown"
      ? Math.max(1, Math.min(3, Math.ceil(snapshot.resumeCountdownSecondsRemaining ?? 0)))
      : null;
    if (this.lastPauseState !== snapshot.state || this.lastCountdownNumber !== countdownNumber) {
      this.rebuildModal(snapshot, countdownNumber);
      this.lastPauseState = snapshot.state;
      this.lastCountdownNumber = countdownNumber;
    }
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.disposed) return ok(undefined);
    this.disposed = true;
    this.releaseOwner(this.root);
    this.root.removeFromParent();
    this.root.destroy({ children: true });
    return ok(undefined);
  }

  private rebuildModal(snapshot: PauseControlSceneSnapshot, countdownNumber: number | null): void {
    this.modalRoot.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.modalRoot.visible = snapshot.state !== "playing";
    if (snapshot.state === "playing") return;
    if (snapshot.state === "resume-countdown" && countdownNumber !== null) {
      const texture = this.pauseTextures.countdown[countdownNumber - 1];
      const sprite = new Sprite({ texture, label: `resume-countdown-${countdownNumber}` });
      const scale = snapshot.layout.controlScale;
      sprite.width = texture.width * scale;
      sprite.height = texture.height * scale;
      sprite.position.set((snapshot.layout.viewportWidth - sprite.width) / 2 + (countdownNumber === 1 ? -5 * scale : 0), (snapshot.layout.viewportHeight - sprite.height) / 2);
      this.modalRoot.addChild(sprite);
      return;
    }
    const cover = new Graphics().rect(0, 0, snapshot.layout.viewportWidth, snapshot.layout.viewportHeight).fill({ color: 0x000000, alpha: 0.5 });
    cover.label = "pause-dark-cover";
    this.modalRoot.addChild(cover);
    if (snapshot.state === "pause-menu") this.buildPauseMenu(snapshot);
    else this.buildConfirmation(snapshot, snapshot.state === "retry-confirm");
  }

  private buildPauseMenu(snapshot: PauseControlSceneSnapshot): void {
    const layout = snapshot.layout;
    this.addWindow(layout.pauseMenu.windowBoundsTopLeft, "pause-window");
    this.addHeader(layout.pauseMenu.windowBoundsTopLeft, Math.fround(842 * layout.controlScale), Math.fround(40 * layout.controlScale));
    this.addCenteredText(snapshot.words.pause.title, layout.viewportWidth / 2, layout.pauseMenu.windowBoundsTopLeft.y + 34 * layout.controlScale, 30 * layout.controlScale, 0x333333, "pause-title");
    this.addCenteredText(snapshot.words.pause.message, layout.viewportWidth / 2, layout.viewportHeight / 2 - 14 * layout.controlScale, 24 * layout.controlScale, 0x333333, "pause-message");
    this.addButton(layout.pauseMenu.abortBoundsTopLeft, this.pauseTextures.gray, snapshot.words.pause.buttons[0], 32 * layout.controlScale, "pause-abort");
    this.addButton(layout.pauseMenu.retryBoundsTopLeft, this.pauseTextures.gray, snapshot.words.pause.buttons[1], 32 * layout.controlScale, "pause-retry");
    this.addButton(layout.pauseMenu.resumeBoundsTopLeft, this.pauseTextures.pink, snapshot.words.pause.buttons[2], 34 * layout.controlScale, "pause-resume");
  }

  private buildConfirmation(snapshot: PauseControlSceneSnapshot, retry: boolean): void {
    const layout = snapshot.layout;
    this.addWindow(layout.confirmation.windowBoundsTopLeft, retry ? "retry-confirm-window" : "abort-confirm-window");
    this.addHeader(layout.confirmation.windowBoundsTopLeft, Math.fround(558 * layout.controlScale), Math.fround(40 * layout.controlScale));
    const words = retry ? snapshot.words.retry : snapshot.words.abort;
    this.addCenteredText(words.title, layout.viewportWidth / 2, layout.confirmation.windowBoundsTopLeft.y + 34 * layout.controlScale, 30 * layout.controlScale, 0x333333, retry ? "retry-confirm-title" : "abort-confirm-title");
    this.addCenteredText(words.message, layout.viewportWidth / 2, layout.viewportHeight / 2 - 38 * layout.controlScale, 24 * layout.controlScale, 0x333333, retry ? "retry-confirm-message" : "abort-confirm-message");
    if (!retry) this.addCenteredText(snapshot.words.abort.annotation, layout.viewportWidth / 2, layout.viewportHeight / 2 + 52 * layout.controlScale, 19 * layout.controlScale, 0x555555, "abort-confirm-annotation");
    this.addButton(layout.confirmation.cancelBoundsTopLeft, this.pauseTextures.gray, words.buttons[0], 32 * layout.controlScale, retry ? "retry-cancel" : "abort-cancel");
    this.addButton(layout.confirmation.confirmBoundsTopLeft, this.pauseTextures.pink, words.buttons[1], 32 * layout.controlScale, retry ? "retry-confirm" : "abort-confirm");
  }

  private addWindow(value: PauseControlBounds, label: string): void {
    const window = new NineSliceSprite({ texture: this.pauseTextures.window, leftWidth: 12, rightWidth: 12, topHeight: 12, bottomHeight: 12, label });
    applyBounds(window, value);
    this.modalRoot.addChild(window);
  }
  private addHeader(window: PauseControlBounds, width: number, height: number): void {
    const header = new NineSliceSprite({ texture: this.pauseTextures.header, leftWidth: 28, rightWidth: 4, topHeight: 0, bottomHeight: 0, label: "pause-dialog-header" });
    applyBounds(header, { x: Math.fround(window.x + (window.width - width) / 2), y: window.y, width, height });
    this.modalRoot.addChild(header);
  }
  private addButton(value: PauseControlBounds, texture: Texture, text: string, fontSize: number, label: string): void {
    const button = new NineSliceSprite({ texture, leftWidth: 14, rightWidth: 20, topHeight: 22, bottomHeight: 12, label });
    applyBounds(button, value);
    const caption = this.text(text, fontSize, texture === this.pauseTextures.pink ? 0xffffff : 0x555555, `${label}-label`);
    caption.anchor.set(0.5, 0.5);
    caption.position.set(value.x + value.width / 2, value.y + value.height / 2);
    this.modalRoot.addChild(button, caption);
  }
  private addCenteredText(text: string, x: number, y: number, size: number, fill: number, label: string): void {
    const value = this.text(text, size, fill, label);
    value.anchor.set(0.5, 0.5);
    value.position.set(x, y);
    this.modalRoot.addChild(value);
  }
  private text(value: string, size: number, fill: number, label: string): Text {
    return new Text({ text: value, style: { fill, fontFamily: this.fontFamily, fontSize: size, fontWeight: "normal", align: "center" }, label });
  }
  private applyAvailability(): void {
    if (this.returnButton !== null) this.returnButton.alpha = this.moveTimeInProgress || Math.floor(this.timelineSeconds) === 0 ? 0.45 : 1;
    if (this.advanceButton !== null) this.advanceButton.alpha = this.moveTimeInProgress ? 0.45 : 1;
  }
}

class CachingProvider implements SimulatorResourceProvider {
  private readonly bytes = new Map<string, Uint8Array>();

  constructor(private readonly source: SimulatorResourceProvider) {}

  async read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>> {
    const cached = this.bytes.get(logicalAssetId);
    if (cached !== undefined) return ok(Uint8Array.from(cached));
    const result = await this.source.read(logicalAssetId);
    if (result.status === "ok") this.bytes.set(logicalAssetId, Uint8Array.from(result.value));
    return result.status === "ok" ? ok(Uint8Array.from(result.value)) : result;
  }

  get(logicalAssetId: string): Uint8Array | undefined {
    const value = this.bytes.get(logicalAssetId);
    return value === undefined ? undefined : Uint8Array.from(value);
  }
}

type SetTransformCommand = Extract<RenderCommand, { readonly kind: "set-transform" }>;
type SetMeshCommand = Extract<RenderCommand, { readonly kind: "set-mesh" }>;
type SetLineCommand = Extract<RenderCommand, { readonly kind: "set-line" }>;
type SetMaskCommand = Extract<RenderCommand, { readonly kind: "set-mask" }>;
type SetHudCommand = Extract<RenderCommand, { readonly kind: "set-hud" }>;
function createEvidenceMask(command: SetMaskCommand): Graphics {
  const points = command.polygon.flatMap((point) => [point.x.value, point.y.value]);
  return new Graphics().poly(points, true).fill(0xffffff);
}

function createThresholdMask(
  threshold: number,
  projection: RenderOrthographicProjectionProfile,
): Graphics {
  const topPixel = Math.fround(projection.viewportHeight - threshold);
  return new Graphics().rect(
    0,
    topPixel,
    projection.viewportWidth,
    Math.fround(projection.viewportHeight - topPixel),
  ).fill(0xffffff);
}

function isEvidenceHud(
  command: SetHudCommand,
  objectRole: string,
  textures: ReadonlyMap<string, Texture>,
  decodedFonts: ReadonlyMap<string, PixiDecodedFont>,
): boolean {
  if (!validateTypedRenderHudCommand(command, objectRole)) return false;
  switch (command.hudRole) {
    case "score":
      return scoreHudTexturesAvailable(textures, command.state.meterKey) &&
        decodedFonts.has(CURRENT_SCORE_HUD_BINDINGS.rankLabelFontLogicalAssetId);
    case "combo": {
      const prefix = command.state.allPerfect ? "icon_number_big_AP_" : "icon_number_big_";
      return String(command.state.combo).split("").every((digit) =>
        textures.has(spriteKey(
          CURRENT_ORDINARY_VISIBLE_BINDINGS.comboNumberLogicalAssetId,
          `${prefix}${digit}`,
        )));
    }
    case "result":
      return hasUniqueExactTextureBinding(textures, command.state.judgeKey) &&
        (command.state.timingKey === null || hasUniqueExactTextureBinding(textures, command.state.timingKey));
    case "life":
      return ordinaryLifeTexturesAvailable(textures) &&
        decodedFonts.has(CURRENT_SCORE_HUD_BINDINGS.rankLabelFontLogicalAssetId);
    case "add-score":
      return [
        "icon_number_plus",
        ...String(command.state.value).split("").map((digit) => `icon_number_${digit}`),
      ].every((key) => textures.has(spriteKey(CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, key)));
    case "habahiro-flash":
    case "fidelity-label":
      return true;
  }
}

function applyEvidenceHud(
  object: PixiObjectRecord,
  command: SetHudCommand,
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
  decodedFonts: ReadonlyMap<string, PixiDecodedFont>,
): PixiHudVisual {
  const visual = object.hudVisual ?? createHudVisual(object.node, command.hudRole);
  if (visual.kind !== command.hudRole) throw new Error("HUD visual route cannot change owner kind");
  if (visual.text !== null) visual.text.visible = true;
  visual.primaryFill?.clear();
  visual.secondaryFill?.clear();
  visual.fillRatios = Object.freeze([0, 0]);
  switch (command.hudRole) {
    case "score": {
      applyScoreHud(object, visual, command.state, textures, referenceCounts, decodedFonts);
      break;
    }
    case "combo": {
      applyComboHud(object, visual, command.state, textures, referenceCounts);
      break;
    }
    case "result": {
      applyResultHud(object, visual, command.state, textures, referenceCounts);
      break;
    }
    case "life": {
      applyLifeHud(object, visual, command.state, textures, referenceCounts, decodedFonts);
      break;
    }
    case "add-score": {
      applyAddScoreHud(object, visual, command.state, textures, referenceCounts);
      break;
    }
    case "habahiro-flash": {
      object.node.position.set(0, 0);
      if (visual.text !== null) visual.text.visible = false;
      const projection = object.resourceProfile.scene.projection;
      visual.primaryFill!.rect(0, 0, projection.viewportWidth, projection.viewportHeight).fill(0xffffff);
      visual.primaryFill!.alpha = 0;
      break;
    }
    case "fidelity-label":
      if ("laneChangePhase" in command.state) {
        object.node.position.set(20, 52);
        setHudText(
          visual.text!,
          command.state.laneChangePhase === "flash-start"
            ? "HABAHIRO · Flash"
            : "HABAHIRO · Lane Changed",
          20,
          0xffd166,
        );
      } else {
        object.node.position.set(20, 20);
        setHudText(visual.text!, command.state.label, 24, 0xffd166);
      }
      break;
  }
  return visual;
}

function createHudVisual(node: Container, kind: PixiHudVisual["kind"]): PixiHudVisual {
  const content = new Container({ sortableChildren: true });
  const needsText = kind === "life" || kind === "fidelity-label";
  const needsFill = kind === "habahiro-flash";
  const secondaryFill = needsFill ? new Graphics() : null;
  const primaryFill = needsFill ? new Graphics() : null;
  const text = needsText ? new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 32 },
    label: kind === "life" ? "life-current-label" : "fidelity-label",
  }) : null;
  const gameOverText = kind === "life"
    ? new Text({ text: "", style: { fill: 0xff0000, fontSize: 22 }, label: "life-game-over-label" })
    : null;
  const animationLayer = new Container({ visible: false, label: "score-high-rank-animation-layer" });
  animationLayer.zIndex = 30;
  const scoreHighRankPanelMask = kind === "score"
    ? new Graphics({ label: "score-high-rank-panel-mask" })
    : null;
  if (secondaryFill !== null) content.addChild(secondaryFill);
  if (primaryFill !== null) content.addChild(primaryFill);
  if (text !== null) content.addChild(text);
  if (gameOverText !== null) content.addChild(gameOverText);
  content.addChild(animationLayer);
  if (scoreHighRankPanelMask !== null) {
    content.addChild(scoreHighRankPanelMask);
    animationLayer.mask = scoreHighRankPanelMask;
  }
  node.addChild(content);
  return {
    kind,
    content,
    text,
    gameOverText,
    primaryFill,
    secondaryFill,
    animationLayer,
    digitSprites: [],
    fillMasks: [],
    scoreDigitTexts: [],
    scoreGaugeSprites: [],
    scoreRankSprites: [],
    scoreHighRankSprites: [],
    scoreHighRankNodeNames: [],
    scoreHighRankPanelMask,
    scoreHighRankPanelMaskGeneration: scoreHighRankPanelMask === null ? 0 : 1,
    scoreHighRankPanelMaskBounds: null,
    scoreHighRankGeneration: 0,
    fillRatios: Object.freeze([0, 0]),
  };
}

function authoredUiScale(object: PixiObjectRecord): number {
  return object.surfaceLayout.ui.screenToSafeChildScale;
}

function placeAuthoredUiRoot(
  object: PixiObjectRecord,
  authoredX: number,
  authoredY: number,
  localScale = 1,
): void {
  const projection = object.resourceProfile.scene.projection;
  const uiScale = authoredUiScale(object);
  object.node.position.set(
    Math.fround(projection.viewportWidth / 2 + authoredX * uiScale),
    Math.fround(projection.viewportHeight / 2 - authoredY * uiScale),
  );
  object.node.scale.set(Math.fround(uiScale * localScale));
}

function placeSafeTopAnchoredUiRoot(
  object: PixiObjectRecord,
  side: "left" | "right",
): void {
  const layout = object.surfaceLayout;
  const safe = layout.starUi.safeArea;
  const safeX = side === "left" ? safe.x : Math.fround(safe.x + safe.width);
  const safeTop = Math.fround(
    layout.surface.viewportHeight - Math.fround(safe.y + safe.height),
  );
  object.node.position.set(safeX, safeTop);
  object.node.scale.set(authoredUiScale(object));
}

function applyComboHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  state: { readonly combo: number; readonly allPerfect: boolean },
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
): void {
  const profile = requireOrdinaryVisibleProfile(object);
  clearHudSprites(object, visual, referenceCounts);
  placeAuthoredUiRoot(object, profile.combo.rootPosition[0], profile.combo.rootPosition[1]);
  const displayed = String(state.combo);
  const digitPrefix = state.allPerfect ? "icon_number_big_AP_" : "icon_number_big_";
  const leastSignificantKeys = [...displayed].reverse().map((digit) => `${digitPrefix}${digit}`);
  const positions = spriteNumberPositions(
    object.resourceProfile,
    CURRENT_ORDINARY_VISIBLE_BINDINGS.comboNumberLogicalAssetId,
    leastSignificantKeys,
    CURRENT_ORDINARY_HUD_PROFILE.combo.padding,
    "center",
  );
  leastSignificantKeys.forEach((exactKey, index) => {
    const binding = requiredTextureBinding(
      textures,
      CURRENT_ORDINARY_VISIBLE_BINDINGS.comboNumberLogicalAssetId,
      exactKey,
    );
    const sprite = new Sprite({ texture: binding.texture, label: `combo-digit-${index}` });
    sprite.anchor.set(0.5);
    sprite.width = profile.combo.digitSize[0];
    sprite.height = profile.combo.digitSize[1];
    sprite.position.set(
      CURRENT_ORDINARY_HUD_PROFILE.combo.numberLocalPosition[0] + positions[index]!,
      -CURRENT_ORDINARY_HUD_PROFILE.combo.numberLocalPosition[1],
    );
    sprite.zIndex = CURRENT_ORDINARY_HUD_PROFILE.combo.digitDepth;
    visual.content.addChild(sprite);
    visual.digitSprites.push(sprite);
    retainHudBinding(object, binding.key, referenceCounts);
  });
  const unitKey = state.allPerfect ? profile.combo.unit.allPerfect : profile.combo.unit.normal;
  const unitBinding = requiredTextureBinding(
    textures,
    CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
    unitKey,
  );
  const unit = new Sprite({ texture: unitBinding.texture, label: "combo-unit" });
  unit.anchor.set(0.5);
  unit.width = profile.combo.unit.size[0];
  unit.height = profile.combo.unit.size[1];
  unit.position.set(profile.combo.unit.localPosition[0], -profile.combo.unit.localPosition[1]);
  unit.zIndex = CURRENT_ORDINARY_HUD_PROFILE.combo.unitDepth;
  visual.content.addChild(unit);
  visual.digitSprites.unshift(unit);
  retainHudBinding(object, unitBinding.key, referenceCounts);
}

function applyAddScoreHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  state: { readonly value: number; readonly depth: number },
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
): void {
  const profile = requireOrdinaryVisibleProfile(object);
  clearHudSprites(object, visual, referenceCounts);
  const current = CURRENT_ORDINARY_HUD_PROFILE.addScore;
  placeSafeTopAnchoredUiRoot(object, "left");
  const uiScale = authoredUiScale(object);
  object.node.position.set(
    Math.fround(object.node.position.x + current.numberBaseAuthoredPosition[0] * uiScale),
    Math.fround(object.node.position.y -
      (current.numberBaseAuthoredPosition[1] + current.initialLocalY) * uiScale),
  );
  object.node.scale.set(Math.fround(uiScale * current.numberScale));
  object.node.alpha = profile.addScore.start.alpha;
  const leastSignificantKeys = [
    ...String(state.value).split("").reverse().map((digit) => `${profile.addScore.digits.prefix}${digit}`),
    profile.addScore.digits.plus,
  ];
  const positions = spriteNumberPositions(
    object.resourceProfile,
    CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId,
    leastSignificantKeys,
    current.padding,
    "left",
  );
  leastSignificantKeys.forEach((exactKey, index) => {
    const binding = requiredTextureBinding(textures, CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, exactKey);
    const sprite = new Sprite({ texture: binding.texture, label: `add-score-${index}` });
    sprite.anchor.set(0.5);
    sprite.width = profile.addScore.digits.size[0];
    sprite.height = profile.addScore.digits.size[1];
    sprite.position.set(positions[index]!, 0);
    sprite.zIndex = state.depth;
    visual.content.addChild(sprite);
    visual.digitSprites.push(sprite);
    retainHudBinding(object, binding.key, referenceCounts);
  });
}

function applyResultHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  state: { readonly judgeKey: string; readonly timingKey: string | null },
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
): void {
  const profile = requireOrdinaryVisibleProfile(object);
  clearHudSprites(object, visual, referenceCounts);
  placeAuthoredUiRoot(
    object,
    profile.result.rootPosition[0],
    profile.result.rootPosition[1],
    CURRENT_ORDINARY_HUD_PROFILE.result.rootScale,
  );
  object.node.alpha = profile.result.alpha;
  const judgeBinding = requiredUniqueExactTextureBinding(textures, state.judgeKey);
  const judge = new Sprite({ texture: judgeBinding.texture, label: "result-judge" });
  judge.anchor.set(0.5);
  judge.width = profile.result.judgeSize[0];
  judge.height = profile.result.judgeSize[1];
  judge.zIndex = CURRENT_ORDINARY_HUD_PROFILE.result.judgeDepth;
  visual.content.addChild(judge);
  visual.digitSprites.push(judge);
  retainHudBinding(object, judgeBinding.key, referenceCounts);
  if (state.timingKey !== null) {
    const timingBinding = requiredUniqueExactTextureBinding(textures, state.timingKey);
    const timing = new Sprite({ texture: timingBinding.texture, label: "result-timing" });
    timing.anchor.set(0.5);
    timing.width = profile.result.timingSize[0];
    timing.height = profile.result.timingSize[1];
    timing.position.set(
      CURRENT_ORDINARY_HUD_PROFILE.result.timingLocalPosition[0],
      -CURRENT_ORDINARY_HUD_PROFILE.result.timingLocalPosition[1],
    );
    timing.scale.set(CURRENT_ORDINARY_HUD_PROFILE.result.timingLocalScale);
    timing.zIndex = CURRENT_ORDINARY_HUD_PROFILE.result.timingDepth;
    visual.content.addChild(timing);
    visual.digitSprites.push(timing);
    retainHudBinding(object, timingBinding.key, referenceCounts);
  }
}

function applyLifeHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  state: { readonly label: string; readonly primaryFill: { readonly value: number }; readonly secondaryFill: { readonly value: number }; readonly color: "normal" | "danger"; readonly warning: boolean; readonly singleGameOver: boolean },
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
  decodedFonts: ReadonlyMap<string, PixiDecodedFont>,
): void {
  const profile = requireOrdinaryVisibleProfile(object);
  const current = CURRENT_ORDINARY_HUD_PROFILE.life;
  clearHudSprites(object, visual, referenceCounts);
  placeSafeTopAnchoredUiRoot(object, "right");
  const localFromAuthoredWorld = (position: readonly number[]): readonly [number, number] => Object.freeze([
    Math.fround(position[0]! - current.rootPosition[0]),
    Math.fround(-(position[1]! - current.rootPosition[1])),
  ] as const);
  const add = (
    logicalAssetId: string,
    exactKey: string,
    sceneKey: keyof typeof profile.life.sprites,
    label: string,
    visible = true,
    tint = 0xffffff,
  ) => {
    const scene = profile.life.sprites[sceneKey];
    const binding = requiredTextureBinding(textures, logicalAssetId, exactKey);
    const border = current.borders[sceneKey];
    const sprite = new NineSliceSprite({
      texture: binding.texture,
      width: scene.size[0],
      height: scene.size[1],
      anchor: { x: 0.5, y: 0.5 },
      leftWidth: border[0],
      rightWidth: border[1],
      bottomHeight: border[2],
      topHeight: border[3],
      label,
    });
    sprite.position.set(...localFromAuthoredWorld(scene.position));
    sprite.zIndex = scene.depth;
    sprite.visible = visible;
    sprite.tint = tint;
    sprite.blendMode = logicalAssetId === CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId
      ? "normal"
      : "add";
    visual.content.addChild(sprite);
    visual.digitSprites.push(sprite as unknown as Sprite);
    retainHudBinding(object, binding.key, referenceCounts);
    return sprite;
  };
  const clipLeftToRight = (sprite: NineSliceSprite, ratio: number, label: string): void => {
    const mask = new Graphics({ label }).rect(
      sprite.position.x - sprite.width / 2,
      sprite.position.y - sprite.height / 2,
      Math.fround(sprite.width * ratio),
      sprite.height,
    ).fill(0xffffff);
    mask.zIndex = sprite.zIndex;
    visual.content.addChild(mask);
    visual.fillMasks.push(mask);
    sprite.mask = mask;
  };
  const colors = state.singleGameOver ? profile.life.colorsF32Bits.gameOverBase : profile.life.colorsF32Bits[state.color];
  const tint = rgbTint(f32FromBits(colors[0]), f32FromBits(colors[1]), f32FromBits(colors[2]));
  add(CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "bg_health", "gauge_base", "life-gauge-base", true, tint);
  const secondary = add(CURRENT_ORDINARY_VISIBLE_BINDINGS.lifeAdditiveLogicalAssetId, "hp_meter", "second", "life-secondary", state.secondaryFill.value > 0);
  clipLeftToRight(secondary, state.secondaryFill.value, "life-secondary-fill-mask");
  const primary = add(CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "hp_meter", "primary", "life-primary", state.primaryFill.value > 0, tint);
  clipLeftToRight(primary, state.primaryFill.value, "life-primary-fill-mask");
  add(CURRENT_ORDINARY_VISIBLE_BINDINGS.warningLogicalAssetId, "effect_health_caution_outline", "warning_outline", "life-warning-outline", state.warning);
  add(CURRENT_ORDINARY_VISIBLE_BINDINGS.warningLogicalAssetId, "effect_health_caution_inside", "warning_body", "life-warning-body", state.warning);
  add(CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "bg_no_health", "game_over_background", "life-game-over", state.singleGameOver);
  const font = decodedFonts.get(profile.life.label.fontLogicalAssetId);
  if (font === undefined || visual.text === null || visual.gameOverText === null) {
    throw new Error("Life sgm label font is missing");
  }
  setHudText(visual.text, state.label, current.lifeLabel.fontSize, 0xffffff, font.family);
  visual.text.anchor.set(1, 0.5);
  visual.text.position.set(...localFromAuthoredWorld(current.lifeLabel.authoredPosition));
  visual.text.zIndex = current.lifeLabel.depth;
  setHudText(
    visual.gameOverText,
    current.gameOverLabel.text,
    current.gameOverLabel.fontSize,
    current.gameOverLabel.tint,
    font.family,
  );
  visual.gameOverText.anchor.set(0, 0.5);
  visual.gameOverText.position.set(...localFromAuthoredWorld(current.gameOverLabel.authoredPosition));
  visual.gameOverText.zIndex = current.gameOverLabel.depth;
  visual.gameOverText.visible = state.singleGameOver;
  visual.fillRatios = Object.freeze([state.primaryFill.value, state.secondaryFill.value]);
}

function requireOrdinaryVisibleProfile(object: PixiObjectRecord): NonNullable<RenderResourceProfile["ordinaryVisibleProfile"]> {
  if (object.ordinaryVisibleProfile === undefined) throw new Error("ordinary visible HUD profile is missing");
  return object.ordinaryVisibleProfile;
}

function f32FromBits(bits: string): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, Number.parseInt(bits, 16), false);
  return view.getFloat32(0, false);
}

function applyScoreHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  state: RenderScoreHudState,
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
  decodedFonts: ReadonlyMap<string, PixiDecodedFont>,
): void {
  clearScoreHud(object, visual, referenceCounts);
  if (visual.text !== null) visual.text.visible = false;
  const scene = CURRENT_SCORE_HUD_SCENE_PROFILE;
  placeSafeTopAnchoredUiRoot(object, "left");

  const scoreDigits = String(state.score);
  const leadingZeroCount = Math.max(scene.scoreMinimumDigits - scoreDigits.length, 0);
  const displayed = `${"0".repeat(leadingZeroCount)}${scoreDigits}`;
  const glyphByKey = new Map(CURRENT_SCORE_HUD_BITMAP_GLYPHS.map((glyph) => [glyph.exactKey, glyph]));
  const fontScale = 1;
  const advances = [...displayed].map((digit) => glyphByKey.get(digit)!.xAdvance * fontScale);
  let cursor = scene.totalScoreLocalPosition[0] - advances.reduce((sum, value) => sum + value, 0);
  [...displayed].forEach((digit, index) => {
    const glyph = glyphByKey.get(digit)!;
    const binding = requiredTextureBinding(textures, CURRENT_SCORE_HUD_BINDINGS.fontLogicalAssetId, digit);
    const sprite = new Sprite({ texture: binding.texture, label: `score-digit-${index}` });
    sprite.anchor.set(0, 0);
    sprite.scale.set(fontScale);
    sprite.tint = index < leadingZeroCount ? scene.scoreLeadingColor : scene.scoreSignificantColor;
    sprite.zIndex = scene.totalScoreDepth;
    sprite.position.set(
      cursor + glyph.xOffset * fontScale,
      -scene.totalScoreLocalPosition[1] + glyph.yOffset * fontScale,
    );
    cursor += glyph.xAdvance * fontScale;
    visual.content.addChild(sprite);
    visual.scoreDigitTexts.push(sprite);
    retainHudBinding(object, binding.key, referenceCounts);
  });

  const progress = new Container({ label: "score-gauge-progress", sortableChildren: true });
  progress.position.set(scene.progressLocalPosition[0], -scene.progressLocalPosition[1]);
  visual.content.addChild(progress);
  visual.scoreGaugeSprites.push(progress);
  const gaugeAssetId = CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId;
  const background = scoreNineSlice(
    requiredTextureBinding(textures, gaugeAssetId, "gauge_base_score"),
    scene.gauge.background.width,
    scene.gauge.background.height,
    CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.gaugeBase,
    "score-gauge-background",
  );
  background.position.set(scene.gauge.background.position[0], -scene.gauge.background.position[1]);
  background.zIndex = scene.gauge.background.depth;
  progress.addChild(background);
  retainHudBinding(object, spriteKey(gaugeAssetId, "gauge_base_score"), referenceCounts);

  const cover = scoreNineSlice(
    requiredTextureBinding(textures, gaugeAssetId, "bg_gauge_score_multi"),
    scene.gauge.cover.width,
    scene.gauge.cover.height,
    CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.gaugeCover,
    "score-gauge-cover",
  );
  cover.position.set(scene.gauge.cover.position[0], -scene.gauge.cover.position[1]);
  cover.zIndex = scene.gauge.cover.depth;
  progress.addChild(cover);
  retainHudBinding(object, spriteKey(gaugeAssetId, "bg_gauge_score_multi"), referenceCounts);

  const meterKey = state.meterKey as string;
  const foregroundBinding = requiredTextureBinding(textures, gaugeAssetId, meterKey);
  const borders = meterKey === "score_meter_blue"
    ? CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.meterBlue
    : meterKey === "score_meter_s"
    ? CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.meterS
    : CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.meterOther;
  const foreground = scoreNineSlice(
    foregroundBinding,
    scene.gauge.foreground.width,
    scene.gauge.foreground.height,
    borders,
    "score-gauge-foreground",
  );
  foreground.position.set(scene.gauge.foreground.position[0], -scene.gauge.foreground.position[1]);
  foreground.visible = state.foregroundActive as boolean;
  foreground.zIndex = scene.gauge.foreground.depth;
  progress.addChild(foreground);
  const foregroundMask = new Graphics({ label: "score-gauge-foreground-fill-mask" }).rect(
    foreground.position.x,
    foreground.position.y - scene.gauge.foreground.height / 2,
    Math.fround(scene.gauge.foreground.width * state.sliderValue.value),
    scene.gauge.foreground.height,
  ).fill(0xffffff);
  foregroundMask.zIndex = foreground.zIndex;
  progress.addChild(foregroundMask);
  foreground.mask = foregroundMask;
  retainHudBinding(object, foregroundBinding.key, referenceCounts);

  const markerPositions = {
    C: state.rankMarkerCLocalX.value,
    B: state.rankMarkerBLocalX.value,
    A: state.rankMarkerALocalX.value,
    S: state.rankMarkerSLocalX.value,
    SS: state.rankMarkerSSLocalX.value,
  } as const;
  for (const row of scene.rankRoots) {
    const x = markerPositions[row.rank];
    const levelMarkBinding = requiredTextureBinding(
      textures,
      CURRENT_SCORE_HUD_BINDINGS.levelMarkLogicalAssetId,
      "level_mark",
    );
    const levelMark = new Sprite({ texture: levelMarkBinding.texture, label: `score-rank-marker-${row.rank}` });
    levelMark.anchor.set(0.5, 0.5);
    levelMark.width = 8;
    levelMark.height = 6;
    levelMark.position.set(x, 10);
    levelMark.zIndex = scene.gauge.markerDepth;
    progress.addChild(levelMark);
    visual.scoreRankSprites.push(levelMark);
    retainHudBinding(object, levelMarkBinding.key, referenceCounts);
    const rankFont = decodedFonts.get(CURRENT_SCORE_HUD_BINDINGS.rankLabelFontLogicalAssetId);
    if (rankFont === undefined) throw new Error("Score Rank label font is missing");
    const rankLabel = new Text({
      text: row.rank,
      style: { fill: 0xffffff, fontFamily: rankFont.family, fontSize: 12 },
      label: `score-rank-${row.rank}`,
    });
    rankLabel.anchor.set(0.5, 0.5);
    rankLabel.position.set(x, 2);
    rankLabel.zIndex = scene.gauge.markerDepth;
    progress.addChild(rankLabel);
    visual.scoreRankSprites.push(rankLabel);
  }

  const panel = scene.gauge.highRankPanel;
  if (visual.scoreHighRankPanelMask === null) {
    throw new Error("Score high-rank panel mask owner is missing");
  }
  visual.scoreHighRankPanelMask.position.copyFrom(progress.position);
  const panelRight = panel.targetLeftX + state.indicatorLocalX;
  const authoredLeft = panel.targetLeftX + panel.leftAbsolute;
  const panelWidth = Math.max(panel.minimumWidth, panelRight - authoredLeft);
  const panelCenter = (authoredLeft + panelRight) / 2;
  const panelLeft = panelCenter - panelWidth / 2;
  const panelTop = -panel.topY;
  const panelHeight = panel.topY - panel.bottomY;
  visual.scoreHighRankPanelMask.clear()
    .rect(panelLeft, panelTop, panelWidth, panelHeight)
    .fill(0xffffff);
  visual.scoreHighRankPanelMaskBounds = Object.freeze([
    panelLeft, panelTop, panelWidth, panelHeight,
  ] as const);

  if (state.highRankEffectActive === true && visual.scoreHighRankSprites.length === 0) {
    const animation = currentScoreGaugeSsAnimation(object);
    visual.animationLayer.position.copyFrom(progress.position);
    visual.animationLayer.visible = true;
    visual.scoreHighRankGeneration += 1;
    for (const node of animation.nodes) {
      const assetId = node.textureKey === "high-rank-kira"
        ? CURRENT_SCORE_HUD_BINDINGS.highRankKiraLogicalAssetId
        : node.textureKey === "high-rank-long-star"
        ? CURRENT_SCORE_HUD_BINDINGS.highRankLongStarLogicalAssetId
        : CURRENT_SCORE_HUD_BINDINGS.highRankOverlayLogicalAssetId;
      const binding = requiredTextureBinding(textures, assetId, node.textureKey);
      const sprite = new Sprite({ texture: binding.texture, label: `score-gauge-ss:${node.name}` });
      sprite.anchor.set(0.5, 0.5);
      sprite.position.set(node.initialPosition[0], -node.initialPosition[1]);
      sprite.scale.set(node.initialScale[0], node.initialScale[1]);
      sprite.rotation = quaternionZRadians(node.initialRotationQuaternion);
      sprite.visible = false;
      sprite.zIndex = 30;
      visual.animationLayer.addChild(sprite);
      visual.scoreHighRankSprites.push(sprite);
      visual.scoreHighRankNodeNames.push(node.name);
      retainScoreHighRankBinding(object, binding.key, referenceCounts);
    }
  }
  visual.fillRatios = Object.freeze([state.sliderValue.value, state.ratio.value]);
}

function clearScoreHud(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  referenceCounts: Map<string, number>,
): void {
  for (const bindingKey of object.hudBindingKeys) {
    const next = (referenceCounts.get(bindingKey) ?? 0) - 1;
    if (next <= 0) referenceCounts.delete(bindingKey);
    else referenceCounts.set(bindingKey, next);
  }
  object.hudBindingKeys.length = 0;
  for (const sprite of visual.scoreDigitTexts.splice(0)) sprite.destroy();
  for (const sprite of visual.scoreRankSprites.splice(0)) sprite.destroy();
  for (const node of visual.scoreGaugeSprites.splice(0)) node.destroy({ children: true });
}

function scoreNineSlice(
  binding: { readonly key: string; readonly texture: Texture },
  width: number,
  height: number,
  borders: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  label: string,
): NineSliceSprite {
  return new NineSliceSprite({
    texture: binding.texture,
    leftWidth: borders.left,
    topHeight: borders.top,
    rightWidth: borders.right,
    bottomHeight: borders.bottom,
    width,
    height,
    anchor: { x: 0, y: 0.5 },
    label,
  });
}

function scoreHudDescendants(root: Container): Container[] {
  const rows: Container[] = [];
  const visit = (node: Container): void => {
    for (const child of node.children) {
      rows.push(child);
      visit(child);
    }
  };
  visit(root);
  return rows;
}

function requiredTextureBinding(
  textures: ReadonlyMap<string, Texture>,
  logicalAssetId: string,
  exactKey: string,
): { readonly key: string; readonly texture: Texture } {
  const key = spriteKey(logicalAssetId, exactKey);
  const texture = textures.get(key);
  if (texture === undefined) throw new Error(`missing Score HUD texture ${logicalAssetId}:${exactKey}`);
  return Object.freeze({ key, texture });
}

function hasUniqueExactTextureBinding(
  textures: ReadonlyMap<string, Texture>,
  exactKey: string,
): boolean {
  let count = 0;
  for (const key of textures.keys()) {
    if (boundSpriteExactKey(key) === exactKey) count += 1;
  }
  return count === 1;
}

function requiredUniqueExactTextureBinding(
  textures: ReadonlyMap<string, Texture>,
  exactKey: string,
): { readonly key: string; readonly texture: Texture } {
  const matches = [...textures].filter(([key]) => boundSpriteExactKey(key) === exactKey);
  if (matches.length !== 1) {
    throw new Error(`Result HUD requires exactly one selected Judge texture for ${exactKey}; found ${matches.length}.`);
  }
  return Object.freeze({ key: matches[0]![0], texture: matches[0]![1] });
}

function retainHudBinding(
  object: PixiObjectRecord,
  bindingKey: string,
  referenceCounts: Map<string, number>,
): void {
  object.hudBindingKeys.push(bindingKey);
  referenceCounts.set(bindingKey, (referenceCounts.get(bindingKey) ?? 0) + 1);
}

function retainScoreHighRankBinding(
  object: PixiObjectRecord,
  bindingKey: string,
  referenceCounts: Map<string, number>,
): void {
  object.scoreHighRankBindingKeys.push(bindingKey);
  referenceCounts.set(bindingKey, (referenceCounts.get(bindingKey) ?? 0) + 1);
}

function clearHudSprites(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  referenceCounts: Map<string, number>,
): void {
  for (const bindingKey of object.hudBindingKeys) {
    const next = (referenceCounts.get(bindingKey) ?? 0) - 1;
    if (next <= 0) referenceCounts.delete(bindingKey);
    else referenceCounts.set(bindingKey, next);
  }
  object.hudBindingKeys.length = 0;
  for (const mask of visual.fillMasks.splice(0)) mask.destroy();
  for (const sprite of visual.digitSprites.splice(0)) sprite.destroy();
}

function setHudText(
  text: Text,
  value: string,
  fontSize: number,
  fill: number,
  fontFamily?: string,
): void {
  text.text = value;
  text.style = { fill, fontSize, fontFamily, fontWeight: fontFamily === undefined ? "bold" : "normal" };
  text.anchor.set(0.5);
}

function applyEvidenceAnimation(
  object: PixiObjectRecord,
  role: EvidenceAnimationRole,
  elapsedSeconds: number,
): void {
  if (role === "combo") {
    const profile = requireOrdinaryVisibleProfile(object);
    const clip = profile.combo.clips.find((candidate) => candidate.clipId === "combo-scale");
    if (clip === undefined) throw new Error("Combo scale clip is missing");
    const values = sampleOrdinaryVisibleClip(clip, elapsedSeconds);
    const uiScale = authoredUiScale(object);
    object.node.scale.set(
      Math.fround(values[0]! * uiScale),
      Math.fround(values[1]! * uiScale),
    );
    return;
  }
  if (role === "all-perfect") {
    const profile = requireOrdinaryVisibleProfile(object);
    const clip = profile.combo.clips.find((candidate) => candidate.clipId === "combo-all-perfect");
    if (clip === undefined || object.hudVisual?.kind !== "combo") {
      throw new Error("All Perfect Sprite clip/owner is missing");
    }
    const values = sampleOrdinaryVisibleClip(clip, elapsedSeconds);
    object.hudVisual.digitSprites.forEach((sprite, index) => {
      sprite.alpha = values[Math.min(index, 4)]!;
    });
    return;
  }
  if (role === "score-gauge-ss") {
    const visual = object.hudVisual;
    const animation = currentScoreGaugeSsAnimation(object);
    if (visual === null || visual.scoreHighRankSprites.length !== animation.nodes.length) {
      throw new Error("ScoreGaugeSS resource-backed visual is missing");
    }
    const values = sampleScoreGaugeSsAnimation(animation, elapsedSeconds);
    const positionNodes = ["kira_1", "kira_2", "kira_3", "kira_4", "kira_5", "kira_6", "kira_7", "kira_8"];
    const rotationNodes = ["kira_4", "kira_7", "kira_1"];
    const scaleNodes = ["kira_1", "kira_2", "kira_4", "kira_7"];
    for (let index = 0; index < animation.nodes.length; index += 1) {
      const node = animation.nodes[index]!;
      const sprite = visual.scoreHighRankSprites[index]!;
      const positionIndex = positionNodes.indexOf(node.name);
      const rotationIndex = rotationNodes.indexOf(node.name);
      const scaleIndex = scaleNodes.indexOf(node.name);
      const position = positionIndex < 0 ? node.initialPosition : values.slice(positionIndex * 3, positionIndex * 3 + 3);
      const scale = scaleIndex < 0 ? node.initialScale : values.slice(33 + scaleIndex * 3, 36 + scaleIndex * 3);
      sprite.position.set(position[0]!, -position[1]!);
      sprite.scale.set(scale[0]!, scale[1]!);
      sprite.rotation = rotationIndex < 0
        ? quaternionZRadians(node.initialRotationQuaternion)
        : Math.fround(values[24 + rotationIndex * 3 + 2]! * Math.PI / 180);
      sprite.visible = values[45 + index]! >= 0.5;
    }
    return;
  }
  if (role === "habahiro-lane-change") {
    const visual = object.hudVisual;
    if (visual?.primaryFill === null || visual?.primaryFill === undefined) throw new Error("HABAHIRO flash owner missing HUD visual");
    visual.primaryFill.alpha = Math.fround(Math.sin(
      Math.min(1, elapsedSeconds / 0.25) * Math.PI,
    ));
    return;
  }
  if (role === "add-score") {
    const current = CURRENT_ORDINARY_HUD_PROFILE.addScore;
    const phaseSeconds = current.phaseSeconds;
    const phase = Math.min(2, Math.floor(elapsedSeconds / phaseSeconds));
    const progress = Math.fround((elapsedSeconds - phase * phaseSeconds) / phaseSeconds);
    const localY = phase === 0
      ? Math.fround(current.initialLocalY + 8 * progress)
      : phase === 1
      ? Math.fround(current.initialLocalY + 8 + progress)
      : Math.fround(current.initialLocalY + 9 + progress);
    const layout = object.surfaceLayout;
    const safe = layout.starUi.safeArea;
    const safeTop = Math.fround(
      layout.surface.viewportHeight - Math.fround(safe.y + safe.height),
    );
    object.node.position.y = Math.fround(
      safeTop - (current.numberBaseAuthoredPosition[1] + localY) * authoredUiScale(object),
    );
    object.node.alpha = phase === 0
      ? Math.fround(0.2 + 0.8 * progress)
      : phase === 1 ? 1 : Math.fround(1 - progress);
    return;
  }
  if (role === "result") {
    const values = sampleOrdinaryHudStreamedClip(
      CURRENT_ORDINARY_HUD_PROFILE.result.gameJudge.frames,
      CURRENT_ORDINARY_HUD_PROFILE.result.gameJudge.curveCount,
      Math.min(elapsedSeconds, CURRENT_ORDINARY_HUD_PROFILE.result.gameJudge.durationSeconds),
    );
    const uiScale = authoredUiScale(object);
    object.node.scale.set(
      Math.fround(values[0]! * uiScale),
      Math.fround(values[1]! * uiScale),
    );
    object.node.alpha = values[3]!;
    return;
  }
  if (role === "life-warning") {
    const visual = object.hudVisual;
    if (visual?.kind !== "life") throw new Error("Life warning animation owner is missing");
    const alpha = samplePingPongAlpha(CURRENT_ORDINARY_HUD_PROFILE.life.warningTween, elapsedSeconds);
    for (const sprite of visual.digitSprites) {
      if (sprite.label === "life-warning-outline" || sprite.label === "life-warning-body") {
        sprite.alpha = alpha;
      }
    }
    return;
  }
  if (role === "life-game-over") {
    const text = object.hudVisual?.gameOverText;
    if (text === null || text === undefined) throw new Error("Life GameOver label animation owner is missing");
    text.alpha = samplePingPongAlpha(CURRENT_ORDINARY_HUD_PROFILE.life.gameOverLabelTween, elapsedSeconds);
    return;
  }
  if (role === "note-flick" || role === "note-directional-flick" || role === "note-long-flash") {
    applyOrdinaryNoteAnimation(object, role, elapsedSeconds);
    return;
  }
  throw new Error("unsupported HUD animation role");
}

function stopEvidenceAnimation(object: PixiObjectRecord, role: EvidenceAnimationRole): void {
  if (role === "combo") {
    object.node.scale.set(authoredUiScale(object));
    object.node.alpha = 1;
    return;
  }
  if (role === "result") {
    object.node.scale.set(Math.fround(
      authoredUiScale(object) * CURRENT_ORDINARY_HUD_PROFILE.result.rootScale,
    ));
    object.node.alpha = 1;
    return;
  }
  if (role === "all-perfect") {
    for (const sprite of object.hudVisual?.digitSprites ?? []) sprite.alpha = 1;
    return;
  }
  if (role === "score-gauge-ss") {
    for (const sprite of object.hudVisual?.scoreHighRankSprites ?? []) sprite.visible = false;
    return;
  }
  if (role === "habahiro-lane-change") {
    if (object.hudVisual?.primaryFill !== null && object.hudVisual?.primaryFill !== undefined) object.hudVisual.primaryFill.alpha = 0;
    return;
  }
  if (role === "add-score") {
    object.node.alpha = 1;
    return;
  }
  if (role === "life-warning") {
    for (const sprite of object.hudVisual?.digitSprites ?? []) {
      if (sprite.label === "life-warning-outline" || sprite.label === "life-warning-body") sprite.alpha = 1;
    }
    return;
  }
  if (role === "life-game-over") {
    if (object.hudVisual?.gameOverText !== null && object.hudVisual?.gameOverText !== undefined) {
      object.hudVisual.gameOverText.alpha = 1;
    }
    return;
  }
  if (role === "note-flick" || role === "note-directional-flick" || role === "note-long-flash") {
    applyOrdinaryNoteAnimation(object, role, 0);
    return;
  }
  if (object.hudVisual !== null) object.hudVisual.animationLayer.visible = false;
}

function applyOrdinaryNoteAnimation(
  object: PixiObjectRecord,
  role: "note-flick" | "note-directional-flick" | "note-long-flash",
  elapsedSeconds: number,
): void {
  const sprite = object.spriteContent;
  const profile = object.ordinaryVisibleProfile;
  if (sprite === null || profile === undefined || object.spriteBindingKey === null || object.spritePixelsPerUnit === null) {
    throw new Error("ordinary Note animation owner/profile/resource binding is missing");
  }
  const exactKey = object.spriteBindingKey.slice(object.spriteBindingKey.indexOf("\u0000") + 1);
  const clipId = role === "note-flick"
    ? exactKey === profile.noteAnimations.directionalSpriteKeys.up ||
        /^note_flick_top(?:_[23])?$/.test(exactKey)
      ? "note-flick-up"
      : null
    : role === "note-directional-flick"
    ? exactKey === profile.noteAnimations.directionalSpriteKeys.left || /^note_flick_l_[0-6]$/.test(exactKey)
      ? "note-flick-left"
      : exactKey === profile.noteAnimations.directionalSpriteKeys.right || /^note_flick_r_[0-6]$/.test(exactKey)
      ? "note-flick-right"
      : null
    : exactKey.startsWith(profile.noteAnimations.longFlashSpritePrefix)
    ? "note-long-flash"
    : null;
  if (clipId === null) throw new Error("ordinary Note animation resource key does not select a current clip");
  const clip = profile.noteAnimations.clips.find((candidate) => candidate.clipId === clipId);
  if (clip === undefined) throw new Error("ordinary Note animation clip is missing");
  const values = sampleOrdinaryVisibleClip(clip, elapsedSeconds);
  if (role === "note-long-flash") {
    sprite.tint = rgbTint(values[0]!, values[1]!, values[2]!);
    sprite.alpha = values[3]!;
  } else {
    object.node.position.set(
      Math.fround(values[0]! * object.spritePixelsPerUnit),
      Math.fround(-values[1]! * object.spritePixelsPerUnit),
    );
    object.node.rotation = Math.fround(-values[5]! * Math.PI / 180);
  }
}

function sampleOrdinaryVisibleClip(
  clip: OrdinaryVisibleClip,
  elapsedSeconds: number,
): readonly number[] {
  const phase = clip.loop
    ? Math.fround(elapsedSeconds % clip.durationSeconds)
    : Math.fround(Math.min(elapsedSeconds, clip.durationSeconds));
  return Object.freeze(clip.curves.map((curve) => {
    if (curve.storage === "constant") return curve.value;
    let key = curve.keys[0]!;
    for (const candidate of curve.keys) {
      if (candidate.time > phase) break;
      key = candidate;
    }
    const delta = Math.fround(phase - key.time);
    let value = Math.fround(Math.fround(key.coefficients[0] * delta) + key.coefficients[1]);
    value = Math.fround(Math.fround(value * delta) + key.coefficients[2]);
    return Math.fround(Math.fround(value * delta) + key.coefficients[3]);
  }));
}

function ordinaryLifeTexturesAvailable(textures: ReadonlyMap<string, Texture>): boolean {
  return [
    [CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "bg_health"],
    [CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "hp_meter"],
    [CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId, "bg_no_health"],
    [CURRENT_ORDINARY_VISIBLE_BINDINGS.lifeAdditiveLogicalAssetId, "hp_meter"],
    [CURRENT_ORDINARY_VISIBLE_BINDINGS.warningLogicalAssetId, "effect_health_caution_outline"],
    [CURRENT_ORDINARY_VISIBLE_BINDINGS.warningLogicalAssetId, "effect_health_caution_inside"],
  ].every(([logicalAssetId, exactKey]) => textures.has(spriteKey(logicalAssetId!, exactKey!)));
}

function scoreHudTexturesAvailable(
  textures: ReadonlyMap<string, Texture>,
  meterKey: string,
): boolean {
  const font = CURRENT_SCORE_HUD_BINDINGS.fontLogicalAssetId;
  const gauge = CURRENT_SCORE_HUD_BINDINGS.gaugeLogicalAssetId;
  return [..."0123456789"].every((key) => textures.has(spriteKey(font, key))) &&
    textures.has(spriteKey(CURRENT_SCORE_HUD_BINDINGS.levelMarkLogicalAssetId, "level_mark")) &&
    ["gauge_base_score", "bg_gauge_score_multi", meterKey]
      .every((key) => textures.has(spriteKey(gauge, key))) &&
    textures.has(spriteKey(CURRENT_SCORE_HUD_BINDINGS.highRankKiraLogicalAssetId, "high-rank-kira")) &&
    textures.has(spriteKey(CURRENT_SCORE_HUD_BINDINGS.highRankLongStarLogicalAssetId, "high-rank-long-star")) &&
    textures.has(spriteKey(CURRENT_SCORE_HUD_BINDINGS.highRankOverlayLogicalAssetId, "high-rank-overlay"));
}

function spriteNumberPositions(
  profile: RenderResourceProfile,
  logicalAssetId: string,
  leastSignificantKeys: readonly string[],
  padding: number,
  alignment: "left" | "center",
): readonly number[] {
  const asset = profile.assets.find((candidate) => candidate.logicalAssetId === logicalAssetId);
  if (asset === undefined) throw new Error("UISpriteNumber atlas profile is missing");
  let cursor = Math.fround(0);
  let allWidth = Math.fround(0);
  const positions = leastSignificantKeys.map((exactKey) => {
    const row = asset.atlasRows.find((candidate) => candidate.exactKey === exactKey);
    if (row === undefined || row.borderLeft === undefined || row.borderRight === undefined) {
      throw new Error("UISpriteNumber exact Sprite row/border is missing");
    }
    const advance = Math.fround(row.width - row.borderLeft - row.borderRight + padding);
    allWidth = Math.fround(allWidth + advance);
    cursor = Math.fround(cursor - advance);
    return cursor;
  });
  const offset = alignment === "left" ? allWidth : Math.fround(allWidth * 0.5);
  return Object.freeze(positions.map((position) => Math.fround(position + offset)));
}

function sampleOrdinaryHudStreamedClip(
  frames: readonly { readonly time: number; readonly keys: readonly { readonly index: number; readonly coefficients: readonly [number, number, number, number] }[] }[],
  curveCount: number,
  phase: number,
): readonly number[] {
  const latest = new Map<number, { readonly time: number; readonly coefficients: readonly [number, number, number, number] }>();
  for (const frame of frames) {
    if (frame.time > phase) break;
    for (const key of frame.keys) latest.set(key.index, { time: frame.time, coefficients: key.coefficients });
  }
  return Object.freeze(Array.from({ length: curveCount }, (_, index) => {
    const key = latest.get(index);
    if (key === undefined) throw new Error("HUD streamed clip curve has no current key");
    const delta = Math.fround(phase - key.time);
    let value = Math.fround(Math.fround(key.coefficients[0] * delta) + key.coefficients[1]);
    value = Math.fround(Math.fround(value * delta) + key.coefficients[2]);
    return Math.fround(Math.fround(value * delta) + key.coefficients[3]);
  }));
}

function samplePingPongAlpha(
  profile: { readonly durationSeconds: number; readonly fromAlpha: number; readonly toAlpha: number },
  elapsedSeconds: number,
): number {
  const period = Math.fround(profile.durationSeconds * 2);
  const phase = Math.fround(elapsedSeconds % period);
  const factor = phase <= profile.durationSeconds
    ? Math.fround(phase / profile.durationSeconds)
    : Math.fround((period - phase) / profile.durationSeconds);
  return Math.fround(profile.fromAlpha + Math.fround((profile.toAlpha - profile.fromAlpha) * factor));
}

function currentScoreGaugeSsAnimation(
  object: PixiObjectRecord,
): NonNullable<RenderResourceProfile["scoreGaugeSsAnimation"]> {
  const profile = object.scoreGaugeSsAnimation;
  if (profile === undefined) throw new Error("ScoreGaugeSS animation profile is not prepared");
  return profile;
}

function sampleScoreGaugeSsAnimation(
  profile: NonNullable<RenderResourceProfile["scoreGaugeSsAnimation"]>,
  elapsedSeconds: number,
): readonly number[] {
  const phase = Math.fround(elapsedSeconds % profile.durationSeconds);
  const times = new Float32Array(profile.curveCount);
  const coefficients: Array<readonly [number, number, number, number] | null> =
    Array.from({ length: profile.curveCount }, () => null);
  for (const frame of profile.frames) {
    if (frame.time > phase) break;
    for (const key of frame.keys) {
      times[key.index] = frame.time;
      coefficients[key.index] = key.coefficients;
    }
  }
  return Object.freeze(coefficients.map((curve, index) => {
    if (curve === null) throw new Error("ScoreGaugeSS curve has no initial value");
    const delta = Math.fround(phase - times[index]!);
    let value = Math.fround(Math.fround(curve[0] * delta) + curve[1]);
    value = Math.fround(Math.fround(value * delta) + curve[2]);
    return Math.fround(Math.fround(value * delta) + curve[3]);
  }));
}

function quaternionZRadians(quaternion: readonly [number, number, number, number]): number {
  return Math.fround(Math.atan2(
    2 * (quaternion[3] * quaternion[2] + quaternion[0] * quaternion[1]),
    1 - 2 * (quaternion[1] * quaternion[1] + quaternion[2] * quaternion[2]),
  ));
}

function boundSpriteExactKey(bindingKey: string | null): string | null {
  return bindingKey === null ? null : bindingKey.slice(bindingKey.indexOf("\u0000") + 1);
}

function isEvidenceAnimationRole(role: string): role is EvidenceAnimationRole {
  return role === "combo" || role === "all-perfect" || role === "add-score" ||
    role === "result" || role === "life-warning" || role === "life-game-over" ||
    role === "score-gauge-ss" || role === "habahiro-lane-change" || role === "note-flick" ||
    role === "note-directional-flick" || role === "note-long-flash";
}

function requireEvidenceAnimationRole(role: string): EvidenceAnimationRole {
  if (!isEvidenceAnimationRole(role)) throw new Error("unsupported animation role");
  return role;
}

function noteSpatialRole(role: RenderObjectRole): boolean {
  return role === "note-root" || role === "note-head" || role === "note-icon" ||
    role === "note-intermediate" || role === "note-side-visual";
}

function spatialSpriteRole(role: RenderObjectRole): boolean {
  return noteSpatialRole(role) || role === "field-line" || role === "judge-line" ||
    role === "tap-lane-effect";
}

function boundAtlasRow(
  profile: RenderResourceProfile,
  bindingKey: string | null,
): RenderAtlasRow | null {
  if (bindingKey === null) return null;
  const separator = bindingKey.indexOf("\u0000");
  if (separator <= 0 || separator === bindingKey.length - 1) return null;
  const logicalAssetId = bindingKey.slice(0, separator);
  const exactKey = bindingKey.slice(separator + 1);
  return profile.assets.find((asset) => asset.logicalAssetId === logicalAssetId)
    ?.atlasRows.find((row) => row.exactKey === exactKey) ?? null;
}

function applySpatialSpriteTransform(
  object: PixiObjectRecord,
  command: SetTransformCommand,
  profile: RenderResourceProfile,
): void {
  if (noteSpatialRole(object.role)) {
    applyNoteSpatialTransform(object, command, profile);
    return;
  }
  const row = boundAtlasRow(profile, object.spriteBindingKey);
  if (row === null || object.spriteContent === null) {
    throw new Error("spatial Sprite transform requires one bound atlas row");
  }
  const node = object.node;
  if (object.role === "field-line") {
    const uiScale = authoredUiScale(object);
    node.position.set(
      Math.fround(profile.scene.projection.viewportWidth / 2 + command.position.x.value * uiScale),
      Math.fround(profile.scene.projection.viewportHeight / 2 - command.position.y.value * uiScale),
    );
    node.scale.set(
      Math.fround(command.scale.x.value * uiScale),
      Math.fround(command.scale.y.value * uiScale),
    );
    object.spriteContent.anchor.set(0.5, 1);
  } else {
    const projected = projectWorldPoint(
      command.position.x.value,
      command.position.y.value,
      profile.scene.projection,
    );
    const parentScale = object.role === "tap-lane-effect"
      ? object.surfaceLayout.gameplay.noteSettingScale
      : Math.fround(1);
    const textureScale = Math.fround(
      profile.scene.projection.pixelsPerWorldUnit / row.pixelsPerUnit * parentScale,
    );
    node.position.set(projected[0], projected[1]);
    node.scale.set(
      Math.fround(command.scale.x.value * textureScale),
      Math.fround(command.scale.y.value * textureScale),
    );
  }
  node.rotation = Math.fround(-command.rotationDegrees.value * Math.PI / 180);
}

function applyNoteSpatialTransform(
  object: PixiObjectRecord,
  command: SetTransformCommand,
  profile: RenderResourceProfile,
): void {
  const row = boundAtlasRow(profile, object.spriteBindingKey);
  const node = object.node;
  if (object.parentObjectId === null) {
    const projected = projectWorldPoint(
      command.position.x.value,
      command.position.y.value,
      profile.scene.projection,
    );
    const textureScale = row === null
      ? 1
      : profile.scene.projection.pixelsPerWorldUnit / row.pixelsPerUnit;
    node.position.set(projected[0], projected[1]);
    node.scale.set(
      Math.fround(command.scale.x.value * textureScale),
      Math.fround(command.scale.y.value * textureScale),
    );
  } else {
    const localPixelsPerUnit = row?.pixelsPerUnit ?? 1;
    node.position.set(
      Math.fround(command.position.x.value * localPixelsPerUnit),
      Math.fround(-command.position.y.value * localPixelsPerUnit),
    );
    node.scale.set(command.scale.x.value, command.scale.y.value);
  }
  node.rotation = Math.fround(-command.rotationDegrees.value * Math.PI / 180);
}

function projectWorldPoint(
  x: number,
  y: number,
  projection: RenderOrthographicProjectionProfile,
): readonly [number, number] {
  return Object.freeze([
    Math.fround(
      projection.viewportWidth / 2 +
      Math.fround(Math.fround(x - projection.worldCenterX) * projection.pixelsPerWorldUnit),
    ),
    Math.fround(
      projection.viewportHeight / 2 -
      Math.fround(Math.fround(y - projection.worldCenterY) * projection.pixelsPerWorldUnit),
    ),
  ] as const);
}

function isEvidenceLine(command: SetLineCommand): boolean {
  return (command.materialRole === "sync-line" ||
    command.materialRole === "multiple-directional-line") &&
    command.width.value > 0 &&
    Math.hypot(
      command.end.x.value - command.start.x.value,
      command.end.y.value - command.start.y.value,
    ) > 0;
}

function createEvidenceLine(
  command: SetLineCommand,
  projection: RenderOrthographicProjectionProfile,
): Mesh {
  if (!isEvidenceLine(command)) throw new Error("line outside R2 profile");
  const [startX, startY] = projectWorldPoint(command.start.x.value, command.start.y.value, projection);
  const [endX, endY] = projectWorldPoint(command.end.x.value, command.end.y.value, projection);
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  const halfWidth = command.width.value * projection.pixelsPerWorldUnit / 2;
  const nx = -dy / length * halfWidth;
  const ny = dx / length * halfWidth;
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      startX + nx, startY + ny,
      endX + nx, endY + ny,
      endX - nx, endY - ny,
      startX - nx, startY - ny,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    topology: "triangle-list",
    shrinkBuffersToFit: true,
  });
  return new Mesh({ geometry, texture: Texture.EMPTY, roundPixels: false });
}

function isEvidenceMesh(command: SetMeshCommand): boolean {
  const base = command.vertices.length === 22 && command.indices.length === 60;
  const advanced = command.vertices.length === 42 && command.indices.length === 120;
  if (
    (!base && !advanced) ||
    command.uv.length !== command.vertices.length ||
    command.colors.length !== command.vertices.length ||
    command.vertices.some((vertex) => vertex.z.bits !== "00000000")
  ) {
    return false;
  }
  const first = command.colors[0]!;
  return command.colors.every((color) =>
    color.red.bits === first.red.bits &&
    color.green.bits === first.green.bits &&
    color.blue.bits === first.blue.bits &&
    color.alpha.bits === first.alpha.bits);
}

function createEvidenceMesh(
  command: SetMeshCommand,
  projection: RenderOrthographicProjectionProfile,
): Mesh {
  if (!isEvidenceMesh(command)) throw new Error("mesh outside R7 profile");
  const positions = new Float32Array(command.vertices.length * 2);
  const uvs = new Float32Array(command.uv.length * 2);
  for (let index = 0; index < command.vertices.length; index += 1) {
    const projected = projectWorldPoint(
      command.vertices[index]!.x.value,
      command.vertices[index]!.y.value,
      projection,
    );
    positions[index * 2] = projected[0];
    positions[index * 2 + 1] = projected[1];
    uvs[index * 2] = command.uv[index]!.x.value;
    uvs[index * 2 + 1] = command.uv[index]!.y.value;
  }
  const geometry = new MeshGeometry({
    positions,
    uvs,
    indices: Uint32Array.from(command.indices),
    topology: "triangle-list",
    shrinkBuffersToFit: true,
  });
  const mesh = new Mesh({ geometry, texture: Texture.WHITE, roundPixels: false });
  const color = command.colors[0]!;
  mesh.tint = rgbTint(color.red.value, color.green.value, color.blue.value);
  mesh.alpha = color.alpha.value;
  return mesh;
}

function destroyMesh(mesh: Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.destroy();
  mesh.destroy({ texture: false, textureSource: false } as DestroyOptions);
}

const defaultObjectFactory: PixiSceneObjectFactory = Object.freeze({
  create(role: string, renderObjectId: string, roundPixels: boolean): Container {
    const root = new Container({ label: renderObjectId, sortableChildren: true });
    if (spriteRole(role)) {
      root.addChild(new Sprite({
        texture: Texture.EMPTY,
        roundPixels,
        label: `${renderObjectId}:sprite`,
      }));
    }
    return root;
  },
});

function applyGeometryMaterial(
  mesh: Mesh,
  object: PixiObjectRecord,
  profile: RenderResourceProfile,
): void {
  const texture = object.materialTexture;
  if (texture === null) throw new Error("geometry material texture is missing after validated preflight");
  const asset = object.materialLogicalAssetId === null
    ? undefined
    : profile.assets.find((candidate) => candidate.logicalAssetId === object.materialLogicalAssetId);
  if (asset === undefined || asset.textureSettings === null) {
    throw new Error("geometry material profile is missing after validated preflight");
  }
  mesh.texture = texture;
  mesh.blendMode = asset.textureSettings.blendMode;
}

function applyTextureSettings(texture: Texture, asset: RenderResourceAssetProfile): void {
  const settings = asset.textureSettings!;
  texture.source.scaleMode = settings.scaleMode;
  texture.source.style.addressModeU = settings.wrapModeU === "repeat"
    ? "repeat"
    : "clamp-to-edge";
  texture.source.style.addressModeV = settings.wrapModeV === "repeat"
    ? "repeat"
    : "clamp-to-edge";
  texture.source.style.update();
  texture.source.autoGenerateMipmaps = settings.mipmap === "on";
  texture.source.alphaMode = settings.premultiplyAlpha
    ? "premultiply-alpha-on-upload"
    : "no-premultiply-alpha";
}

function spriteChild(node: Container): Sprite | null {
  const child = node.children[0];
  return child instanceof Sprite ? child : null;
}

function spriteRole(role: string): boolean {
  return role === "note-root" || role === "note-head" || role === "note-icon" ||
    role === "note-intermediate" || role === "note-side-visual" ||
    role === "field-line" || role === "judge-line" || role === "tap-lane-effect";
}

function spriteKey(logicalAssetId: string, exactKey: string): string {
  return `${logicalAssetId}\u0000${exactKey}`;
}

function materialKey(logicalAssetId: string): string {
  return `${logicalAssetId}\u0000`;
}

function rgbTint(red: number, green: number, blue: number): number {
  const byte = (value: number) => Math.round(value * 255);
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

function applyHudOrdering(object: PixiObjectRecord, command: SetHudCommand): void {
  const profile = CURRENT_ORDINARY_HUD_PROFILE;
  let sourceZ: number | null = null;
  if (command.hudRole === "add-score") sourceZ = command.state.depth;
  else if (command.hudRole === "combo") sourceZ = profile.combo.digitDepth;
  else if (command.hudRole === "result") sourceZ = profile.result.judgeDepth;
  else if (command.hudRole === "score" || command.hudRole === "life") {
    sourceZ = profile.sorting.frontPanelDepth * 1000;
  }
  if (sourceZ === null) return;
  object.ordering = Object.freeze([
    profile.sorting.domainLayer,
    profile.sorting.sortingOrder,
    sourceZ,
    object.ordering[3],
  ]);
  object.node.zIndex = orderingZIndex(object.ordering);
}

function orderingZIndex(ordering: readonly [number, number, number, number]): number {
  return ordering[0] * 1_000_000 + ordering[1] * 1_000 + ordering[2];
}

function compareOrdering(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function copyPixiCommand(command: RenderCommand): RenderCommand {
  if (command.kind === "set-mesh") {
    return Object.freeze({
      ...command,
      vertices: Object.freeze(command.vertices.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
        z: Object.freeze({ ...value.z }),
      }))),
      indices: Object.freeze([...command.indices]),
      uv: Object.freeze(command.uv.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
      }))),
      colors: Object.freeze(command.colors.map((value) => Object.freeze({
        red: Object.freeze({ ...value.red }),
        green: Object.freeze({ ...value.green }),
        blue: Object.freeze({ ...value.blue }),
        alpha: Object.freeze({ ...value.alpha }),
      }))),
    });
  }
  if (command.kind === "set-line") {
    return Object.freeze({
      ...command,
      start: Object.freeze({
        x: Object.freeze({ ...command.start.x }),
        y: Object.freeze({ ...command.start.y }),
        z: Object.freeze({ ...command.start.z }),
      }),
      end: Object.freeze({
        x: Object.freeze({ ...command.end.x }),
        y: Object.freeze({ ...command.end.y }),
        z: Object.freeze({ ...command.end.z }),
      }),
      width: Object.freeze({ ...command.width }),
    });
  }
  if (command.kind === "set-mask") {
    return Object.freeze({
      ...command,
      polygon: Object.freeze(command.polygon.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
      }))),
    });
  }
  if (command.kind === "set-hud") {
    return Object.freeze({ ...command, state: Object.freeze({ ...command.state }) }) as RenderCommand;
  }
  if (command.kind === "sample-animation") {
    return Object.freeze({
      ...command,
      elapsedSeconds: Object.freeze({ ...command.elapsedSeconds }),
    });
  }
  if (command.kind === "set-transform") {
    return Object.freeze({
      ...command,
      position: Object.freeze({
        x: Object.freeze({ ...command.position.x }),
        y: Object.freeze({ ...command.position.y }),
        z: Object.freeze({ ...command.position.z }),
      }),
      scale: Object.freeze({
        x: Object.freeze({ ...command.scale.x }),
        y: Object.freeze({ ...command.scale.y }),
      }),
      rotationDegrees: Object.freeze({ ...command.rotationDegrees }),
      color: Object.freeze({
        red: Object.freeze({ ...command.color.red }),
        green: Object.freeze({ ...command.color.green }),
        blue: Object.freeze({ ...command.color.blue }),
        alpha: Object.freeze({ ...command.color.alpha }),
      }),
      ordering: Object.freeze({
        ...command.ordering,
        sourceZ: Object.freeze({ ...command.ordering.sourceZ }),
      }),
    });
  }
  return Object.freeze({ ...command });
}

function reject(capability: string, boundary: string) {
  return integrityFailure(
    capability,
    ["RPR-D14", "RPR-D15", "RPR-D17", "PR35", "PR36", "PR37"],
    boundary,
  );
}
