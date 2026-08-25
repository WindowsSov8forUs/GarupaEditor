import type {
  AudioResourcePreflightAdapter,
  SimulatorAudioBackend,
} from "../backends/audioContracts";
import type {
  ParticleResourcePreflightAdapter,
  SimulatorParticleBackend,
  SimulatorParticleRendererBackend,
} from "../backends/particleContracts";
import type {
  RenderResourcePreflightAdapter,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "../backends/renderingContracts";
import { prepareHabahiroBestdoriPack } from "./legacyHabahiroBestdoriProvider";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { CURRENT_SCORE_HUD_BINDINGS } from "./legacyCurrentScoreHudResourceManifest";
import { CURRENT_ORDINARY_VISIBLE_BINDINGS } from "./legacyCurrentOrdinaryVisibleResourceManifest";
import type { RenderEngineResourceBindings } from "../engine/rendering/renderCommandProducer";
import {
  appendSimulatorCleanupFailures,
  simulatorCleanupFailure,
  simulatorCleanupFailureFromResult,
} from "../public/failures";
import type { SimulatorModuleCleanupFailure } from "../public/contracts";
import type { PreparedSessionBgmResource } from "../assembly/sessionBgmDerivation";
import type { SimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import type { SharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import type { SimulatorStaticResourceSelection } from "./legacyStaticResourceSelector";
import {
  prepareSelectedSkinPortablePacks,
  type PreparedSkinPortablePack,
} from "./legacySkinPortablePack";
import { prepareSkinRenderOverlay } from "../assembly/skinRenderPreparation";
import { prepareSkinAudioOverlay } from "./legacySkinAudioPreparation";
import { prepareSkinParticleProvider } from "../assembly/skinParticlePreparation";
import {
  createSharedHabahiroTransport,
  prepareSharedAudioResources,
  prepareSharedOrdinaryRenderResources,
  prepareSharedOrdinaryVisibleRenderResources,
  prepareSharedParticleProvider,
  prepareSharedScoreGaugeSsAnimationResource,
  prepareSharedScoreHudRenderResources,
  prepareSharedStartupDirectionRenderResources,
  rejected,
  type SimulatorAssemblyResult,
} from "./legacySharedResourceAdapters";

export interface SimulatorResourceAssemblyTargets {
  readonly sessionId: string;
  readonly rendering: {
    readonly backend: SimulatorRendererBackend;
    readonly preflight: RenderResourcePreflightAdapter;
  };
  readonly audio: {
    readonly backend: SimulatorAudioBackend;
    readonly preflight: AudioResourcePreflightAdapter;
  };
  readonly particles: {
    readonly backend: SimulatorParticleBackend;
    readonly renderer: SimulatorParticleRendererBackend;
    readonly preflight: ParticleResourcePreflightAdapter;
  };
  createSceneLayout(
    renderingKind: "ordinary" | "habahiro",
    resources: RenderEngineResourceBindings,
    fieldBindings: {
      readonly backgroundLineLogicalAssetId: string;
      readonly judgeLineLogicalAssetId: string;
    } | null,
  ): SimulatorAssemblyResult<SimulatorSceneLayout>;
}

export interface PreparedSimulatorResourceAssembly {
  readonly sessionId: string;
  readonly skinRecipeIdentity: string;
  readonly skinPortablePacks: readonly PreparedSkinPortablePack[];
  readonly fieldBindings: {
    readonly backgroundLineLogicalAssetId: string;
    readonly judgeLineLogicalAssetId: string;
  } | null;
  readonly backgroundLogicalAssetId: string | null;
  readonly backgroundImage: {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly renderBindings: RenderEngineResourceBindings;
  readonly audioBackend: SimulatorAudioBackend;
  readonly rendererBackend: SimulatorRendererBackend;
  readonly particleBackend: SimulatorParticleBackend;
  readonly particleRendererBackend: SimulatorParticleRendererBackend;
  readonly sceneLayout: SimulatorSceneLayout;
}

export async function assembleSimulatorResources(
  chartAudio: PreparedSessionBgmResource,
  selection: SimulatorStaticResourceSelection,
  store: SharedStaticResourceStore,
  targets: SimulatorResourceAssemblyTargets,
): Promise<SimulatorAssemblyResult<PreparedSimulatorResourceAssembly>> {
  if (
    typeof targets.sessionId !== "string" || targets.sessionId.length === 0
  ) {
    return rejected(
      "launch-failed",
      "simulator.assembly.invalid-session",
      "Autonomous resource assembly requires one internally generated non-empty session identity.",
    );
  }
  const skinSelection = validateSkinResourceSelection(selection);
  if (skinSelection.status === "rejected") return skinSelection;
  const skinPortablePacks = await prepareSelectedSkinPortablePacks(
    selection.skin.resources,
    store,
  );
  if (skinPortablePacks.status === "rejected") return skinPortablePacks;

  let renderPack: {
    readonly profile: Parameters<SimulatorRendererBackend["prepare"]>[1];
    readonly provider: Parameters<SimulatorRendererBackend["prepare"]>[2];
    readonly bindings: RenderEngineResourceBindings;
  };
  if (selection.rendering.kind === "ordinary") {
    const ordinary = await prepareSharedOrdinaryRenderResources(
      selection.rendering.profileResource,
      selection.rendering.resources,
      store,
    );
    if (ordinary.status === "rejected") return ordinary;
    renderPack = Object.freeze({
      profile: ordinary.value.profile,
      provider: ordinary.value.provider,
      bindings: CURRENT_ORDINARY_RENDER_BINDINGS,
    });
  } else {
    const habahiro = await prepareHabahiroBestdoriPack(
      createSharedHabahiroTransport(selection.rendering.resources, store),
    );
    if (habahiro.status !== "ok") {
      return rejected("resource-unavailable", habahiro.capability, habahiro.boundary);
    }
    renderPack = Object.freeze({
      profile: habahiro.value.profile,
      provider: habahiro.value.provider,
      bindings: Object.freeze({
        noteAtlasLogicalAssetId: habahiro.value.bindings.normalAtlasLogicalAssetId,
        directionalAtlasLogicalAssetId: habahiro.value.bindings.flickAtlasLogicalAssetId,
        syncLineLogicalAssetId: habahiro.value.bindings.syncLineLogicalAssetId,
        multipleDirectionalLineLeftLogicalAssetId: habahiro.value.bindings.multipleDirectionalLineLeftLogicalAssetId,
        multipleDirectionalLineRightLogicalAssetId: habahiro.value.bindings.multipleDirectionalLineRightLogicalAssetId,
        longNoteMaterialLogicalAssetId: habahiro.value.bindings.longNoteMaterialLogicalAssetId,
        curveNoteMaterialLogicalAssetId: habahiro.value.bindings.curveNoteMaterialLogicalAssetId,
        scoreHud: CURRENT_SCORE_HUD_BINDINGS,
        ordinaryVisible: CURRENT_ORDINARY_VISIBLE_BINDINGS,
        habahiroAtlasLogicalAssetIds: Object.freeze({
          normal: habahiro.value.bindings.normalAtlasLogicalAssetId,
          normal16: habahiro.value.bindings.normal16AtlasLogicalAssetId,
          skill: habahiro.value.bindings.skillAtlasLogicalAssetId,
          flick: habahiro.value.bindings.flickAtlasLogicalAssetId,
          long: habahiro.value.bindings.longAtlasLogicalAssetId,
          longFlash: habahiro.value.bindings.longFlashAtlasLogicalAssetId,
          slideAmong: habahiro.value.bindings.slideAmongAtlasLogicalAssetId,
        }),
      }),
    });
  }
  const skinRender = await prepareSkinRenderOverlay(
    selection.skin.resolved,
    skinPortablePacks.value,
    renderPack.bindings,
  );
  if (skinRender.status === "rejected") return skinRender;
  if (skinRender.value !== null) {
    renderPack = Object.freeze({
      ...renderPack,
      profile: Object.freeze({
        ...renderPack.profile,
        packIdentity: `${renderPack.profile.packIdentity}+skin-current-10.1.4-static-portable-v1`,
        assets: Object.freeze([...renderPack.profile.assets, ...skinRender.value.assets]),
      }),
      provider: mergeRenderProviders(
        renderPack.provider,
        skinRender.value.provider,
        skinRender.value.assets.map((asset) => asset.logicalAssetId),
      ),
      bindings: skinRender.value.bindings,
    });
  }
  const ordinaryVisible = await prepareSharedOrdinaryVisibleRenderResources(
    selection.ordinaryVisibleProfile,
    selection.ordinaryVisible,
    store,
  );
  if (ordinaryVisible.status === "rejected") return ordinaryVisible;
  const scoreHud = await prepareSharedScoreHudRenderResources(selection.scoreHud, store);
  if (scoreHud.status === "rejected") return scoreHud;
  const startupDirection = await prepareSharedStartupDirectionRenderResources(selection.startupDirection, store);
  if (startupDirection.status === "rejected") return startupDirection;
  const scoreGaugeSsAnimation = await prepareSharedScoreGaugeSsAnimationResource(
    selection.scoreGaugeSsAnimation,
    store,
  );
  if (scoreGaugeSsAnimation.status === "rejected") return scoreGaugeSsAnimation;
  const combinedAssets = [
    ...renderPack.profile.assets,
    ...ordinaryVisible.value.assets,
    ...scoreHud.value.assets,
    ...startupDirection.value.assets,
  ];
  if (new Set(combinedAssets.map((asset) => asset.logicalAssetId)).size !== combinedAssets.length) {
    return rejected(
      "resource-integrity",
      "simulator.assembly.duplicate-render-logical-id",
      "Ordinary, visible HUD and Score resource manifests must be disjoint before renderer preparation.",
    );
  }
  renderPack = Object.freeze({
    ...renderPack,
    profile: Object.freeze({
      ...renderPack.profile,
      packIdentity: `${renderPack.profile.packIdentity}+ordinary-visible-current-10.1.4-v1+score-hud-current-10.1.4-v1+startup-direction-current-10.1.4-v1`,
      assets: Object.freeze(combinedAssets),
      ordinaryVisibleProfile: ordinaryVisible.value.profile,
      scoreGaugeSsAnimation: scoreGaugeSsAnimation.value,
    }),
    provider: mergeRenderProviders(
      mergeRenderProviders(
        mergeRenderProviders(renderPack.provider, ordinaryVisible.value.provider, ordinaryVisible.value.assets.map(
          (asset) => asset.logicalAssetId,
        )),
        scoreHud.value.provider,
        scoreHud.value.assets.map((asset) => asset.logicalAssetId),
      ),
      startupDirection.value.provider,
      startupDirection.value.assets.map((asset) => asset.logicalAssetId),
    ),
  });
  const scene = targets.createSceneLayout(
    selection.rendering.kind,
    renderPack.bindings,
    skinRender.value?.fieldBindings ?? null,
  );
  if (scene.status === "rejected") return scene;
  const projection = scene.value.surfaceLayout.camera;
  renderPack = Object.freeze({
    ...renderPack,
    profile: Object.freeze({
      ...renderPack.profile,
      scene: Object.freeze({
        ...renderPack.profile.scene,
        projection: Object.freeze({
          ...renderPack.profile.scene.projection,
          viewportWidth: projection.viewportWidth,
          viewportHeight: projection.viewportHeight,
          worldCenterX: projection.worldCenterX,
          worldCenterY: projection.worldCenterY,
          cameraPositionZ: projection.positionZ,
          nearClip: projection.nearClip,
          farClip: projection.farClip,
          pixelsPerWorldUnit: projection.pixelsPerWorldUnit,
        }),
      }),
    }),
  });
  const audio = await prepareSharedAudioResources(
    chartAudio,
    selection.audioSe,
    store,
    null,
  );
  if (audio.status === "rejected") return audio;
  const skinAudio = await prepareSkinAudioOverlay(
    audio.value.profile,
    audio.value.provider,
    skinPortablePacks.value,
    selection.skin.resolved.tapSE.logicalResource!,
    selection.skin.resolved.directional.seLogicalResource,
    targets.audio.preflight,
  );
  if (skinAudio.status === "rejected") return skinAudio;
  const particles = await prepareSharedParticleProvider(selection.particles, store);
  if (particles.status === "rejected") return particles;
  const skinParticles = prepareSkinParticleProvider(
    selection.skin.resolved,
    skinPortablePacks.value,
    particles.value,
  );
  if (skinParticles.status === "rejected") return skinParticles;

  const prepared: Array<{
    readonly identity: string;
    readonly dispose: () => unknown;
  }> = [];
  const rollback = (): readonly SimulatorModuleCleanupFailure[] => {
    const failures: SimulatorModuleCleanupFailure[] = [];
    for (let index = prepared.length - 1; index >= 0; index -= 1) {
      const owner = prepared[index]!;
      try {
        const result = owner.dispose();
        const failure = simulatorCleanupFailureFromResult(owner.identity, result);
        if (failure !== null) failures.push(failure);
      } catch {
        failures.push(simulatorCleanupFailure(
          `simulator.assembly.rollback-${owner.identity}-threw`,
          `The ${owner.identity} owner threw during resource-assembly rollback; every remaining owner was still released.`,
        ));
      }
    }
    return Object.freeze(failures);
  };

  const renderReady = await targets.rendering.backend.prepare(
    targets.sessionId,
    renderPack.profile,
    renderPack.provider,
    targets.rendering.preflight,
  );
  if (renderReady.status !== "ok") {
    return rejected("resource-integrity", renderReady.capability, renderReady.boundary);
  }
  prepared.push({
    identity: "renderer",
    dispose: () => targets.rendering.backend.dispose(),
  });

  const audioReady = await targets.audio.backend.prepare(
    targets.sessionId,
    skinAudio.value.profile,
    skinAudio.value.provider,
    targets.audio.preflight,
  );
  if (audioReady.status !== "accepted") {
    return rejectedWithCleanup(
      rejected(
        mapAudioFailure(audioReady.status),
        audioReady.failure.capability,
        audioReady.failure.boundary,
      ),
      rollback(),
    );
  }
  prepared.push({
    identity: "audio",
    dispose: () => targets.audio.backend.dispose(),
  });

  const particleReady = await targets.particles.backend.prepare(
    targets.sessionId,
    Object.freeze({
      gameplayTransformScaleBits: scene.value.particleScene.gameplayTransformScaleBits,
    }),
    skinParticles.value,
    targets.particles.preflight,
  );
  if (particleReady.status !== "accepted") {
    return rejectedWithCleanup(
      rejected(
        mapParticleFailure(particleReady.status),
        particleReady.failure.capability,
        particleReady.failure.boundary,
      ),
      rollback(),
    );
  }
  prepared.push({
    identity: "particle-backend",
    dispose: () => targets.particles.backend.dispose(),
  });

  const particleRendererReady = await targets.particles.renderer.prepare(
    targets.sessionId,
    scene.value.particleScene,
    skinParticles.value,
    targets.particles.preflight,
  );
  if (particleRendererReady.status !== "accepted") {
    return rejectedWithCleanup(
      rejected(
        mapParticleFailure(particleRendererReady.status),
        particleRendererReady.failure.capability,
        particleRendererReady.failure.boundary,
      ),
      rollback(),
    );
  }

  return accepted(Object.freeze({
    sessionId: targets.sessionId,
    skinRecipeIdentity: selection.skin.recipeIdentity,
    skinPortablePacks: skinPortablePacks.value,
    fieldBindings: skinRender.value?.fieldBindings ?? null,
    backgroundLogicalAssetId: skinRender.value?.backgroundLogicalAssetId ?? null,
    backgroundImage: skinRender.value?.backgroundImage ?? null,
    renderBindings: renderPack.bindings,
    audioBackend: targets.audio.backend,
    rendererBackend: targets.rendering.backend,
    particleBackend: targets.particles.backend,
    particleRendererBackend: targets.particles.renderer,
    sceneLayout: scene.value,
  }));
}

function validateSkinResourceSelection(
  selection: SimulatorStaticResourceSelection,
): SimulatorAssemblyResult<void> {
  if (typeof selection.skin.recipeIdentity !== "string" ||
    !selection.skin.recipeIdentity.startsWith("skin-recipe-v1|") ||
    !Array.isArray(selection.skin.resources) || selection.skin.resources.length < 8) {
    return rejected(
      "resource-integrity",
      "simulator.assembly.invalid-skin-resource-selection",
      "Resolved Skin assembly requires one canonical recipe identity and the complete internally selected component inventory.",
    );
  }
  const identities = new Set<string>();
  for (const resource of selection.skin.resources) {
    const identity = `${resource.role}\u0000${resource.logicalResource}`;
    if (identities.has(identity) || !resource.resourceKey.startsWith(
      "simulator-static/current-10.1.4/skin-portable/",
    ) || resource.profile === null ||
      resource.profile.logicalResource !== resource.logicalResource) {
      return rejected(
        "resource-integrity",
        "simulator.assembly.duplicate-or-external-skin-resource",
        "Skin resources require unique simulator-owned role/identity pairs, one exact current portable-pack profile and internal static-store keys; URL and alias keys are forbidden.",
      );
    }
    identities.add(identity);
  }
  return accepted(undefined);
}

function mergeRenderProviders(
  base: SimulatorResourceProvider,
  scoreHud: SimulatorResourceProvider,
  scoreHudLogicalAssetIds: readonly string[],
): SimulatorResourceProvider {
  const scoreHudIds = new Set(scoreHudLogicalAssetIds);
  return Object.freeze({
    read(logicalAssetId: string) {
      return scoreHudIds.has(logicalAssetId)
        ? scoreHud.read(logicalAssetId)
        : base.read(logicalAssetId);
    },
  });
}

function mapAudioFailure(
  code: Exclude<Awaited<ReturnType<SimulatorAudioBackend["prepare"]>>, { status: "accepted" }>["status"],
): "integrity-failure" | "resource-unavailable" | "resource-integrity" |
  "resource-decode" | "platform-unavailable" | "launch-failed" {
  if (code === "audio-resource-unavailable") return "resource-unavailable";
  if (code === "audio-resource-integrity") return "resource-integrity";
  if (code === "audio-resource-decode") return "resource-decode";
  if (code === "audio-context-unavailable") return "platform-unavailable";
  return code === "integrity-failure" ? "integrity-failure" : "launch-failed";
}

function mapParticleFailure(
  code: "integrity-failure" | "particle-resource-unavailable" |
    "particle-resource-integrity" | "particle-resource-decode" |
    "particle-backend-fault" | "terminal-disposed",
): "integrity-failure" | "resource-unavailable" | "resource-integrity" |
  "resource-decode" | "launch-failed" {
  if (code === "particle-resource-unavailable") return "resource-unavailable";
  if (code === "particle-resource-integrity") return "resource-integrity";
  if (code === "particle-resource-decode") return "resource-decode";
  return code === "integrity-failure" ? "integrity-failure" : "launch-failed";
}

function rejectedWithCleanup<T>(
  primary: SimulatorAssemblyResult<T>,
  cleanupFailures: readonly SimulatorModuleCleanupFailure[],
): SimulatorAssemblyResult<T> {
  if (primary.status === "accepted" || cleanupFailures.length === 0) return primary;
  return Object.freeze({
    status: "rejected" as const,
    failure: appendSimulatorCleanupFailures(primary.failure, cleanupFailures),
  });
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
