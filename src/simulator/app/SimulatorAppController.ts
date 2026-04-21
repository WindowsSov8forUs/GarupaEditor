import { emit, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AudioEngine } from "../engine/audio";
import { loadNoteSkinTextureBundle } from "../engine/assets";
import { parseEditorChart } from "../engine/editorChartParser";
import {
  buildSettingsFromPayload,
  legacyOffsetToMs,
  precomputeLut,
} from "../engine/legacyMath";
import { loadMvResourceFromPayload, type MvResource } from "../engine/mv";
import { LegacyRuntime } from "../engine/runtime";
import { ParsedChart, SimulatorSettings } from "../engine/types";
import {
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorLaunchPayload,
  type SimulatorMvPayload,
  type SimulatorWindowPayloadEnvelope,
} from "../launchPayload";
import { PixiRenderer, type SimulatorStartupRenderState } from "../renderer/pixiRenderer";
import { getDifficultyStyle } from "../../difficultyStyle";
import simulatorPauseIconSvg from "../../assets/icons/simulator-pause.svg?raw";
import simulatorPlayIconSvg from "../../assets/icons/simulator-play.svg?raw";

interface UiRefs {
  root: HTMLDivElement;
  host: HTMLDivElement;
  uiLayer: HTMLDivElement;
  pauseMask: HTMLDivElement;
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

export class SimulatorAppController {
  private ui: UiRefs;
  private runtime: LegacyRuntime | null = null;
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
  private readonly onWindowResize = () => {
    this.updateBootLayerLayout();
  };

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

    const uiLayer = document.createElement("div");
    uiLayer.className = "simulator-ui-layer";
    const pauseMask = document.createElement("div");
    pauseMask.className = "simulator-pause-mask";
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
    uiLayer.append(pauseMask, pauseAnchor);

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
      uiLayer,
      pauseMask,
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

    const settings = buildSettingsFromPayload(this.launchPayload.settings ?? null);
    this.settings = settings;
    this.frameIntervalMs = 1000 / Math.max(1, settings.fps);
    this.frameIntervalEpsilonMs = Math.max(0.1, this.frameIntervalMs * 0.03);
    if (!this.launchPayload.chartData) {
      throw new Error("Launch payload requires chartData.");
    }

    this.renderer = new PixiRenderer(settings);
    await this.renderer.mount(this.ui.host);

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

    const payloadMv = resolveMvPayloadFromMetadata(payloadMetadata);
    if (settings.mvmode) {
      this.chartMvResource = await loadMvResourceFromPayload(payloadMv).catch(() => null);
    }

    this.runtime = new LegacyRuntime(settings, chart);

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
      const offsetMs = legacyOffsetToMs(this.settings.offset);
      const runtimeShiftMs = STARTUP_CHART_PREROLL_MS - offsetMs;
      this.runtime.start(now + runtimeShiftMs);
      this.runtimeStarted = true;
      this.startupPhase = "running";
    }

    const stats = this.runtime.update(now);
    this.lastElapsedMs = stats.elapsedMs;

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

    const elapsedMs = stats.elapsedMs;
    const mvFrame = this.runtimeStarted ? this.resolveChartMvFrame(elapsedMs) : null;

    this.renderer.render(this.runtime.getActiveNotes(), stats, mvFrame);

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

  private applyBootCoverState(alpha: number, visible: boolean): void {
    const shouldShow = visible && this.startupCoverSrc.length > 0;
    this.ui.bootLayer.style.display = shouldShow ? "flex" : "none";
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
    | { kind: "video"; video: HTMLVideoElement; alpha: number; sourceWidth: number; sourceHeight: number }
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
    const videoElapsedMs = elapsedMs - this.chartMvResource.offsetMs;
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
      return null;
    }

    const targetSeconds = Math.max(0, videoElapsedMs / 1000);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    if (this.isPaused) {
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.currentTime - targetSeconds) > 0.12) {
        try {
          video.currentTime = targetSeconds;
        } catch {
          // ignore seek errors
        }
      }
    } else if (duration !== null && targetSeconds >= duration) {
      const freezeSeconds = Math.max(0, duration - 0.001);
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.currentTime - freezeSeconds) > 0.03) {
        try {
          video.currentTime = freezeSeconds;
        } catch {
          // ignore seek errors
        }
      }
    } else {
      if (Math.abs(video.currentTime - targetSeconds) > 0.12) {
        try {
          video.currentTime = targetSeconds;
        } catch {
          // ignore seek errors
        }
      }
      if (video.paused) {
        void video.play().catch(() => {});
      }
    }

    return {
      kind: "video",
      video,
      alpha: this.settings.mvAlpha,
      sourceWidth: this.chartMvResource.width,
      sourceHeight: this.chartMvResource.height,
    };
  }

  private releaseMvResource(): void {
    if (this.chartMvResource?.kind === "video") {
      const video = this.chartMvResource.video;
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
    }
    this.chartMvResource = null;
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
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
    this.pendingStartupTouch = false;
    this.applyPauseUiState();
    this.applyUiAlpha(0);
    this.audio.stopBgm();
    if (this.chartMvResource?.kind === "video") {
      this.chartMvResource.video.pause();
    }
  }
}
