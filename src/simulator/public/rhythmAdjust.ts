import authored from "../../data/originalRhythmAdjust.json";
import { prepareLeasedDefaultParticleProvider } from "../assembly/leasedDefaultParticlePreparation";
import { createOriginalPreviewParticleScene, type OriginalPreviewParticlePack } from "../backends/pixi/pixiSkinPreviewParticles";
import type { ParticlePortableProfile } from "../backends/particleContracts";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
export { sampleOrdinaryVisibleClip as sampleRhythmAdjustResultAnimation } from "../backends/ordinaryVisibleAnimation";

export async function prepareRhythmAdjustParticles(lease: SimulatorResourceLease): Promise<OriginalPreviewParticlePack> {
  const provider = await prepareLeasedDefaultParticleProvider(lease);
  if (provider.status !== "accepted") throw new Error(provider.failure.boundary);
  const pack = await provider.value.readPreparedSkinPack!();
  if (pack.status !== "accepted") throw new Error(pack.failure.boundary);
  return { ...pack.value, previewSources: { ordinary: "original-rhythm-adjust-prefab" } };
}

/** Authored calibration particles use the shared simulation/material/geometry consumers. */
export async function createRhythmAdjustParticles(pack: OriginalPreviewParticlePack, ready: boolean) {
  const source = authored.particles[ready ? "rhythmadjustreadydialog" : "rhythmadjustdialog"];
  const base = pack.profile.bundles.find(bundle => bundle.key === "ordinary")!;
  const profiles: Record<string, any> = {}, moduleProfiles: Record<string, Record<string, any>> = {};
  const rendererProfiles: Record<string, any> = {};
  const systems = source.systems.map((entry, index) => {
    const original = base.systems.find(system => system.path === entry.path)!;
    const definition = base.profiles[original.profile]!;
    const raw = entry.particle as Record<string, any>, key = `rhythm-adjust-${index}`;
    const modules: Record<string, string> = {};
    // The portable module table contains executable modules only. Serialized
    // prefabs also retain settings for disabled modules; those must stay dormant.
    for (const [name, value] of Object.entries(raw)) {
      if (!name.endsWith("Module") || !value || typeof value !== "object" || value.enabled !== true) continue;
      modules[name] = key; (moduleProfiles[name] ??= {})[key] = value;
    }
    const system = Object.fromEntries(Object.keys(definition.system).map(name =>
      [name, name === "moveWithCustomTransform" ? null : raw[name]]));
    profiles[key] = { system, modules, renderer: key };
    rendererProfiles[key] = { ...base.rendererProfiles[definition.renderer], ...entry.renderer,
      m_Materials: base.rendererProfiles[definition.renderer]!.m_Materials };
    return { ...original, profile: key, transform: entry.transform, parentTransforms: entry.parentTransforms,
      nativePlayActive: entry.activeInHierarchy, sourceOrdinal: index };
  });
  const profile = { ...pack.profile, systemCount: systems.length,
    bundles: [{ ...base, systems, profiles, moduleProfiles, rendererProfiles }] } as ParticlePortableProfile;
  const bits = (value: number) => {
    const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value);
    return "0x" + view.getUint32(0).toString(16).toUpperCase().padStart(8, "0");
  };
  const zero = bits(0), one = bits(1);
  return createOriginalPreviewParticleScene(pack, 100, { profile,
    instance: { kind: "skin-preview", buttonType: 0, rangeLength: null, particleSystemSetupScaleBits: one,
      ownerTransform: { source: "skin-preview-root", position: { xBits: zero, yBits: zero, zBits: zero },
        rotation: { xBits: zero, yBits: zero, zBits: zero, wBits: one },
        scale: { xBits: one, yBits: one, zBits: one } } },
  });
}
