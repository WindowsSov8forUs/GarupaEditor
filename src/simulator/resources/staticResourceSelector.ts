import type { AudioFixedSeResourceProfile } from "../backends/audioContracts";
import { CURRENT_AUDIO_SE_RESOURCES } from "../backends/resources/currentAudioResourceManifest";
import {
  HABAHIRO_BESTDORI_PACK_IDENTITY,
  HABAHIRO_BESTDORI_PINNED_ASSETS,
  type HabahiroBestdoriPinnedAsset,
} from "../backends/resources/habahiroBestdoriManifest";
import { CURRENT_PARTICLE_RESOURCE_MANIFEST } from "../backends/resources/currentParticleResourceManifest";
import {
  CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE,
  CURRENT_SCORE_HUD_PORTABLE_RESOURCES,
  type ScoreHudPortableResourceEntry,
} from "../backends/resources/currentScoreHudResourceManifest";
import {
  CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY,
  CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE,
  CURRENT_ORDINARY_PORTABLE_RESOURCES,
  type OrdinaryPortableResourceEntry,
} from "../backends/resources/currentOrdinaryResourceManifest";
import type { ParticleResourceAllowlistEntry } from "../backends/particleContracts";
import type { ChartConstructionResult } from "../engine/chart/types";

const STATIC_RESOURCE_NAMESPACE = "simulator-static/current-10.1.4" as const;

export interface SelectedAudioSeResource {
  readonly resourceKey: string;
  readonly profile: AudioFixedSeResourceProfile;
}

export interface SelectedParticleResource {
  readonly resourceKey: string;
  readonly profile: ParticleResourceAllowlistEntry;
}

export interface SelectedHabahiroResource {
  readonly resourceKey: string;
  readonly profile: HabahiroBestdoriPinnedAsset;
}

export interface SelectedOrdinaryResource {
  readonly resourceKey: string;
  readonly profile: OrdinaryPortableResourceEntry;
}

export interface SelectedScoreGaugeSsAnimationResource {
  readonly resourceKey: string;
  readonly profile: typeof CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE;
}

export interface SelectedScoreHudResource {
  readonly resourceKey: string;
  readonly profile: ScoreHudPortableResourceEntry["profile"];
}

export type SelectedRenderResourceRoute =
  | {
      readonly kind: "ordinary";
      readonly status: "selected";
      readonly packIdentity: typeof CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY;
      readonly profileResource: {
        readonly resourceKey: string;
        readonly profile: typeof CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE;
      };
      readonly resources: readonly SelectedOrdinaryResource[];
    }
  | {
      readonly kind: "habahiro";
      readonly status: "selected";
      readonly packIdentity: typeof HABAHIRO_BESTDORI_PACK_IDENTITY;
      readonly resources: readonly SelectedHabahiroResource[];
    };

export interface SimulatorStaticResourceSelection {
  readonly schemaVersion: 1;
  readonly audioSe: readonly SelectedAudioSeResource[];
  readonly particles: readonly SelectedParticleResource[];
  readonly scoreHud: readonly SelectedScoreHudResource[];
  readonly scoreGaugeSsAnimation: SelectedScoreGaugeSsAnimationResource;
  readonly rendering: SelectedRenderResourceRoute;
}

export function selectSimulatorStaticResources(
  chart: ChartConstructionResult,
): SimulatorStaticResourceSelection {
  const audioSe = Object.freeze(CURRENT_AUDIO_SE_RESOURCES.map((profile) =>
    Object.freeze({
      resourceKey: audioSeResourceKey(profile.logicalId, profile.cue),
      profile,
    })));
  const particles = Object.freeze(
    CURRENT_PARTICLE_RESOURCE_MANIFEST.resources.map((profile) =>
      Object.freeze({
        resourceKey: particleResourceKey(profile.logicalAssetId),
        profile,
      })),
  );
  const scoreHud = Object.freeze(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((entry) =>
    Object.freeze({
      resourceKey: scoreHudResourceKey(entry.resourceKeySuffix),
      profile: entry.profile,
    })));
  const scoreGaugeSsAnimation = Object.freeze({
    resourceKey: scoreHudResourceKey(CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE.resourceKeySuffix),
    profile: CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE,
  });
  const rendering: SelectedRenderResourceRoute = chart.habahiroChangeAbsolutePos >= 0
    ? Object.freeze({
        kind: "habahiro" as const,
        status: "selected" as const,
        packIdentity: HABAHIRO_BESTDORI_PACK_IDENTITY,
        resources: Object.freeze(HABAHIRO_BESTDORI_PINNED_ASSETS.map((profile) =>
          Object.freeze({
            resourceKey: habahiroResourceKey(profile.technicalName),
            profile,
          }))),
      })
    : Object.freeze({
        kind: "ordinary" as const,
        status: "selected" as const,
        packIdentity: CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY,
        profileResource: Object.freeze({
          resourceKey: ordinaryResourceKey(CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE.logicalAssetId),
          profile: CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE,
        }),
        resources: Object.freeze(CURRENT_ORDINARY_PORTABLE_RESOURCES.map((profile) =>
          Object.freeze({
            resourceKey: ordinaryResourceKey(profile.logicalAssetId),
            profile,
          }))),
      });
  return Object.freeze({
    schemaVersion: 1 as const,
    audioSe,
    particles,
    scoreHud,
    scoreGaugeSsAnimation,
    rendering,
  });
}

export function audioSeResourceKey(logicalId: string, cue: string): string {
  return `${STATIC_RESOURCE_NAMESPACE}/audio-se/${encodeKey(logicalId)}/${encodeKey(cue)}`;
}

export function particleResourceKey(logicalAssetId: string): string {
  return `${STATIC_RESOURCE_NAMESPACE}/particle/${encodeKey(logicalAssetId)}`;
}

export function habahiroResourceKey(technicalName: string): string {
  return `${STATIC_RESOURCE_NAMESPACE}/habahiro/${encodeKey(technicalName)}`;
}

export function ordinaryResourceKey(logicalAssetId: string): string {
  return `${STATIC_RESOURCE_NAMESPACE}/render-ordinary/${encodeKey(logicalAssetId)}`;
}

export function scoreHudResourceKey(resourceKeySuffix: string): string {
  return `${STATIC_RESOURCE_NAMESPACE}/score-hud/${encodeKey(resourceKeySuffix)}`;
}

function encodeKey(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}
