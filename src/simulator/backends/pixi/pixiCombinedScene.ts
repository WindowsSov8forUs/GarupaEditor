import { Container } from "pixi.js";
import { PIXI_MV_LIVE_STAGE_LABEL } from "./pixiMvLiveBackend";
import { evidenceRequired, ok, type SimulatorResult } from "../../engine/evidence";
import type { PixiStartupDirectionScene } from "./pixiStartupDirectionScene";
import type { StartupDirectionSceneState } from "../../scene/startupDirectionScene";

export const PIXI_COMBINED_SCENE_LABEL = "GarupaSimulatorCombinedScene";
export const PIXI_PARTICLE_STAGE_LABEL = "GarupaSimulatorParticles";
export const PIXI_ORDINARY_STAGE_LABEL = "GarupaSimulatorRoot";

export interface PixiCombinedSceneSnapshot {
  readonly state: "attached" | "disposed";
  readonly rootLabel: typeof PIXI_COMBINED_SCENE_LABEL;
  readonly childLabels: readonly string[];
  readonly rootParentAttached: boolean;
  readonly particleStageParentIsRoot: boolean;
  readonly ordinaryStageParentIsRoot: boolean;
  readonly mvStageParentIsRoot: boolean | null;
  readonly startupBackgroundParentIsRoot: boolean | null;
  readonly startupForegroundParentIsRoot: boolean | null;
}

export interface PixiCombinedScene {
  readonly root: Container;
  applyStartupState(state: StartupDirectionSceneState): SimulatorResult<void>;
  snapshot(): PixiCombinedSceneSnapshot;
  dispose(): SimulatorResult<void>;
}

export function createPixiCombinedScene(
  particleStage: Container,
  ordinaryStage: Container,
  startupScene?: PixiStartupDirectionScene,
  mvStage?: Container,
): SimulatorResult<PixiCombinedScene> {
  if (
    !(particleStage instanceof Container) || !(ordinaryStage instanceof Container) ||
    particleStage === ordinaryStage || particleStage.destroyed || ordinaryStage.destroyed ||
    particleStage.parent !== null || ordinaryStage.parent !== null ||
    particleStage.label !== PIXI_PARTICLE_STAGE_LABEL ||
    ordinaryStage.label !== PIXI_ORDINARY_STAGE_LABEL ||
    (mvStage !== undefined && (
      !(mvStage instanceof Container) || mvStage === particleStage || mvStage === ordinaryStage ||
      mvStage.destroyed || mvStage.parent !== null || mvStage.label !== PIXI_MV_LIVE_STAGE_LABEL
    )) ||
    (startupScene !== undefined && (
      startupScene.backgroundRoot.parent !== null || startupScene.foregroundRoot.parent !== null ||
      startupScene.backgroundRoot.destroyed || startupScene.foregroundRoot.destroyed
    ))
  ) {
    return evidenceRequired(
      "render.pixi.invalid-combined-scene-stages",
      ["OSR-GAP-01", "OSR-E12340", "OSR-E12341", "OSR-E12342", "OSR-E12343", "OSR-E12344"],
      "The current ordinary scene accepts exactly one live unparented particle stage followed by one live unparented Note/HUD stage; labels, identity or ownership cannot be inferred or repaired.",
    );
  }
  const root = new Container({ label: PIXI_COMBINED_SCENE_LABEL, sortableChildren: false });
  root.sortableChildren = false;
  try {
    if (mvStage !== undefined) root.addChild(mvStage);
    if (startupScene !== undefined) root.addChild(startupScene.backgroundRoot);
    root.addChild(particleStage);
    root.addChild(ordinaryStage);
    if (startupScene !== undefined) root.addChild(startupScene.foregroundRoot);
  } catch {
    mvStage?.removeFromParent();
    startupScene?.backgroundRoot.removeFromParent();
    particleStage.removeFromParent();
    ordinaryStage.removeFromParent();
    startupScene?.foregroundRoot.removeFromParent();
    root.destroy({ children: false });
    return evidenceRequired(
      "render.pixi.combined-scene-attach-failed",
      ["OSR-GAP-01"],
      "Combined-scene construction is atomic and rejects without retaining either stage when Pixi cannot attach the evidence-ordered children.",
    );
  }
  return ok(new OwnedPixiCombinedScene(root, particleStage, ordinaryStage, startupScene, mvStage));
}

class OwnedPixiCombinedScene implements PixiCombinedScene {
  private disposed = false;

  constructor(
    readonly root: Container,
    private readonly particleStage: Container,
    private readonly ordinaryStage: Container,
    private readonly startupScene?: PixiStartupDirectionScene,
    private readonly mvStage?: Container,
  ) {}

  applyStartupState(state: StartupDirectionSceneState): SimulatorResult<void> {
    if (this.disposed || this.startupScene === undefined) {
      return evidenceRequired(
        "render.pixi.startup-state-without-scene",
        ["SD05", "SD08", "SD09"],
        "Startup visibility can be applied only while the combined scene owns the startup roots.",
      );
    }
    this.startupScene.publish(state);
    this.ordinaryStage.visible = state.hudAlpha > 0;
    this.ordinaryStage.alpha = state.hudAlpha;
    return ok(undefined);
  }

  snapshot(): PixiCombinedSceneSnapshot {
    return Object.freeze({
      state: this.disposed ? "disposed" as const : "attached" as const,
      rootLabel: PIXI_COMBINED_SCENE_LABEL,
      childLabels: Object.freeze([
        ...(this.mvStage === undefined ? [] : [PIXI_MV_LIVE_STAGE_LABEL]),
        PIXI_PARTICLE_STAGE_LABEL,
        PIXI_ORDINARY_STAGE_LABEL,
      ]),
      rootParentAttached: this.root.parent !== null,
      particleStageParentIsRoot: this.particleStage.parent === this.root,
      ordinaryStageParentIsRoot: this.ordinaryStage.parent === this.root,
      mvStageParentIsRoot: this.mvStage === undefined ? null : this.mvStage.parent === this.root,
      startupBackgroundParentIsRoot: this.startupScene === undefined ? null : this.startupScene.backgroundRoot.parent === this.root,
      startupForegroundParentIsRoot: this.startupScene === undefined ? null : this.startupScene.foregroundRoot.parent === this.root,
    });
  }

  dispose(): SimulatorResult<void> {
    if (this.disposed) return ok(undefined);
    this.disposed = true;
    try {
      this.root.removeFromParent();
      this.mvStage?.removeFromParent();
      this.startupScene?.backgroundRoot.removeFromParent();
      this.particleStage.removeFromParent();
      this.ordinaryStage.removeFromParent();
      this.startupScene?.foregroundRoot.removeFromParent();
      this.root.destroy({ children: false });
      return ok(undefined);
    } catch {
      return evidenceRequired(
        "render.pixi.combined-scene-dispose-threw",
        ["OSR-GAP-01", "OSR-E12343", "OSR-E12344"],
        "Combined-scene disposal releases the root and both stage parent relations exactly once without destroying backend-owned stages.",
      );
    }
  }
}
