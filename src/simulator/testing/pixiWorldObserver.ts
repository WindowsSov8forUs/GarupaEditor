import {
  Container,
  Graphics,
  Mesh,
  NineSliceSprite,
  Sprite,
  Text,
  type Bounds,
  type Matrix,
} from "pixi.js";

export interface PixiWorldObservationRecord {
  readonly path: string;
  readonly label: string;
  readonly parent: string | null;
  readonly localMatrix: readonly [number, number, number, number, number, number];
  readonly worldMatrix: readonly [number, number, number, number, number, number];
  readonly localBounds: readonly [number, number, number, number] | null;
  readonly worldBounds: readonly [number, number, number, number] | null;
  readonly anchor: readonly [number, number] | null;
  readonly size: readonly [number, number];
  readonly visible: boolean;
  readonly renderable: boolean;
  readonly alpha: number;
  readonly tint: number | null;
  readonly blend: string;
  readonly order: readonly [number, number];
  readonly mask: string | null;
  readonly texture: {
    readonly label: string;
    readonly sourceLabel: string;
    readonly alphaMode: string;
    readonly frame: readonly [number, number, number, number];
  } | null;
  readonly geometry: {
    readonly vertexCount: number;
    readonly indexCount: number;
    readonly positionBounds: readonly [number, number, number, number] | null;
  } | null;
}

export interface PixiWorldObservation {
  readonly schemaVersion: 1;
  readonly kind: "testing-pixi-world-observer";
  readonly records: readonly PixiWorldObservationRecord[];
}

type TupleMatrix = readonly [number, number, number, number, number, number];
type TupleBounds = readonly [number, number, number, number];

interface MutableObservationRecord extends Omit<PixiWorldObservationRecord, "worldBounds"> {
  worldBounds: TupleBounds | null;
}

export function observePixiWorld(root: Container): PixiWorldObservation {
  if (!(root instanceof Container) || root.destroyed) {
    throw new Error("world observer requires one live Pixi Container root");
  }
  const records: MutableObservationRecord[] = [];
  visit(root, null, root.label || "<root>", Object.freeze([1, 0, 0, 1, 0, 0]), records);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    for (const child of records) {
      if (child.parent === record.path && child.worldBounds !== null) {
        record.worldBounds = union(record.worldBounds, child.worldBounds);
      }
    }
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "testing-pixi-world-observer" as const,
    records: Object.freeze(records.map((record) => Object.freeze({
      ...record,
      worldBounds: record.worldBounds === null ? null : Object.freeze(record.worldBounds),
    }))),
  });
}

function visit(
  node: Container,
  parentPath: string | null,
  path: string,
  parentWorld: TupleMatrix,
  records: MutableObservationRecord[],
): void {
  node.updateLocalTransform();
  const localMatrix = matrix(node.localTransform);
  const worldMatrix = multiply(parentWorld, localMatrix);
  const localBounds = ownLocalBounds(node);
  const worldBounds = localBounds === null ? null : transformBounds(localBounds, worldMatrix);
  const anchor = "anchor" in node && isPointLike(node.anchor)
    ? Object.freeze([node.anchor.x, node.anchor.y] as const)
    : null;
  const ownSize = node instanceof Sprite || node instanceof NineSliceSprite
    ? Object.freeze([node.width, node.height] as const)
    : localBounds === null
      ? Object.freeze([0, 0] as const)
      : Object.freeze([localBounds[2], localBounds[3]] as const);
  records.push({
    path,
    label: node.label || "",
    parent: parentPath,
    localMatrix,
    worldMatrix,
    localBounds,
    worldBounds,
    anchor,
    size: ownSize,
    visible: node.visible,
    renderable: node.renderable,
    alpha: node.alpha,
    tint: "tint" in node && typeof node.tint === "number" ? Number(node.tint) : null,
    blend: String(node.blendMode),
    order: Object.freeze([
      node.parent === null ? 0 : node.parent.getChildIndex(node),
      node.zIndex,
    ] as const),
    mask: node.mask instanceof Container ? node.mask.label : null,
    texture: node instanceof Sprite
      ? Object.freeze({
          label: node.texture.label ?? "",
          sourceLabel: node.texture.source.label ?? "",
          alphaMode: node.texture.source.alphaMode,
          frame: Object.freeze([
            node.texture.frame.x,
            node.texture.frame.y,
            node.texture.frame.width,
            node.texture.frame.height,
          ] as const),
        })
      : null,
    geometry: node instanceof Mesh ? observeGeometry(node) : null,
  });
  node.children.forEach((child, index) => {
    const childLabel = child.label || child.constructor.name;
    visit(child, path, `${path}/${childLabel}[${index}]`, worldMatrix, records);
  });
}

function ownLocalBounds(node: Container): TupleBounds | null {
  if (node instanceof Sprite) {
    const width = node.texture.orig.width;
    const height = node.texture.orig.height;
    return Object.freeze([
      -node.anchor.x * width,
      -node.anchor.y * height,
      width,
      height,
    ] as const);
  }
  if (node instanceof NineSliceSprite) {
    return Object.freeze([
      -node.anchor.x * node.width,
      -node.anchor.y * node.height,
      node.width,
      node.height,
    ] as const);
  }
  if (node instanceof Text) return null;
  if (node instanceof Mesh || node instanceof Graphics) return pixiBounds(node.getLocalBounds());
  return null;
}

function observeGeometry(node: Mesh): PixiWorldObservationRecord["geometry"] {
  const attributes = node.geometry.attributes as Record<string, {
    readonly buffer: { readonly data: ArrayLike<number> };
  }>;
  const position = attributes.aPosition?.buffer.data ?? null;
  const indices = node.geometry.indexBuffer?.data ?? null;
  if (position === null) {
    return Object.freeze({ vertexCount: 0, indexCount: indices?.length ?? 0, positionBounds: null });
  }
  const values = Array.from(position);
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  return Object.freeze({
    vertexCount: Math.floor(values.length / 2),
    indexCount: indices?.length ?? 0,
    positionBounds: xs.length === 0 || ys.length === 0
      ? null
      : Object.freeze([
          Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys),
        ] as const),
  });
}

function matrix(value: Matrix): TupleMatrix {
  return Object.freeze([value.a, value.b, value.c, value.d, value.tx, value.ty] as const);
}

function multiply(parent: TupleMatrix, local: TupleMatrix): TupleMatrix {
  return Object.freeze([
    parent[0] * local[0] + parent[2] * local[1],
    parent[1] * local[0] + parent[3] * local[1],
    parent[0] * local[2] + parent[2] * local[3],
    parent[1] * local[2] + parent[3] * local[3],
    parent[0] * local[4] + parent[2] * local[5] + parent[4],
    parent[1] * local[4] + parent[3] * local[5] + parent[5],
  ] as const);
}

function transformBounds(bounds: TupleBounds, transform: TupleMatrix): TupleBounds {
  const [x, y, width, height] = bounds;
  const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]] as const;
  const points = corners.map(([localX, localY]) => [
    transform[0] * localX + transform[2] * localY + transform[4],
    transform[1] * localX + transform[3] * localY + transform[5],
  ] as const);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return Object.freeze([minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY] as const);
}

function pixiBounds(value: Bounds): TupleBounds | null {
  const result = [
    value.minX,
    value.minY,
    value.maxX - value.minX,
    value.maxY - value.minY,
  ] as const;
  return result.every(Number.isFinite) ? Object.freeze(result) : null;
}

function union(left: TupleBounds | null, right: TupleBounds): TupleBounds {
  if (left === null) return right;
  const minX = Math.min(left[0], right[0]);
  const minY = Math.min(left[1], right[1]);
  const maxX = Math.max(left[0] + left[2], right[0] + right[2]);
  const maxY = Math.max(left[1] + left[3], right[1] + right[3]);
  return [minX, minY, maxX - minX, maxY - minY];
}

function isPointLike(value: unknown): value is { readonly x: number; readonly y: number } {
  return value !== null && typeof value === "object" &&
    typeof (value as { readonly x?: unknown }).x === "number" &&
    typeof (value as { readonly y?: unknown }).y === "number";
}
