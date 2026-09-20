import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import type { OriginalSkinSettings, ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import { prepareSelectedSkinSourcePackages } from "../resources/sourcePackageDecoder";
import { prepareLeasedDefaultParticleProvider } from "../assembly/leasedDefaultParticlePreparation";
import { prepareSkinParticleProvider, usesExactDefaultParticlePack } from "../assembly/skinParticlePreparation";
import { validateSelectedSkinParticlePack } from "../backends/particleValidation";
import type { OriginalPreviewParticlePack } from "../backends/pixi/pixiSkinPreviewParticles";
import type { SimulatorResourceLease, SimulatorResourceRequirement } from "../platform/resourceContracts";

export type { OriginalPreviewParticlePack } from "../backends/pixi/pixiSkinPreviewParticles";
export type { SimulatorResourceLease as OriginalPreviewParticleLease } from "../platform/resourceContracts";
export { createOriginalPreviewParticleScene, type OriginalPreviewParticleScene } from "../backends/pixi/pixiSkinPreviewParticles";
const defaultResource = "portable/profiles/default-particle";

/** Preview selection follows the same master/variant resolver and exact source decoder as live. */
export function originalPreviewParticleSelection(settings: OriginalSkinSettings) {
  const resolved = resolveOriginalSkinRecipe(settings, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard");
  if (resolved.status !== "ok") throw new Error(resolved.boundary);
  const recipe = resolved.value;
  const selected = usesExactDefaultParticlePack(recipe) ? [] : [
    { semanticRole: "preview.tap-effect", logicalResource: recipe.tapEffect.logicalResource! },
    { semanticRole: "preview.directional-effect", logicalResource: recipe.directional.effectLogicalResource },
  ];
  const requirements: readonly SimulatorResourceRequirement[] = [
    { semanticRole: "preview.default-particle", logicalResource: defaultResource, requiredFiles: null },
    ...selected.map(row => ({ ...row, requiredFiles: null })),
  ];
  return { key: `${recipe.tapEffect.logicalResource}|${recipe.directional.effectLogicalResource}`, recipe, requirements };
}

export async function prepareOriginalPreviewParticlePack(lease: SimulatorResourceLease,
  recipe: ResolvedOriginalSkinRecipe): Promise<OriginalPreviewParticlePack> {
  const defaults = await prepareLeasedDefaultParticleProvider(lease);
  if (defaults.status !== "accepted") throw new Error(defaults.failure.boundary);
  let provider = defaults.value;
  if (!usesExactDefaultParticlePack(recipe)) {
    const sources = await prepareSelectedSkinSourcePackages([
      { role: "tap-effect", logicalResource: recipe.tapEffect.logicalResource! },
      { role: "directional-effect", logicalResource: recipe.directional.effectLogicalResource },
    ], lease);
    if (sources.status !== "accepted") throw new Error(sources.failure.boundary);
    const prepared = prepareSkinParticleProvider(recipe, sources.value, provider);
    if (prepared.status !== "accepted") throw new Error(prepared.failure.boundary);
    provider = prepared.value;
  }
  const loaded = await provider.readPreparedSkinPack?.();
  if (!loaded || loaded.status !== "accepted")
    throw new Error(loaded?.failure.boundary ?? "Preview particle provider omitted its prepared source pack.");
  const validated = validateSelectedSkinParticlePack(loaded.value);
  if (validated.status !== "accepted") throw new Error(validated.failure.boundary);
  return { ...validated.value, previewSources: { ordinary: recipe.tapEffect.logicalResource!,
    directional: recipe.directional.effectLogicalResource } };
}
