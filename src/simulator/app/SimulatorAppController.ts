import { emit, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AudioEngine } from "../engine/audio";
import { loadNoteSkinTextureBundle } from "../engine/assets";
import {
  loadPauseButtonImageDataUrl,
  loadRhythmGameUiHudSpriteDataUrls,
  loadRhythmGameUiSpriteDataUrls,
  loadScoreFontGlyphDataUrls,
  UI_COMMON_ATLAS_RECTS,
  RHYTHM_GAME_UI_RECTS,
  SCORE_FONT_GLYPHS,
  SCORE_FONT_LINE_HEIGHT,
} from "../engine/uiAtlas";
import {
  projectNguiOffsetFromAnchoredRoot,
  projectNguiAnchoredPoint,
  getLevel3StarAnchor,
  getLevel3NguiSpriteMetrics,
  getLevel3WidgetDepthMetrics,
  getLevel3WidgetMetrics,
  resolveNguiDrawingRect,
  sumLevel3LocalPositionBetween,
  RHYTHM_UI_PATHS,
} from "../engine/uiHudLayout";
import { parseEditorChart } from "../engine/editorChartParser";
import {
  buildSettingsFromPayload,
  precomputeLut,
} from "../engine/simulatorTiming";
import { loadMvResourceFromPayload, type MvResource } from "../engine/mv";
import { SimulatorRuntime } from "../engine/runtime";
import {
  buildScoreHudState,
  SIMULATOR_SCORE_GAUGE_RANK_CLASSES,
  SIMULATOR_SCORE_RANK_THRESHOLDS,
  type SimulatorScoreRankLabel,
  type SimulatorScoreRankMarker,
} from "../engine/scoreHud";
import {
  loadNguiFontMetricApproximation,
  type NguiFontMetricApproximation,
} from "../engine/nguiFontMetrics";
import { ParsedChart, RuntimeStats, SimulatorSettings } from "../engine/types";
import {
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorLaunchPayload,
  type SimulatorMvPayload,
  type SimulatorWindowPayloadEnvelope,
} from "../launchPayload";
import { PixiRenderer, type SimulatorStartupRenderState } from "../renderer/pixiRenderer";
import { getDifficultyStyle } from "../../difficultyStyle";
import {
  isMobileRuntime,
  readMobileRoutePayload,
  removeMobileRoutePayload,
} from "../../app/mobileRuntime";
import ttShinGoMFontUrl from "../../assets/fonts/TTShinGoM.ttf?url";

interface ScoreRankMarkerRefs {
  root: HTMLDivElement;
  label: HTMLCanvasElement;
  separator: HTMLDivElement;
  separatorImage: HTMLImageElement;
}

interface UiRefs {
  root: HTMLDivElement;
  host: HTMLDivElement;
  canvasHost: HTMLDivElement;
  mvLayer: HTMLDivElement;
  uiLayer: HTMLDivElement;
  runtimeErrorOverlay: HTMLDivElement;
  pauseMask: HTMLDivElement;
  scoreHud: HTMLDivElement;
  scoreBase: HTMLDivElement;
  scoreTopTrack: HTMLDivElement;
  scoreGaugeFill: HTMLDivElement;
  scoreText: HTMLSpanElement;
  scoreDigits: HTMLSpanElement[];
  scoreRankObject: HTMLDivElement;
  scoreRankMarkers: Record<SimulatorScoreRankLabel, ScoreRankMarkerRefs>;
  lifeGauge: HTMLDivElement;
  lifeGaugeBg: HTMLImageElement;
  lifeGaugeFillWrap: HTMLDivElement;
  lifeGaugeFill: HTMLImageElement;
  lifeGaugeSecondFillWrap: HTMLDivElement;
  lifeGaugeSecondFill: HTMLImageElement;
  pauseAnchor: HTMLDivElement;
  pauseButton: HTMLButtonElement;
  pauseIconPause: HTMLImageElement;
  pauseCoverIcon: HTMLImageElement;
  bootLayer: HTMLDivElement;
  bootBack: HTMLDivElement;
  bootFrame: HTMLDivElement;
  bootCoverWrap: HTMLDivElement;
  bootCover: HTMLImageElement;
  bootTitleBar: HTMLDivElement;
  bootTitleText: HTMLSpanElement;
  bootDifficultyBadge: HTMLDivElement;
  bootDifficultyText: HTMLSpanElement;
}

type StartupPhase = "waiting_touch" | "animating" | "running";
type MvVideoRenderState = "hidden" | "video" | "black_tail";

const STARTUP_STAGE_LIVE_BG_FADE_IN_MS = 250;
const STARTUP_STAGE_COVER_FADE_OUT_MS = 750;
const STARTUP_STAGE_UI_FADE_IN_MS = 250;
const STARTUP_STAGE_LIVE_BG_ALPHA_TO_FULL_MS = 1750;
const STARTUP_STAGE_POST_UI_DURATION_MS = 2750;
const STARTUP_STAGE_PLAYFIELD_FADE_DELAY_MS = 2000;
const STARTUP_STAGE_PLAYFIELD_FADE_MS = 750;
const STARTUP_LIVE_BG_TARGET_SCALE = 1.2;
const BOOT_DIFFICULTY_FONT_SIZE_RATIO = 8 / 11;
const BOOT_TITLE_FONT_SIZE_RATIO = 37 / 82;
const STARTUP_TIMELINE_TOTAL_MS =
  STARTUP_STAGE_LIVE_BG_FADE_IN_MS
  + STARTUP_STAGE_COVER_FADE_OUT_MS
  + STARTUP_STAGE_UI_FADE_IN_MS
  + STARTUP_STAGE_POST_UI_DURATION_MS;
const STARTUP_CHART_PREROLL_MS = 3000;
const SCORE_HUD_DIGIT_COUNT = 8;
const SIMULATOR_RUNTIME_ERROR_MAX_LENGTH = 220;
const SCORE_HUD_TOTAL_SCORE_FONT_SIZE = 28;
// Source: level3 RankObject UILabel raw data. The labels use mFontSize=12,
// widget 22x26, center pivot, white color, and text C/B/A/S/SS.
const SCORE_RANK_LABEL_FONT_SIZE = 12;
const SCORE_RANK_LABEL_FONT_FAMILY = "\"TTShinGoM\", \"ChartUI\", \"Microsoft YaHei UI\", sans-serif";
const SCORE_HUD_TOTAL_SCORE_WIDGET = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreTotalScore);
const SCORE_HUD_DIGIT_SCALE = SCORE_HUD_TOTAL_SCORE_FONT_SIZE / SCORE_FONT_LINE_HEIGHT;
const PAUSE_MAIN_WIDGET = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.pauseMain);
const PAUSE_COVER_WIDGET = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.pauseCover);
const PAUSE_MAIN_SPRITE = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.pauseMain);
const PAUSE_COVER_SPRITE = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.pauseCover);
const LIFE_GAUGE_BACKGROUND_DEPTH = getLevel3WidgetDepthMetrics(RHYTHM_UI_PATHS.lifeGaugeBackground).depth;
const LIFE_GAUGE_FRONT_DEPTH = getLevel3WidgetDepthMetrics(RHYTHM_UI_PATHS.lifeGaugeFront).depth;
const LIFE_GAUGE_SECOND_FRONT_DEPTH = getLevel3WidgetDepthMetrics(RHYTHM_UI_PATHS.lifeGaugeSecondFront).depth;
const SIMULATOR_SCORE_RANK_LABELS = SIMULATOR_SCORE_RANK_THRESHOLDS.map(
  (threshold) => threshold.label,
) as readonly SimulatorScoreRankLabel[];
const SCORE_RANK_PATHS = {
  C: {
    root: RHYTHM_UI_PATHS.scoreRankC,
    label: RHYTHM_UI_PATHS.scoreRankCLabel,
    separator: RHYTHM_UI_PATHS.scoreRankCSeparator,
  },
  B: {
    root: RHYTHM_UI_PATHS.scoreRankB,
    label: RHYTHM_UI_PATHS.scoreRankBLabel,
    separator: RHYTHM_UI_PATHS.scoreRankBSeparator,
  },
  A: {
    root: RHYTHM_UI_PATHS.scoreRankA,
    label: RHYTHM_UI_PATHS.scoreRankALabel,
    separator: RHYTHM_UI_PATHS.scoreRankASeparator,
  },
  S: {
    root: RHYTHM_UI_PATHS.scoreRankS,
    label: RHYTHM_UI_PATHS.scoreRankSLabel,
    separator: RHYTHM_UI_PATHS.scoreRankSSeparator,
  },
  SS: {
    root: RHYTHM_UI_PATHS.scoreRankSS,
    label: RHYTHM_UI_PATHS.scoreRankSSLabel,
    separator: RHYTHM_UI_PATHS.scoreRankSSSeparator,
  },
} as const satisfies Record<SimulatorScoreRankLabel, { root: string; label: string; separator: string }>;
const SCORE_RANK_SEPARATOR_SPRITES = Object.fromEntries(
  SIMULATOR_SCORE_RANK_LABELS.map((rank) => [
    rank,
    getLevel3NguiSpriteMetrics(SCORE_RANK_PATHS[rank].separator),
  ]),
) as Record<SimulatorScoreRankLabel, ReturnType<typeof getLevel3NguiSpriteMetrics>>;
// Source: UIProgressBar.FillDirection enum in dump.cs.
const NGUI_PROGRESS_FILL_LEFT_TO_RIGHT = 0;
const NGUI_PROGRESS_FILL_RIGHT_TO_LEFT = 1;
const NGUI_PROGRESS_FILL_BOTTOM_TO_TOP = 2;
const NGUI_PROGRESS_FILL_TOP_TO_BOTTOM = 3;
const PAUSE_MAIN_DRAW_RECT = resolveNguiDrawingRect(
  PAUSE_MAIN_WIDGET,
  PAUSE_MAIN_SPRITE,
  RHYTHM_GAME_UI_RECTS.buttonPause,
);
const PAUSE_COVER_DRAW_RECT = resolveNguiDrawingRect(
  PAUSE_COVER_WIDGET,
  PAUSE_COVER_SPRITE,
  RHYTHM_GAME_UI_RECTS.buttonPause,
);
const NGUI_BASIC_SPRITE_SIMPLE_TYPE = 0;

for (const [label, sprite] of [
  ["Pause", PAUSE_MAIN_SPRITE],
  ["Pause/cover", PAUSE_COVER_SPRITE],
] as const) {
  if (
    sprite.type !== NGUI_BASIC_SPRITE_SIMPLE_TYPE
    || sprite.typeName !== "Simple"
    || sprite.spriteName !== "button_pause"
    || !sprite.fixedAspect
  ) {
    throw new Error(`Unsupported ${label} UISprite binding: ${JSON.stringify(sprite)}`);
  }
}

// Source: Pause/cover UISprite 1128 serialized UIWidget color in
// HOST________/VSCode/bangdream-apk/reverse/analysis/targets/level3-hud-subtree-report.*.
// ButtonTouchColor ctor constants are not decoded to RGBA yet, so this keeps
// the recovered cover widget color instead of inventing a touch flash color.
const PAUSE_COVER_ALPHA = 0.501960813999176;

interface NguiProgressDrawRegionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function applyNguiProgressDrawRegion(
  element: HTMLElement,
  fullWidth: number,
  fullHeight: number,
  value: number,
  fillDirection: number,
): NguiProgressDrawRegionRect {
  const amount = Math.max(0, Math.min(1, value));
  let xMin = 0;
  let yMin = 0;
  let xMax = 1;
  let yMax = 1;
  if (fillDirection === NGUI_PROGRESS_FILL_RIGHT_TO_LEFT) {
    xMin = 1 - amount;
  } else if (fillDirection === NGUI_PROGRESS_FILL_BOTTOM_TO_TOP) {
    yMax = amount;
  } else if (fillDirection === NGUI_PROGRESS_FILL_TOP_TO_BOTTOM) {
    yMin = 1 - amount;
  } else {
    xMax = amount;
  }

  // Source: UIProgressBar.ForceUpdate calls UIWidget.set_drawRegion(Vector4)
  // on mFG. This mirrors the resulting NGUI foreground widget draw rectangle;
  // it is not a texture crop or CSS mask.
  const rect = {
    left: fullWidth * xMin,
    top: fullHeight * yMin,
    width: fullWidth * (xMax - xMin),
    height: fullHeight * (yMax - yMin),
  };
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  element.style.clipPath = "";
  element.style.backgroundSize = `${fullWidth}px ${fullHeight}px`;
  element.style.backgroundPosition = `${-rect.left}px ${-rect.top}px`;
  return rect;
}

function parseLaunchRequestIdFromHash(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) {
    return "";
  }
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get("request")?.trim() ?? "";
}

function formatRuntimeIssueMessage(context: string, error?: unknown): string {
  const detail = (() => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    if (error === null || typeof error === "undefined") {
      return "";
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  })();
  const message = detail ? `${context}: ${detail}` : context;
  return message.length > SIMULATOR_RUNTIME_ERROR_MAX_LENGTH
    ? `${message.slice(0, SIMULATOR_RUNTIME_ERROR_MAX_LENGTH - 1)}…`
    : message;
}

function resolveMvPayloadFromMetadata(
  metadata: SimulatorLaunchPayload["metadata"] | null | undefined,
): SimulatorMvPayload | null {
  const source = metadata?.mvDataUrl;
  if (typeof source !== "string") {
    return null;
  }
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const kind: "image" | "video" =
    lower.startsWith("data:video/")
    || /\.(mp4|webm|ogg|mov|m4v|avi|mkv)(?:[?#].*)?$/i.test(trimmed)
      ? "video"
      : "image";
  const offsetMs = Number.isFinite(metadata?.mvOffsetMs ?? Number.NaN)
    ? Math.round(Number(metadata?.mvOffsetMs))
    : 0;
  return {
    kind,
    src: trimmed,
    offsetMs,
  };
}

function resolveMvPayloadCandidatesFromMetadata(
  metadata: SimulatorLaunchPayload["metadata"] | null | undefined,
): SimulatorMvPayload[] {
  const primary = resolveMvPayloadFromMetadata(metadata);
  const fallbackRaw = (metadata as { mvDataUrlFallback?: unknown } | null | undefined)?.mvDataUrlFallback;
  const fallbackSource = typeof fallbackRaw === "string" ? fallbackRaw.trim() : "";
  if (!primary) {
    if (!fallbackSource) {
      return [];
    }
    return [
      {
        kind:
          fallbackSource.toLowerCase().startsWith("data:video/")
          || /\.(mp4|webm|ogg|mov|m4v|avi|mkv)(?:[?#].*)?$/i.test(fallbackSource)
            ? "video"
            : "image",
        src: fallbackSource,
        offsetMs: 0,
      },
    ];
  }
  if (!fallbackSource || fallbackSource === primary.src) {
    return [primary];
  }
  const fallbackKind: "image" | "video" =
    fallbackSource.toLowerCase().startsWith("data:video/")
    || /\.(mp4|webm|ogg|mov|m4v|avi|mkv)(?:[?#].*)?$/i.test(fallbackSource)
      ? "video"
      : "image";
  return [
    primary,
    {
      kind: fallbackKind,
      src: fallbackSource,
      offsetMs: primary.offsetMs,
    },
  ];
}

export class SimulatorAppController {
  private ui: UiRefs;
  private runtime: SimulatorRuntime | null = null;
  private renderer: PixiRenderer | null = null;
  private isStarting = false;
  private pendingStartupTouch = false;
  private isPaused = false;
  private pauseStartedAtMs = 0;
  private readonly audio = new AudioEngine();
  private rafId = 0;
  private frameIntervalMs = 1000 / 60;
  private frameIntervalEpsilonMs = 0.25;
  private lastLoopTickMs = 0;
  private loopAccumulatorMs = 0;
  private lastElapsedMs = 0;
  private isDisposed = false;
  private activeEmptyTapPointerId: number | null = null;

  private settings: SimulatorSettings | null = null;
  private chartMvResource: MvResource | null = null;
  private mvPreflightPromise: Promise<void> | null = null;
  private mvPreflightResource: MvResource | null = null;
  private mvPreflightFailed = false;
  private mvPreflightKey = "";
  private mvPreflightToken = 0;

  private readonly launchRequestId = parseLaunchRequestIdFromHash();
  private launchPayload: SimulatorLaunchPayload | null = null;
  private launchPayloadUnlisten: UnlistenFn | null = null;
  private startupPhase: StartupPhase = "waiting_touch";
  private startupTouchMs = 0;
  private startupLaneTargetAlpha = 1;
  private startupCoverSrc = "";
  private lastAppliedUiAlpha = Number.NaN;
  private lastPauseBlocked: boolean | null = null;
  private runtimeStarted = false;
  private readonly reportedRuntimeIssueKeys = new Set<string>();
  private lastRenderedScore = Number.NaN;
  private lastScoreGaugeValue = 0;
  private lastScoreRankMarkers: readonly SimulatorScoreRankMarker[] = [];
  private rankFontMetricApproximation: NguiFontMetricApproximation | null = null;
  private bootRevealPrepared = false;
  private bootRevealRafId = 0;
  private bootPendingAlpha = 1;
  private bootPendingVisible = false;
  private domMvVideo: HTMLVideoElement | null = null;
  private pauseCoverFlashRaf1 = 0;
  private pauseCoverFlashRaf2 = 0;
  private readonly onWindowResize = () => {
    this.updateBootLayerLayout();
  };

  private disposeMvResource(resource: MvResource | null): void {
    if (!resource || resource.kind !== "video") {
      return;
    }
    const video = resource.video;
    try {
      video.pause();
    } catch {
      // ignore pause errors
    }
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // ignore unload errors
    }
    if (resource.objectUrl) {
      try {
        URL.revokeObjectURL(resource.objectUrl);
      } catch {
        // ignore revoke errors
      }
    }
  }

  private clearDomMvVideo(): void {
    while (this.ui.mvLayer.firstChild) {
      this.ui.mvLayer.removeChild(this.ui.mvLayer.firstChild);
    }
    this.domMvVideo = null;
    this.ui.mvLayer.style.display = "none";
    this.ui.mvLayer.style.opacity = "0";
    this.ui.mvLayer.style.zIndex = "0";
  }

  private attachDomMvVideo(video: HTMLVideoElement, alpha: number): void {
    if (this.domMvVideo !== video) {
      this.clearDomMvVideo();
      video.classList.add("simulator-mv-video");
      this.ui.mvLayer.appendChild(video);
      this.domMvVideo = video;
    }
    this.ui.mvLayer.style.display = "block";
    this.ui.mvLayer.style.opacity = `${this.clamp01(alpha)}`;
    this.applyMvLayerOrdering();
  }

  private applyMvLayerOrdering(): void {
    const glAlpha = this.renderer?.getWebglContextAlphaEnabled();
    if (glAlpha === false) {
      this.ui.mvLayer.style.zIndex = "2";
    } else {
      this.ui.mvLayer.style.zIndex = "0";
    }
  }

  private resetMvPreflightState(): void {
    this.mvPreflightToken += 1;
    this.mvPreflightPromise = null;
    this.mvPreflightFailed = false;
    this.mvPreflightKey = "";
    if (this.mvPreflightResource) {
      this.disposeMvResource(this.mvPreflightResource);
      this.mvPreflightResource = null;
    }
  }

  private buildMvPreflightKey(mvModeEnabled: boolean, payloadMvCandidates: readonly SimulatorMvPayload[]): string {
    if (!mvModeEnabled) {
      return "off";
    }
    if (payloadMvCandidates.length <= 0) {
      return "on:none";
    }
    const parts = payloadMvCandidates.map((candidate) => {
      const offset = Number.isFinite(candidate.offsetMs) ? Math.round(candidate.offsetMs ?? 0) : 0;
      return `${candidate.kind}:${offset}:${candidate.src}`;
    });
    return `on:${parts.join("|")}`;
  }

  private scheduleMvPreflight(payload: SimulatorLaunchPayload | null | undefined): void {
    if (!payload) {
      this.resetMvPreflightState();
      return;
    }
    const previewSettings = buildSettingsFromPayload(payload.settings ?? null);
    const payloadMvCandidates = resolveMvPayloadCandidatesFromMetadata(payload.metadata);
    const key = this.buildMvPreflightKey(previewSettings.mvmode, payloadMvCandidates);
    if (
      this.mvPreflightKey === key
      && (this.mvPreflightPromise !== null || this.mvPreflightResource !== null || this.mvPreflightFailed)
    ) {
      return;
    }

    const token = this.mvPreflightToken + 1;
    this.mvPreflightToken = token;
    this.mvPreflightPromise = null;
    this.mvPreflightFailed = false;
    this.mvPreflightKey = key;
    if (this.mvPreflightResource) {
      this.disposeMvResource(this.mvPreflightResource);
      this.mvPreflightResource = null;
    }

    if (!previewSettings.mvmode) {
      return;
    }
    if (payloadMvCandidates.length <= 0) {
      this.mvPreflightFailed = true;
      return;
    }

    this.mvPreflightPromise = (async () => {
      let resource: MvResource | null = null;
      for (const candidate of payloadMvCandidates) {
        resource = await loadMvResourceFromPayload(candidate).catch(() => null);
        if (resource) {
          break;
        }
      }
      return resource;
    })()
      .then((resource) => {
        if (token !== this.mvPreflightToken) {
          this.disposeMvResource(resource);
          return;
        }
        if (!resource) {
          this.mvPreflightFailed = true;
          this.reportRuntimeIssue("MV 资源预加载失败，已回退为普通背景", undefined, "mv-preflight");
          return;
        }
        this.mvPreflightResource = resource;
      })
      .catch((error: unknown) => {
        if (token !== this.mvPreflightToken) {
          return;
        }
        this.mvPreflightFailed = true;
        this.reportRuntimeIssue("MV 资源预加载异常，已回退为普通背景", error, "mv-preflight");
      });
  }

  private async consumeMvPreflightForPayload(
    payload: SimulatorLaunchPayload,
  ): Promise<{ resource: MvResource | null; failed: boolean }> {
    this.scheduleMvPreflight(payload);
    if (this.mvPreflightPromise) {
      await this.mvPreflightPromise;
      this.mvPreflightPromise = null;
    }
    const previewSettings = buildSettingsFromPayload(payload.settings ?? null);
    const payloadMvCandidates = resolveMvPayloadCandidatesFromMetadata(payload.metadata);
    const expectedKey = this.buildMvPreflightKey(previewSettings.mvmode, payloadMvCandidates);
    if (this.mvPreflightKey !== expectedKey) {
      return { resource: null, failed: previewSettings.mvmode };
    }
    const resource = this.mvPreflightResource;
    this.mvPreflightResource = null;
    return { resource, failed: this.mvPreflightFailed || resource === null };
  }

  private beginStartIfNeeded(): void {
    if (this.isDisposed || this.isStarting || !this.launchPayload) {
      return;
    }
    this.isStarting = true;
    void this.start()
      .catch((error: unknown) => {
        this.reportRuntimeIssue("模拟器启动失败", error, "simulator-start");
      })
      .finally(() => {
        this.isStarting = false;
      });
  }

  private readonly onHostPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    if (this.isPaused) {
      return;
    }
    if (this.startupPhase === "waiting_touch") {
      const preflightVideo = this.mvPreflightResource?.kind === "video" ? this.mvPreflightResource.video : null;
      if (preflightVideo) {
        try {
          preflightVideo.muted = true;
          preflightVideo.defaultMuted = true;
          void preflightVideo.play().then(() => {
            preflightVideo.pause();
            try {
              preflightVideo.currentTime = 0;
            } catch {
              // ignore seek errors
            }
          }).catch(() => {
            // ignore warmup play rejection
          });
        } catch {
          // ignore warmup errors
        }
      }
      this.pendingStartupTouch = true;
      if (this.renderer && this.runtime && this.settings) {
        this.startupPhase = "animating";
        this.startupTouchMs = performance.now();
        this.pendingStartupTouch = false;
      } else {
        this.beginStartIfNeeded();
      }
      return;
    }
    if (!this.renderer || !this.runtime || !this.settings) {
      return;
    }
    if (this.startupPhase !== "running" || !this.runtimeStarted) {
      return;
    }
    if (this.activeEmptyTapPointerId !== null) {
      return;
    }
    if (!this.settings.effectEnable) {
      return;
    }
    const rect = this.ui.host.getBoundingClientRect();
    const viewportX = event.clientX - rect.left;
    const lane = this.renderer.resolveSlotLaneFromViewportX(viewportX);
    if (lane === null) {
      return;
    }
    this.activeEmptyTapPointerId = event.pointerId;
    try {
      this.ui.host.setPointerCapture(event.pointerId);
    } catch {
      // ignore unsupported capture errors
    }
    this.renderer.triggerEmptyTapEffects(lane, this.lastElapsedMs);
  };

  private readonly onPauseButtonClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (this.startupPhase !== "running" || !this.runtimeStarted) {
      return;
    }
    if (!this.isPaused) {
      this.startPauseCoverFlash();
    }
    this.setPaused(!this.isPaused);
  };

  private readonly onHostPointerUpOrCancel = (event: PointerEvent) => {
    if (this.activeEmptyTapPointerId === null || event.pointerId !== this.activeEmptyTapPointerId) {
      return;
    }
    if (this.renderer && this.settings?.effectEnable) {
      this.renderer.endEmptyTapEffects(this.lastElapsedMs);
    }
    this.activeEmptyTapPointerId = null;
    try {
      this.ui.host.releasePointerCapture(event.pointerId);
    } catch {
      // ignore unsupported capture errors
    }
  };

  constructor(parent: HTMLElement) {
    this.ui = this.buildUi(parent);
    this.applyUiAlpha(0);
    this.applyPauseUiState();
    this.applyBootCoverState(1, true);
    this.updateBootLayerLayout();
    this.ui.pauseButton.addEventListener("click", this.onPauseButtonClick);
    this.ui.host.addEventListener("pointerdown", this.onHostPointerDown);
    this.ui.host.addEventListener("pointerup", this.onHostPointerUpOrCancel);
    this.ui.host.addEventListener("pointercancel", this.onHostPointerUpOrCancel);
    window.addEventListener("resize", this.onWindowResize);
    if ("fonts" in document) {
      void document.fonts.load(`${SCORE_RANK_LABEL_FONT_SIZE}px TTShinGoM`).catch(() => {});
      void document.fonts.ready.then(() => this.updateFontSensitiveLayout()).catch(() => {});
    }
    void loadNguiFontMetricApproximation(ttShinGoMFontUrl)
      .then((metrics) => {
        if (this.isDisposed) {
          return;
        }
        this.rankFontMetricApproximation = metrics;
        this.updateFontSensitiveLayout();
      })
      .catch((error) => {
        this.reportRuntimeIssue(
          "Rank 字体近似 metrics 解析失败，已回退到 Canvas 中线",
          error,
          "rank-font-metrics",
        );
      });
    void this.attachLaunchPayloadBridge();
  }

  private updateFontSensitiveLayout(): void {
    if (this.isDisposed) {
      return;
    }
    this.updateBootLayerLayout();
    const rect = this.ui.root.getBoundingClientRect();
    this.updateScoreRankMarkerLayout(
      Math.max(1, rect.width || window.innerWidth || 1),
      Math.max(1, rect.height || window.innerHeight || 1),
      this.lastScoreRankMarkers,
    );
  }

  private reportRuntimeIssue(context: string, error?: unknown, key = context): void {
    const message = formatRuntimeIssueMessage(context, error);
    if (!this.reportedRuntimeIssueKeys.has(key)) {
      this.reportedRuntimeIssueKeys.add(key);
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`[Simulator] ${message}`, error);
      }
    }
    this.ui.runtimeErrorOverlay.textContent = message;
    this.ui.runtimeErrorOverlay.style.display = "block";
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.stopLoop();
    this.renderer?.destroy();
    this.renderer = null;
    this.runtime = null;
    this.releaseMvResource();
    this.resetMvPreflightState();
    if (this.launchPayloadUnlisten) {
      void this.launchPayloadUnlisten();
      this.launchPayloadUnlisten = null;
    }
    this.ui.pauseButton.removeEventListener("click", this.onPauseButtonClick);
    this.ui.host.removeEventListener("pointerdown", this.onHostPointerDown);
    this.ui.host.removeEventListener("pointerup", this.onHostPointerUpOrCancel);
    this.ui.host.removeEventListener("pointercancel", this.onHostPointerUpOrCancel);
    window.removeEventListener("resize", this.onWindowResize);
    this.clearPauseCoverFlash();
    this.ui.root.remove();
  }

  private buildUi(parent: HTMLElement): UiRefs {
    const root = document.createElement("div");
    root.className = "simulator-page";

    const shell = document.createElement("div");
    shell.className = "simulator-shell";

    const host = document.createElement("div");
    host.className = "simulator-canvas-wrap";
    const mvLayer = document.createElement("div");
    mvLayer.className = "simulator-mv-layer";
    const canvasHost = document.createElement("div");
    canvasHost.className = "simulator-canvas-host";
    host.append(mvLayer, canvasHost);

    const uiLayer = document.createElement("div");
    uiLayer.className = "simulator-ui-layer";
    const runtimeErrorOverlay = document.createElement("div");
    runtimeErrorOverlay.className = "simulator-runtime-error";
    runtimeErrorOverlay.setAttribute("role", "status");
    runtimeErrorOverlay.setAttribute("aria-live", "polite");
    const pauseMask = document.createElement("div");
    pauseMask.className = "simulator-pause-mask";

    const scoreHud = document.createElement("div");
    scoreHud.className = "simulator-score-hud";
    const scoreBase = document.createElement("div");
    scoreBase.className = "simulator-score-base";
    const scoreTopTrack = document.createElement("div");
    scoreTopTrack.className = "simulator-score-top-track";
    const scoreGaugeFill = document.createElement("div");
    scoreGaugeFill.className = "simulator-score-gauge-fill";
    scoreTopTrack.append(scoreGaugeFill);
    const scoreText = document.createElement("span");
    scoreText.className = "simulator-score-value";
    const scoreDigits: HTMLSpanElement[] = [];
    for (let index = 0; index < SCORE_HUD_DIGIT_COUNT; index += 1) {
      const digit = document.createElement("span");
      digit.className = "simulator-score-digit";
      digit.textContent = "0";
      scoreDigits.push(digit);
      scoreText.appendChild(digit);
    }
    const scoreRankObject = document.createElement("div");
    scoreRankObject.className = "simulator-score-rank-object";
    const scoreRankMarkers = {} as Record<SimulatorScoreRankLabel, ScoreRankMarkerRefs>;
    for (const rank of SIMULATOR_SCORE_RANK_LABELS) {
      const marker = document.createElement("div");
      marker.className = "simulator-score-rank-marker";
      marker.dataset.rank = rank;
      const label = document.createElement("canvas");
      label.className = "simulator-score-rank-label";
      label.setAttribute("aria-label", rank);
      const separator = document.createElement("img");
      const separatorFrame = document.createElement("div");
      separatorFrame.className = "simulator-score-rank-separator";
      separator.className = "simulator-score-rank-separator-image";
      separator.alt = "";
      separator.decoding = "async";
      separator.hidden = true;
      separatorFrame.hidden = true;
      separatorFrame.appendChild(separator);
      marker.append(label, separatorFrame);
      scoreRankObject.appendChild(marker);
      scoreRankMarkers[rank] = { root: marker, label, separator: separatorFrame, separatorImage: separator };
    }
    scoreHud.append(scoreBase, scoreTopTrack, scoreRankObject, scoreText);

    const lifeGauge = document.createElement("div");
    lifeGauge.className = "simulator-life-gauge";
    const lifeGaugeBg = document.createElement("img");
    lifeGaugeBg.className = "simulator-life-gauge-bg";
    lifeGaugeBg.alt = "";
    lifeGaugeBg.decoding = "async";
    const lifeGaugeFillWrap = document.createElement("div");
    lifeGaugeFillWrap.className = "simulator-life-gauge-fill-wrap";
    const lifeGaugeFill = document.createElement("img");
    lifeGaugeFill.className = "simulator-life-gauge-fill";
    lifeGaugeFill.alt = "";
    lifeGaugeFill.decoding = "async";
    const lifeGaugeSecondFillWrap = document.createElement("div");
    lifeGaugeSecondFillWrap.className = "simulator-life-gauge-fill-wrap simulator-life-gauge-fill-wrap-second";
    const lifeGaugeSecondFill = document.createElement("img");
    lifeGaugeSecondFill.className = "simulator-life-gauge-fill simulator-life-gauge-fill-second";
    lifeGaugeSecondFill.alt = "";
    lifeGaugeSecondFill.decoding = "async";
    lifeGaugeFillWrap.appendChild(lifeGaugeFill);
    lifeGaugeSecondFillWrap.appendChild(lifeGaugeSecondFill);
    // Source: UIPanel.CompareFunc first sorts UIWidget.mDepth, then Transform
    // sibling index. The depths are read from level3-hud-subtree-report.json
    // raw UISprite offset 144 instead of copied in as visual constants.
    const lifeGaugeLayers = [
      { element: lifeGaugeBg, depth: LIFE_GAUGE_BACKGROUND_DEPTH, sibling: 0 },
      { element: lifeGaugeFillWrap, depth: LIFE_GAUGE_FRONT_DEPTH, sibling: 1 },
      { element: lifeGaugeSecondFillWrap, depth: LIFE_GAUGE_SECOND_FRONT_DEPTH, sibling: 2 },
    ].sort((a, b) => (a.depth - b.depth) || (a.sibling - b.sibling));
    lifeGauge.append(...lifeGaugeLayers.map((layer) => layer.element));

    void loadRhythmGameUiHudSpriteDataUrls()
      .then((sprites) => {
        if (sprites.gaugeBaseScore) {
          scoreBase.style.backgroundImage = `url("${sprites.gaugeBaseScore}")`;
        }
        if (sprites.scoreMeterBlue) {
          scoreGaugeFill.style.backgroundImage = `url("${sprites.scoreMeterBlue}")`;
        }
        if (sprites.levelMark) {
          for (const marker of Object.values(scoreRankMarkers)) {
            marker.separatorImage.src = sprites.levelMark;
            marker.separatorImage.hidden = false;
            marker.separator.hidden = false;
          }
        } else {
          this.reportRuntimeIssue(
            "level_mark 贴图加载失败：UICommon 裁切结果为空",
            undefined,
            "level-mark-empty",
          );
        }
        this.applyScoreGaugeDrawRegion();
        if (sprites.bgHealth) {
          lifeGaugeBg.src = sprites.bgHealth;
        }
        if (sprites.hpMeterMain ?? sprites.hpMeter) {
          lifeGaugeFill.src = sprites.hpMeterMain ?? sprites.hpMeter ?? "";
        }
        if (sprites.hpMeterSecond) {
          lifeGaugeSecondFill.src = sprites.hpMeterSecond;
        }
      })
      .catch((error: unknown) => {
        this.reportRuntimeIssue("HUD 贴图加载失败，已跳过部分 UI 贴图", error, "hud-assets");
      });
    void loadRhythmGameUiSpriteDataUrls().catch((error: unknown) => {
      this.reportRuntimeIssue("RhythmGameUI 图集裁切失败", error, "rhythm-game-ui-atlas");
    });
    void loadScoreFontGlyphDataUrls()
      .then((glyphs) => {
        for (const digit of scoreDigits) {
          const value = digit.dataset.scoreGlyph as keyof typeof glyphs | undefined;
          if (value && glyphs[value]) {
            digit.style.backgroundImage = `url("${glyphs[value]}")`;
          }
        }
      })
      .catch((error: unknown) => {
        this.reportRuntimeIssue("分数字体贴图加载失败", error, "score-font-atlas");
      });

    const pauseAnchor = document.createElement("div");
    pauseAnchor.className = "simulator-pause-anchor";
    const pauseButton = document.createElement("button");
    pauseButton.type = "button";
    pauseButton.className = "simulator-pause-button";
    pauseButton.setAttribute("aria-label", "暂停");
    const pauseCore = document.createElement("span");
    pauseCore.className = "tool-icon-core";
    const pauseIconPause = document.createElement("img");
    pauseIconPause.className = "simulator-pause-icon simulator-pause-icon-pause";
    pauseIconPause.alt = "";
    pauseIconPause.decoding = "async";
    const pauseCoverIcon = document.createElement("img");
    pauseCoverIcon.className = "simulator-pause-icon simulator-pause-icon-cover";
    pauseCoverIcon.alt = "";
    pauseCoverIcon.decoding = "async";
    pauseCoverIcon.style.setProperty("--sim-pause-cover-alpha", `${PAUSE_COVER_ALPHA}`);
    void loadPauseButtonImageDataUrl()
      .then((url) => {
        if (url) {
          pauseIconPause.src = url;
          pauseCoverIcon.src = url;
        }
      })
      .catch((error: unknown) => {
        this.reportRuntimeIssue("暂停按钮贴图加载失败", error, "pause-button-image");
      });
    pauseCore.append(pauseIconPause, pauseCoverIcon);
    pauseButton.append(pauseCore);
    pauseAnchor.append(pauseButton);
    uiLayer.append(pauseMask, scoreHud, lifeGauge, pauseAnchor);

    const bootLayer = document.createElement("div");
    bootLayer.className = "simulator-boot-layer";
    const bootBack = document.createElement("div");
    bootBack.className = "simulator-boot-back";
    const bootFrame = document.createElement("div");
    bootFrame.className = "simulator-boot-frame";
    const bootCoverWrap = document.createElement("div");
    bootCoverWrap.className = "simulator-boot-cover-wrap";
    const bootCover = document.createElement("img");
    bootCover.className = "simulator-boot-cover";
    bootCover.alt = "";
    bootCoverWrap.appendChild(bootCover);
    const bootTitleBar = document.createElement("div");
    bootTitleBar.className = "simulator-boot-title";
    const bootTitleText = document.createElement("span");
    bootTitleText.className = "simulator-boot-title-text";
    const bootDifficultyBadge = document.createElement("div");
    bootDifficultyBadge.className = "simulator-boot-difficulty";
    const bootDifficultyText = document.createElement("span");
    bootDifficultyText.className = "simulator-boot-difficulty-text";
    bootDifficultyBadge.appendChild(bootDifficultyText);
    bootLayer.append(bootBack, bootFrame, bootCoverWrap, bootTitleBar, bootTitleText, bootDifficultyBadge);

    shell.append(host, bootLayer, uiLayer, runtimeErrorOverlay);
    root.appendChild(shell);
    parent.appendChild(root);

    return {
      root,
      host,
      canvasHost,
      mvLayer,
      uiLayer,
      runtimeErrorOverlay,
      pauseMask,
      scoreHud,
      scoreBase,
      scoreTopTrack,
      scoreGaugeFill,
      scoreText,
      scoreDigits,
      scoreRankObject,
      scoreRankMarkers,
      lifeGauge,
      lifeGaugeBg,
      lifeGaugeFillWrap,
      lifeGaugeFill,
      lifeGaugeSecondFillWrap,
      lifeGaugeSecondFill,
      pauseAnchor,
      pauseButton,
      pauseIconPause,
      pauseCoverIcon,
      bootLayer,
      bootBack,
      bootFrame,
      bootCoverWrap,
      bootCover,
      bootTitleBar,
      bootTitleText,
      bootDifficultyBadge,
      bootDifficultyText,
    };
  }

  private async attachLaunchPayloadBridge(): Promise<void> {
    if (!this.launchRequestId) {
      return;
    }
    if (isMobileRuntime()) {
      const envelope = readMobileRoutePayload<SimulatorWindowPayloadEnvelope>(this.launchRequestId);
      if (envelope?.requestId === this.launchRequestId && envelope.payload) {
        this.launchPayload = envelope.payload;
        this.scheduleMvPreflight(envelope.payload);
        this.applyLaunchMetadata(envelope.payload.metadata);
        this.applyBootCoverState(1, true);
        removeMobileRoutePayload(this.launchRequestId);
        return;
      }
    }
    try {
      const currentWindow = getCurrentWebviewWindow();
      this.launchPayloadUnlisten = await currentWindow.listen<SimulatorWindowPayloadEnvelope>(
        SIMULATOR_WINDOW_PAYLOAD_EVENT,
        (event) => {
          if (this.isDisposed) {
            return;
          }
          const envelope = event.payload;
          if (!envelope || envelope.requestId !== this.launchRequestId || !envelope.payload) {
            return;
          }
          this.launchPayload = envelope.payload;
          this.scheduleMvPreflight(envelope.payload);
          this.applyLaunchMetadata(envelope.payload.metadata);
          this.applyBootCoverState(1, true);
        },
      );
      await emit(SIMULATOR_WINDOW_READY_EVENT, {
        requestId: this.launchRequestId,
        label: currentWindow.label,
      });
    } catch {
      // ignore launch payload bridge errors
    }
  }

  private async start(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    const pendingStartupTouch = this.pendingStartupTouch;
    this.stopLoop();
    this.pendingStartupTouch = pendingStartupTouch;
    this.renderer?.destroy();
    this.renderer = null;
    this.runtime = null;
    this.releaseMvResource();

    if (!this.launchPayload) {
      throw new Error("Launch payload is required.");
    }
    this.lastAppliedUiAlpha = Number.NaN;
    this.lastPauseBlocked = null;
    const payloadMetadata = this.launchPayload.metadata ?? null;
    this.applyLaunchMetadata(payloadMetadata);
    this.applyBootCoverState(1, true);
    this.applyPauseUiState();
    this.applyUiAlpha(0);
    this.updateScoreHud(null);

    const settings = buildSettingsFromPayload(this.launchPayload.settings ?? null);
    this.settings = settings;
    this.frameIntervalMs = 1000 / Math.max(1, settings.fps);
    this.frameIntervalEpsilonMs = Math.max(0.1, this.frameIntervalMs * 0.03);
    if (!this.launchPayload.chartData) {
      throw new Error("Launch payload requires chartData.");
    }

    this.renderer = new PixiRenderer(settings);
    await this.renderer.mount(this.ui.canvasHost);
    this.applyMvLayerOrdering();

    const rendererRef = this.renderer;
    const noteSkinPayload = this.launchPayload?.skin?.noteSkin ?? null;
    const fieldSkinPayload = this.launchPayload?.skin?.fieldSkin ?? null;
    const bgSkinPayload = this.launchPayload?.skin?.bgSkin ?? null;
    const judgeSkinPayload = this.launchPayload?.skin?.judgeSkin ?? null;
    const assetsPromise = (() => {
      if (!noteSkinPayload) {
        throw new Error("NoteSkin payload is required.");
      }
      return loadNoteSkinTextureBundle(
        noteSkinPayload,
        fieldSkinPayload,
        bgSkinPayload,
        judgeSkinPayload,
      ).catch((error: unknown) => {
        this.reportRuntimeIssue("音符/判定贴图加载失败，已使用空资源继续", error, "note-skin-assets");
        return null;
      });
    })();

    await this.audio.ensureContext();
    const payloadAudio = this.launchPayload?.audio ?? null;
    this.audio.setVolumes({
      bgmVolumePercent: payloadAudio?.bgmVolumePercent,
      seVolumePercent: payloadAudio?.seVolumePercent,
    });
    const payloadBgmDataUrl =
      typeof payloadMetadata?.bgmDataUrl === "string" && payloadMetadata.bgmDataUrl.trim() !== ""
        ? payloadMetadata.bgmDataUrl
        : null;
    const payloadSeRuntimeAssets = payloadAudio?.seRuntimeAssets;
    const audioPromise = Promise.all([
      (payloadBgmDataUrl
        ? this.audio.loadBgmFromDataUrl(payloadBgmDataUrl)
        : Promise.resolve(this.audio.clearBgm())).catch((error: unknown) => {
          this.reportRuntimeIssue("BGM 加载失败，已静音继续", error, "bgm-load");
        }),
      this.audio.loadSeFromRuntimeAssets(payloadSeRuntimeAssets ?? null).catch((error: unknown) => {
        this.reportRuntimeIssue("打击音加载失败，已静音继续", error, "se-load");
      }),
    ]);

    const assets = await assetsPromise;
    if (this.renderer === rendererRef) {
      this.renderer.setAssets(assets);
    } else if (assets) {
      assets.destroy();
    }
    await audioPromise;

    precomputeLut(settings);
    const chart: ParsedChart = parseEditorChart(this.launchPayload.chartData, settings);
    this.renderer.setChart(chart);

    if (settings.mvmode) {
      const preflight = await this.consumeMvPreflightForPayload(this.launchPayload);
      if (preflight.failed || !preflight.resource) {
        settings.mvmode = false;
        this.chartMvResource = null;
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("[Simulator] MV preflight failed, fallback to BG rendering.");
        }
      } else {
        this.chartMvResource = preflight.resource;
      }
    }
    if (settings.mvmode && this.chartMvResource?.kind === "video") {
      this.attachDomMvVideo(this.chartMvResource.video, settings.mvAlpha);
    } else {
      this.clearDomMvVideo();
    }

    this.runtime = new SimulatorRuntime(settings, chart);

    this.lastLoopTickMs = 0;
    this.loopAccumulatorMs = 0;
    this.lastElapsedMs = 0;

    if (this.pendingStartupTouch) {
      this.startupPhase = "animating";
      this.startupTouchMs = performance.now();
      this.pendingStartupTouch = false;
    }

    this.renderer.setStartupRenderState(this.resolveStartupRenderState(performance.now()));
    this.loop();
  }

  private loop = (): void => {
    if (!this.renderer || !this.settings || this.isDisposed) {
      return;
    }

    const now = performance.now();
    if (this.lastLoopTickMs <= 0) {
      this.lastLoopTickMs = now;
    }

    const rawDelta = now - this.lastLoopTickMs;
    this.lastLoopTickMs = now;
    const deltaMs = Math.max(0, Math.min(250, rawDelta));
    this.loopAccumulatorMs += deltaMs;

    if (this.loopAccumulatorMs + this.frameIntervalEpsilonMs < this.frameIntervalMs) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }
    if (this.loopAccumulatorMs > this.frameIntervalMs * 3) {
      this.loopAccumulatorMs = this.frameIntervalMs;
    } else {
      this.loopAccumulatorMs = this.loopAccumulatorMs % this.frameIntervalMs;
    }

    if (!this.runtime) {
      return;
    }

    const startupRenderState = this.resolveStartupRenderState(now);
    if (this.startupPhase === "running" || this.runtimeStarted) {
      startupRenderState.playfieldAlpha = this.startupLaneTargetAlpha;
    }
    this.renderer.setStartupRenderState(startupRenderState);
    this.applyUiAlpha(startupRenderState.uiAlpha);
    const bootCoverState = this.resolveBootCoverState(now);
    this.applyBootCoverState(bootCoverState.alpha, bootCoverState.visible);

    if (this.isPaused && this.runtimeStarted) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    if (
      this.startupPhase === "animating"
      && !this.runtimeStarted
      && this.settings
      && now - this.startupTouchMs >= STARTUP_TIMELINE_TOTAL_MS
    ) {
      const runtimeShiftMs = STARTUP_CHART_PREROLL_MS - this.settings.offsetMs;
      this.runtime.start(now + runtimeShiftMs);
      this.runtimeStarted = true;
      this.startupPhase = "running";
    }

    const stats = this.runtime.update(now);
    this.lastElapsedMs = stats.elapsedMs;
    this.updateScoreHud(stats);

    if (this.runtimeStarted && this.runtime.consumePendingMusicStart()) {
      this.audio.playBgm();
    }

    if (this.runtimeStarted) {
      for (const se of this.runtime.consumePendingSeNotes()) {
        this.audio.playSe(se);
      }
    }

    if (this.runtimeStarted) {
      const particleTriggers = this.runtime.consumePendingParticleTriggers();
      if (particleTriggers.length > 0) {
        this.renderer.pushParticleTriggers(particleTriggers);
      }
      const judgeTriggers = this.runtime.consumePendingJudgeTriggers();
      if (judgeTriggers.length > 0) {
        this.renderer.pushJudgeTriggers(judgeTriggers);
      }
    }

    if (this.settings?.mvmode && this.renderer.isWebglContextLost()) {
      this.fallbackToLiveBgOnMvRuntimeError(new Error("webgl context lost"));
    }

    const elapsedMs = stats.elapsedMs;
    let mvFrame:
      | { kind: "image"; src: string; alpha: number; sourceWidth: number; sourceHeight: number }
      | null = null;
    if (this.domMvVideo && !this.runtimeStarted) {
      this.ui.mvLayer.style.display = "none";
    }
    this.applyMvLayerOrdering();
    if (this.runtimeStarted) {
      try {
        mvFrame = this.resolveChartMvFrame(elapsedMs);
      } catch (error) {
        this.fallbackToLiveBgOnMvRuntimeError(error);
        mvFrame = null;
      }
    }

    try {
      this.renderer.render(
        this.runtime.getActiveNotes(),
        this.runtime.getActiveSlides(),
        this.runtime.getActiveNotesMap(),
        this.runtime.getNoteLifecycleStates(),
        stats,
        mvFrame,
      );
    } catch (error) {
      if (this.settings?.mvmode) {
        this.fallbackToLiveBgOnMvRuntimeError(error);
        this.renderer.render(
          this.runtime.getActiveNotes(),
          this.runtime.getActiveSlides(),
          this.runtime.getActiveNotesMap(),
          this.runtime.getNoteLifecycleStates(),
          stats,
          null,
        );
      } else {
        throw error;
      }
    }

    if (!this.runtimeStarted || !this.runtime.isFinished()) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private resolveStartupRenderState(nowMs: number): SimulatorStartupRenderState {
    if (this.startupPhase === "waiting_touch" || this.startupTouchMs <= 0) {
      return {
        liveBgAlpha: 0,
        liveBgScale: 1,
        liveBgAnchorTopCenter: true,
        playfieldAlpha: 0,
        uiAlpha: 0,
        chartObjectsVisible: false,
      };
    }

    const t = Math.max(0, nowMs - this.startupTouchMs);
    const stage1End = STARTUP_STAGE_LIVE_BG_FADE_IN_MS;
    const stage2End = stage1End + STARTUP_STAGE_COVER_FADE_OUT_MS;
    const stage3End = stage2End + STARTUP_STAGE_UI_FADE_IN_MS;
    const postUiEnd = stage3End + STARTUP_STAGE_POST_UI_DURATION_MS;
    const playfieldFadeStart = stage3End + STARTUP_STAGE_PLAYFIELD_FADE_DELAY_MS;
    const playfieldFadeEnd = playfieldFadeStart + STARTUP_STAGE_PLAYFIELD_FADE_MS;
    const liveBgScaleEnabled = this.settings?.mvmode !== true;

    let liveBgAlpha = 0;
    let liveBgScale = 1;
    let uiAlpha = 0;
    let playfieldAlpha = 0;

    if (t <= stage1End) {
      liveBgAlpha = this.lerp(0, 0.1, t / Math.max(1, STARTUP_STAGE_LIVE_BG_FADE_IN_MS));
    } else {
      liveBgAlpha = 0.1;
    }

    if (t > stage2End && t <= stage3End) {
      uiAlpha = this.lerp(0, 1, (t - stage2End) / Math.max(1, STARTUP_STAGE_UI_FADE_IN_MS));
    } else if (t > stage3End) {
      uiAlpha = 1;
    }

    if (t > stage3End && t <= stage3End + STARTUP_STAGE_LIVE_BG_ALPHA_TO_FULL_MS) {
      const phase = (t - stage3End) / Math.max(1, STARTUP_STAGE_LIVE_BG_ALPHA_TO_FULL_MS);
      liveBgAlpha = this.lerp(0.1, 1, phase);
    } else if (t > stage3End + STARTUP_STAGE_LIVE_BG_ALPHA_TO_FULL_MS) {
      liveBgAlpha = 1;
    }

    if (liveBgScaleEnabled) {
      if (t > stage3End && t <= postUiEnd) {
        const phase = (t - stage3End) / Math.max(1, STARTUP_STAGE_POST_UI_DURATION_MS);
        const eased = this.easeInOutSmooth(phase);
        liveBgScale = this.lerp(1, STARTUP_LIVE_BG_TARGET_SCALE, eased);
      } else if (t > postUiEnd) {
        liveBgScale = STARTUP_LIVE_BG_TARGET_SCALE;
      }
    }

    if (t > playfieldFadeStart && t <= playfieldFadeEnd) {
      const phase = (t - playfieldFadeStart) / Math.max(1, STARTUP_STAGE_PLAYFIELD_FADE_MS);
      playfieldAlpha = this.lerp(0, this.startupLaneTargetAlpha, phase);
    } else if (t > playfieldFadeEnd) {
      playfieldAlpha = this.startupLaneTargetAlpha;
    }

    return {
      liveBgAlpha: this.clamp01(liveBgAlpha),
      liveBgScale: Math.max(0, liveBgScale),
      liveBgAnchorTopCenter: true,
      playfieldAlpha: this.clamp01(playfieldAlpha),
      uiAlpha: this.clamp01(uiAlpha),
      chartObjectsVisible: this.startupPhase === "running" && this.runtimeStarted,
    };
  }

  private resolveBootCoverState(nowMs: number): { alpha: number; visible: boolean } {
    if (!this.startupCoverSrc) {
      return { alpha: 0, visible: false };
    }
    if (this.startupPhase === "waiting_touch" || this.startupTouchMs <= 0) {
      return { alpha: 1, visible: true };
    }
    const t = Math.max(0, nowMs - this.startupTouchMs);
    const fadeStart = STARTUP_STAGE_LIVE_BG_FADE_IN_MS;
    const fadeEnd = fadeStart + STARTUP_STAGE_COVER_FADE_OUT_MS;
    if (t <= fadeStart) {
      return { alpha: 1, visible: true };
    }
    if (t >= fadeEnd) {
      return { alpha: 0, visible: false };
    }
    const phase = (t - fadeStart) / Math.max(1, STARTUP_STAGE_COVER_FADE_OUT_MS);
    return {
      alpha: this.clamp01(1 - phase),
      visible: true,
    };
  }

  private applyLaunchMetadata(metadata: SimulatorLaunchPayload["metadata"] | null | undefined): void {
    this.startupCoverSrc = typeof metadata?.coverDataUrl === "string"
      ? metadata.coverDataUrl
      : "";
    this.applyBootTitle(metadata?.title);
    this.applyDifficultyStyle(metadata?.difficulty);
    this.applyBootCoverSource(this.startupCoverSrc);
  }

  private applyBootCoverSource(src: string): void {
    if (!src) {
      this.ui.bootCover.removeAttribute("src");
      this.updateBootLayerLayout();
      return;
    }
    this.ui.bootCover.src = src;
    this.updateBootLayerLayout();
  }

  private prepareBootRevealIfNeeded(): void {
    if (this.bootRevealPrepared || this.bootRevealRafId !== 0) {
      return;
    }
    this.ui.bootLayer.style.display = "flex";
    this.ui.bootLayer.style.visibility = "hidden";
    this.ui.bootLayer.style.opacity = "0";
    this.updateBootLayerLayout();
    this.bootRevealRafId = requestAnimationFrame(() => {
      this.bootRevealRafId = requestAnimationFrame(() => {
        this.bootRevealRafId = 0;
        if (this.isDisposed) {
          return;
        }
        this.updateBootLayerLayout();
        this.bootRevealPrepared = true;
        this.applyBootCoverState(this.bootPendingAlpha, this.bootPendingVisible);
      });
    });
  }

  private applyBootCoverState(alpha: number, visible: boolean): void {
    this.bootPendingAlpha = alpha;
    this.bootPendingVisible = visible;
    const shouldShow = visible && this.startupCoverSrc.length > 0;
    if (!shouldShow) {
      if (this.bootRevealRafId) {
        cancelAnimationFrame(this.bootRevealRafId);
        this.bootRevealRafId = 0;
      }
      this.bootRevealPrepared = false;
      this.ui.bootLayer.style.visibility = "";
      this.ui.bootLayer.style.display = "none";
      this.ui.bootLayer.style.opacity = "0";
      return;
    }
    if (!this.bootRevealPrepared) {
      this.prepareBootRevealIfNeeded();
      return;
    }
    this.ui.bootLayer.style.display = "flex";
    this.ui.bootLayer.style.visibility = "";
    this.ui.bootLayer.style.opacity = `${this.clamp01(alpha)}`;
  }

  private applyUiAlpha(alpha: number): void {
    const clamped = this.clamp01(alpha);
    if (!Number.isFinite(this.lastAppliedUiAlpha) || Math.abs(this.lastAppliedUiAlpha - clamped) > 1e-4) {
      this.ui.uiLayer.style.opacity = `${clamped}`;
      this.lastAppliedUiAlpha = clamped;
    }
    const blocked = clamped < 0.999 || this.startupPhase !== "running" || !this.runtimeStarted;
    if (this.lastPauseBlocked !== blocked) {
      this.ui.pauseButton.classList.toggle("is-blocked", blocked);
      this.ui.pauseButton.setAttribute("aria-disabled", blocked ? "true" : "false");
      this.lastPauseBlocked = blocked;
    }
  }

  private applyPauseUiState(): void {
    this.ui.pauseMask.style.display = this.isPaused ? "block" : "none";
    this.ui.pauseButton.setAttribute("aria-label", this.isPaused ? "继续" : "暂停");
    this.ui.pauseIconPause.style.display = "block";
  }

  private clearPauseCoverFlash(): void {
    if (this.pauseCoverFlashRaf1) {
      cancelAnimationFrame(this.pauseCoverFlashRaf1);
      this.pauseCoverFlashRaf1 = 0;
    }
    if (this.pauseCoverFlashRaf2) {
      cancelAnimationFrame(this.pauseCoverFlashRaf2);
      this.pauseCoverFlashRaf2 = 0;
    }
    this.ui.pauseCoverIcon.style.display = "none";
  }

  private startPauseCoverFlash(): void {
    this.clearPauseCoverFlash();
    this.ui.pauseCoverIcon.style.display = "block";
    // Source: PauseButton.<finishCoverFlash>d__25.MoveNext yields null twice,
    // then calls coverSprite.gameObject.SetActive(false). There is no lerp.
    this.pauseCoverFlashRaf1 = requestAnimationFrame(() => {
      this.pauseCoverFlashRaf1 = 0;
      this.pauseCoverFlashRaf2 = requestAnimationFrame(() => {
        this.pauseCoverFlashRaf2 = 0;
        this.ui.pauseCoverIcon.style.display = "none";
      });
    });
  }

  private clearActiveTouchCapture(): void {
    if (this.activeEmptyTapPointerId === null) {
      return;
    }
    if (this.renderer && this.settings?.effectEnable) {
      this.renderer.endEmptyTapEffects(this.lastElapsedMs);
    }
    try {
      this.ui.host.releasePointerCapture(this.activeEmptyTapPointerId);
    } catch {
      // ignore unsupported capture errors
    }
    this.activeEmptyTapPointerId = null;
  }

  private setPaused(paused: boolean): void {
    if (paused === this.isPaused || this.startupPhase !== "running" || !this.runtimeStarted) {
      return;
    }
    const now = performance.now();
    this.isPaused = paused;
    if (paused) {
      this.pauseStartedAtMs = now;
      this.audio.pauseBgm();
      if (this.chartMvResource?.kind === "video") {
        this.chartMvResource.video.pause();
      }
      this.clearActiveTouchCapture();
    } else {
      const pausedDurationMs = Math.max(0, now - this.pauseStartedAtMs);
      this.pauseStartedAtMs = 0;
      if (pausedDurationMs > 0) {
        this.runtime?.shiftStartMs(pausedDurationMs);
      }
      this.audio.resumeBgm();
      this.lastLoopTickMs = now;
    }
    this.applyPauseUiState();
  }

  private applyDifficultyStyle(difficulty: unknown): void {
    const difficultyLabel = typeof difficulty === "string" && difficulty.trim() !== ""
      ? difficulty.trim().toUpperCase()
      : "EXPERT";
    const style = getDifficultyStyle(difficulty);
    this.ui.root.style.setProperty("--sim-difficulty-fill", style.fill);
    this.ui.root.style.setProperty("--sim-difficulty-stroke", style.stroke);
    this.ui.root.style.setProperty("--sim-difficulty-text-stroke", style.stroke);
    this.ui.bootDifficultyText.textContent = difficultyLabel;
    this.updateBootDifficultyTextScale();
  }

  private updateBootLayerLayout(): void {
    const rect = this.ui.root.getBoundingClientRect();
    const windowWidth = Math.max(1, rect.width || window.innerWidth || 1);
    const windowHeight = Math.max(1, rect.height || window.innerHeight || 1);

    const coverHeight = windowHeight * (337 / 880);
    const coverWidth = coverHeight;
    const coverX = (windowWidth - coverWidth) * 0.5;
    const coverY = windowHeight * (13 / 80);

    const frameHeight = coverHeight * (345 / 337);
    const frameX = coverX + (coverWidth - frameHeight) * 0.5;
    const frameY = coverY + (coverHeight - frameHeight) * 0.5;

    const backHeight = coverHeight * (349 / 337);
    const backX = coverX;
    const backBottom = coverY + coverHeight;
    const backY = backBottom - backHeight;

    const diffWidth = coverWidth * (92 / 337);
    const diffHeight = diffWidth * (13 / 46);
    const diffX = (windowWidth - diffWidth) * 0.5;
    const diffY = windowHeight * (25 / 44);
    const diffFontSize = diffHeight * BOOT_DIFFICULTY_FONT_SIZE_RATIO;

    const titleY = windowHeight * (547 / 880);
    const titleHeight = windowHeight * (41 / 440);
    const titleStroke = titleHeight * (5 / 82);
    const titleFontSize = titleHeight * BOOT_TITLE_FONT_SIZE_RATIO;
    const titleOverscan = titleStroke * 3;
    const titleX = -titleOverscan;
    const titleWidth = windowWidth + titleOverscan * 2;

    this.applyRectStyle(this.ui.bootCoverWrap, coverX, coverY, coverWidth, coverHeight);
    this.applyRectStyle(this.ui.bootFrame, frameX, frameY, frameHeight, frameHeight);
    this.applyRectStyle(this.ui.bootBack, backX, backY, backHeight, backHeight);
    this.applyRectStyle(this.ui.bootTitleBar, titleX, titleY, titleWidth, titleHeight);
    this.ui.bootTitleBar.style.borderWidth = `${Math.max(0, titleStroke)}px`;
    this.ui.bootTitleText.style.left = "50%";
    this.ui.bootTitleText.style.top = `${titleY + (titleHeight * 0.5)}px`;
    this.ui.bootTitleText.style.fontSize = `${Math.max(1, titleFontSize)}px`;
    this.applyRectStyle(this.ui.bootDifficultyBadge, diffX, diffY, diffWidth, diffHeight);
    this.ui.bootDifficultyBadge.style.borderRadius = "5px";
    this.ui.bootDifficultyText.style.fontSize = `${Math.max(1, diffFontSize)}px`;
    this.updateScoreHudLayout(windowWidth, windowHeight);
    this.updateLifeGaugeLayout(windowWidth, windowHeight);
    this.updatePauseButtonLayout(windowWidth, windowHeight);

    this.updateBootDifficultyTextScale();
  }

  private updatePauseButtonLayout(windowWidth: number, windowHeight: number): void {
    const projected = projectNguiAnchoredPoint(
      {
        ...getLevel3StarAnchor(RHYTHM_UI_PATHS.pauseRoot),
        offset: sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.pauseRoot, RHYTHM_UI_PATHS.pauseMain),
      },
      {
        width: windowWidth,
        height: windowHeight,
      },
    );
    const buttonWidth = Math.max(1, PAUSE_MAIN_WIDGET.width * projected.scale);
    const buttonHeight = Math.max(1, PAUSE_MAIN_WIDGET.height * projected.scale);
    const coverWidth = Math.max(1, PAUSE_COVER_WIDGET.width * projected.scale);
    const coverHeight = Math.max(1, PAUSE_COVER_WIDGET.height * projected.scale);
    const buttonDrawWidth = Math.max(1, PAUSE_MAIN_DRAW_RECT.width * projected.scale);
    const buttonDrawHeight = Math.max(1, PAUSE_MAIN_DRAW_RECT.height * projected.scale);
    const coverDrawWidth = Math.max(1, PAUSE_COVER_DRAW_RECT.width * projected.scale);
    const coverDrawHeight = Math.max(1, PAUSE_COVER_DRAW_RECT.height * projected.scale);

    this.ui.pauseAnchor.style.left = `${projected.x}px`;
    this.ui.pauseAnchor.style.top = `${projected.y}px`;
    this.ui.pauseAnchor.style.right = "";
    this.ui.pauseAnchor.style.bottom = "";
    this.ui.pauseAnchor.style.setProperty("--sim-pause-button-width", `${buttonWidth}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-button-height", `${buttonHeight}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-cover-width", `${coverWidth}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-cover-height", `${coverHeight}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-button-draw-width", `${buttonDrawWidth}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-button-draw-height", `${buttonDrawHeight}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-cover-draw-width", `${coverDrawWidth}px`);
    this.ui.pauseAnchor.style.setProperty("--sim-pause-cover-draw-height", `${coverDrawHeight}px`);
  }

  private applyRectStyle(el: HTMLElement, x: number, y: number, w: number, h: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${Math.max(0, w)}px`;
    el.style.height = `${Math.max(0, h)}px`;
  }

  private snapCssPixel(value: number): number {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    return Math.round(value * dpr) / dpr;
  }

  private renderScoreRankLabel(
    canvas: HTMLCanvasElement,
    rank: SimulatorScoreRankLabel,
    logicalWidth: number,
    logicalHeight: number,
    fontSize: number,
  ): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(logicalWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(logicalHeight * dpr));
    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth;
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.font = `${fontSize}px ${SCORE_RANK_LABEL_FONT_FAMILY}`;
    // Boundary from reverse/analysis/targets/score-rank-hud-chain-current.md:
    // Rank UILabel structure/size/pivot/alignment is recovered, but Unity
    // native CharacterInfo metrics are not. This baseline is a documented
    // TTF-derived approximation, not exact decompiled text placement.
    const baseline = this.rankFontMetricApproximation?.resolveApproximateCenterPivotCanvasBaseline(logicalHeight, fontSize)
      ?? Math.round(logicalHeight * 0.5);
    context.textBaseline = "alphabetic";
    context.fillText(rank, logicalWidth * 0.5, baseline);
  }

  private updateBootDifficultyTextScale(): void {
    const textEl = this.ui.bootDifficultyText;
    const badgeEl = this.ui.bootDifficultyBadge;
    const available = Math.max(1, badgeEl.clientWidth - 4);
    const required = Math.max(1, textEl.scrollWidth);
    const scaleX = Math.max(0.2, Math.min(1, available / required));
    textEl.style.transform = `translate(-50%, -50%) scaleX(${scaleX})`;
  }

  private updateScoreHudLayout(windowWidth: number, windowHeight: number): void {
    const viewport = { width: windowWidth, height: windowHeight };
    const scoreRootAnchor = getLevel3StarAnchor(RHYTHM_UI_PATHS.scoreRoot);
    const scoreBackgroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreBackground);
    const scoreForegroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreForeground);
    const background = projectNguiOffsetFromAnchoredRoot(
      scoreRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.scoreRoot, RHYTHM_UI_PATHS.scoreBackground),
      viewport,
    );
    const scorePoint = projectNguiOffsetFromAnchoredRoot(
      scoreRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.scoreRoot, RHYTHM_UI_PATHS.scoreTotalScore),
      viewport,
    );
    const meterPoint = projectNguiOffsetFromAnchoredRoot(
      scoreRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.scoreRoot, RHYTHM_UI_PATHS.scoreForeground),
      viewport,
    );
    const scale = background.scale;
    const baseWidth = scoreBackgroundWidget.width * scale;
    const baseHeight = scoreBackgroundWidget.height * scale;
    const meterWidth = scoreForegroundWidget.width * scale;
    const meterHeight = scoreForegroundWidget.height * scale;
    this.applyRectStyle(this.ui.scoreHud, 0, 0, windowWidth, windowHeight);
    this.applyRectStyle(this.ui.scoreBase, background.x, background.y - (baseHeight * 0.5), baseWidth, baseHeight);
    this.applyRectStyle(
      this.ui.scoreTopTrack,
      meterPoint.x,
      meterPoint.y - (meterHeight * 0.5),
      meterWidth,
      meterHeight,
    );
    const digitScale = scale * SCORE_HUD_DIGIT_SCALE;
    this.ui.scoreText.style.left = `${scorePoint.x}px`;
    this.ui.scoreText.style.top = `${scorePoint.y}px`;
    this.ui.scoreText.style.display = "inline-flex";
    this.ui.scoreTopTrack.style.setProperty("--sim-score-meter-width", `${meterWidth}px`);
    this.ui.scoreTopTrack.style.setProperty("--sim-score-meter-height", `${meterHeight}px`);
    this.ui.scoreGaugeFill.style.width = `${meterWidth}px`;
    this.ui.scoreGaugeFill.style.height = `${meterHeight}px`;
    this.applyScoreGaugeDrawRegion();
    this.ui.scoreText.style.setProperty("--sim-score-font-scale", `${digitScale}`);
    this.ui.scoreText.style.width = `${SCORE_HUD_TOTAL_SCORE_WIDGET.width}px`;
    this.ui.scoreText.style.height = `${SCORE_HUD_TOTAL_SCORE_WIDGET.height}px`;
    this.ui.scoreText.style.transform = `translate(-50%, -50%) scale(${digitScale})`;
    this.layoutBitmapScoreDigits();
    this.updateScoreRankMarkerLayout(windowWidth, windowHeight, this.lastScoreRankMarkers);
  }

  private updateScoreRankMarkerLayout(
    windowWidth: number,
    windowHeight: number,
    markers: readonly SimulatorScoreRankMarker[],
  ): void {
    this.applyRectStyle(this.ui.scoreRankObject, 0, 0, windowWidth, windowHeight);
    const markerByRank = new Map(markers.map((marker) => [marker.rank, marker]));
    const viewport = { width: windowWidth, height: windowHeight };
    const scoreRootAnchor = getLevel3StarAnchor(RHYTHM_UI_PATHS.scoreRoot);
    const rankObjectPoint = projectNguiOffsetFromAnchoredRoot(
      scoreRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.scoreRoot, RHYTHM_UI_PATHS.scoreRankObject),
      viewport,
    );
    const scoreForegroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreForeground);
    const rankObjectLocalFromScoreRoot = sumLevel3LocalPositionBetween(
      RHYTHM_UI_PATHS.scoreRoot,
      RHYTHM_UI_PATHS.scoreRankObject,
    );
    const foregroundLocalFromScoreRoot = sumLevel3LocalPositionBetween(
      RHYTHM_UI_PATHS.scoreRoot,
      RHYTHM_UI_PATHS.scoreForeground,
    );
    const foregroundLocalFromRankObject = {
      x: foregroundLocalFromScoreRoot.x - rankObjectLocalFromScoreRoot.x,
      y: foregroundLocalFromScoreRoot.y - rankObjectLocalFromScoreRoot.y,
    };

    for (const rank of SIMULATOR_SCORE_RANK_LABELS) {
      const refs = this.ui.scoreRankMarkers[rank];
      const marker = markerByRank.get(rank);
      if (!marker || !Number.isFinite(marker.ratio)) {
        refs.root.style.display = "none";
        continue;
      }

      const paths = SCORE_RANK_PATHS[rank];
      const ratio = this.clamp01(marker.ratio);
      const labelLocal = sumLevel3LocalPositionBetween(paths.root, paths.label);
      const separatorLocal = sumLevel3LocalPositionBetween(paths.root, paths.separator);
      const labelWidget = getLevel3WidgetMetrics(paths.label);
      const separatorWidget = getLevel3WidgetMetrics(paths.separator);
      const separatorDrawingRect = resolveNguiDrawingRect(
        separatorWidget,
        SCORE_RANK_SEPARATOR_SPRITES[rank],
        UI_COMMON_ATLAS_RECTS.levelMark,
      );
      const scale = rankObjectPoint.scale;
      // Source: reverse/analysis/targets/score-rank-hud-chain-current.md.
      // The game computes X as slider local x + foreground width * score /
      // scoreMax, then initializeScoreRankIcon writes the full rank root local
      // position to (positionX, 0, 0). The serialized rank* y=-2 is only the
      // prefab/default value and is not the shown runtime Y.
      const rankRootLocalX = foregroundLocalFromRankObject.x + (scoreForegroundWidget.width * ratio);
      const rankRootLocalY = 0;
      const rootX = rankObjectPoint.x + (rankRootLocalX * scale);
      const rootY = rankObjectPoint.y - (rankRootLocalY * scale);

      refs.root.style.display = "block";
      refs.root.style.left = `${rootX}px`;
      refs.root.style.top = `${rootY}px`;
      const labelWidth = labelWidget.width * scale;
      const labelHeight = labelWidget.height * scale;
      this.applyRectStyle(
        refs.label,
        labelLocal.x * scale,
        -labelLocal.y * scale,
        labelWidth,
        labelHeight,
      );
      this.renderScoreRankLabel(refs.label, rank, labelWidget.width, labelWidget.height, SCORE_RANK_LABEL_FONT_SIZE);
      this.applyRectStyle(
        refs.separator,
        this.snapCssPixel(separatorLocal.x * scale),
        this.snapCssPixel(-separatorLocal.y * scale),
        this.snapCssPixel(separatorWidget.width * scale),
        this.snapCssPixel(separatorWidget.height * scale),
      );
      this.applyRectStyle(
        refs.separatorImage,
        this.snapCssPixel(separatorDrawingRect.x * scale),
        this.snapCssPixel(separatorDrawingRect.y * scale),
        this.snapCssPixel(separatorDrawingRect.width * scale),
        this.snapCssPixel(separatorDrawingRect.height * scale),
      );
      refs.separator.hidden = !refs.separatorImage.src;
      refs.separatorImage.hidden = !refs.separatorImage.src;
    }
  }

  private updateLifeGaugeLayout(windowWidth: number, windowHeight: number): void {
    const viewport = { width: windowWidth, height: windowHeight };
    const lifeGaugeRootAnchor = getLevel3StarAnchor(RHYTHM_UI_PATHS.lifeGaugeRoot);
    const lifeGaugeBackgroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeBackground);
    const lifeGaugeFrontWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeFront);
    const lifeGaugeSecondFrontWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeSecondFront);
    const background = projectNguiOffsetFromAnchoredRoot(
      lifeGaugeRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.lifeGaugeRoot, RHYTHM_UI_PATHS.lifeGaugeBackground),
      viewport,
    );
    const front = projectNguiOffsetFromAnchoredRoot(
      lifeGaugeRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.lifeGaugeRoot, RHYTHM_UI_PATHS.lifeGaugeFront),
      viewport,
    );
    const secondFront = projectNguiOffsetFromAnchoredRoot(
      lifeGaugeRootAnchor,
      sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.lifeGaugeRoot, RHYTHM_UI_PATHS.lifeGaugeSecondFront),
      viewport,
    );
    const scale = background.scale;
    const bgWidth = lifeGaugeBackgroundWidget.width * scale;
    const bgHeight = lifeGaugeBackgroundWidget.height * scale;
    const frontWidth = lifeGaugeFrontWidget.width * scale;
    const frontHeight = lifeGaugeFrontWidget.height * scale;
    const secondFrontWidth = lifeGaugeSecondFrontWidget.width * scale;
    const secondFrontHeight = lifeGaugeSecondFrontWidget.height * scale;
    this.applyRectStyle(this.ui.lifeGauge, 0, 0, windowWidth, windowHeight);
    this.applyRectStyle(
      this.ui.lifeGaugeBg,
      background.x - (bgWidth * 0.5),
      background.y - (bgHeight * 0.5),
      bgWidth,
      bgHeight,
    );
    this.applyRectStyle(
      this.ui.lifeGaugeFillWrap,
      front.x - (frontWidth * 0.5),
      front.y - (frontHeight * 0.5),
      frontWidth,
      frontHeight,
    );
    this.applyRectStyle(this.ui.lifeGaugeFill, 0, 0, frontWidth, frontHeight);
    this.applyRectStyle(
      this.ui.lifeGaugeSecondFillWrap,
      secondFront.x - (secondFrontWidth * 0.5),
      secondFront.y - (secondFrontHeight * 0.5),
      secondFrontWidth,
      secondFrontHeight,
    );
    this.applyRectStyle(this.ui.lifeGaugeSecondFill, 0, 0, secondFrontWidth, secondFrontHeight);
    // Source: score-life-fill-direction-current.md confirms these FrontGauge
    // objects are UISprite type=Sliced, not UIProgressBar instances. Their
    // serialized fillDirection=Radial360 is not active progress evidence while
    // type is Sliced, so do not apply UIProgressBar.drawRegion here.
  }

  private updateScoreHud(stats: RuntimeStats | null): void {
    const hudState = buildScoreHudState(stats);
    const score = hudState.score;
    if (!Number.isFinite(this.lastRenderedScore) || this.lastRenderedScore !== score) {
      const clamped = Math.min(999_999_999, score);
      const raw = clamped <= 0 ? "" : String(clamped);
      const padded = raw.padStart(SCORE_HUD_DIGIT_COUNT, "0").slice(-SCORE_HUD_DIGIT_COUNT);
      for (let index = 0; index < this.ui.scoreDigits.length; index += 1) {
        const digit = this.ui.scoreDigits[index];
        const value = padded[index] ?? "0";
        digit.textContent = "";
        digit.dataset.scoreGlyph = value;
        this.applyBitmapScoreGlyph(digit, value);
      }
      this.layoutBitmapScoreDigits();
      this.lastRenderedScore = score;
    }
    this.lastScoreGaugeValue = hudState.scoreRatio;
    this.lastScoreRankMarkers = hudState.rankMarkers;
    for (const className of SIMULATOR_SCORE_GAUGE_RANK_CLASSES) {
      this.ui.scoreGaugeFill.classList.toggle(className, className === hudState.gaugeRankClass);
    }
    const rect = this.ui.root.getBoundingClientRect();
    this.updateScoreRankMarkerLayout(rect.width, rect.height, this.lastScoreRankMarkers);
    // Source: score-life-fill-direction-current.md confirms Score/Progress
    // UISlider has UIProgressBar.mFill=0=LeftToRight and mFG=1217
    // Foreground. ForceUpdate applies the value through foreground
    // UIWidget.set_drawRegion(Vector4), not through a mask/texture crop.
    this.applyScoreGaugeDrawRegion();
  }

  private applyScoreGaugeDrawRegion(): void {
    const gaugeRect = this.ui.scoreTopTrack.getBoundingClientRect();
    if (gaugeRect.width <= 0 || gaugeRect.height <= 0) {
      this.reportRuntimeIssue(
        "分数条 drawRegion 跳过：Foreground 尺寸无效",
        new Error(`${gaugeRect.width.toFixed(3)}x${gaugeRect.height.toFixed(3)}`),
        "score-gauge-invalid-size",
      );
      return;
    }
    applyNguiProgressDrawRegion(
      this.ui.scoreGaugeFill,
      gaugeRect.width,
      gaugeRect.height,
      this.lastScoreGaugeValue,
      NGUI_PROGRESS_FILL_LEFT_TO_RIGHT,
    );
  }

  private applyBitmapScoreGlyph(el: HTMLElement, value: string): void {
    const glyph = SCORE_FONT_GLYPHS[value as keyof typeof SCORE_FONT_GLYPHS];
    if (!glyph) {
      el.style.display = "none";
      return;
    }
    el.style.display = "inline-block";
    el.style.opacity = "1";
    el.style.width = `${glyph.xAdvance}px`;
    el.style.height = `${SCORE_FONT_LINE_HEIGHT}px`;
    el.style.backgroundSize = `${glyph.width}px ${glyph.height}px`;
    el.style.backgroundPosition = `${glyph.xOffset}px ${glyph.yOffset}px`;
    void loadScoreFontGlyphDataUrls()
      .then((glyphs) => {
        const url = glyphs[value as keyof typeof glyphs];
        if (url) {
          el.style.backgroundImage = `url("${url}")`;
        }
      })
      .catch((error: unknown) => {
        this.reportRuntimeIssue("分数字形贴图加载失败", error, "score-glyph-load");
      });
  }

  private layoutBitmapScoreDigits(): void {
    this.ui.scoreText.style.width = `${SCORE_HUD_TOTAL_SCORE_WIDGET.width}px`;
    this.ui.scoreText.style.height = `${SCORE_HUD_TOTAL_SCORE_WIDGET.height}px`;
  }

  private applyBootTitle(value: unknown): void {
    const title = typeof value === "string" && value.trim() !== ""
      ? value.trim()
      : "Untitled";
    this.ui.bootTitleText.textContent = title;
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private lerp(from: number, to: number, t: number): number {
    const phase = this.clamp01(t);
    return from + (to - from) * phase;
  }

  private easeInOutSmooth(t: number): number {
    const p = this.clamp01(t);
    // smoothstep: ease-in at start, ease-out at end
    return p * p * (3 - 2 * p);
  }

  private resolveChartMvFrame(elapsedMs: number):
    | { kind: "image"; src: string; alpha: number; sourceWidth: number; sourceHeight: number }
    | null {
    if (!this.settings?.mvmode || !this.chartMvResource) {
      return null;
    }

    if (this.chartMvResource.kind === "image") {
      return {
        kind: "image",
        src: this.chartMvResource.src,
        alpha: this.settings.mvAlpha,
        sourceWidth: this.chartMvResource.width,
        sourceHeight: this.chartMvResource.height,
      };
    }

    const video = this.chartMvResource.video;
    const mvVideoRenderState = this.syncVideoPlayback(video, elapsedMs, this.chartMvResource.offsetMs);
    this.ui.mvLayer.style.opacity = `${this.clamp01(this.settings.mvAlpha)}`;
    this.ui.mvLayer.style.display = mvVideoRenderState === "hidden" ? "none" : "block";
    this.ui.mvLayer.style.backgroundColor = "#000";
    if (this.domMvVideo !== video) {
      this.attachDomMvVideo(video, this.settings.mvAlpha);
    }
    if (this.domMvVideo) {
      this.domMvVideo.style.visibility = mvVideoRenderState === "video" ? "visible" : "hidden";
    }
    return null;
  }

  private syncVideoPlayback(video: HTMLVideoElement, elapsedMs: number, offsetMs: number): MvVideoRenderState {
    if (video.error) {
      throw new Error(`mv video element error: code=${video.error.code}`);
    }
    const videoElapsedMs = elapsedMs - offsetMs;
    if (videoElapsedMs < 0) {
      if (!video.paused) {
        video.pause();
      }
      if (video.currentTime !== 0) {
        try {
          video.currentTime = 0;
        } catch {
          // ignore seek errors
        }
      }
      return "hidden";
    }

    const targetSeconds = Math.max(0, videoElapsedMs / 1000);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    if (duration !== null && targetSeconds >= duration) {
      const tailSeconds = Math.max(0, duration - 0.001);
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.currentTime - tailSeconds) > 0.03) {
        try {
          video.currentTime = tailSeconds;
        } catch {
          // ignore seek errors
        }
      }
      return "black_tail";
    }

    if (this.isPaused) {
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.currentTime - targetSeconds) > 0.08) {
        try {
          video.currentTime = targetSeconds;
        } catch {
          // ignore seek errors
        }
      }
      return "video";
    }

    video.playbackRate = 1;
    if (video.paused) {
      if (Math.abs(video.currentTime - targetSeconds) > 0.08) {
        try {
          video.currentTime = targetSeconds;
        } catch {
          // ignore seek errors
        }
      }
      void video.play().catch((error: unknown) => {
        this.reportRuntimeIssue("MV 视频播放被浏览器拒绝", error, "mv-video-play");
      });
    }
    return "video";
  }

  private releaseMvResource(): void {
    this.clearDomMvVideo();
    this.disposeMvResource(this.chartMvResource);
    this.chartMvResource = null;
  }

  private fallbackToLiveBgOnMvRuntimeError(error: unknown): void {
    this.releaseMvResource();
    if (this.settings) {
      this.settings.mvmode = false;
    }
    this.reportRuntimeIssue("MV 渲染失败，已回退为普通背景", error, "mv-runtime-render");
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.bootRevealRafId) {
      cancelAnimationFrame(this.bootRevealRafId);
      this.bootRevealRafId = 0;
    }
    this.clearActiveTouchCapture();
    this.lastLoopTickMs = 0;
    this.loopAccumulatorMs = 0;
    this.lastElapsedMs = 0;
    this.runtimeStarted = false;
    this.startupPhase = "waiting_touch";
    this.startupTouchMs = 0;
    this.isPaused = false;
    this.pauseStartedAtMs = 0;
    this.lastAppliedUiAlpha = Number.NaN;
    this.lastPauseBlocked = null;
    this.lastRenderedScore = Number.NaN;
    this.pendingStartupTouch = false;
    this.applyPauseUiState();
    this.applyUiAlpha(0);
    this.updateScoreHud(null);
    this.audio.stopBgm();
    this.clearDomMvVideo();
    if (this.chartMvResource?.kind === "video") {
      this.chartMvResource.video.pause();
    }
  }
}
