import { Container, type Texture } from "pixi.js";
import profile from "../../../data/simulator/resultEffectsProfile.json";
import { DeterministicParticleSimulation } from "../../engine/particles/particleSimulation";
import { buildCurrentParticlePrimitives } from "../../engine/particles/particleGeometry";
import type { ParticleInstanceIdentity, ParticlePixiSceneProfile, ParticlePortableProfile, ParticleSystemDefinition } from "../particleContracts";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import type { PixiResultWidgetGraph } from "./pixiResultWidgetGraph";
import { createPixiParticleNativePrimitiveMesh, updatePixiParticleNativePrimitiveMesh,
  destroyPixiParticleLinearColorMesh, type PixiParticleLinearColorMesh } from "./pixiParticleLinearColorMesh";

const source = profile.particles as unknown as ParticlePortableProfile;
const zero = "0x00000000", one = "0x3F800000";

/** Result UI owns activation; simulation and material geometry use the gameplay implementation. */
export class PixiResultParticles {
  readonly root = new Container();
  private readonly simulation = new DeterministicParticleSimulation(source);
  private readonly systems: readonly ParticleSystemDefinition[];
  private readonly active = new Set<string>();
  private readonly meshes = new Map<string, PixiParticleLinearColorMesh>();
  private readonly instance: ParticleInstanceIdentity;
  private readonly sourceRoot: "result:rank" | "result:banner";
  private readonly depth: number;

  constructor(private readonly graph: PixiResultWidgetGraph, kind: "rank" | "banner",
    private readonly layout: OriginalSurfaceLayout, private readonly texture: (name: string) => Texture) {
    this.sourceRoot = `result:${kind}`;
    this.systems = source.bundles[0]!.systems.filter(s => s.root === this.sourceRoot);
    const scale = bits(layout.ui.screenToSafeChildScale / layout.camera.pixelsPerWorldUnit);
    this.instance = { kind: "result-ui", buttonType: 0, rangeLength: null, particleSystemSetupScaleBits: one,
      ownerTransform: { source: "result-ui-root", position: { xBits: zero, yBits: zero, zBits: zero },
        rotation: { xBits: zero, yBits: zero, zBits: zero, wBits: one },
        scale: { xBits: scale, yBits: scale, zBits: scale } } };
    // cUIRenderQueue places particles after the referenced widget's atlas draw call.
    this.depth = Math.max(...[...graph.sprites.values()].map(s => s.zIndex)) + 1;
  }

  advance(delta: number): void {
    this.simulation.updateSystemTransforms(this.systems.map(s => {
      const parts = s.path.split("/");
      const paths = ["", ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))];
      return { systemId: s.identity, transform: this.graph.particleTransform(s.path, s.transform),
        parentTransforms: s.parentTransforms.map((t, i) => this.graph.particleTransform(paths[i]!, t)) };
    }));
    for (const system of this.systems) {
      let node: Container | null = this.graph.nodes.get(system.path)!;
      let visible = true;
      while (node !== null) { if (!node.visible) { visible = false; break; } node = node.parent; }
      if (visible && !this.active.has(system.identity)) {
        this.simulation.playRootSystems(this.sourceRoot, this.instance, this.sourceRoot, [system.identity]);
        this.active.add(system.identity);
      } else if (!visible && this.active.delete(system.identity)) {
        this.simulation.deactivateRootSystems(this.sourceRoot, [system.identity]);
      }
    }
    if (this.active.size === 0 && this.meshes.size === 0) return;
    this.simulation.step(delta, false);
    // Particle geometry is in this container's backing-pixel space, not Pixi's
    // global space, which also includes the host stage's screen/canvas scale.
    const origin = this.root.toLocal({ x: 0, y: 0 }, this.graph.root);
    const { viewportWidth: width, viewportHeight: height } = this.layout.surface;
    const pixelScale = this.layout.camera.pixelsPerWorldUnit;
    const scene: ParticlePixiSceneProfile = { viewportWidth: width, viewportHeight: height,
      worldCenterXBits: bits((width / 2 - origin.x) / pixelScale),
      worldCenterYBits: bits((origin.y - height / 2) / pixelScale), pixelsPerWorldUnitBits: bits(pixelScale),
      roundPixels: false, buttonAnchors: [] };
    const primitives = buildCurrentParticlePrimitives(source, scene, this.simulation.samples());
    const alive = new Set<string>();
    for (const [index, primitive] of primitives.entries()) {
      alive.add(primitive.particleId);
      const existing = this.meshes.get(primitive.particleId);
      if (existing !== undefined) updatePixiParticleNativePrimitiveMesh(existing,
        this.texture(primitive.logicalTextureId.slice("particle-texture:result:".length)), primitive);
      else {
        const mesh = createPixiParticleNativePrimitiveMesh(this.texture(primitive.logicalTextureId.slice("particle-texture:result:".length)), primitive);
        this.root.addChild(mesh); this.graph.order.attach(mesh); this.meshes.set(primitive.particleId, mesh);
      }
      this.meshes.get(primitive.particleId)!.zIndex = this.depth + index / (primitives.length + 1);
    }
    for (const [id, mesh] of this.meshes) if (!alive.has(id)) {
      this.graph.order.detach(mesh); destroyPixiParticleLinearColorMesh(mesh); this.meshes.delete(id);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) { this.graph.order.detach(mesh); destroyPixiParticleLinearColorMesh(mesh); }
    this.meshes.clear(); this.active.clear(); this.simulation.clearAll(); this.root.destroy();
  }
}

function bits(value: number): string {
  const buffer = new ArrayBuffer(4); const view = new DataView(buffer);
  view.setFloat32(0, value); return "0x" + view.getUint32(0).toString(16).toUpperCase().padStart(8, "0");
}
