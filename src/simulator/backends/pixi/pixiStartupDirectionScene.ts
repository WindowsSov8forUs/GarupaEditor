import { localizeSimulatorText, simulatorTextFonts } from "../../scene/presentationLocalization";
import { PIXI_STAGE_DARK_COVER_BLEND } from "./pixiFlashBlend";
import { layoutNguiText } from "./hud/nguiTextLayout";
import { DIFFICULTY_LABEL_STYLE } from "../../scene/difficultyLabelStyle";
import {
  Container,
  Graphics,
  NineSliceSprite,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { PreparedSessionPresentation } from "../../assembly/sessionPresentationDerivation";
import { integrityFailure, ok, type SimulatorResult } from "../../engine/result";
import type {
  StartupDirectionSceneBackend,
  StartupDirectionSceneState,
} from "../../scene/startupDirectionScene";
import type { RenderResourceAssetProfile } from "../renderingContracts";
import type { PixiTextureDecoder } from "./pixiRendererBackend";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import { linearTintFromSrgbColor, srgbChannelToLinear } from "./hud/nguiMaterialPipeline";
import { PixiStageLights } from "./pixiStageLights";
import { PixiStagePsyllium } from "./pixiStagePsyllium";
import { PixiStageSpeakers } from "./pixiStageSpeakers";
import type { OneFrameJudgementBatch } from "../../engine/data/oneFrameData";

export const PIXI_STARTUP_BACKGROUND_LABEL = "GarupaSimulatorStartupBackground";
export const PIXI_STARTUP_FOREGROUND_LABEL = "GarupaSimulatorStartupForeground";

export interface PixiStartupSlicedImage {
  readonly texture: Texture;
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly topHeight: number;
  readonly bottomHeight: number;
}

export interface PixiStartupDirectionCommonResources {
  readonly titleBase: Texture;
  readonly difficultyBackground: PixiStartupSlicedImage;
  readonly lineStar: Texture;
  readonly stageLight: Texture;
  readonly stageSpeaker: Texture;
  readonly stageSpeakerGlow: Texture;
  readonly stagePsyllium: Texture;
  readonly stageCover: Texture;
  readonly stageDarkCover: Texture;
  readonly jacketFrame: PixiStartupSlicedImage;
  readonly difficultyFrames: Readonly<Record<"EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL", PixiStartupSlicedImage>>;
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
    dynamicTextureCount: number;
  }>;
}

export async function createPixiStartupDirectionScene(
  presentation: PreparedSessionPresentation,
  common: PixiStartupDirectionCommonResources,
  decoder: PixiTextureDecoder,
  isFullLength: boolean,
  surfaceLayout: OriginalSurfaceLayout,
  includeStandardStage = true,
  includeStageEffects = true,
): Promise<SimulatorResult<PixiStartupDirectionScene>> {
  if (presentation.sdCharacters.length !== 0) {
    return integrityFailure(
      "render.startup-direction.non-empty-sd-character-assets",
      "The portable host maps literal-null SD-character input to one owned empty collection; character placeholders or caller overlays are forbidden.",
    );
  }
  const prepared = [] as Texture[];
  const images = includeStandardStage
    ? [presentation.stageBackdrop, presentation.jacket]
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
        mipmap: "off", premultiplyAlpha: false, blendMode: "normal",
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
      surfaceLayout,
      includeStandardStage,
      includeStageEffects,
    ));
  } catch {
    for (const texture of prepared) texture.destroy(true);
    return integrityFailure(
      "render.startup-direction.scene-construction-threw",
      "Startup scene construction is atomic and has no generic artwork, system-font or missing-texture fallback.",
    );
  }
}

class OwnedPixiStartupDirectionScene implements PixiStartupDirectionScene {
  readonly backgroundRoot = new Container({ label: PIXI_STARTUP_BACKGROUND_LABEL, sortableChildren: false });
  readonly foregroundRoot = new Container({ label: PIXI_STARTUP_FOREGROUND_LABEL, sortableChildren: false });
  private readonly information = new Container({ label: "StartupInformation", sortableChildren: false });
  private readonly darkCover: Sprite | Graphics;
  private readonly stageSubtraction: Sprite | null;
  private readonly stageBackdrop: Sprite | null;
  private readonly stageLights: PixiStageLights | null;
  private readonly stageSpeakers: PixiStageSpeakers | null;
  private readonly stagePsyllium: PixiStagePsyllium | null;
  private stageProgress = 0;
  private readonly characters: readonly Sprite[];
  private disposed = false;

  constructor(
    presentation: PreparedSessionPresentation,
    common: PixiStartupDirectionCommonResources,
    private readonly dynamicTextures: readonly Texture[],
    isFullLength: boolean,
    private readonly surfaceLayout: OriginalSurfaceLayout,
    includeStandardStage: boolean,
    includeStageEffects: boolean,
  ) {
    this.backgroundRoot.sortableChildren = false;
    this.foregroundRoot.sortableChildren = false;
    this.information.sortableChildren = false;
    const jacketTexture = dynamicTextures[dynamicTextures.length - 1]!;
    if (includeStandardStage) {
      const stageTexture = dynamicTextures[0]!;
      const characterTextures = dynamicTextures.slice(1, -1);
      this.stageBackdrop = informationSprite(
        stageTexture,
        "StartupStageBackdrop",
        0, -170, 1920, 1440,
      );
      this.characters = Object.freeze(characterTextures.map((texture, index) => fullFrameSprite(
        texture,
        `StartupSdCharacter${index}`,
        surfaceLayout.surface.viewportWidth,
        surfaceLayout.surface.viewportHeight,
      )));
      this.backgroundRoot.addChild(this.stageBackdrop, ...this.characters);
    } else {
      this.stageBackdrop = null;
      this.characters = Object.freeze([]);
    }
    const viewportWidth = surfaceLayout.surface.viewportWidth;
    const viewportHeight = surfaceLayout.surface.viewportHeight;
    if (includeStandardStage) {
      // level3 BgCover: Simple center-pivot sprite, 2000x2000, scale 2.5,
      // local X=80 under the width-fitted UI_Root_Back (not the safe-area HUD).
      const scale = surfaceLayout.ui.pixelsPerAuthoredUnit;
      const cover = new Sprite({ texture: common.stageCover, label: "StartupStageCover", anchor: 0.5 });
      cover.position.set(viewportWidth / 2 + 80 * scale, viewportHeight / 2);
      cover.width = 5000 * scale; cover.height = 5000 * scale; cover.tint = 0x000000;
      this.darkCover = cover;
    } else {
      this.darkCover = new Graphics({ label: "StartupDarkCover" })
        .rect(0, 0, viewportWidth, viewportHeight).fill({ color: 0x000000, alpha: 1 });
    }
    this.information.position.set(viewportWidth / 2, viewportHeight / 2);
    this.information.scale.set(surfaceLayout.ui.screenToSafeChildScale);

    const titleBase = informationSprite(common.titleBase, "StartupTitleBase", 0, -159, 1334, 88);
    const lineStar = informationSprite(common.lineStar, "StartupLineStar", 0, -170, 1346, 196);
    this.information.addChild(titleBase, lineStar);

    const difficulty = DIFFICULTY_LABEL_STYLE[presentation.difficulty.type];
    const jacketBase = informationSlicedSprite(common.difficultyFrames[presentation.difficulty.type],
      "StartupJacketDifficultyBase", 6, 144, 374, 374);
    const frame = informationSlicedSprite(common.jacketFrame, "StartupJacketFrame", 0, 138, 374, 374);
    const jacket = informationSprite(jacketTexture, "StartupJacket", 0, 138, 360, 360);
    this.information.addChild(jacketBase, frame, jacket);

    const difficultyBackground = informationSlicedSprite(
      common.difficultyBackground,
      "StartupDifficultyBackground",
      7,
      -77,
      97,
      27,
    );
    difficultyBackground.tint = linearTintFromSrgbColor(difficulty.background);
    this.information.addChild(difficultyBackground);
    const difficultyLabel = text(presentation.difficulty.type, common.fontFamily,
      7 + difficulty.offsetX, -79, 20, "StartupDifficulty");
    difficultyLabel.style.stroke = { color: linearTintFromSrgbColor(difficulty.outline), width: 2 };
    difficultyLabel.style.letterSpacing = difficulty.spacing;
    layoutNguiText(difficultyLabel);
    fitText(difficultyLabel, 94);
    this.information.addChild(difficultyLabel);
    this.information.addChild(text(presentation.song.title, common.fontFamily, 0, -162, 38, "StartupSongTitle", 1110, 0x505050));
    this.information.addChild(text(presentation.song.bandName, common.fontFamily, 0, -236, 28, "StartupBandName", 932));
    for (const [role, prefix, value, authoredY] of [
      ["Lyricist", "作詞：", presentation.song.lyricist, -283],
      ["Composer", "作曲：", presentation.song.composer, -313],
      ["Arranger", "編曲：", presentation.song.arranger, -343],
    ] as const) {
      if (value !== null && value.length > 0) {
        this.information.addChild(text(localizeSimulatorText(prefix) + value, common.fontFamily, 0, authoredY, 22, `Startup${role}`, 925));
      }
    }
    if (isFullLength) {
      const full = informationSprite(common.fullLiveLabel, "StartupFullLive", 161, 293, 70, 34);
      this.information.addChild(full);
    }
    this.foregroundRoot.addChild(this.information);
    this.stageLights = includeStandardStage && includeStageEffects ? new PixiStageLights(common.stageLight) : null;
    if (this.stageLights !== null) this.backgroundRoot.addChild(this.stageLights.root);
    this.stageSpeakers = includeStandardStage && includeStageEffects ? new PixiStageSpeakers(common.stageSpeaker, common.stageSpeakerGlow) : null;
    if (this.stageSpeakers !== null) this.backgroundRoot.addChild(this.stageSpeakers.root);
    this.stagePsyllium = includeStandardStage && includeStageEffects ? new PixiStagePsyllium(common.stagePsyllium) : null;
    if (this.stagePsyllium !== null) this.backgroundRoot.addChild(this.stagePsyllium.root);
    this.backgroundRoot.addChild(this.darkCover);
    if (includeStandardStage) {
      // Queue3490 is independent of BgCover (3400): ShowScreenALittle fades
      // this widget's RGB from white to quarter-gray while retaining alpha1.
      const scale = surfaceLayout.ui.pixelsPerAuthoredUnit;
      const subtraction = new Sprite({ texture: common.stageDarkCover, label: "StageDarkCover", anchor: 0.5 });
      subtraction.position.set(viewportWidth / 2, viewportHeight / 2 - 190 * scale);
      subtraction.width = 1334 * scale; subtraction.height = 1500 * scale;
      subtraction.blendMode = PIXI_STAGE_DARK_COVER_BLEND;
      this.backgroundRoot.addChild(subtraction);
      this.stageSubtraction = subtraction;
    } else this.stageSubtraction = null;
    this.publish({
      sequence: 0, informationPhase: "hidden", informationAlpha: 0,
      hudAlpha: 0, darkCoverAlpha: 1, stageSubtractionColor: 1, stagePhase: "dark", stageProgress: 0, stageColorProgress: 0, stagePsylliumFading: false, stagePsylliumSpeed: 1,
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
    if (this.stageSubtraction !== null) {
      // UIDrawCall converts animated UIWidget RGB to Linear before subtraction.
      const color = srgbChannelToLinear(state.stageSubtractionColor);
      this.stageSubtraction.tint = [color, color, color];
    }
    this.stageProgress = state.stageProgress;
    if (this.stageBackdrop !== null) {
      const layout = this.surfaceLayout;
      const highAspect = layout.starUi.highAspectRatio;
      const rootScale = (1 - 0.23 * highAspect) * layout.ui.pixelsPerAuthoredUnit;
      const eased = state.stageProgress;
      const trsScale = 0.7 + (0.92 - 0.7) * eased;
      const trsY = 111 * (1 - eased);
      this.stageBackdrop.position.set(layout.surface.viewportWidth / 2,
        layout.surface.viewportHeight / 2 -
          (14 * highAspect * layout.ui.pixelsPerAuthoredUnit + (trsY - 170 * trsScale) * rootScale));
      this.stageBackdrop.width = 1920 * trsScale * rootScale;
      this.stageBackdrop.height = 1440 * trsScale * rootScale;
      const brightness = 0.5 + 0.5 * state.stageColorProgress;
      this.stageBackdrop.tint = [brightness, brightness, brightness];
      // Ordinary SetStageStatus is a no-op; the stage stays behind BgCover
      // throughout the information view, wait and intro.
      for (const root of [this.stageLights?.root, this.stageSpeakers?.root, this.stagePsyllium?.root]) {
        if (root === undefined) continue;
        root.position.set(layout.surface.viewportWidth / 2,
          layout.surface.viewportHeight / 2 -
            (14 * highAspect * layout.ui.pixelsPerAuthoredUnit + trsY * rootScale));
        root.scale.set(trsScale * rootScale);
      }
    }
    if (state.stagePsylliumFading) this.stagePsyllium?.beginFade();
    this.stagePsyllium?.updateStage(state.stagePhase, state.stageProgress, this.surfaceLayout.surface.viewportWidth, this.surfaceLayout.surface.viewportHeight, state.stagePsylliumSpeed);
    for (const character of this.characters) character.alpha = state.characterAlpha;
  }

  snapshot() {
    return Object.freeze({
      state: this.disposed ? "disposed" as const : "ready" as const,
      backgroundLabel: this.backgroundRoot.label,
      foregroundLabel: this.foregroundRoot.label,
      informationAlpha: this.information.alpha,
      darkCoverAlpha: this.darkCover.alpha,
      stageProgress: this.stageProgress,
      characterAlpha: this.characters[0]?.alpha ?? 0,
      dynamicTextureCount: this.dynamicTextures.length,
    });
  }

  advanceStageEffects(deltaSeconds: number): void {
    if (this.disposed) throw new Error("startup scene disposed");
    this.stageLights?.advance(deltaSeconds);
    this.stageSpeakers?.advance(deltaSeconds);
    this.stagePsyllium?.advance(deltaSeconds);
  }

  reflectStageJudgements(batch: OneFrameJudgementBatch): void {
    if (this.disposed) throw new Error("startup scene disposed");
    this.stageSpeakers?.reflect(batch);
  }

  reflectStageCommand(command: import("../../engine/data/stageCommand").StagePsylliumCommand | null, speed: number): void {
    if (this.disposed) throw new Error("startup scene disposed");
    this.stagePsyllium?.executeCommand(command, speed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stageSpeakers?.dispose();
    this.stagePsyllium?.dispose();
    this.backgroundRoot.removeFromParent();
    this.foregroundRoot.removeFromParent();
    this.backgroundRoot.destroy({ children: true });
    this.foregroundRoot.destroy({ children: true });
    for (const texture of this.dynamicTextures) texture.destroy(true);
  }
}

function fullFrameSprite(
  texture: Texture,
  label: string,
  width: number,
  height: number,
): Sprite {
  const sprite = new Sprite({ texture, label });
  sprite.position.set(0, 0);
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

function informationSprite(
  texture: Texture,
  label: string,
  authoredX: number,
  authoredY: number,
  width: number,
  height: number,
): Sprite {
  const sprite = new Sprite({ texture, label });
  sprite.anchor.set(0.5);
  sprite.position.set(authoredX, -authoredY);
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

function informationSlicedSprite(image: PixiStartupSlicedImage, label: string,
  x: number, y: number, width: number, height: number): NineSliceSprite {
  const sprite = new NineSliceSprite({ ...image, label, width, height });
  sprite.anchor.set(0.5);
  sprite.position.set(x, -y);
  return sprite;
}


function text(value: string, fontFamily: string, x: number, y: number, fontSize: number,
  label: string, maxWidth?: number, fill = 0xffffff): Text {
  const result = new Text({
    text: value,
    label,
    style: { fill: linearTintFromSrgbColor(fill), fontFamily: simulatorTextFonts(value, fontFamily), fontSize, align: "center" },
  });
  layoutNguiText(result);
  result.position.set(x, -y);
  if (maxWidth !== undefined) fitText(result, maxWidth);
  return result;
}

function fitText(label: Text, width: number): void {
  if (label.width > width) label.scale.set(width / label.width);
}
