import { emit, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AudioEngine } from "../engine/audio";
import { loadNoteSkinTextureBundle } from "../engine/assets";
import { parseEditorChart } from "../engine/editorChartParser";
import {
  buildSettingsFromPayload,
  precomputeLut,
} from "../engine/simulatorTiming";
import { loadMvResourceFromPayload, type MvResource } from "../engine/mv";
import { SimulatorRuntime } from "../engine/runtime";
import { JudgeTriggerEvent, ParsedChart, RuntimeStats, SimulatorSettings } from "../engine/types";
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
import simulatorPauseIconSvg from "../../assets/icons/simulator-pause.svg?raw";
import simulatorPlayIconSvg from "../../assets/icons/simulator-play.svg?raw";

interface UiRefs {
  root: HTMLDivElement;
  host: HTMLDivElement;
  canvasHost: HTMLDivElement;
  mvLayer: HTMLDivElement;
  uiLayer: HTMLDivElement;
  pauseMask: HTMLDivElement;
  scoreHud: HTMLDivElement;
  scoreGainLayer: HTMLDivElement;
  scoreAutoLive: HTMLDivElement;
  scoreAutoLiveText: HTMLSpanElement;
  scoreFrameSvg: SVGSVGElement;
  scoreFrameFill: SVGPathElement;
  scoreFrameStroke: SVGPathElement;
  scoreTopBadge: HTMLDivElement;
  scoreTopBadgeIcon: SVGSVGElement;
  scoreTopTrack: HTMLDivElement;
  scoreRankLabels: HTMLSpanElement[];
  scoreGaugeFill: HTMLDivElement;
  scoreText: HTMLSpanElement;
  scoreDigits: HTMLSpanElement[];
  pauseAnchor: HTMLDivElement;
  pauseButton: HTMLButtonElement;
  pauseIconPause: HTMLSpanElement;
  pauseIconPlay: HTMLSpanElement;
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

interface ScoreGainAnimation {
  el: SVGSVGElement;
  strokeText: SVGTextElement;
  fillText: SVGTextElement;
  fontPx: number;
  startMs: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

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
const SCORE_HUD_LEFT_MARGIN_RATIO = 16 / 1280;
const SCORE_HUD_LAYOUT_INPUT_WIDTH = 1024;
const SCORE_HUD_LAYOUT_INPUT_HEIGHT = 576;
const PAUSE_BUTTON_RIGHT_MARGIN_RATIO = 5 / 720;
const OVERLAY_UI_TOP_MARGIN_RATIO = 18 / 1280;
const SCORE_HUD_TOP_WIDTH_RATIO = 11 / 32;
const SCORE_HUD_TOTAL_HEIGHT_BY_TOP_WIDTH = 39 / 220;
const SCORE_HUD_UPPER_HEIGHT_RATIO = 37 / 78;
const SCORE_HUD_LOWER_BASE_WIDTH_BY_TOP_WIDTH = 97 / 220;
const SCORE_HUD_SLOPE_JOIN_X_RATIO = 5 / 11;
const SCORE_HUD_TRACK_HEIGHT_BY_UPPER = 24 / 37;
const SCORE_HUD_TRACK_WIDTH_BY_TOP_WIDTH = 393 / 440;
const SCORE_HUD_TOP_RADIUS_BY_HEIGHT = 8 / 102;
const SCORE_HUD_BOTTOM_RADIUS_MULTIPLIER = 2;
const SCORE_HUD_DIGIT_COUNT = 8;
const SCORE_HUD_DIGIT_PAD_COLOR = "rgb(204, 204, 204)";
const SCORE_HUD_ACCENT_PINK = "rgb(255, 59, 113)";
const SCORE_HUD_BADGE_COLOR = "rgb(72, 72, 72)";
const SCORE_HUD_BADGE_DIAMETER_BY_HEIGHT = 9 / 26;
const SCORE_HUD_BADGE_ICON_SIZE_BY_DIAMETER = 17 / 27;
const SCORE_HUD_BADGE_BORDER_WIDTH_PX = 2;
const SCORE_HUD_FRAME_STROKE_WIDTH_PX = 2;
const SCORE_HUD_GAIN_ANIM_TOTAL_MS = ((12 / 15) * 1000 * 3) / 4;
const SCORE_HUD_GAIN_PHASE_1_END = 4 / 15;
const SCORE_HUD_GAIN_PHASE_2_END = 8 / 15;
const SCORE_HUD_GAIN_PHASE_3_END = 12 / 15;
const SCORE_HUD_GAIN_X0 = SCORE_HUD_LOWER_BASE_WIDTH_BY_TOP_WIDTH;
const SCORE_HUD_GAIN_X1 = 31 / 50;
const SCORE_HUD_GAIN_X2 = 32 / 50;
const SCORE_HUD_GAIN_X3 = 33 / 50;
const SCORE_HUD_GAIN_FONT_SCALE = 1.08;
const SCORE_HUD_GAIN_STROKE_WIDTH_PX = 2;
const SCORE_HUD_AUTO_LIVE_GAP_PX = 5;
const SCORE_HUD_AUTO_LIVE_WIDTH_BY_TOP_WIDTH = 193 / 440;
const SCORE_HUD_AUTO_LIVE_HEIGHT_BY_TOTAL_HEIGHT = 37 / 78;
const SCORE_HUD_AUTO_LIVE_FONT_BY_HEIGHT = 20 / 37;
const SCORE_HUD_BASE_FULL_SCORE = 10000000;
const SCORE_HUD_RANK_THRESHOLDS = [
  { label: "C", score: 400000 },
  { label: "B", score: 2500000 },
  { label: "A", score: 4500000 },
  { label: "S", score: 6750000 },
  { label: "SS", score: 9000000 },
] as const;

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
  private lastRenderedScore = Number.NaN;
  private lastScoreRankNotes = Number.NaN;
  private scoreHudLayoutWidth = 1;
  private scoreValueFontPx = 1;
  private scoreValueCenterYPx = 0;
  private scoreGainAnimations: ScoreGainAnimation[] = [];
  private scoreGainGradientSeq = 0;
  private bootRevealPrepared = false;
  private bootRevealRafId = 0;
  private bootPendingAlpha = 1;
  private bootPendingVisible = false;
  private domMvVideo: HTMLVideoElement | null = null;
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
          return;
        }
        this.mvPreflightResource = resource;
      })
      .catch(() => {
        if (token !== this.mvPreflightToken) {
          return;
        }
        this.mvPreflightFailed = true;
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
      .catch(() => {})
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
    void this.attachLaunchPayloadBridge();
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
    const pauseMask = document.createElement("div");
    pauseMask.className = "simulator-pause-mask";

    const scoreHud = document.createElement("div");
    scoreHud.className = "simulator-score-hud";
    const scoreGainLayer = document.createElement("div");
    scoreGainLayer.className = "simulator-score-gain-layer";
    const scoreAutoLive = document.createElement("div");
    scoreAutoLive.className = "simulator-score-auto-live";
    const scoreAutoLiveText = document.createElement("span");
    scoreAutoLiveText.className = "simulator-score-auto-live-text";
    scoreAutoLiveText.textContent = "AUTO LIVE";
    scoreAutoLive.appendChild(scoreAutoLiveText);
    const scoreFrameSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    scoreFrameSvg.classList.add("simulator-score-frame-svg");
    scoreFrameSvg.setAttribute("viewBox", "0 0 611 102");
    scoreFrameSvg.setAttribute("preserveAspectRatio", "none");
    scoreFrameSvg.setAttribute("aria-hidden", "true");
    const scoreFrameDefs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const scoreFrameGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    scoreFrameGradient.setAttribute("id", "sim-score-frame-fill");
    scoreFrameGradient.setAttribute("x1", "0");
    scoreFrameGradient.setAttribute("y1", "0");
    scoreFrameGradient.setAttribute("x2", "0");
    scoreFrameGradient.setAttribute("y2", "1");
    const scoreFrameGradientStopTop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    scoreFrameGradientStopTop.setAttribute("offset", "0%");
    scoreFrameGradientStopTop.setAttribute("stop-color", "#ffffff");
    const scoreFrameGradientStopBottom = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    scoreFrameGradientStopBottom.setAttribute("offset", "100%");
    scoreFrameGradientStopBottom.setAttribute("stop-color", "#f1f7fd");
    scoreFrameGradient.append(scoreFrameGradientStopTop, scoreFrameGradientStopBottom);
    scoreFrameDefs.appendChild(scoreFrameGradient);
    const scoreFrameFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    scoreFrameFill.classList.add("simulator-score-frame-fill");
    scoreFrameFill.setAttribute("fill", "url(#sim-score-frame-fill)");
    const scoreFrameStroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    scoreFrameStroke.classList.add("simulator-score-frame-stroke");
    scoreFrameSvg.append(scoreFrameDefs, scoreFrameFill, scoreFrameStroke);

    const scoreTopBadge = document.createElement("div");
    scoreTopBadge.className = "simulator-score-top-badge";
    const scoreTopBadgeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    scoreTopBadgeIcon.setAttribute("class", "simulator-score-top-badge-icon");
    scoreTopBadgeIcon.setAttribute("viewBox", "0 0 100 100");
    scoreTopBadgeIcon.setAttribute("aria-hidden", "true");
    const scoreTopBadgeIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    scoreTopBadgeIconPath.setAttribute(
      "d",
      "M50 10 L61 38 L91 38 L67 56 L76 86 L50 68 L24 86 L33 56 L9 38 L39 38 Z",
    );
    scoreTopBadgeIconPath.setAttribute("fill", SCORE_HUD_BADGE_COLOR);
    scoreTopBadgeIconPath.setAttribute("stroke", SCORE_HUD_BADGE_COLOR);
    scoreTopBadgeIconPath.setAttribute("stroke-width", "6");
    scoreTopBadgeIconPath.setAttribute("stroke-linejoin", "round");
    scoreTopBadgeIconPath.setAttribute("stroke-linecap", "round");
    scoreTopBadgeIcon.appendChild(scoreTopBadgeIconPath);
    scoreTopBadge.appendChild(scoreTopBadgeIcon);
    const scoreTopTrack = document.createElement("div");
    scoreTopTrack.className = "simulator-score-top-track";
    const scoreGaugeFill = document.createElement("div");
    scoreGaugeFill.className = "simulator-score-gauge-fill";
    const scoreRankRow = document.createElement("div");
    scoreRankRow.className = "simulator-score-rank-row";
    const scoreRankLabels: HTMLSpanElement[] = [];
    for (const { label } of SCORE_HUD_RANK_THRESHOLDS) {
      const marker = document.createElement("span");
      marker.className = "simulator-score-rank-label";
      marker.textContent = label;
      scoreRankLabels.push(marker);
      scoreRankRow.appendChild(marker);
    }
    scoreTopTrack.append(scoreGaugeFill, scoreRankRow);
    const scoreText = document.createElement("span");
    scoreText.className = "simulator-score-value";
    const scoreDigits: HTMLSpanElement[] = [];
    for (let index = 0; index < SCORE_HUD_DIGIT_COUNT; index += 1) {
      const digit = document.createElement("span");
      digit.className = "simulator-score-digit is-pad";
      digit.textContent = "0";
      scoreDigits.push(digit);
      scoreText.appendChild(digit);
    }
    scoreHud.append(scoreFrameSvg, scoreGainLayer, scoreTopBadge, scoreTopTrack, scoreText);

    const pauseAnchor = document.createElement("div");
    pauseAnchor.className = "simulator-pause-anchor";
    const pauseButton = document.createElement("button");
    pauseButton.type = "button";
    pauseButton.className = "simulator-pause-button tool-icon-button";
    pauseButton.setAttribute("aria-label", "暂停");
    const pauseCore = document.createElement("span");
    pauseCore.className = "tool-icon-core";
    const pauseIconPause = document.createElement("span");
    pauseIconPause.className = "play-tool-icon simulator-pause-icon simulator-pause-icon-pause";
    pauseIconPause.innerHTML = simulatorPauseIconSvg;
    const pauseIconPlay = document.createElement("span");
    pauseIconPlay.className = "play-tool-icon simulator-pause-icon simulator-pause-icon-play";
    pauseIconPlay.innerHTML = simulatorPlayIconSvg;
    pauseCore.append(pauseIconPause, pauseIconPlay);
    pauseButton.append(pauseCore);
    pauseAnchor.append(pauseButton);
    uiLayer.append(pauseMask, scoreHud, scoreAutoLive, pauseAnchor);

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

    shell.append(host, bootLayer, uiLayer);
    root.appendChild(shell);
    parent.appendChild(root);

    return {
      root,
      host,
      canvasHost,
      mvLayer,
      uiLayer,
      pauseMask,
      scoreHud,
      scoreGainLayer,
      scoreAutoLive,
      scoreAutoLiveText,
      scoreFrameSvg,
      scoreFrameFill,
      scoreFrameStroke,
      scoreTopBadge,
      scoreTopBadgeIcon,
      scoreTopTrack,
      scoreRankLabels,
      scoreGaugeFill,
      scoreText,
      scoreDigits,
      pauseAnchor,
      pauseButton,
      pauseIconPause,
      pauseIconPlay,
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
      ).catch(() => null);
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
        : Promise.resolve(this.audio.clearBgm())).catch(() => {}),
      this.audio.loadSeFromRuntimeAssets(payloadSeRuntimeAssets ?? null).catch(() => {}),
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
    this.renderer.setChartEvents(chart.events, chart.timingGroups);
    this.updateScoreRankMarkerPositions(chart.noteCount);

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
        this.spawnScoreGainAnimationsFromJudgeTriggers(stats, judgeTriggers, now);
        this.renderer.pushJudgeTriggers(judgeTriggers);
      }
    }

    this.updateScoreGainAnimations(now);

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
      this.renderer.render(this.runtime.getActiveNotes(), stats, mvFrame);
    } catch (error) {
      if (this.settings?.mvmode) {
        this.fallbackToLiveBgOnMvRuntimeError(error);
        this.renderer.render(this.runtime.getActiveNotes(), stats, null);
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
    this.ui.pauseIconPause.style.display = this.isPaused ? "none" : "inline-flex";
    this.ui.pauseIconPlay.style.display = this.isPaused ? "inline-flex" : "none";
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
    this.updateScoreHudLayout(SCORE_HUD_LAYOUT_INPUT_WIDTH, SCORE_HUD_LAYOUT_INPUT_HEIGHT);
    this.ui.pauseAnchor.style.top = `${windowHeight * OVERLAY_UI_TOP_MARGIN_RATIO}px`;
    this.ui.pauseAnchor.style.right = `${windowWidth * PAUSE_BUTTON_RIGHT_MARGIN_RATIO}px`;
    this.ui.pauseAnchor.style.left = "";

    this.updateBootDifficultyTextScale();
  }

  private applyRectStyle(el: HTMLElement, x: number, y: number, w: number, h: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${Math.max(0, w)}px`;
    el.style.height = `${Math.max(0, h)}px`;
  }

  private updateBootDifficultyTextScale(): void {
    const textEl = this.ui.bootDifficultyText;
    const badgeEl = this.ui.bootDifficultyBadge;
    const available = Math.max(1, badgeEl.clientWidth - 4);
    const required = Math.max(1, textEl.scrollWidth);
    const scaleX = Math.max(0.2, Math.min(1, available / required));
    textEl.style.transform = `translate(-50%, -50%) scaleX(${scaleX})`;
  }

  private buildScoreHudFramePath(
    topWidth: number,
    totalHeight: number,
    upperHeight: number,
    lowerBaseWidth: number,
  ): string {
    const width = Math.max(1, topWidth);
    const height = Math.max(1, totalHeight);
    const upper = Math.max(0, Math.min(height, upperHeight));
    const lowerBase = Math.max(1, Math.min(width, lowerBaseWidth));
    const topRadius = Math.max(2, height * SCORE_HUD_TOP_RADIUS_BY_HEIGHT);
    const bottomRadius = Math.max(topRadius, topRadius * SCORE_HUD_BOTTOM_RADIUS_MULTIPLIER);
    const slopeJoinX = width * SCORE_HUD_SLOPE_JOIN_X_RATIO;
    const joinY = upper;
    const cornerX = lowerBase;
    const cornerY = height;
    const upperBottomRightRoundStartY = Math.max(topRadius, joinY - topRadius);
    const upperBottomRightRoundEndX = Math.max(topRadius, width - topRadius);
    const inDx = cornerX - slopeJoinX;
    const inDy = cornerY - joinY;
    const inLen = Math.hypot(inDx, inDy);
    const ax = inLen > 1e-4 ? inDx / inLen : -1;
    const ay = inLen > 1e-4 ? inDy / inLen : 0;
    const bx = -1;
    const by = 0;
    const dot = Math.max(-0.999999, Math.min(0.999999, ax * bx + ay * by));
    const theta = Math.acos(dot);
    const tanHalf = Math.tan(theta * 0.5);
    const idealFilletOffset = tanHalf > 1e-4 ? bottomRadius / tanHalf : bottomRadius;
    const maxOffsetOnSlant = Math.max(0, inLen - 1e-3);
    const maxOffsetOnBottom = Math.max(0, cornerX - 1e-3);
    const filletOffset = Math.max(
      0,
      Math.min(idealFilletOffset, maxOffsetOnSlant, maxOffsetOnBottom),
    );
    const slantRoundStartX = cornerX - ax * filletOffset;
    const slantRoundStartY = cornerY - ay * filletOffset;
    const bottomRoundEndX = cornerX - filletOffset;
    const leftBottomRoundStartY = Math.max(topRadius, height - bottomRadius);
    return [
      `M ${topRadius} 0`,
      `H ${Math.max(topRadius, width - topRadius)}`,
      `Q ${width} 0 ${width} ${topRadius}`,
      `V ${upperBottomRightRoundStartY}`,
      `Q ${width} ${joinY} ${upperBottomRightRoundEndX} ${joinY}`,
      `H ${slopeJoinX}`,
      `L ${slantRoundStartX} ${slantRoundStartY}`,
      `Q ${cornerX} ${cornerY} ${bottomRoundEndX} ${height}`,
      `H ${bottomRadius}`,
      `Q 0 ${height} 0 ${leftBottomRoundStartY}`,
      `V ${topRadius}`,
      `Q 0 0 ${topRadius} 0`,
      "Z",
    ].join(" ");
  }

  private updateScoreHudLayout(windowWidth: number, windowHeight: number): void {
    const topWidth = Math.max(1, windowWidth * SCORE_HUD_TOP_WIDTH_RATIO);
    const totalHeight = Math.max(1, topWidth * SCORE_HUD_TOTAL_HEIGHT_BY_TOP_WIDTH);
    const upperHeight = totalHeight * SCORE_HUD_UPPER_HEIGHT_RATIO;
    const lowerBaseWidth = topWidth * SCORE_HUD_LOWER_BASE_WIDTH_BY_TOP_WIDTH;
    const slopeJoinX = topWidth * SCORE_HUD_SLOPE_JOIN_X_RATIO;
    const lowerHeight = Math.max(1, totalHeight - upperHeight);
    const left = windowWidth * SCORE_HUD_LEFT_MARGIN_RATIO;
    const top = windowHeight * OVERLAY_UI_TOP_MARGIN_RATIO;
    this.scoreHudLayoutWidth = topWidth;
    this.applyRectStyle(this.ui.scoreHud, left, top, topWidth, totalHeight);
    const autoLiveWidth = topWidth * SCORE_HUD_AUTO_LIVE_WIDTH_BY_TOP_WIDTH;
    const autoLiveHeight = totalHeight * SCORE_HUD_AUTO_LIVE_HEIGHT_BY_TOTAL_HEIGHT;
    const autoLiveTop = top + totalHeight + SCORE_HUD_AUTO_LIVE_GAP_PX;
    this.applyRectStyle(this.ui.scoreAutoLive, left, autoLiveTop, autoLiveWidth, autoLiveHeight);
    this.ui.scoreAutoLive.style.borderRadius = `${Math.max(0, autoLiveHeight * 0.5)}px`;
    this.ui.scoreAutoLive.style.background = SCORE_HUD_ACCENT_PINK;
    this.ui.scoreAutoLiveText.style.fontSize = `${Math.max(1, autoLiveHeight * SCORE_HUD_AUTO_LIVE_FONT_BY_HEIGHT)}px`;
    const framePath = this.buildScoreHudFramePath(topWidth, totalHeight, upperHeight, lowerBaseWidth);
    this.ui.scoreFrameSvg.setAttribute("viewBox", `0 0 ${topWidth} ${totalHeight}`);
    this.ui.scoreFrameFill.setAttribute("d", framePath);
    this.ui.scoreFrameStroke.setAttribute("d", framePath);
    this.ui.scoreFrameStroke.setAttribute("stroke-width", `${SCORE_HUD_FRAME_STROKE_WIDTH_PX}`);

    const trackWidth = topWidth * SCORE_HUD_TRACK_WIDTH_BY_TOP_WIDTH;
    const trackHeight = upperHeight * SCORE_HUD_TRACK_HEIGHT_BY_UPPER;
    const trackX = topWidth - trackWidth - (topWidth * (8 / 440));
    const trackY = (upperHeight - trackHeight) * 0.5;
    this.applyRectStyle(this.ui.scoreTopTrack, trackX, trackY, trackWidth, trackHeight);

    const badgeDiameter = totalHeight * SCORE_HUD_BADGE_DIAMETER_BY_HEIGHT;
    const badgeWidth = badgeDiameter;
    const badgeHeight = badgeDiameter;
    const badgeX = topWidth * (5 / 440);
    const badgeY = (upperHeight - badgeHeight) * 0.5;
    this.applyRectStyle(this.ui.scoreTopBadge, badgeX, badgeY, badgeWidth, badgeHeight);
    this.ui.scoreTopBadge.style.borderRadius = "50%";
    this.ui.scoreTopBadge.style.background = "transparent";
    this.ui.scoreTopBadge.style.borderColor = SCORE_HUD_BADGE_COLOR;
    this.ui.scoreTopBadge.style.borderWidth = `${SCORE_HUD_BADGE_BORDER_WIDTH_PX}px`;
    this.ui.scoreTopBadgeIcon.style.width = `${badgeDiameter * SCORE_HUD_BADGE_ICON_SIZE_BY_DIAMETER}px`;
    this.ui.scoreTopBadgeIcon.style.height = `${badgeDiameter * SCORE_HUD_BADGE_ICON_SIZE_BY_DIAMETER}px`;

    const denom = Math.max(1e-6, slopeJoinX + lowerBaseWidth);
    const lowerCenterX = (slopeJoinX * slopeJoinX + slopeJoinX * lowerBaseWidth + lowerBaseWidth * lowerBaseWidth)
      / (3 * denom);
    const lowerCenterYOffset = lowerHeight * (slopeJoinX + 2 * lowerBaseWidth) / (3 * denom);
    const scoreCenterY = upperHeight + lowerCenterYOffset;
    this.scoreValueCenterYPx = scoreCenterY;
    this.ui.scoreText.style.left = `${lowerCenterX}px`;
    this.ui.scoreText.style.top = `${scoreCenterY}px`;
    this.scoreValueFontPx = Math.max(1, lowerHeight * 0.68);
    this.ui.scoreText.style.fontSize = `${this.scoreValueFontPx}px`;
    this.updateScoreGainAnimations(performance.now());
  }

  private updateScoreHud(stats: RuntimeStats | null): void {
    if (stats) {
      this.updateScoreRankMarkerPositions(stats.notes);
    }
    const score = Math.max(0, Math.floor(stats?.score ?? 0));
    if (!Number.isFinite(this.lastRenderedScore) || this.lastRenderedScore !== score) {
      const clamped = Math.min(999_999_999, score);
      const raw = clamped <= 0 ? "" : String(clamped);
      const padded = raw.padStart(SCORE_HUD_DIGIT_COUNT, "0").slice(-SCORE_HUD_DIGIT_COUNT);
      const filledStart = Math.max(0, SCORE_HUD_DIGIT_COUNT - raw.length);
      for (let index = 0; index < this.ui.scoreDigits.length; index += 1) {
        const digit = this.ui.scoreDigits[index];
        digit.textContent = padded[index] ?? "0";
        const isPad = index < filledStart;
        digit.classList.toggle("is-pad", isPad);
        digit.classList.toggle("is-filled", !isPad);
        digit.style.color = isPad ? SCORE_HUD_DIGIT_PAD_COLOR : SCORE_HUD_ACCENT_PINK;
      }
      this.lastRenderedScore = score;
    }
    const targetGauge = (() => {
      if (!stats) {
        return 0;
      }
      const notes = Math.max(0, Math.floor(stats.notes));
      const fullScore = Math.max(1, SCORE_HUD_BASE_FULL_SCORE + notes);
      return this.clamp01(score / fullScore);
    })();
    this.ui.scoreGaugeFill.style.width = `${(targetGauge * 100).toFixed(3)}%`;
  }

  private updateScoreRankMarkerPositions(noteCount: number): void {
    const notes = Math.max(0, Math.floor(noteCount));
    if (Number.isFinite(this.lastScoreRankNotes) && this.lastScoreRankNotes === notes) {
      return;
    }
    this.lastScoreRankNotes = notes;
    const fullScore = SCORE_HUD_BASE_FULL_SCORE + notes;
    for (let index = 0; index < SCORE_HUD_RANK_THRESHOLDS.length; index += 1) {
      const marker = this.ui.scoreRankLabels[index];
      if (!marker) {
        continue;
      }
      const threshold = SCORE_HUD_RANK_THRESHOLDS[index];
      const ratio = this.clamp01(threshold.score / Math.max(1, fullScore));
      marker.style.left = `${(ratio * 100).toFixed(4)}%`;
    }
  }

  private displayScoreGainPerNote(notes: number): number {
    const safeNotes = Math.max(1, Math.floor(notes));
    return Math.max(0, Math.floor(SCORE_HUD_BASE_FULL_SCORE / safeNotes + 1));
  }

  private createScoreGainAnimationElement(label: string, fontPx: number): ScoreGainAnimation {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("simulator-score-gain-svg");
    svg.setAttribute("width", "1");
    svg.setAttribute("height", "1");
    const defs = document.createElementNS(SVG_NS, "defs");
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    const gradientId = `sim-score-gain-gradient-${this.scoreGainGradientSeq++}`;
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("x2", "0");
    gradient.setAttribute("y2", "1");
    const stopTop = document.createElementNS(SVG_NS, "stop");
    stopTop.setAttribute("offset", "0%");
    stopTop.setAttribute("stop-color", "rgb(235, 255, 255)");
    const stopBottom = document.createElementNS(SVG_NS, "stop");
    stopBottom.setAttribute("offset", "100%");
    stopBottom.setAttribute("stop-color", "rgb(191, 220, 243)");
    gradient.append(stopTop, stopBottom);
    defs.appendChild(gradient);

    const strokeText = document.createElementNS(SVG_NS, "text");
    strokeText.classList.add("simulator-score-gain-svg-stroke");
    strokeText.setAttribute("x", "0");
    strokeText.setAttribute("y", "0");
    strokeText.setAttribute("stroke-width", `${SCORE_HUD_GAIN_STROKE_WIDTH_PX}`);
    strokeText.textContent = label;

    const fillText = document.createElementNS(SVG_NS, "text");
    fillText.classList.add("simulator-score-gain-svg-fill");
    fillText.setAttribute("x", "0");
    fillText.setAttribute("y", "0");
    fillText.setAttribute("fill", `url(#${gradientId})`);
    fillText.textContent = label;

    svg.append(defs, strokeText, fillText);
    const animation: ScoreGainAnimation = {
      el: svg,
      strokeText,
      fillText,
      fontPx: Number.NaN,
      startMs: 0,
    };
    this.applyScoreGainAnimationFont(animation, fontPx);
    return animation;
  }

  private applyScoreGainAnimationFont(animation: ScoreGainAnimation, fontPx: number): void {
    const px = Math.max(1, fontPx);
    if (Number.isFinite(animation.fontPx) && Math.abs(animation.fontPx - px) < 1e-3) {
      return;
    }
    animation.fontPx = px;
    const value = `${px}px`;
    animation.strokeText.setAttribute("font-size", value);
    animation.fillText.setAttribute("font-size", value);
  }

  private spawnScoreGainAnimationsFromJudgeTriggers(
    _stats: RuntimeStats,
    judgeTriggers: readonly JudgeTriggerEvent[],
    nowMs: number,
  ): void {
    if (judgeTriggers.length === 0) {
      return;
    }
    const notes = Math.max(1, Math.floor(_stats.notes));
    const gain = this.displayScoreGainPerNote(notes);
    if (gain <= 0) {
      return;
    }
    for (let index = 0; index < judgeTriggers.length; index += 1) {
      const animation = this.createScoreGainAnimationElement(
        `+${gain}`,
        Math.max(1, this.scoreValueFontPx * SCORE_HUD_GAIN_FONT_SCALE),
      );
      animation.startMs = nowMs;
      this.ui.scoreGainLayer.appendChild(animation.el);
      this.scoreGainAnimations.push(animation);
    }
  }

  private updateScoreGainAnimations(nowMs: number): void {
    if (this.scoreGainAnimations.length === 0) {
      return;
    }
    const width = Math.max(1, this.scoreHudLayoutWidth);
    const gainFontPx = Math.max(1, this.scoreValueFontPx * SCORE_HUD_GAIN_FONT_SCALE);
    const active: ScoreGainAnimation[] = [];
    for (const animation of this.scoreGainAnimations) {
      const elapsed = Math.max(0, nowMs - animation.startMs);
      const t = elapsed / SCORE_HUD_GAIN_ANIM_TOTAL_MS;
      if (t >= SCORE_HUD_GAIN_PHASE_3_END) {
        animation.el.remove();
        continue;
      }
      let xRatio = SCORE_HUD_GAIN_X3;
      let opacity = 0;
      if (t <= SCORE_HUD_GAIN_PHASE_1_END) {
        const phase = this.clamp01(t / SCORE_HUD_GAIN_PHASE_1_END);
        xRatio = this.lerp(SCORE_HUD_GAIN_X0, SCORE_HUD_GAIN_X1, phase);
        opacity = this.easeOutCubic(phase);
      } else if (t <= SCORE_HUD_GAIN_PHASE_2_END) {
        const phase = this.clamp01(
          (t - SCORE_HUD_GAIN_PHASE_1_END) / (SCORE_HUD_GAIN_PHASE_2_END - SCORE_HUD_GAIN_PHASE_1_END),
        );
        xRatio = this.lerp(SCORE_HUD_GAIN_X1, SCORE_HUD_GAIN_X2, phase);
        opacity = 1;
      } else {
        const phase = this.clamp01(
          (t - SCORE_HUD_GAIN_PHASE_2_END) / (SCORE_HUD_GAIN_PHASE_3_END - SCORE_HUD_GAIN_PHASE_2_END),
        );
        xRatio = this.lerp(SCORE_HUD_GAIN_X2, SCORE_HUD_GAIN_X3, phase);
        opacity = 1 - this.easeInCubic(phase);
      }
      animation.el.style.left = `${(xRatio * width).toFixed(3)}px`;
      animation.el.style.top = `${this.scoreValueCenterYPx.toFixed(3)}px`;
      animation.el.style.opacity = `${this.clamp01(opacity)}`;
      this.applyScoreGainAnimationFont(animation, gainFontPx);
      active.push(animation);
    }
    this.scoreGainAnimations = active;
  }

  private clearScoreGainAnimations(): void {
    for (const animation of this.scoreGainAnimations) {
      animation.el.remove();
    }
    this.scoreGainAnimations = [];
    this.ui.scoreGainLayer.textContent = "";
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

  private easeOutCubic(t: number): number {
    const p = this.clamp01(t);
    return 1 - (1 - p) ** 3;
  }

  private easeInCubic(t: number): number {
    const p = this.clamp01(t);
    return p ** 3;
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
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("[Simulator] MV video play() rejected.", error);
        }
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
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[Simulator] MV runtime render failed, fallback to BG rendering.", error);
    }
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
    this.lastScoreRankNotes = Number.NaN;
    this.clearScoreGainAnimations();
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
