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
  readonly stageGameOverCover: Texture;
  readonly jacketFrame: PixiStartupSlicedImage;
  readonly difficultyFrames: Readonly<Record<"EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL", PixiStartupSlicedImage>>;
  readonly fullLiveLabel: Texture;
  readonly fontFamily: string;
}

/**
 * The Light background module (InGameGraphicsMode.Light): the presentation's
 * stage backdrop is the card illustration, shown at this brightness (percent).
 */
export interface PixiStartupLightMode {
  readonly brightness: number;
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
  lightMode: PixiStartupLightMode | null = null,
): Promise<SimulatorResult<PixiStartupDirectionScene>> {
  if (presentation.sdCharacters.length !== 0) {
    return integrityFailure(
      "render.startup-direction.non-empty-sd-character-assets",
      "The portable host maps literal-null SD-character input to one owned empty collection; character placeholders or caller overlays are forbidden.",
    );
  }
  const prepared = [] as Texture[];
  const images = includeStandardStage
    ? [presentation.stageBackdrop, ...presentation.stageEffect.map((widget) => widget.image), presentation.jacket]
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
      lightMode,
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
  private readonly gameOverCover: Sprite;
  private readonly stageBackdrop: Sprite | null;
  /** Visible stage-effect widgets of a special background, in TRSRoot space. */
  private readonly stageEffect: Container | null;
  private readonly stageLights: PixiStageLights | null;
  private readonly stageSpeakers: PixiStageSpeakers | null;
  private readonly stagePsyllium: PixiStagePsyllium | null;
  private readonly letterBox: readonly Graphics[];
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
    private readonly lightMode: PixiStartupLightMode | null,
  ) {
    this.backgroundRoot.sortableChildren = false;
    this.foregroundRoot.sortableChildren = false;
    this.information.sortableChildren = false;
    const jacketTexture = dynamicTextures[dynamicTextures.length - 1]!;
    if (includeStandardStage) {
      const stageTexture = dynamicTextures[0]!;
      const effectCount = presentation.stageEffect.length;
      const characterTextures = dynamicTextures.slice(1 + effectCount, -1);
      // bgImage is at local y -170 under Stage/TRSRoot; BgManager.initLightMode
      // and adjustPositionForLightMode move it to -164 for the card.
      this.stageBackdrop = informationSprite(
        stageTexture,
        "StartupStageBackdrop",
        0, lightMode === null ? -170 : -164, 1920, 1440,
      );
      // The prefab draws its widgets in the stage's panel above the background
      // image (documented assumption: its parent panel's queue is not in the
      // evidence), so BgCover and the DarkCover subtraction cover them too.
      this.stageEffect = effectCount === 0 ? null : new Container({ label: "StageSpecialBgEffect", sortableChildren: false });
      presentation.stageEffect.forEach((widget, index) => {
        const sprite = new Sprite({ texture: dynamicTextures[1 + index]!, label: `StageSpecialBgEffect${index}`, anchor: 0.5 });
        sprite.position.set(widget.centerX, -widget.centerY);
        sprite.width = widget.width;
        sprite.height = widget.height;
        sprite.alpha = widget.alpha;
        this.stageEffect!.addChild(sprite);
      });
      this.characters = Object.freeze(characterTextures.map((texture, index) => fullFrameSprite(
        texture,
        `StartupSdCharacter${index}`,
        surfaceLayout.surface.viewportWidth,
        surfaceLayout.surface.viewportHeight,
      )));
      // Stage/TRSRoot/LetterBoxRoot: two enabled bg_rhythm_iPX_black widgets
      // (388x1440, x ±875…±1263, y -164, depth 22) that no stage code toggles.
      // Outside a 16:9 screen at the ordinary pose (scale 0.92); at the start
      // pose kept by Light mode (0.7) their inner edges are at ±612.5.
      this.letterBox = Object.freeze([-1, 1].map((side) => new Graphics({ label: `StageLetterBox${side < 0 ? "Left" : "Right"}` })
        .rect(side < 0 ? -1263 : 875, -556, 388, 1440).fill({ color: 0x000000, alpha: 1 })));
      this.backgroundRoot.addChild(this.stageBackdrop);
      if (this.stageEffect !== null) this.backgroundRoot.addChild(this.stageEffect);
      this.backgroundRoot.addChild(...this.letterBox);
      // A spread of zero children reaches Container.addChild(undefined); charts without SD characters have none.
      if (this.characters.length > 0) this.backgroundRoot.addChild(...this.characters);
    } else {
      this.stageBackdrop = null;
      this.stageEffect = null;
      this.letterBox = Object.freeze([]);
      this.characters = Object.freeze([]);
    }
    const viewportWidth = surfaceLayout.surface.viewportWidth;
    const viewportHeight = surfaceLayout.surface.viewportHeight;
    if (includeStandardStage) {
      // level3 BgCover: Simple center-pivot sprite, 2000x2000, scale 2.5,
      // local X=80 under the integer-activeHeight UI_Root_Back (not the safe-area HUD).
      const scale = surfaceLayout.ui.backRootPixelsPerUnit;
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
    // LightBackgroundModule.LoadResources -> removeStageEffects: the psyllium,
    // the bottom light and the speakers are destroyed.
    const standardStageEffects = includeStandardStage && includeStageEffects && lightMode === null;
    this.stageLights = standardStageEffects ? new PixiStageLights(common.stageLight) : null;
    if (this.stageLights !== null) this.backgroundRoot.addChild(this.stageLights.root);
    this.stageSpeakers = standardStageEffects ? new PixiStageSpeakers(common.stageSpeaker, common.stageSpeakerGlow) : null;
    if (this.stageSpeakers !== null) this.backgroundRoot.addChild(this.stageSpeakers.root);
    this.stagePsyllium = standardStageEffects ? new PixiStagePsyllium(common.stagePsyllium) : null;
    if (this.stagePsyllium !== null) this.backgroundRoot.addChild(this.stagePsyllium.root);
    this.backgroundRoot.addChild(this.darkCover);
    // InGameStageControllerBase.initDarkCoverTexture hides it in Light mode
    // outside practice. Practice may run the Light module, but BgManager.initPracticeMode keeps the
    // practice room ahead of the card, so a practice scene always takes the standard branch here.
    if (includeStandardStage && lightMode === null) {
      // Queue3490 is independent of BgCover (3400): ShowScreenALittle fades
      // this widget's RGB from white to quarter-gray while retaining alpha1.
      const scale = surfaceLayout.ui.backRootPixelsPerUnit;
      const subtraction = new Sprite({ texture: common.stageDarkCover, label: "StageDarkCover", anchor: 0.5 });
      subtraction.position.set(viewportWidth / 2, viewportHeight / 2 - 190 * scale);
      subtraction.width = 1334 * scale; subtraction.height = 1500 * scale;
      subtraction.blendMode = PIXI_STAGE_DARK_COVER_BLEND;
      this.backgroundRoot.addChild(subtraction);
      this.stageSubtraction = subtraction;
    } else this.stageSubtraction = null;
    // GameOverCover/GameOverCover under UI_Root_Back/Display (queue 3490):
    // UITexture sub_glow 1334x1500 at (0, 190) with CE/RevSubtraction; its
    // white rim darkens the screen edges as the life level scales it down.
    this.gameOverCover = new Sprite({ texture: common.stageGameOverCover, label: "GameOverCover", anchor: 0.5 });
    this.gameOverCover.position.set(viewportWidth / 2, viewportHeight / 2 - 190 * surfaceLayout.ui.backRootPixelsPerUnit);
    this.gameOverCover.blendMode = PIXI_STAGE_DARK_COVER_BLEND;
    this.backgroundRoot.addChild(this.gameOverCover);
    this.publish({
      sequence: 0, informationPhase: "hidden", informationAlpha: 0,
      hudAlpha: 0, darkCoverAlpha: 1, stageSubtractionColor: 1, stagePhase: "dark", stageProgress: 0, stageColorProgress: 0, stagePsylliumFading: false, stagePsylliumSpeed: 1,
      characterAlpha: 0, linePhase: "hidden", lineAlpha: 0,
      gameplayVisible: false, rehearsalControlsVisible: false, gameOverCoverVisible: false, gameOverCoverScale: 3,
    });
  }

  publish(state: StartupDirectionSceneState): void {
    if (this.disposed) throw new Error("startup scene disposed");
    this.information.alpha = state.informationAlpha;
    this.information.visible = state.informationPhase !== "hidden" && state.informationPhase !== "complete";
    this.darkCover.alpha = state.darkCoverAlpha;
    this.darkCover.visible = state.darkCoverAlpha > 0;
    const coverScale = state.gameOverCoverScale * this.surfaceLayout.ui.backRootPixelsPerUnit;
    this.gameOverCover.visible = state.gameOverCoverVisible;
    this.gameOverCover.width = 1334 * coverScale;
    this.gameOverCover.height = 1500 * coverScale;
    if (this.stageSubtraction !== null) {
      // UIDrawCall converts animated UIWidget RGB to Linear before subtraction.
      const color = srgbChannelToLinear(state.stageSubtractionColor);
      this.stageSubtraction.tint = [color, color, color];
    }
    this.stageProgress = state.stageProgress;
    if (this.stageBackdrop !== null) {
      const layout = this.surfaceLayout;
      const highAspect = layout.starUi.highAspectRatio;
      const rootScale = (1 - 0.23 * highAspect) * layout.ui.backRootPixelsPerUnit;
      // Light mode: introAnimation returns before moveStageTRS and
      // outroAnimation returns to the same start pose, so the stage stays at
      // onInitialize's serialized pose (y 111, scale 0.7).
      const eased = this.lightMode === null ? state.stageProgress : 0;
      const trsScale = 0.7 + (0.92 - 0.7) * eased;
      const trsY = 111 * (1 - eased);
      const backdropY = this.lightMode === null ? -170 : -164;
      this.stageBackdrop.position.set(layout.surface.viewportWidth / 2,
        layout.surface.viewportHeight / 2 -
          (14 * highAspect * layout.ui.backRootPixelsPerUnit + (trsY + backdropY * trsScale) * rootScale));
      this.stageBackdrop.width = 1920 * trsScale * rootScale;
      this.stageBackdrop.height = 1440 * trsScale * rootScale;
      // The same ColorFader from the serialized color; Light mode ends at
      // LightModeIllustBrightness × 0.01 instead of white.
      const target = this.lightMode === null ? 1 : this.lightMode.brightness / 100;
      const brightness = 0.5 + (target - 0.5) * state.stageColorProgress;
      this.stageBackdrop.tint = [brightness, brightness, brightness];
      // Ordinary SetStageStatus is a no-op; the stage stays behind BgCover
      // throughout the information view, wait and intro.
      for (const root of [this.stageEffect ?? undefined, ...this.letterBox, this.stageLights?.root, this.stageSpeakers?.root, this.stagePsyllium?.root]) {
        if (root === undefined) continue;
        root.position.set(layout.surface.viewportWidth / 2,
          layout.surface.viewportHeight / 2 -
            (14 * highAspect * layout.ui.backRootPixelsPerUnit + trsY * rootScale));
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
