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
import type { RenderEngineResourceBindings } from "../engine/rendering/renderCommandProducer";
import { BASE_DYNAMIC_RENDER_BINDINGS } from "../engine/rendering/commonResourceBindings";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
import {
  appendSimulatorCleanupFailures,
  simulatorCleanupFailure,
  simulatorCleanupFailureFromResult,
} from "../public/failures";
import type { SimulatorModuleCleanupFailure } from "../public/contracts";
import type { SimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import {
  prepareSelectedSkinSourcePackages,
  prepareSourceAudioPackage,
} from "../resources/sourcePackageDecoder";
import type { PreparedSkinSourcePackage } from "../resources/sourcePackageContracts";
import { rejected, type SimulatorAssemblyResult } from "./result";
import { prepareLeasedAudioResources } from "./leasedAudioPreparation";
import { prepareLeasedCommonRenderResources } from "./leasedCommonResourcePreparation";
import type { SimulatorResourceSelection } from "./resourceRequirements";
import type { PreparedSessionBgmResource } from "./sessionBgmDerivation";
import { prepareSkinParticleProvider } from "./skinParticlePreparation";
import { prepareSkinRenderOverlay } from "./skinRenderPreparation";

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
  readonly skinSourcePackages: readonly PreparedSkinSourcePackage[];
  readonly resourceLease: SimulatorResourceLease;
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
  selection: SimulatorResourceSelection,
  lease: SimulatorResourceLease,
  targets: SimulatorResourceAssemblyTargets,
): Promise<SimulatorAssemblyResult<PreparedSimulatorResourceAssembly>> {
  if (typeof targets.sessionId !== "string" || targets.sessionId.length === 0) {
    return rejected("launch-failed", "simulator.assembly.invalid-session", "Autonomous resource assembly requires one internally generated non-empty session identity.");
  }
  const skinSelection = validateSkinResourceSelection(selection);
  if (skinSelection.status === "rejected") return skinSelection;
  const skinPacks = await prepareSelectedSkinSourcePackages(selection.skin.resources, lease);
  if (skinPacks.status === "rejected") return skinPacks;
  const commonAudio = await prepareSourceAudioPackage("sound/common", lease);
  if (commonAudio.status === "rejected") return commonAudio;
  const commonRender = await prepareLeasedCommonRenderResources(lease);
  if (commonRender.status === "rejected") return commonRender;
  const skinRender = await prepareSkinRenderOverlay(
    selection.skin.resolved,
    skinPacks.value,
    BASE_DYNAMIC_RENDER_BINDINGS,
  );
  if (skinRender.status === "rejected" || skinRender.value === null) {
    return skinRender.status === "rejected"
      ? skinRender
      : rejected("resource-integrity", "simulator.assembly.skin-render-empty", "Every current resolved Skin recipe must publish its exact leased render overlay.");
  }
  const combinedAssets = Object.freeze([
    ...commonRender.value.profile.assets,
    ...skinRender.value.assets,
  ]);
  if (new Set(combinedAssets.map((asset) => asset.logicalAssetId)).size !== combinedAssets.length) {
    return rejected("resource-integrity", "simulator.assembly.duplicate-render-logical-id", "Leased common and Skin render assets must be disjoint before renderer preparation.");
  }
  let renderPack = Object.freeze({
    profile: Object.freeze({
      ...commonRender.value.profile,
      packIdentity: `application-leased-render-v1+${selection.skin.recipeIdentity}`,
      assets: combinedAssets,
    }),
    provider: mergeRenderProviders(
      commonRender.value.provider,
      skinRender.value.provider,
      skinRender.value.assets.map((asset) => asset.logicalAssetId),
    ),
    bindings: skinRender.value.bindings,
  });
  const scene = targets.createSceneLayout(
    selection.renderingKind,
    renderPack.bindings,
    skinRender.value.fieldBindings,
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
  const audio = await prepareLeasedAudioResources(
    chartAudio,
    Object.freeze([...skinPacks.value, commonAudio.value]),
    targets.audio.preflight,
  );
  if (audio.status === "rejected") return audio;
  const unavailableBaseParticle = Object.freeze({
    read: async () => ({
      status: "particle-resource-unavailable" as const,
      failure: Object.freeze({
        code: "particle-resource-unavailable" as const,
        capability: "simulator.particle.no-static-base-provider",
        boundary: "All production particle bytes must come from selected leased TapEffect packages.",
      }),
    }),
  });
  const particles = prepareSkinParticleProvider(
    selection.skin.resolved,
    skinPacks.value,
    unavailableBaseParticle,
  );
  if (particles.status === "rejected") return particles;

  const prepared: Array<{ readonly identity: string; readonly dispose: () => unknown }> = [];
  const rollback = (): readonly SimulatorModuleCleanupFailure[] => {
    const failures: SimulatorModuleCleanupFailure[] = [];
    for (let index = prepared.length - 1; index >= 0; index -= 1) {
      const owner = prepared[index]!;
      try {
        const failure = simulatorCleanupFailureFromResult(owner.identity, owner.dispose());
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
  if (renderReady.status !== "ok") return rejected("resource-integrity", renderReady.capability, renderReady.boundary);
  prepared.push({ identity: "renderer", dispose: () => targets.rendering.backend.dispose() });
  const audioReady = await targets.audio.backend.prepare(
    targets.sessionId,
    audio.value.profile,
    audio.value.provider,
    targets.audio.preflight,
  );
  if (audioReady.status !== "accepted") {
    return rejectedWithCleanup(rejected(mapAudioFailure(audioReady.status), audioReady.failure.capability, audioReady.failure.boundary), rollback());
  }
  prepared.push({ identity: "audio", dispose: () => targets.audio.backend.dispose() });
  const particleReady = await targets.particles.backend.prepare(
    targets.sessionId,
    particles.value,
    targets.particles.preflight,
  );
  if (particleReady.status !== "accepted") {
    return rejectedWithCleanup(rejected(mapParticleFailure(particleReady.status), particleReady.failure.capability, particleReady.failure.boundary), rollback());
  }
  prepared.push({ identity: "particle-backend", dispose: () => targets.particles.backend.dispose() });
  const particleRendererReady = await targets.particles.renderer.prepare(
    targets.sessionId,
    scene.value.particleScene,
    particles.value,
    targets.particles.preflight,
  );
  if (particleRendererReady.status !== "accepted") {
    return rejectedWithCleanup(rejected(mapParticleFailure(particleRendererReady.status), particleRendererReady.failure.capability, particleRendererReady.failure.boundary), rollback());
  }
  return accepted(Object.freeze({
    sessionId: targets.sessionId,
    skinRecipeIdentity: selection.skin.recipeIdentity,
    skinSourcePackages: skinPacks.value,
    resourceLease: lease,
    fieldBindings: skinRender.value.fieldBindings,
    backgroundLogicalAssetId: skinRender.value.backgroundLogicalAssetId,
    backgroundImage: skinRender.value.backgroundImage,
    renderBindings: renderPack.bindings,
    audioBackend: targets.audio.backend,
    rendererBackend: targets.rendering.backend,
    particleBackend: targets.particles.backend,
    particleRendererBackend: targets.particles.renderer,
    sceneLayout: scene.value,
  }));
}

function validateSkinResourceSelection(selection: SimulatorResourceSelection): SimulatorAssemblyResult<void> {
  if (selection.schemaVersion !== 1 || typeof selection.skin.recipeIdentity !== "string" ||
    !selection.skin.recipeIdentity.startsWith("skin-recipe-v1|") ||
    !Array.isArray(selection.skin.resources) || selection.skin.resources.length < 8 ||
    !Array.isArray(selection.requirements) || selection.requirements.length < selection.skin.resources.length) {
    return rejected("resource-integrity", "simulator.assembly.invalid-skin-resource-selection", "Resolved Skin assembly requires one canonical recipe identity and complete application-leased requirements.");
  }
  const identities = new Set<string>();
  for (const resource of selection.skin.resources) {
    const identity = `${resource.role}\u0000${resource.logicalResource}`;
    if (identities.has(identity) || typeof resource.logicalResource !== "string" || resource.logicalResource.length === 0) {
      return rejected("resource-integrity", "simulator.assembly.duplicate-skin-resource", "Skin source resources require unique role/logical-resource pairs without keys, URLs, profiles or aliases.");
    }
    identities.add(identity);
  }
  return accepted(undefined);
}

function mergeRenderProviders(
  base: SimulatorResourceProvider,
  overlay: SimulatorResourceProvider,
  overlayLogicalAssetIds: readonly string[],
): SimulatorResourceProvider {
  const ids = new Set(overlayLogicalAssetIds);
  return Object.freeze({
    read(logicalAssetId: string) {
      return ids.has(logicalAssetId) ? overlay.read(logicalAssetId) : base.read(logicalAssetId);
    },
  });
}

function mapAudioFailure(code: Exclude<Awaited<ReturnType<SimulatorAudioBackend["prepare"]>>, { status: "accepted" }>["status"]): "integrity-failure" | "resource-unavailable" | "resource-integrity" | "resource-decode" | "platform-unavailable" | "launch-failed" {
  if (code === "audio-resource-unavailable") return "resource-unavailable";
  if (code === "audio-resource-integrity") return "resource-integrity";
  if (code === "audio-resource-decode") return "resource-decode";
  if (code === "audio-context-unavailable") return "platform-unavailable";
  return code === "integrity-failure" ? "integrity-failure" : "launch-failed";
}
function mapParticleFailure(code: "integrity-failure" | "particle-resource-unavailable" | "particle-resource-integrity" | "particle-resource-decode" | "particle-backend-fault" | "terminal-disposed"): "integrity-failure" | "resource-unavailable" | "resource-integrity" | "resource-decode" | "launch-failed" {
  if (code === "particle-resource-unavailable") return "resource-unavailable";
  if (code === "particle-resource-integrity") return "resource-integrity";
  if (code === "particle-resource-decode") return "resource-decode";
  return code === "integrity-failure" ? "integrity-failure" : "launch-failed";
}
function rejectedWithCleanup<T>(primary: SimulatorAssemblyResult<T>, cleanupFailures: readonly SimulatorModuleCleanupFailure[]): SimulatorAssemblyResult<T> {
  if (primary.status === "accepted" || cleanupFailures.length === 0) return primary;
  return Object.freeze({ status: "rejected" as const, failure: appendSimulatorCleanupFailures(primary.failure, cleanupFailures) });
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
