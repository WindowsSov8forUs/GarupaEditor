import { Container, Texture } from "pixi.js";
import routes from "../../../data/originalSkinPreviewParticles.json";
import { DeterministicParticleSimulation } from "../../engine/particles/particleSimulation";
import { buildCurrentParticlePrimitives } from "../../engine/particles/particleGeometry";
import type { ParticleInstanceIdentity, ParticlePortableProfile, ParticlePreparedResourcePack,
  ParticleRootId, ParticleTransformProfile } from "../particleContracts";
import { applyTextureSettings } from "./pixiParticleRendererBackend";
import { createPixiParticleNativePrimitiveMesh, updatePixiParticleNativePrimitiveMesh,
  destroyPixiParticleLinearColorMesh, type PixiParticleLinearColorMesh } from "./pixiParticleLinearColorMesh";

const zero = "0x00000000", one = "0x3F800000";
const fields = routes.rootFields as Readonly<Record<string, { readonly root: string }>>;
const actions = routes.impactActions as Readonly<Record<string, readonly string[]>>;
function bits(value: number): string {
  const data = new DataView(new ArrayBuffer(4)); data.setFloat32(0, value);
  return `0x${data.getUint32(0).toString(16).toUpperCase().padStart(8, "0")}`;
}

/** Unity exposes Euler angles in Z-X-Y order; only the source slash child's Y is cleared. */
function clearSlashYaw(transform: ParticleTransformProfile): ParticleTransformProfile {
  const { x, y, z, w } = transform.m_LocalRotation;
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z))));
  const roll = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
  const sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
  const sz = Math.sin(roll / 2), cz = Math.cos(roll / 2);
  return { ...transform, m_LocalRotation: { x: sx * cz, y: -sx * sz, z: cx * sz, w: cx * cz } };
}

/** This is instance setup, not a modified asset or a second particle simulation. */
function previewProfile(source: ParticlePortableProfile, noteSize: number): ParticlePortableProfile {
  const scale = noteSize / routes.setup.noteSizeDivisor;
  const slash = routes.setup.flickChildLocalEulerOverride.path;
  return { ...source, bundles: source.bundles.map(bundle => ({ ...bundle,
    rendererProfiles: Object.fromEntries(Object.entries(bundle.rendererProfiles).map(([id, renderer]) => [id,
      renderer.m_RenderMode === 1 ? { ...renderer, m_LengthScale: renderer.m_LengthScale * scale } : renderer])),
    systems: bundle.systems.map(system => {
      if (bundle.key !== "ordinary" || !(system.path === slash || system.path.startsWith(`${slash}/`))) return system;
      const parts = system.path.split("/");
      return { ...system,
        transform: system.path === slash ? clearSlashYaw(system.transform) : system.transform,
        parentTransforms: system.parentTransforms.map((parent, index) =>
          parts.slice(0, index + 1).join("/") === slash ? clearSlashYaw(parent) : parent),
      };
    }),
  })) };
}

export interface OriginalPreviewParticlePack extends ParticlePreparedResourcePack {
  readonly previewSources: Readonly<Record<string, string>>;
}
export interface OriginalParticleSceneSetup {
  readonly profile: ParticlePortableProfile;
  readonly instance: ParticleInstanceIdentity;
}

export class OriginalPreviewParticleScene {
  private readonly simulations = new Map<string, DeterministicParticleSimulation>();
  private readonly layers = new Map<number, Container>();
  private parent: Container | null = null;
  private profile: ParticlePortableProfile;
  private readonly sourceProfile: ParticlePortableProfile;
  private readonly meshes = new Map<string, PixiParticleLinearColorMesh>();
  private readonly instance: ParticleInstanceIdentity;
  private disposed = false;
  sampleCount = 0;
  visibleRoots: readonly string[] = [];
  readonly impactCounts: Record<string, number> = {};

  constructor(private readonly pack: OriginalPreviewParticlePack, private readonly noteSize: number,
    private readonly textures: ReadonlyMap<string, Texture>, private readonly images: ReadonlySet<ImageBitmap>,
    setup?: OriginalParticleSceneSetup) {
    if (!Number.isFinite(noteSize) || noteSize < 80 || noteSize > 150)
      throw new Error("Preview particle size is outside the original setting domain.");
    this.profile = setup?.profile ?? previewProfile(pack.profile, noteSize);
    this.sourceProfile = this.profile;
    for (const bundle of this.profile.bundles) this.simulations.set(bundle.key,
      new DeterministicParticleSimulation({ ...this.profile, bundles: [bundle], systemCount: bundle.systems.length }));
    const [x, y, z] = routes.setup.parentLocalPosition;
    this.instance = setup?.instance ?? { kind: "skin-preview", buttonType: 0, rangeLength: null,
      particleSystemSetupScaleBits: bits(noteSize / routes.setup.noteSizeDivisor),
      ownerTransform: { source: "skin-preview-root",
        position: { xBits: bits(x!), yBits: bits(y!), zBits: bits(z!) },
        rotation: { xBits: zero, yBits: zero, zBits: zero, wBits: one },
        scale: { xBits: one, yBits: one, zBits: one } } };
  }

  restartRoot(root: ParticleRootId): void {
    const simulation = this.simulations.get(root.split(":")[0]!);
    simulation?.stopOwner(root);
    simulation?.playRoot(root, this.instance, root);
  }

  /** Parent animation affects emission transforms; Local particles retain their own size. */
  setParentTransform(parent: ParticleTransformProfile): void {
    const vector = (value: { x: number; y: number; z: number }) =>
      ({ x: Math.fround(value.x), y: Math.fround(value.y), z: Math.fround(value.z) });
    const encoded = { m_LocalPosition: vector(parent.m_LocalPosition), m_LocalScale: vector(parent.m_LocalScale),
      m_LocalRotation: { ...vector(parent.m_LocalRotation), w: Math.fround(parent.m_LocalRotation.w) } };
    this.profile = { ...this.sourceProfile, bundles: this.sourceProfile.bundles.map(bundle => {
      const systems = bundle.systems.map(system => ({ ...system,
        parentTransforms: [encoded, ...system.parentTransforms],
        parentParticleSystemFlags: [false, ...(system.parentParticleSystemFlags ?? system.parentTransforms.map(() => true))] }));
      this.simulations.get(bundle.key)!.updateSystemTransforms(systems.map(system => ({
        systemId: system.identity, transform: system.transform, parentTransforms: system.parentTransforms,
        parentParticleSystemFlags: system.parentParticleSystemFlags,
      })));
      return { ...bundle, systems };
    }) };
  }

  impact(noteType: number): void {
    if (this.disposed) return;
    const sequence = actions[String(noteType)];
    if (!sequence) throw new Error(`Unknown original preview impact ${noteType}.`);
    this.impactCounts[noteType] = (this.impactCounts[noteType] ?? 0) + 1;
    for (const action of sequence) {
      const [operation, field] = action.split(":");
      const root = fields[field!]?.root as ParticleRootId | undefined;
      if (!root) throw new Error(`Unknown original preview particle field ${field}.`);
      const simulation = this.simulations.get(root.split(":")[0]!)!;
      if (operation === "deactivate") simulation.stopOwner(field!);
      else simulation.playRoot(field!, this.instance, root);
    }
  }

  /** Skin update methods replace only their own effect objects; Play only clears the held effect. */
  retainUnchangedEffects(previous: OriginalPreviewParticleScene): void {
    if (previous.noteSize !== this.noteSize) return;
    for (const [key, simulation] of previous.simulations) {
      if (this.pack.previewSources[key] !== previous.pack.previewSources[key]) continue;
      this.simulations.get(key)?.clearAll(); this.simulations.set(key, simulation);
      previous.simulations.delete(key);
    }
  }

  restartNotes(): void { this.simulations.get("ordinary")?.stopOwner("longEffect"); }

  attachTo(parent: Container): void {
    this.parent = parent;
    for (const layer of this.layers.values()) parent.addChild(layer);
  }

  detach(): void {
    for (const layer of this.layers.values()) layer.removeFromParent();
    this.parent = null;
  }

  advance(delta: number, width: number, height: number, projection: number,
    nearClip: number, farClip: number, camera: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    for (const simulation of this.simulations.values()) simulation.step(delta, false);
    const samples = [...this.simulations.values()].flatMap(simulation => [...simulation.samples()]);
    this.sampleCount = samples.length;
    this.visibleRoots = [...new Set(samples.map(sample => sample.root))];
    const primitives = buildCurrentParticlePrimitives(this.profile, {
      viewportWidth: width, viewportHeight: height, worldCenterXBits: bits(camera.x), worldCenterYBits: bits(camera.y),
      pixelsPerWorldUnitBits: bits(projection),
      orthographicSizeBits: bits(height / (2 * projection)), cameraZBits: bits(camera.z),
      cameraNearClipBits: bits(nearClip), cameraFarClipBits: bits(farClip),
      roundPixels: false, buttonAnchors: [],
    }, samples);
    const alive = new Set<string>();
    const layerIndices = new Map<number, number>();
    for (const primitive of primitives) {
      const texture = this.textures.get(primitive.logicalTextureId);
      if (!texture) throw new Error(`Missing prepared preview particle texture ${primitive.logicalTextureId}.`);
      alive.add(primitive.particleId);
      let layer = this.layers.get(primitive.sortingOrder);
      if (!layer) {
        layer = new Container(); layer.zIndex = primitive.sortingOrder;
        this.layers.set(primitive.sortingOrder, layer); this.parent?.addChild(layer);
      }
      layer.position.set(-width / 2, -height / 2);
      const index = layerIndices.get(primitive.sortingOrder) ?? 0;
      layerIndices.set(primitive.sortingOrder, index + 1);
      let mesh = this.meshes.get(primitive.particleId);
      if (mesh) updatePixiParticleNativePrimitiveMesh(mesh, texture, primitive);
      else {
        mesh = createPixiParticleNativePrimitiveMesh(texture, primitive);
        this.meshes.set(primitive.particleId, mesh); layer.addChild(mesh);
      }
      layer.setChildIndex(mesh, index);
    }
    for (const [id, mesh] of this.meshes) if (!alive.has(id)) {
      destroyPixiParticleLinearColorMesh(mesh); this.meshes.delete(id);
    }
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const mesh of this.meshes.values()) destroyPixiParticleLinearColorMesh(mesh);
    this.meshes.clear();
    for (const simulation of this.simulations.values()) simulation.clearAll();
    this.simulations.clear();
    for (const layer of this.layers.values()) layer.destroy();
    this.layers.clear(); this.parent = null;
    for (const texture of this.textures.values()) texture.destroy(true);
    for (const image of this.images) image.close();
  }
}

export async function createOriginalPreviewParticleScene(pack: OriginalPreviewParticlePack,
  noteSize: number, setup?: OriginalParticleSceneSetup): Promise<OriginalPreviewParticleScene> {
  const entries = new Map(pack.textures.entries.map(entry => [entry.logicalAssetId, entry]));
  const resolve = (id: string): string => {
    const visited = new Set<string>();
    while (!pack.pngBytes.has(id)) {
      if (visited.has(id)) throw new Error("Cyclic preview particle texture alias.");
      visited.add(id);
      const entry = entries.get(id);
      const next = entry && "aliasOf" in entry ? entry.aliasOf : undefined;
      if (!next) throw new Error(`Missing encoded preview particle texture ${id}.`);
      id = next;
    }
    return id;
  };
  const textures = new Map<string, Texture>(), images = new Set<ImageBitmap>();
  try {
    const ids = [...new Set([...entries.keys()].map(resolve))];
    const decoded = await Promise.allSettled(ids.map(async id => {
      const bytes = Uint8Array.from(pack.pngBytes.get(id)!);
      const image = await createImageBitmap(new Blob([bytes.buffer], { type: "image/png" }),
        { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      images.add(image); return [id, image] as const;
    }));
    const failed = decoded.find(item => item.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const byId = new Map(decoded.map(item => (item as PromiseFulfilledResult<readonly [string, ImageBitmap]>).value));
    for (const bundle of pack.profile.bundles) for (const metadata of bundle.textures) {
      const id = `particle-texture:${bundle.key}:${metadata.name}`, image = byId.get(resolve(id));
      if (!image || image.width !== metadata.width || image.height !== metadata.height)
        throw new Error(`Invalid decoded preview particle texture ${id}.`);
      const texture = Texture.from(image, true);
      applyTextureSettings(texture, metadata.wrapU!, metadata.wrapV!);
      textures.set(id, texture);
    }
    return new OriginalPreviewParticleScene(pack, noteSize, textures, images, setup);
  } catch (error) {
    for (const texture of textures.values()) texture.destroy(true);
    for (const image of images) image.close();
    throw error;
  }
}
