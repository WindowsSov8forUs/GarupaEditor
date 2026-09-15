import { clipNotePolygon, type NoteClipVertex as Vertex } from "../../engine/rendering/notePolygonClipping";
import { Container, Matrix, Mesh, MeshGeometry, Sprite } from "pixi.js";
import { coordinate, coordinateAdd, coordinateScale, type ExponentialCoordinate } from "../../engine/rendering/exponentialCoordinates";
import type { RenderCommand, RenderResourceProfile } from "../renderingContracts";

type Transform = Extract<RenderCommand, { kind: "set-transform" }>;
type ClipRecord = { mesh: Mesh | null; renderable: boolean };
type ExponentialMatrix = readonly [ExponentialCoordinate, ExponentialCoordinate, ExponentialCoordinate,
  ExponentialCoordinate, ExponentialCoordinate, ExponentialCoordinate];

function appendExponential(m: ExponentialMatrix, local: Matrix): ExponentialMatrix {
  const mix = (a: number, b: number, x: number, y: number) => coordinateAdd(coordinateScale(m[a]!, x), coordinateScale(m[b]!, y));
  return [mix(0, 2, local.a, local.b), mix(1, 3, local.a, local.b),
    mix(0, 2, local.c, local.d), mix(1, 3, local.c, local.d),
    coordinateAdd(m[4], mix(0, 2, local.tx, local.ty)), coordinateAdd(m[5], mix(1, 3, local.tx, local.ty))];
}

/** Host-space clipping for the same Sprite leaves, including animated child icons. */
export class NoteViewportClipper {
  private readonly records = new Map<Sprite, ClipRecord>();
  constructor(private readonly attach: (sprite: Sprite, mesh: Mesh) => void,
    private readonly detach: (mesh: Mesh) => void) {}

  get active(): boolean { return this.records.size > 0; }

  restore(): void {
    for (const [sprite, record] of this.records) {
      if (!sprite.destroyed) sprite.renderable = record.renderable;
      if (record.mesh && !record.mesh.destroyed) record.mesh.visible = false;
    }
  }

  update(roots: Iterable<{ node: Container; command: Transform }>, profile: RenderResourceProfile): void {
    const used = new Set<Sprite>();
    const projection = profile.scene.projection;
    for (const { node, command } of roots) {
      const raw = command.unclipped;
      if (!raw || node.destroyed || !node.visible) continue;
      const carrier = node.getGlobalTransform();
      const parent = node.parent?.getGlobalTransform() ?? new Matrix();
      const deltaX = (raw.x - command.position.x.value) * projection.pixelsPerWorldUnit;
      const deltaY = -(raw.y - command.position.y.value) * projection.pixelsPerWorldUnit;
      const sx = command.scale.x.value === 0 && raw.scaleX === 0 ? 1 : raw.scaleX / command.scale.x.value,
        sy = command.scale.y.value === 0 && raw.scaleY === 0 ? 1 : raw.scaleY / command.scale.y.value;
      const actual = new Matrix(carrier.a * sx, carrier.b * sx, carrier.c * sy, carrier.d * sy,
        carrier.tx + parent.a * deltaX + parent.c * deltaY,
        carrier.ty + parent.b * deltaX + parent.d * deltaY);
      const e = raw.exponential;
      const dx = e ? coordinateScale(coordinateAdd(e.x, coordinate(-command.position.x.value)), projection.pixelsPerWorldUnit) : undefined;
      const dy = e ? coordinateScale(coordinateAdd(e.y, coordinate(-command.position.y.value)), -projection.pixelsPerWorldUnit) : undefined;
      const exponential: ExponentialMatrix | undefined = e ? [coordinateScale(e.scaleX, carrier.a / command.scale.x.value),
        coordinateScale(e.scaleX, carrier.b / command.scale.x.value), coordinateScale(e.scaleY, carrier.c / command.scale.y.value),
        coordinateScale(e.scaleY, carrier.d / command.scale.y.value),
        coordinateAdd(coordinate(carrier.tx), coordinateScale(dx!, parent.a), coordinateScale(dy!, parent.c)),
        coordinateAdd(coordinate(carrier.ty), coordinateScale(dx!, parent.b), coordinateScale(dy!, parent.d))] : undefined;
      const visit = (current: Container, actualParent: Matrix, carrierParent: Matrix, wideParent?: ExponentialMatrix): void => {
        if (current.destroyed || !current.visible) return;
        current.updateLocalTransform();
        const actualTransform = actualParent.clone().append(current.localTransform);
        const carrierTransform = carrierParent.clone().append(current.localTransform);
        const wide = wideParent ? appendExponential(wideParent, current.localTransform) : undefined;
        if (current instanceof Sprite && current.renderable) {
          used.add(current);
          const texture = current.texture, trim = texture.trim, orig = texture.orig;
          const x = (trim?.x ?? 0) - current.anchor.x * orig.width;
          const y = (trim?.y ?? 0) - current.anchor.y * orig.height;
          const width = trim?.width ?? orig.width, height = trim?.height ?? orig.height;
          const vertex = (px: number, py: number, u: number, v: number): Vertex => wide ? { x: 0, y: 0, u, v,
            exponential: [coordinateAdd(coordinateScale(wide[0], px), coordinateScale(wide[2], py), wide[4]),
              coordinateAdd(coordinateScale(wide[1], px), coordinateScale(wide[3], py), wide[5])] } : ({
            x: actualTransform.a * px + actualTransform.c * py + actualTransform.tx,
            y: actualTransform.b * px + actualTransform.d * py + actualTransform.ty, u, v });
          const quad = [vertex(x, y, 0, 0), vertex(x + width, y, 1, 0),
            vertex(x + width, y + height, 1, 1), vertex(x, y + height, 0, 1)];
          if (quad.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
            throw new Error("Note clipping exceeds finite host coordinates.");
          const clipped = clipNotePolygon(quad, [0, 0, projection.viewportWidth, projection.viewportHeight]);
          let record = this.records.get(current);
          if (!record) { record = { mesh: null, renderable: current.renderable }; this.records.set(current, record); }
          current.renderable = false;
          if (clipped.length >= 3) {
            const inverse = carrierParent.clone().invert();
            const positions = new Float32Array(clipped.length * 2), uvs = new Float32Array(positions.length);
            for (const [i, point] of clipped.entries()) {
              positions[i * 2] = inverse.a * point.x + inverse.c * point.y + inverse.tx;
              positions[i * 2 + 1] = inverse.b * point.x + inverse.d * point.y + inverse.ty;
              uvs[i * 2] = point.u; uvs[i * 2 + 1] = point.v;
            }
            if (!positions.every(Number.isFinite)) throw new Error("Clipped Note vertices exceed GPU coordinates.");
            const indices = new Uint32Array((clipped.length - 2) * 3);
            for (let i = 0; i < clipped.length - 2; i++) indices.set([0, i + 1, i + 2], i * 3);
            if (!record.mesh || record.mesh.destroyed) {
              record.mesh = new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices }), texture });
              record.mesh.label = "clipped-note-sprite";
              current.parent!.addChildAt(record.mesh, current.parent!.getChildIndex(current) + 1);
            } else {
              const previous = record.mesh.geometry as MeshGeometry;
              previous.positions = positions; previous.uvs = uvs; previous.indices = indices;
              record.mesh.texture = texture;
            }
            record.mesh.visible = true; record.mesh.alpha = current.alpha; record.mesh.tint = current.tint;
            record.mesh.blendMode = current.blendMode; record.mesh.filters = [...current.filters];
            record.mesh.mask = current.mask;
            this.attach(current, record.mesh);
          }
        }
        // Clipped Mesh siblings are deliberately not traversed or given ownership.
        for (const child of [...current.children]) if (!(child instanceof Mesh))
          visit(child, actualTransform, carrierTransform, wide);
      };
      for (const child of [...node.children]) if (!(child instanceof Mesh)) visit(child, actual, carrier, exponential);
    }
    for (const [sprite, record] of this.records) if (!used.has(sprite)) {
      this.release(record); this.records.delete(sprite);
    }
  }
  dispose(): void {
    this.restore();
    for (const record of this.records.values()) this.release(record);
    this.records.clear();
  }
  private release(record: ClipRecord): void {
    if (record.mesh && !record.mesh.destroyed) {
      this.detach(record.mesh); record.mesh.geometry.destroy(); record.mesh.destroy();
    }
  }
}
