import { Container, RenderLayer } from "pixi.js";

export const PIXI_GAMEPLAY_RENDER_ORDER_LABEL = "GarupaSimulatorGameplayRenderOrder";

export interface PixiGameplayDrawOrder {
  readonly sortingOrder: number;
  readonly distance: number;
  readonly rendererType: 1 | 3 | 6 | 7;
  /** Existing same-type submission order; native material/resource ties remain a separate consumer. */
  readonly sameTypeSequence: number;
}

/** C30/C36/C39: current gameplay layers are0, queues3000, and source groups absent. */
export function compareGameplayDrawOrder(left: PixiGameplayDrawOrder, right: PixiGameplayDrawOrder): number {
  return left.sortingOrder - right.sortingOrder || left.distance - right.distance ||
    left.rendererType - right.rendererType || left.sameTypeSequence - right.sameTypeSequence;
}

/** C38/C204: planar note transforms compose local Z through every parent before view distance. */
export function calculateGameplayWorldZ(
  centerZ: number,
  leafToRoot: readonly { readonly positionZ: number; readonly scaleZ: number | undefined }[],
): number {
  let originZ = 0;
  let worldScaleZ = 1;
  for (const transform of leafToRoot) {
    // A planar Sprite center at0 is independent of its own finite Z scale.
    // Nonzero child offsets require the parent's explicitly transported scale.
    if (originZ !== 0 || centerZ !== 0) {
      if (transform.scaleZ === undefined) throw new Error("Nonzero renderer depth requires an explicit parent Z scale.");
      originZ = Math.fround(originZ * transform.scaleZ);
      if (centerZ !== 0) worldScaleZ = Math.fround(worldScaleZ * transform.scaleZ);
    }
    originZ = Math.fround(transform.positionZ + originZ);
  }
  // Native bounds apply the completed matrix to the local center. Transforming
  // the center at each ancestor would round in a different order.
  return Math.fround(originZ + (centerZ === 0 ? 0 : Math.fround(worldScaleZ * centerZ)));
}

/** RenderLayer changes draw order while retaining the logical parent, its transform and visibility. */
export class PixiGameplayRenderOrder {
  private readonly orders = new WeakMap<Container, () => PixiGameplayDrawOrder>();
  readonly layer = new RenderLayer({
    sortableChildren: true,
    sortFunction: (left, right) => {
      const leftOrder = this.orders.get(left);
      const rightOrder = this.orders.get(right);
      if (leftOrder === undefined || rightOrder === undefined) {
        throw new Error("Gameplay render layer received an unregistered draw owner.");
      }
      return compareGameplayDrawOrder(leftOrder(), rightOrder());
    },
  });

  constructor() {
    this.layer.label = PIXI_GAMEPLAY_RENDER_ORDER_LABEL;
  }

  attach(node: Container, order: () => PixiGameplayDrawOrder): void {
    this.orders.set(node, order);
    if (node.parentRenderLayer !== this.layer) this.layer.attach(node);
    else this.invalidate();
  }

  detach(node: Container): void {
    if (node.parentRenderLayer === this.layer) this.layer.detach(node);
    this.orders.delete(node);
  }

  private invalidate(): void {
    // RenderLayer sorts during instruction collection. Changing only a key
    // would otherwise leave the previous cached instruction order in use.
    const group = this.layer.renderGroup ?? this.layer.parentRenderGroup;
    if (group !== null) group.structureDidChange = true;
  }

  mount(ordinaryStage: Container): void {
    // This is the existing application gameplay/HUD phase boundary, not a native sorting key.
    this.layer.zIndex = 3_100_000;
    ordinaryStage.addChild(this.layer);
  }

  dispose(): void {
    if (!this.layer.destroyed) {
      this.invalidate();
      this.layer.detachAll();
      this.layer.destroy({ children: false });
    }
  }
}
