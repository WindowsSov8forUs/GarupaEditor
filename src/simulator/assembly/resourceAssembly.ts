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
} from "../backends/renderingContracts";
import { prepareHabahiroBestdoriPack } from "../backends/resources/habahiroBestdoriProvider";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../backends/resources/currentOrdinaryResourceManifest";
import type { RenderEngineResourceBindings } from "../engine/rendering/renderCommandProducer";
import type { SimulatorChartAudioData } from "../public/contracts";
import type { SimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import type { SharedStaticResourceStore } from "../resources/sharedStaticResourceStore";
import type { SimulatorStaticResourceSelection } from "../resources/staticResourceSelector";
import {
  createSharedHabahiroTransport,
  prepareSharedAudioResources,
  prepareSharedOrdinaryRenderResources,
  prepareSharedParticleProvider,
  rejected,
  type SimulatorAssemblyResult,
} from "../resources/sharedResourceAdapters";

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
  ): SimulatorAssemblyResult<SimulatorSceneLayout>;
}

export interface PreparedSimulatorResourceAssembly {
  readonly sessionId: string;
  readonly renderBindings: RenderEngineResourceBindings;
  readonly audioBackend: SimulatorAudioBackend;
  readonly rendererBackend: SimulatorRendererBackend;
  readonly particleBackend: SimulatorParticleBackend;
  readonly particleRendererBackend: SimulatorParticleRendererBackend;
  readonly sceneLayout: SimulatorSceneLayout;
}

export async function assembleSimulatorResources(
  chartAudio: SimulatorChartAudioData,
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
        habahiroAtlasLogicalAssetIds: Object.freeze({
          normal: habahiro.value.bindings.normalAtlasLogicalAssetId,
          normal16: habahiro.value.bindings.normal16AtlasLogicalAssetId,
          flick: habahiro.value.bindings.flickAtlasLogicalAssetId,
          long: habahiro.value.bindings.longAtlasLogicalAssetId,
          longFlash: habahiro.value.bindings.longFlashAtlasLogicalAssetId,
          slideAmong: habahiro.value.bindings.slideAmongAtlasLogicalAssetId,
        }),
      }),
    });
  }
  const scene = targets.createSceneLayout(selection.rendering.kind, renderPack.bindings);
  if (scene.status === "rejected") return scene;
  const audio = await prepareSharedAudioResources(chartAudio, selection.audioSe, store);
  if (audio.status === "rejected") return audio;
  const particles = await prepareSharedParticleProvider(selection.particles, store);
  if (particles.status === "rejected") return particles;

  const prepared: Array<() => void> = [];
  const rollback = (): void => {
    for (let index = prepared.length - 1; index >= 0; index -= 1) {
      try { prepared[index]!(); } catch {}
    }
  };

  const renderReady = await targets.rendering.backend.prepare(
    targets.sessionId,
    renderPack.profile,
    renderPack.provider,
    targets.rendering.preflight,
  );
  if (renderReady.status !== "ok") {
    rollback();
    return rejected("resource-integrity", renderReady.capability, renderReady.boundary);
  }
  prepared.push(() => { targets.rendering.backend.dispose(); });

  const audioReady = await targets.audio.backend.prepare(
    targets.sessionId,
    audio.value.profile,
    audio.value.provider,
    targets.audio.preflight,
  );
  if (audioReady.status !== "accepted") {
    rollback();
    return rejected(
      mapAudioFailure(audioReady.status),
      audioReady.failure.capability,
      audioReady.failure.boundary,
    );
  }
  prepared.push(() => { targets.audio.backend.dispose(); });

  const particleReady = await targets.particles.backend.prepare(
    targets.sessionId,
    particles.value,
    targets.particles.preflight,
  );
  if (particleReady.status !== "accepted") {
    rollback();
    return rejected(
      mapParticleFailure(particleReady.status),
      particleReady.failure.capability,
      particleReady.failure.boundary,
    );
  }
  prepared.push(() => { targets.particles.backend.dispose(); });

  const particleRendererReady = await targets.particles.renderer.prepare(
    targets.sessionId,
    scene.value.particleScene,
    particles.value,
    targets.particles.preflight,
  );
  if (particleRendererReady.status !== "accepted") {
    rollback();
    return rejected(
      mapParticleFailure(particleRendererReady.status),
      particleRendererReady.failure.capability,
      particleRendererReady.failure.boundary,
    );
  }

  return accepted(Object.freeze({
    sessionId: targets.sessionId,
    renderBindings: renderPack.bindings,
    audioBackend: targets.audio.backend,
    rendererBackend: targets.rendering.backend,
    particleBackend: targets.particles.backend,
    particleRendererBackend: targets.particles.renderer,
    sceneLayout: scene.value,
  }));
}

function mapAudioFailure(
  code: Exclude<Awaited<ReturnType<SimulatorAudioBackend["prepare"]>>, { status: "accepted" }>["status"],
): "evidence-required" | "resource-unavailable" | "resource-integrity" |
  "resource-decode" | "platform-unavailable" | "launch-failed" {
  if (code === "audio-resource-unavailable") return "resource-unavailable";
  if (code === "audio-resource-integrity") return "resource-integrity";
  if (code === "audio-resource-decode") return "resource-decode";
  if (code === "audio-context-unavailable") return "platform-unavailable";
  return code === "evidence-required" ? "evidence-required" : "launch-failed";
}

function mapParticleFailure(
  code: "evidence-required" | "particle-resource-unavailable" |
    "particle-resource-integrity" | "particle-resource-decode" |
    "particle-backend-fault" | "terminal-disposed",
): "evidence-required" | "resource-unavailable" | "resource-integrity" |
  "resource-decode" | "launch-failed" {
  if (code === "particle-resource-unavailable") return "resource-unavailable";
  if (code === "particle-resource-integrity") return "resource-integrity";
  if (code === "particle-resource-decode") return "resource-decode";
  return code === "evidence-required" ? "evidence-required" : "launch-failed";
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
