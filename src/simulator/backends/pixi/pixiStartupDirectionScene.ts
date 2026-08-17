import {
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { PreparedSessionPresentation } from "../../assembly/sessionPresentationDerivation";
import { evidenceRequired, ok, type SimulatorResult } from "../../engine/evidence";
import type {
  StartupDirectionSceneBackend,
  StartupDirectionSceneState,
} from "../../scene/startupDirectionScene";
import type { RenderResourceAssetProfile } from "../renderingContracts";
import type { PixiTextureDecoder } from "./pixiRendererBackend";

export const PIXI_STARTUP_BACKGROUND_LABEL = "GarupaSimulatorStartupBackground";
export const PIXI_STARTUP_FOREGROUND_LABEL = "GarupaSimulatorStartupForeground";

export interface PixiStartupDirectionCommonResources {
  readonly lineStar: Texture;
  readonly jacketFrame: Texture;
  readonly difficultyFrames: Readonly<Record<"EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL", Texture>>;
  readonly fullLiveLabel: Texture;
  readonly fontFamily: string;
}

export interface PixiStartupDirectionScene extends StartupDirectionSceneBackend {
  readonly backgroundRoot: Container;
  readonly foregroundRoot: Container;
  snapshot(): Readonly<{
    state: "ready" | "disposed";
    backgroundLabel: string;
    foregroundLabel: string;
    informationAlpha: number;
    darkCoverAlpha: number;
    stageProgress: number;
    characterAlpha: number;
    lineAlpha: number;
    dynamicTextureCount: number;
  }>;
}

export async function createPixiStartupDirectionScene(
  presentation: PreparedSessionPresentation,
  common: PixiStartupDirectionCommonResources,
  decoder: PixiTextureDecoder,
  isFullLength: boolean,
  includeStandardStage = true,
): Promise<SimulatorResult<PixiStartupDirectionScene>> {
  const prepared = [] as Texture[];
  const images = includeStandardStage
    ? [presentation.stageBackdrop, ...presentation.sdCharacters, presentation.jacket]
    : [presentation.jacket];
  for (const image of images) {
    const profile: RenderResourceAssetProfile = Object.freeze({
      logicalAssetId: image.logicalId,
      role: "startup-ui",
      byteLength: image.byteLength,
      sha256: image.sha256,
      mime: "image/png",
      width: image.width,
      height: image.height,
      textureSettings: Object.freeze({
        scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp",
        mipmap: "off", premultiplyAlpha: true, blendMode: "normal",
      }),
      atlasRows: Object.freeze([]), materialRole: "hud", animationRole: "none",
      provenance: "current-external-portable",
    });
    const decoded = await decoder.decodePng(profile, image.bytes);
    if (decoded.status !== "ok") {
      for (const texture of prepared) texture.destroy(true);
      return decoded;
    }
    prepared.push(decoded.value);
  }
  try {
    return ok(new OwnedPixiStartupDirectionScene(
      presentation,
      common,
      prepared,
      isFullLength,
      includeStandardStage,
    ));
  } catch {
    for (const texture of prepared) texture.destroy(true);
    return evidenceRequired(
      "render.startup-direction.scene-construction-threw",
      ["SD02", "SD05", "SD07", "SD08", "SD16"],
      "Startup scene construction is atomic and has no generic artwork, system-font or missing-texture fallback.",
    );
  }
}

class OwnedPixiStartupDirectionScene implements PixiStartupDirectionScene {
  readonly backgroundRoot = new Container({ label: PIXI_STARTUP_BACKGROUND_LABEL, sortableChildren: false });
  readonly foregroundRoot = new Container({ label: PIXI_STARTUP_FOREGROUND_LABEL, sortableChildren: false });
  private readonly information = new Container({ label: "StartupInformation", sortableChildren: false });
  private readonly darkCover: Graphics;
  private readonly stageBackdrop: Sprite | null;
  private readonly characters: readonly Sprite[];
  private readonly lineOwner = new Container({ label: "StartupLineUiOwner", sortableChildren: false });
  private disposed = false;

  constructor(
    presentation: PreparedSessionPresentation,
    common: PixiStartupDirectionCommonResources,
    private readonly dynamicTextures: readonly Texture[],
    isFullLength: boolean,
    includeStandardStage: boolean,
  ) {
    this.backgroundRoot.sortableChildren = false;
    this.foregroundRoot.sortableChildren = false;
    this.information.sortableChildren = false;
    const jacketTexture = dynamicTextures[dynamicTextures.length - 1]!;
    if (includeStandardStage) {
      const stageTexture = dynamicTextures[0]!;
      const characterTextures = dynamicTextures.slice(1, -1);
      this.stageBackdrop = fullFrameSprite(stageTexture, "StartupStageBackdrop");
      this.characters = Object.freeze(characterTextures.map((texture, index) => fullFrameSprite(texture, `StartupSdCharacter${index}`)));
      this.backgroundRoot.addChild(this.stageBackdrop, ...this.characters);
    } else {
      this.stageBackdrop = null;
      this.characters = Object.freeze([]);
    }
    this.darkCover = new Graphics({ label: "StartupDarkCover" }).rect(0, 0, 1600, 720).fill({ color: 0x000000, alpha: 1 });
    this.foregroundRoot.addChild(this.darkCover);

    const lineStar = new Sprite({ texture: common.lineStar, label: "StartupLineStar" });
    lineStar.anchor.set(0.5);
    lineStar.position.set(800, 371);
    lineStar.width = 1346;
    lineStar.height = 196;
    this.information.addChild(lineStar);

    const jacket = new Sprite({ texture: jacketTexture, label: "StartupJacket" });
    jacket.anchor.set(0.5);
    jacket.position.set(800, 222);
    jacket.width = 360;
    jacket.height = 360;
    this.information.addChild(jacket);
    const frame = new Sprite({ texture: common.jacketFrame, label: "StartupJacketFrame" });
    frame.anchor.set(0.5);
    frame.position.copyFrom(jacket.position);
    frame.width = 374;
    frame.height = 374;
    this.information.addChild(frame);

    const difficultyFrame = new Sprite({
      texture: common.difficultyFrames[presentation.difficulty.type],
      label: "StartupDifficultyFrame",
    });
    difficultyFrame.anchor.set(0.5);
    difficultyFrame.position.set(807, 440);
    difficultyFrame.width = 102;
    difficultyFrame.height = 34;
    this.information.addChild(difficultyFrame);
    this.information.addChild(text(presentation.difficulty.type, common.fontFamily, 807, 440, 20, "StartupDifficulty"));
    this.information.addChild(text(String(presentation.difficulty.level), common.fontFamily, 870, 440, 20, "StartupDifficultyLevel"));
    this.information.addChild(text(presentation.song.title, common.fontFamily, 800, 562, 32, "StartupSongTitle"));
    this.information.addChild(text(presentation.song.bandName, common.fontFamily, 800, 636, 24, "StartupBandName"));
    let creditY = 668;
    for (const [role, value] of [
      ["Lyricist", presentation.song.lyricist],
      ["Composer", presentation.song.composer],
      ["Arranger", presentation.song.arranger],
    ] as const) {
      if (value !== null) {
        this.information.addChild(text(value, common.fontFamily, 800, creditY, 18, `Startup${role}`));
        creditY += 25;
      }
    }
    if (isFullLength) {
      const full = new Sprite({ texture: common.fullLiveLabel, label: "StartupFullLive" });
      full.position.set(926, 187);
      full.width = 70;
      full.height = 34;
      this.information.addChild(full);
    }
    this.foregroundRoot.addChild(this.information, this.lineOwner);
    this.publish({
      sequence: 0, informationPhase: "hidden", informationAlpha: 0,
      hudAlpha: 0, darkCoverAlpha: 1, stagePhase: "dark", stageProgress: 0,
      characterAlpha: 0, linePhase: "hidden", lineAlpha: 0,
      gameplayVisible: false, rehearsalControlsVisible: false,
    });
  }

  publish(state: StartupDirectionSceneState): void {
    if (this.disposed) throw new Error("startup scene disposed");
    this.information.alpha = state.informationAlpha;
    this.information.visible = state.informationPhase !== "hidden" && state.informationPhase !== "complete";
    this.darkCover.alpha = state.darkCoverAlpha;
    this.darkCover.visible = state.darkCoverAlpha > 0;
    if (this.stageBackdrop !== null) this.stageBackdrop.alpha = state.stageProgress;
    for (const character of this.characters) character.alpha = state.characterAlpha;
    this.lineOwner.alpha = state.lineAlpha;
    this.lineOwner.visible = state.lineAlpha > 0;
  }

  snapshot() {
    return Object.freeze({
      state: this.disposed ? "disposed" as const : "ready" as const,
      backgroundLabel: this.backgroundRoot.label,
      foregroundLabel: this.foregroundRoot.label,
      informationAlpha: this.information.alpha,
      darkCoverAlpha: this.darkCover.alpha,
      stageProgress: this.stageBackdrop?.alpha ?? 0,
      characterAlpha: this.characters[0]?.alpha ?? 0,
      lineAlpha: this.lineOwner.alpha,
      dynamicTextureCount: this.dynamicTextures.length,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.backgroundRoot.removeFromParent();
    this.foregroundRoot.removeFromParent();
    this.backgroundRoot.destroy({ children: true });
    this.foregroundRoot.destroy({ children: true });
    for (const texture of this.dynamicTextures) texture.destroy(true);
  }
}

function fullFrameSprite(texture: Texture, label: string): Sprite {
  const sprite = new Sprite({ texture, label });
  sprite.position.set(0, 0);
  sprite.width = 1600;
  sprite.height = 720;
  return sprite;
}
function text(value: string, fontFamily: string, x: number, y: number, fontSize: number, label: string): Text {
  const result = new Text({
    text: value,
    label,
    style: { fill: 0xffffff, fontFamily, fontSize, align: "center" },
  });
  result.anchor.set(0.5);
  result.position.set(x, y);
  return result;
}
