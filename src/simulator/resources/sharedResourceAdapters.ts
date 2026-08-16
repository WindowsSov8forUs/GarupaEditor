import type {
  AudioResourceProfileSet,
  AudioSessionBgmResourceProfile,
} from "../backends/audioContracts";
import { createAudioSessionResourceProfile } from "../backends/resources/currentAudioResourceManifest";
import {
  ImmutableLocalAudioResourceProvider,
  type LocalAudioResource,
} from "../backends/resources/localAudioResourceProvider";
import {
  ImmutableLocalParticleResourceProvider,
  type LocalParticleResource,
} from "../backends/resources/localParticleResourceProvider";
import type { HabahiroBestdoriTransport } from "../backends/resources/habahiroBestdoriProvider";
import type { SimulatorModuleFailure } from "../public/contracts";
import type { RenderResourceProfile, SimulatorResourceProvider } from "../backends/renderingContracts";
import { validateAndFreezeRenderProfile } from "../backends/renderingValidation";
import { sha256UpperHex } from "../backends/resources/sha256";
import {
  ImmutableLocalRenderResourceProvider,
  type LocalRenderResource,
} from "../backends/resources/localResourceProvider";
import { CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY } from "../backends/resources/currentOrdinaryResourceManifest";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../backends/resources/currentScoreHudResourceManifest";
import { CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES } from "../backends/resources/currentStartupDirectionResourceManifest";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES } from "../backends/resources/currentOrdinaryVisibleResourceManifest";
import type { ParticleResourceProvider } from "../backends/particleContracts";
import type { AudioResourceProvider } from "../backends/audioContracts";
import { evidenceRequired, ok } from "../engine/evidence";
import type {
  SelectedAudioSeResource,
  SelectedHabahiroResource,
  SelectedOrdinaryResource,
  SelectedOrdinaryVisibleProfileResource,
  SelectedOrdinaryVisibleResource,
  SelectedParticleResource,
  SelectedScoreGaugeSsAnimationResource,
  SelectedScoreHudResource,
  SelectedStartupDirectionResource,
} from "./staticResourceSelector";
import type { SharedStaticResourceStore } from "./sharedStaticResourceStore";

export type SimulatorAssemblyResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export interface PreparedSharedOrdinaryRenderResources {
  readonly profile: RenderResourceProfile;
  readonly provider: SimulatorResourceProvider;
}

export async function prepareSharedOrdinaryRenderResources(
  profileResource: {
    readonly resourceKey: string;
    readonly profile: { readonly byteLength: number; readonly sha256: string };
  },
  selected: readonly SelectedOrdinaryResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedOrdinaryRenderResources>> {
  const profileRead = await readStatic(store, profileResource.resourceKey);
  if (profileRead.status === "rejected") return profileRead;
  if (profileRead.value.byteLength !== profileResource.profile.byteLength ||
    sha256UpperHex(profileRead.value) !== profileResource.profile.sha256) {
    return rejected(
      "resource-integrity",
      "simulator.resources.ordinary-profile-integrity",
      "The internal current ordinary profile must match its committed byte length and SHA-256 before JSON parsing.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(profileRead.value));
  } catch {
    return rejected(
      "resource-decode",
      "simulator.resources.ordinary-profile-json",
      "The hash-validated current ordinary profile must be valid UTF-8 JSON.",
    );
  }
  const validated = validateAndFreezeRenderProfile(parsed as RenderResourceProfile);
  if (validated.status !== "ok") {
    return rejected("evidence-required", validated.capability, validated.boundary);
  }
  if (validated.value.packIdentity !== CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY ||
    validated.value.fidelity.mode !== "ordinary" ||
    validated.value.fidelity.fidelity !== "exact-current" ||
    validated.value.assets.length !== selected.length) {
    return rejected(
      "resource-integrity",
      "simulator.resources.ordinary-profile-identity",
      "The ordinary profile must remain the committed current pack with exactly seven internally selected assets.",
    );
  }
  const declared = new Map(validated.value.assets.map((asset) => [asset.logicalAssetId, asset]));
  const local: LocalRenderResource[] = [];
  for (const resource of selected) {
    const asset = declared.get(resource.profile.logicalAssetId);
    if (asset === undefined || asset.byteLength !== resource.profile.byteLength ||
      asset.sha256 !== resource.profile.sha256 || asset.width !== resource.profile.width ||
      asset.height !== resource.profile.height) {
      return rejected(
        "resource-integrity",
        "simulator.resources.ordinary-profile-asset-mismatch",
        "Every ordinary profile asset must match the internally pinned logical ID, bytes, SHA-256 and dimensions.",
      );
    }
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    if (read.value.byteLength !== resource.profile.byteLength ||
      sha256UpperHex(read.value) !== resource.profile.sha256) {
      return rejected(
        "resource-integrity",
        "simulator.resources.ordinary-asset-integrity",
        "Every ordinary PNG must match its committed portable-pack bytes and SHA-256 before renderer preparation.",
      );
    }
    local.push({ logicalAssetId: resource.profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  if (provider.status !== "ok") return rejected(
    "launch-failed",
    provider.capability,
    provider.boundary,
  );
  return accepted(Object.freeze({ profile: validated.value, provider: provider.value }));
}

export interface PreparedSharedOrdinaryVisibleRenderResources {
  readonly profile: NonNullable<RenderResourceProfile["ordinaryVisibleProfile"]>;
  readonly assets: RenderResourceProfile["assets"];
  readonly provider: SimulatorResourceProvider;
}

export async function prepareSharedOrdinaryVisibleRenderResources(
  profileSelection: SelectedOrdinaryVisibleProfileResource,
  selected: readonly SelectedOrdinaryVisibleResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedOrdinaryVisibleRenderResources>> {
  if (selected.length !== CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES.length ||
    selected.some((resource, index) => resource.profile.logicalAssetId !== CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES[index]?.profile.logicalAssetId)) {
    return rejected(
      "resource-integrity",
      "simulator.resources.ordinary-visible-inventory",
      "The ordinary visible inventory must preserve the complete internally ordered manifest identity.",
    );
  }
  const profileRead = await readStatic(store, profileSelection.resourceKey);
  if (profileRead.status === "rejected") return profileRead;
  if (profileRead.value.byteLength !== profileSelection.profile.byteLength ||
    sha256UpperHex(profileRead.value) !== profileSelection.profile.sha256) {
    return rejected(
      "resource-integrity",
      "simulator.resources.ordinary-visible-profile-integrity",
      "The ordinary visible profile must match its committed byte length and SHA-256 before JSON parsing.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(profileRead.value));
  } catch {
    return rejected(
      "resource-decode",
      "simulator.resources.ordinary-visible-profile-json",
      "The hash-validated ordinary visible profile must be valid UTF-8 JSON.",
    );
  }
  const profile = parseCurrentOrdinaryVisibleProfile(parsed);
  if (profile === null) {
    return rejected(
      "resource-integrity",
      "simulator.resources.ordinary-visible-profile-shape",
      "Every ordinary visible route, owner, curve, scene constant and Float32 value must preserve the committed strict profile.",
    );
  }
  const local: LocalRenderResource[] = [];
  for (const resource of selected) {
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    if (read.value.byteLength !== resource.profile.byteLength ||
      sha256UpperHex(read.value) !== resource.profile.sha256) {
      return rejected(
        "resource-integrity",
        "simulator.resources.ordinary-visible-asset-integrity",
        "Every ordinary visible PNG must match its committed byte length and SHA-256 before renderer preparation.",
      );
    }
    local.push({ logicalAssetId: resource.profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  return provider.status === "ok"
    ? accepted(Object.freeze({ profile, assets: Object.freeze(selected.map((row) => row.profile)), provider: provider.value }))
    : rejected("launch-failed", provider.capability, provider.boundary);
}

export interface PreparedSharedScoreHudRenderResources {
  readonly assets: RenderResourceProfile["assets"];
  readonly provider: SimulatorResourceProvider;
}

export async function prepareSharedScoreGaugeSsAnimationResource(
  selected: SelectedScoreGaugeSsAnimationResource,
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<NonNullable<RenderResourceProfile["scoreGaugeSsAnimation"]>>> {
  const read = await readStatic(store, selected.resourceKey);
  if (read.status === "rejected") return read;
  if (read.value.byteLength !== selected.profile.byteLength ||
    sha256UpperHex(read.value) !== selected.profile.sha256) {
    return rejected(
      "resource-integrity",
      "simulator.resources.score-gauge-ss-animation-integrity",
      "The ScoreGaugeSS animation profile must match its committed byte length and SHA-256 before JSON parsing.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(read.value));
  } catch {
    return rejected(
      "resource-decode",
      "simulator.resources.score-gauge-ss-animation-json",
      "The hash-validated ScoreGaugeSS animation profile must be valid UTF-8 JSON.",
    );
  }
  const profile = parseCurrentScoreGaugeSsAnimationProfile(parsed);
  return profile === null
    ? rejected(
        "resource-integrity",
        "simulator.resources.score-gauge-ss-animation-shape",
        "The ScoreGaugeSS profile must preserve all 56 curves, 39 finite frames, 236 keys and 11 scene nodes.",
      )
    : accepted(profile);
}

export async function prepareSharedStartupDirectionRenderResources(
  selected: readonly SelectedStartupDirectionResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedScoreHudRenderResources>> {
  if (selected.length !== CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES.length ||
    selected.some((resource, index) => resource.profile.logicalAssetId !== CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES[index]?.profile.logicalAssetId)) {
    return rejected(
      "resource-integrity",
      "simulator.resources.startup-direction-inventory",
      "The startup direction common pack requires the exact internally selected current resource inventory.",
    );
  }
  const local: LocalRenderResource[] = [];
  for (const resource of selected) {
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    if (read.value.byteLength !== resource.profile.byteLength || sha256UpperHex(read.value) !== resource.profile.sha256) {
      return rejected(
        "resource-integrity",
        "simulator.resources.startup-direction-asset-integrity",
        "Every startup direction common resource must match the committed byte length and SHA-256 before publication.",
      );
    }
    local.push({ logicalAssetId: resource.profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  return provider.status === "ok"
    ? accepted(Object.freeze({ assets: Object.freeze(selected.map((row) => row.profile)), provider: provider.value }))
    : rejected("launch-failed", provider.capability, provider.boundary);
}

export async function prepareSharedScoreHudRenderResources(
  selected: readonly SelectedScoreHudResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedScoreHudRenderResources>> {
  if (selected.length !== CURRENT_SCORE_HUD_PORTABLE_RESOURCES.length ||
    selected.some((resource, index) => resource.profile.logicalAssetId !== CURRENT_SCORE_HUD_PORTABLE_RESOURCES[index]?.profile.logicalAssetId)) {
    return rejected(
      "resource-integrity",
      "simulator.resources.score-hud-inventory",
      "The current Score HUD requires the non-empty internally selected portable bitmap font, rank-label font, gauge, rank-marker and high-rank resource identities."
    );
  }
  const local: LocalRenderResource[] = [];
  const logicalIds = new Set<string>();
  for (const resource of selected) {
    const profile = resource.profile;
    if (logicalIds.has(profile.logicalAssetId)) {
      return rejected(
        "resource-integrity",
        "simulator.resources.score-hud-duplicate-logical-id",
        "Every selected Score HUD resource must have one unique internally pinned logical identity.",
      );
    }
    logicalIds.add(profile.logicalAssetId);
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    if (read.value.byteLength !== profile.byteLength ||
      sha256UpperHex(read.value) !== profile.sha256) {
      return rejected(
        "resource-integrity",
        "simulator.resources.score-hud-asset-integrity",
        "Every Score HUD PNG must match the committed portable byte length and SHA-256 before renderer preparation.",
      );
    }
    local.push({ logicalAssetId: profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  return provider.status === "ok"
    ? accepted(Object.freeze({ assets: Object.freeze(selected.map((row) => row.profile)), provider: provider.value }))
    : rejected("launch-failed", provider.capability, provider.boundary);
}

export interface PreparedSharedAudioResources {
  readonly profile: AudioResourceProfileSet;
  readonly provider: AudioResourceProvider;
}

export async function prepareSharedAudioResources(
  bgm: {
    readonly profile: AudioSessionBgmResourceProfile;
    readonly bytes: Uint8Array;
  },
  selectedSe: readonly SelectedAudioSeResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedAudioResources>> {
  const local: LocalAudioResource[] = [{
    logicalId: bgm.profile.logicalId,
    cue: bgm.profile.cue,
    bytes: Uint8Array.from(bgm.bytes),
  }];
  for (const selected of selectedSe) {
    const read = await readStatic(store, selected.resourceKey);
    if (read.status === "rejected") return read;
    local.push({
      logicalId: selected.profile.logicalId,
      cue: selected.profile.cue,
      bytes: read.value,
    });
  }
  const provider = ImmutableLocalAudioResourceProvider.create(local);
  if (provider.status !== "accepted") {
    return rejected(
      "launch-failed",
      provider.failure.capability,
      provider.failure.boundary,
    );
  }
  const profile = createAudioSessionResourceProfile(bgm.profile);
  return accepted(Object.freeze({ profile, provider: provider.value }));
}

export async function prepareSharedParticleProvider(
  selected: readonly SelectedParticleResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<ParticleResourceProvider>> {
  const local: LocalParticleResource[] = [];
  for (const resource of selected) {
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    local.push({ logicalAssetId: resource.profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalParticleResourceProvider.create(local);
  return provider.status === "accepted"
    ? accepted(provider.value)
    : rejected(
        mapParticleFailureCode(provider.failure.code),
        provider.failure.capability,
        provider.failure.boundary,
      );
}

export function createSharedHabahiroTransport(
  selected: readonly SelectedHabahiroResource[],
  store: SharedStaticResourceStore,
): HabahiroBestdoriTransport {
  const byUrl = new Map(selected.map((resource) => [resource.profile.url, resource.resourceKey]));
  return Object.freeze({
    async read(url: string) {
      const resourceKey = byUrl.get(url);
      if (resourceKey === undefined) {
        return evidenceRequired(
          "render.habahiro.shared-store-url-not-selected",
          ["HAB-A01", "HAB-A02"],
          "The autonomous HAB transport accepts only URLs mapped by the internal pinned selection.",
        );
      }
      let read;
      try {
        read = await store.read(resourceKey);
      } catch {
        return evidenceRequired(
          "render.habahiro.shared-store-threw",
          ["HAB-A01", "HAB-A02"],
          "A shared static store exception fails the explicit HAB read without network fallback.",
        );
      }
      return read.status === "accepted"
        ? ok(Uint8Array.from(read.value))
        : evidenceRequired(
            `render.habahiro.${read.failure.capability}`,
            ["HAB-A01", "HAB-A02"],
            read.failure.boundary,
          );
    },
  });
}

async function readStatic(
  store: SharedStaticResourceStore,
  resourceKey: string,
): Promise<SimulatorAssemblyResult<Uint8Array>> {
  try {
    const read = await store.read(resourceKey);
    return read.status === "accepted"
      ? accepted(Uint8Array.from(read.value))
      : rejected(
          read.failure.code === "resource-unavailable"
            ? "resource-unavailable"
            : "launch-failed",
          read.failure.capability,
          read.failure.boundary,
        );
  } catch {
    return rejected(
      "launch-failed",
      "simulator.resources.shared-store-threw",
      "A shared static resource store exception fails launch before backend preparation and is never retried through another source.",
    );
  }
}

function mapParticleFailureCode(
  code: "evidence-required" | "particle-resource-unavailable" | "particle-resource-integrity" |
    "particle-resource-decode" | "particle-backend-fault" | "terminal-disposed",
): SimulatorModuleFailure["code"] {
  if (code === "particle-resource-unavailable") return "resource-unavailable";
  if (code === "particle-resource-integrity") return "resource-integrity";
  if (code === "particle-resource-decode") return "resource-decode";
  return code === "evidence-required" ? "evidence-required" : "launch-failed";
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

export function rejected<T>(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorAssemblyResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}
