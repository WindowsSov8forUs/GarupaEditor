import type {
  AudioResourcePreflightAdapter,
  SimulatorAudioBackend,
} from "../backends/audioContracts";
import type {
  ParticlePixiSceneProfile,
  ParticleResourcePreflightAdapter,
  SimulatorParticleBackend,
  SimulatorParticleRendererBackend,
} from "../backends/particleContracts";
import type {
  RenderResourcePreflightAdapter,
  SimulatorRendererBackend,
} from "../backends/renderingContracts";
import { prepareHabahiroBestdoriPack } from "../backends/resources/habahiroBestdoriProvider";
import type { RenderEngineResourceBindings } from "../engine/rendering/renderCommandProducer";
import type { SimulatorChartAudioData } from "../public/contracts";
import type { SharedStaticResourceStore } from "../resources/sharedStaticResourceStore";
import type { SimulatorStaticResourceSelection } from "../resources/staticResourceSelector";
import {
  createSharedHabahiroTransport,
  prepareSharedAudioResources,
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
    readonly scene: ParticlePixiSceneProfile;
  };
}

export interface PreparedSimulatorResourceAssembly {
  readonly sessionId: string;
  readonly renderBindings: RenderEngineResourceBindings;
  readonly audioBackend: SimulatorAudioBackend;
  readonly rendererBackend: SimulatorRendererBackend;
  readonly particleBackend: SimulatorParticleBackend;
  readonly particleRendererBackend: SimulatorParticleRendererBackend;
}

export async function assembleSimulatorResources(
  chartAudio: SimulatorChartAudioData,
  selection: SimulatorStaticResourceSelection,
  store: SharedStaticResourceStore,
  targets: SimulatorResourceAssemblyTargets,
): Promise<SimulatorAssemblyResult<PreparedSimulatorResourceAssembly>> {
  if (
    typeof targets.sessionId !== "string" || targets.sessionId.length === 0 ||
    selection.rendering.kind === "ordinary"
  ) {
    return selection.rendering.kind === "ordinary"
      ? rejected(
          "evidence-required",
          selection.rendering.capability,
          selection.rendering.boundary,
        )
      : rejected(
          "launch-failed",
          "simulator.assembly.invalid-session",
          "Autonomous resource assembly requires one internally generated non-empty session identity.",
        );
  }

  const habahiro = await prepareHabahiroBestdoriPack(
    createSharedHabahiroTransport(selection.rendering.resources, store),
  );
  if (habahiro.status !== "ok") {
    return rejected("resource-unavailable", habahiro.capability, habahiro.boundary);
  }
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
    habahiro.value.profile,
    habahiro.value.provider,
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
    targets.particles.scene,
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

  const bindings = habahiro.value.bindings;
  return accepted(Object.freeze({
    sessionId: targets.sessionId,
    renderBindings: Object.freeze({
      noteAtlasLogicalAssetId: bindings.normalAtlasLogicalAssetId,
      directionalAtlasLogicalAssetId: bindings.flickAtlasLogicalAssetId,
      syncLineLogicalAssetId: bindings.syncLineLogicalAssetId,
      multipleDirectionalLineLeftLogicalAssetId: bindings.multipleDirectionalLineLeftLogicalAssetId,
      multipleDirectionalLineRightLogicalAssetId: bindings.multipleDirectionalLineRightLogicalAssetId,
      longNoteMaterialLogicalAssetId: bindings.longNoteMaterialLogicalAssetId,
      curveNoteMaterialLogicalAssetId: bindings.curveNoteMaterialLogicalAssetId,
      habahiroAtlasLogicalAssetIds: Object.freeze({
        normal: bindings.normalAtlasLogicalAssetId,
        normal16: bindings.normal16AtlasLogicalAssetId,
        skill: bindings.skillAtlasLogicalAssetId,
        flick: bindings.flickAtlasLogicalAssetId,
        long: bindings.longAtlasLogicalAssetId,
        longFlash: bindings.longFlashAtlasLogicalAssetId,
        slideAmong: bindings.slideAmongAtlasLogicalAssetId,
      }),
    }),
    audioBackend: targets.audio.backend,
    rendererBackend: targets.rendering.backend,
    particleBackend: targets.particles.backend,
    particleRendererBackend: targets.particles.renderer,
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
