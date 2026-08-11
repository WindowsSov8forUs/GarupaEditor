import type { AudioFixedSeResourceProfile } from "../backends/audioContracts";
import { CURRENT_AUDIO_SE_RESOURCES } from "../backends/resources/currentAudioResourceManifest";
import {
  HABAHIRO_BESTDORI_PACK_IDENTITY,
  HABAHIRO_BESTDORI_PINNED_ASSETS,
  type HabahiroBestdoriPinnedAsset,
} from "../backends/resources/habahiroBestdoriManifest";
import { CURRENT_PARTICLE_RESOURCE_MANIFEST } from "../backends/resources/currentParticleResourceManifest";
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

export type SelectedRenderResourceRoute =
  | {
      readonly kind: "ordinary";
      readonly status: "evidence-required";
      readonly capability: "simulator.resources.ordinary-current-pack";
      readonly boundary: string;
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
        status: "evidence-required" as const,
        capability: "simulator.resources.ordinary-current-pack" as const,
        boundary: "The current evidence does not yet provide a committed portable ordinary PNG/profile pack; autonomous launch fails before resource reads rather than accepting a caller-authored profile.",
      });
  return Object.freeze({
    schemaVersion: 1 as const,
    audioSe,
    particles,
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

function encodeKey(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}
