import {
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { PreparedSessionPresentation } from "../../assembly/sessionPresentationDerivation";
import { integrityFailure, ok, type SimulatorResult } from "../../engine/evidence";
import type {
  StartupDirectionSceneBackend,
  StartupDirectionSceneState,
} from "../../scene/startupDirectionScene";
import type { RenderResourceAssetProfile } from "../renderingContracts";
import type { PixiTextureDecoder } from "./pixiRendererBackend";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";

export const PIXI_STARTUP_BACKGROUND_LABEL = "GarupaSimulatorStartupBackground";
export const PIXI_STARTUP_FOREGROUND_LABEL = "GarupaSimulatorStartupForeground";

export interface PixiStartupDirectionCommonResources {
  readonly titleBase: Texture;
  readonly difficultyBackground: Texture;
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
): Promise<SimulatorResult<PixiStartupDirectionScene>> {
  if (presentation.sdCharacters.length !== 0) {
    return integrityFailure(
      "render.startup-direction.non-empty-sd-character-assets",
      ["SDN01", "SDN02", "SDN04"],
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
    ));
  } catch {
    for (const texture of prepared) texture.destroy(true);
    return integrityFailure(
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
    this.darkCover = new Graphics({ label: "StartupDarkCover" })
      .rect(0, 0, viewportWidth, viewportHeight)
      .fill({ color: 0x000000, alpha: 1 });
    this.backgroundRoot.addChildAt(this.darkCover, 0);
    this.information.position.set(viewportWidth / 2, viewportHeight / 2);
    this.information.scale.set(surfaceLayout.ui.screenToSafeChildScale);

    const titleBase = informationSprite(common.titleBase, "StartupTitleBase", 0, -159, 1334, 88);
    const lineStar = informationSprite(common.lineStar, "StartupLineStar", 0, -170, 1346, 196);
    this.information.addChild(titleBase, lineStar);

    const difficulty = STARTUP_DIFFICULTY_STYLE[presentation.difficulty.type];
    const jacketBase = informationSprite(common.difficultyFrames[presentation.difficulty.type],
      "StartupJacketDifficultyBase", 6, 144, 374, 374);
    const frame = informationSprite(common.jacketFrame, "StartupJacketFrame", 0, 138, 374, 374);
    const jacket = informationSprite(jacketTexture, "StartupJacket", 0, 138, 360, 360);
    this.information.addChild(jacketBase, frame, jacket);

    const difficultyBackground = informationSprite(
      common.difficultyBackground,
      "StartupDifficultyBackground",
      7,
      -77,
      97,
      27,
    );
    difficultyBackground.tint = difficulty.background;
    this.information.addChild(difficultyBackground);
    const difficultyLabel = text(presentation.difficulty.type, common.fontFamily,
      7 + difficulty.offsetX, -79, 20, "StartupDifficulty");
    difficultyLabel.style.stroke = { color: difficulty.outline, width: 2 };
    difficultyLabel.style.letterSpacing = difficulty.spacing;
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
        this.information.addChild(text(prefix + value, common.fontFamily, 0, authoredY, 22, `Startup${role}`, 925));
      }
    }
    if (isFullLength) {
      const full = informationSprite(common.fullLiveLabel, "StartupFullLive", 161, 293, 70, 34);
      this.information.addChild(full);
    }
    this.foregroundRoot.addChild(this.information);
    this.publish({
      sequence: 0, informationPhase: "hidden", informationAlpha: 0,
      hudAlpha: 0, darkCoverAlpha: 1, stagePhase: "dark", stageProgress: 0, stageColorProgress: 0,
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
    this.stageProgress = state.stageProgress;
    if (this.stageBackdrop !== null) {
      const layout = this.surfaceLayout;
      const highAspect = layout.starUi.highAspectRatio;
      const rootScale = (1 - 0.23 * highAspect) * layout.ui.pixelsPerAuthoredUnit;
      const eased = 1 - (1 - state.stageProgress) ** 2;
      const trsScale = 0.7 + (0.92 - 0.7) * eased;
      const trsY = 111 * (1 - eased);
      this.stageBackdrop.position.set(layout.surface.viewportWidth / 2,
        layout.surface.viewportHeight / 2 -
          (14 * highAspect * layout.ui.pixelsPerAuthoredUnit + (trsY - 170 * trsScale) * rootScale));
      this.stageBackdrop.width = 1920 * trsScale * rootScale;
      this.stageBackdrop.height = 1440 * trsScale * rootScale;
      const brightness = 0.5 + 0.5 * state.stageColorProgress;
      this.stageBackdrop.tint = [brightness, brightness, brightness];
      this.stageBackdrop.visible = state.stagePhase === "introducing" || state.stagePhase === "idle";
    }
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

// DifficultyUtility colors and DifficultyLabelObject.Setup offsets/spacing.
const STARTUP_DIFFICULTY_STYLE = {
  EASY: { background: 0x3366ff, outline: 0x0033ff, offsetX: 1, spacing: 1 },
  NORMAL: { background: 0x66ff33, outline: 0x00cc33, offsetX: -1, spacing: 1 },
  HARD: { background: 0xffcc33, outline: 0xff9933, offsetX: 1, spacing: 1 },
  EXPERT: { background: 0xff3333, outline: 0xcc0000, offsetX: 1, spacing: 0 },
  SPECIAL: { background: 0xee2299, outline: 0xbb0066, offsetX: 0, spacing: 0 },
} as const;

function text(value: string, fontFamily: string, x: number, y: number, fontSize: number,
  label: string, maxWidth?: number, fill = 0xffffff): Text {
  const result = new Text({
    text: value,
    label,
    style: { fill, fontFamily, fontSize, align: "center" },
  });
  result.anchor.set(0.5);
  result.position.set(x, -y);
  if (maxWidth !== undefined) fitText(result, maxWidth);
  return result;
}

function fitText(label: Text, width: number): void {
  if (label.width > width) label.scale.set(width / label.width);
}
