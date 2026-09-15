import { Container } from "pixi.js";
import type { CurrentScoreHudNativeProfile } from "../../resources/currentScoreHudNativeProfile";

export interface NguiScoreSceneGraph {
  readonly gameObjects: ReadonlyMap<string, Container>;
  readonly highRankEffect: Container;
  readonly progress: Container;
  readonly rankObject: Container;
}

export function createNguiScoreSceneGraph(
  content: Container,
  componentNodes: ReadonlyMap<string, Container>,
  profile: CurrentScoreHudNativeProfile,
): NguiScoreSceneGraph {
  const gameObjects = new Map<string, Container>([[profile.scene.rootPath, content]]);
  const ordered = [...profile.scene.objects]
    .filter((row) => row.path !== profile.scene.rootPath)
    .sort((left, right) => left.path.split("/").length - right.path.split("/").length ||
      left.parentPath!.localeCompare(right.parentPath!) || left.siblingIndex - right.siblingIndex);
  for (const row of ordered) {
    const parent = gameObjects.get(row.parentPath!);
    if (parent === undefined) throw new Error(`Score scene parent is missing: ${row.parentPath}`);
    const node = new Container({ label: row.path, sortableChildren: true, visible: row.activeSerialized });
    node.eventMode = "none";
    node.position.set(row.localPosition[0], -row.localPosition[1]);
    node.scale.set(row.localScale[0], row.localScale[1]);
    node.rotation = reflectedQuaternionZRadians(row.localRotation);
    parent.addChild(node);
    gameObjects.set(row.path, node);
    const component = componentNodes.get(row.path);
    if (component !== undefined) {
      component.removeFromParent();
      component.position.set(0, 0);
      component.scale.set(1, 1);
      component.rotation = 0;
      node.addChild(component);
    }
  }
  const highRankEffect = required(gameObjects, `${profile.scene.rootPath}/Progress/Panel/HighRankEffect`);
  const progress = required(gameObjects, `${profile.scene.rootPath}/Progress`);
  const rankObject = required(gameObjects, `${profile.scene.rootPath}/Progress/RankObject`);
  return Object.freeze({ gameObjects, highRankEffect, progress, rankObject });
}

export function reflectedQuaternionZRadians(
  quaternion: readonly [number, number, number, number],
): number {
  const native = Math.atan2(
    2 * (quaternion[3] * quaternion[2] + quaternion[0] * quaternion[1]),
    1 - 2 * (quaternion[1] * quaternion[1] + quaternion[2] * quaternion[2]),
  );
  return Math.fround(-native);
}

function required(values: ReadonlyMap<string, Container>, path: string): Container {
  const value = values.get(path);
  if (value === undefined) throw new Error(`Score scene object is missing: ${path}`);
  return value;
}
