import commonCatalogJson from "../engine/skin/commonRenderSemanticCatalog.json";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import {
  ImmutableLocalRenderResourceProvider,
  type LocalRenderResource,
} from "../backends/resources/localResourceProvider";
import { sha256UpperHex } from "../backends/resources/sha256";
import type {
  RenderResourceAssetProfile,
  RenderResourceProfile,
  SimulatorResourceProvider,
} from "../backends/renderingContracts";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
import { OriginalResourcePackageView } from "../resources/originalResourcePackageView";
import { rejected, type SimulatorAssemblyResult } from "./result";

interface SemanticEntry {
  readonly file: string;
  readonly profile: Omit<RenderResourceAssetProfile, "byteLength" | "sha256" | "provenance">;
}

const semanticGroups = parseSemanticCatalog(commonCatalogJson);

export interface PreparedLeasedCommonRenderResources {
  readonly profile: RenderResourceProfile;
  readonly provider: SimulatorResourceProvider;
}

export async function prepareLeasedCommonRenderResources(
  lease: SimulatorResourceLease,
): Promise<SimulatorAssemblyResult<PreparedLeasedCommonRenderResources>> {
  const assets: RenderResourceAssetProfile[] = [];
  const local: LocalRenderResource[] = [];
  for (const entry of semanticGroups) {
    const logicalResource = commonLogicalResource(entry.file);
    if (logicalResource === null) return invalid("simulator.resources.common-semantic-file-unmapped");
    const view = await OriginalResourcePackageView.open(lease, logicalResource);
    if (view.status === "rejected") return rejected("resource-unavailable", view.failure.capability, view.failure.boundary);
    const bytes = view.value.requireBytes(entry.file);
    if (bytes.status === "rejected") return rejected("resource-unavailable", bytes.failure.capability, bytes.failure.boundary);
    if (entry.profile.mime === "image/png") {
      const png = view.value.inspectPng(entry.file);
      if (png.status === "rejected") return rejected("resource-decode", png.failure.capability, png.failure.boundary);
      if (png.value.width !== entry.profile.width || png.value.height !== entry.profile.height) {
        return invalid("simulator.resources.common-png-dimensions");
      }
    }
    const profile: RenderResourceAssetProfile = Object.freeze({
      ...entry.profile,
      byteLength: bytes.value.byteLength,
      sha256: sha256UpperHex(bytes.value),
      provenance: "current-official-portable" as const,
    });
    assets.push(profile);
    local.push(Object.freeze({ logicalAssetId: profile.logicalAssetId, bytes: bytes.value }));
  }
  const [baseProfile, ordinaryVisible, scoreAnimation] = await Promise.all([
    readJson(lease, "portable/profiles/ordinary-render", "profile.json"),
    readJson(lease, "portable/profiles/ordinary-visible", "profile.json"),
    readJson(lease, "prefabs/bms/rhythmgamegauge/score", "score-gauge-ss-animation-profile.json"),
  ]);
  if (baseProfile.status === "rejected") return baseProfile;
  if (ordinaryVisible.status === "rejected") return ordinaryVisible;
  if (scoreAnimation.status === "rejected") return scoreAnimation;
  const base = record(baseProfile.value);
  const visible = parseCurrentOrdinaryVisibleProfile(ordinaryVisible.value);
  const score = parseCurrentScoreGaugeSsAnimationProfile(scoreAnimation.value);
  if (base === null || base.schemaVersion !== 1 || record(base.scene) === null || record(base.sample) === null || visible === null || score === null) {
    return invalid("simulator.resources.common-profile-shape");
  }
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  if (provider.status !== "ok") return rejected("resource-integrity", provider.capability, provider.boundary);
  const profile: RenderResourceProfile = Object.freeze({
    schemaVersion: 1,
    sample: base.sample as RenderResourceProfile["sample"],
    packIdentity: "application-leased-semantic-render-v1",
    fidelity: base.fidelity as RenderResourceProfile["fidelity"],
    networkAllowed: false,
    automaticFallbackAllowed: false,
    assets: Object.freeze(assets),
    scene: base.scene as RenderResourceProfile["scene"],
    ordinaryVisibleProfile: visible,
    scoreGaugeSsAnimation: score,
  });
  return accepted(Object.freeze({ profile, provider: provider.value }));
}

async function readJson(
  lease: SimulatorResourceLease,
  logicalResource: string,
  file: string,
): Promise<SimulatorAssemblyResult<unknown>> {
  const view = await OriginalResourcePackageView.open(lease, logicalResource);
  if (view.status === "rejected") return rejected("resource-unavailable", view.failure.capability, view.failure.boundary);
  const parsed = view.value.requireJson(file);
  return parsed.status === "rejected"
    ? rejected("resource-decode", parsed.failure.capability, parsed.failure.boundary)
    : accepted(parsed.value);
}

function commonLogicalResource(file: string): string | null {
  if (file === "combo-number.png") return "atlas/bms/ui/iconcombonumber";
  if (file === "rhythm-game-additive.png" || file === "rhythm-game-ui.png") return "atlas/bms/ui/rhythmgameui";
  if (file.startsWith("tap-lane-effect-")) return "atlas/bms/ui/tap-lane-effect";
  if (file === "ui-additive-effect.png") return "atlas/bms/ui/ui-additive-effect";
  if (file === "ui-common.png") return "atlas/bms/ui/uicommon";
  if (file === "score-font.png") return "fonts/score/score";
  if (file === "rank-label-font.ttf") return "fonts/sgm";
  if (file === "startup-line-star.png") return "prefabs/bms/information";
  if (file.startsWith("high-rank-")) return "prefabs/bms/rhythmgamegauge/score";
  return null;
}

function parseSemanticCatalog(value: unknown): readonly SemanticEntry[] {
  const root = record(value);
  const groups = record(root?.groups);
  if (root?.schemaVersion !== 1 || groups === null) throw new Error("invalid common render semantic catalog");
  const output: SemanticEntry[] = [];
  for (const key of ["ordinaryVisible", "scoreHud", "startupDirection"]) {
    const values = groups[key];
    if (!Array.isArray(values)) throw new Error("invalid common render semantic group");
    for (const value of values) {
      const row = record(value);
      const profile = record(row?.profile);
      if (typeof row?.file !== "string" || profile === null || typeof profile.logicalAssetId !== "string") {
        throw new Error("invalid common render semantic entry");
      }
      output.push(Object.freeze({ file: row.file, profile: profile as unknown as SemanticEntry["profile"] }));
    }
  }
  return Object.freeze(output);
}

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}
function invalid<T>(capability: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, "Application-leased common render bytes and semantic profiles must remain complete and structurally compatible without fixed content eligibility hashes or fallback.");
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
