import { emit, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AudioEngine } from "../engine/audio";
import { loadNoteSkinTextureBundle } from "../engine/assets";
import { parseEditorChart } from "../engine/editorChartParser";
import {
  buildSettingsFromPayload,
  precomputeLut,
} from "../engine/legacyMath";
import { loadMvResourceFromPayload, type MvResource } from "../engine/mv";
import { LegacyRuntime } from "../engine/runtime";
import { ParsedChart, RuntimeStats, SimulatorSettings } from "../engine/types";
import {
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorLaunchPayload,
  type SimulatorWindowPayloadEnvelope,
} from "../launchPayload";
import { PixiRenderer } from "../renderer/pixiRenderer";

interface UiRefs {
  root: HTMLDivElement;
  host: HTMLDivElement;
  startButton: HTMLButtonElement;
  status: HTMLDivElement;
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


export class SimulatorAppController {
  private ui: UiRefs;
  private runtime: LegacyRuntime | null = null;
  private renderer: PixiRenderer | null = null;
  private readonly audio = new AudioEngine();
  private rafId = 0;
  private frameIntervalMs = 1000 / 60;
  private frameIntervalEpsilonMs = 0.25;
  private lastLoopTickMs = 0;
  private loopAccumulatorMs = 0;
  private fpsCounterTime = 0;
  private fpsCounterFrames = 0;
  private fpsText = "0";
  private isDisposed = false;

  private settings: SimulatorSettings | null = null;
  private chartMvResource: MvResource | null = null;

  private readonly launchRequestId = parseLaunchRequestIdFromHash();
  private launchPayload: SimulatorLaunchPayload | null = null;
  private launchPayloadUnlisten: UnlistenFn | null = null;

  private readonly onStartClick = () => {
    void this.start().catch((error) => {
      if (this.isDisposed) {
        return;
      }
      this.ui.status.textContent = `Start failed: ${String(error)}`;
      this.ui.startButton.disabled = false;
    });
  };

  constructor(parent: HTMLElement) {
    this.ui = this.buildUi(parent);
    this.ui.startButton.addEventListener("click", this.onStartClick);
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
    this.ui.startButton.removeEventListener("click", this.onStartClick);
    this.ui.root.remove();
  }

  private buildUi(parent: HTMLElement): UiRefs {
    const root = document.createElement("div");
    root.className = "simulator-page";

    const shell = document.createElement("div");
    shell.className = "simulator-shell";

    const topbar = document.createElement("div");
    topbar.className = "simulator-topbar";

    const startButton = document.createElement("button");
    startButton.textContent = "Start";

    const status = document.createElement("div");
    status.className = "simulator-status";
    status.textContent = "idle";

    topbar.append(startButton, status);

    const host = document.createElement("div");
    host.className = "simulator-canvas-wrap";

    shell.append(topbar, host);
    root.appendChild(shell);
    parent.appendChild(root);

    return {
      root,
      host,
      startButton,
      status,
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
          this.ui.status.textContent = "launch payload ready";
          if (envelope.payload.autoStart !== false) {
            this.onStartClick();
          }
        },
      );
      await emit(SIMULATOR_WINDOW_READY_EVENT, {
        requestId: this.launchRequestId,
        label: currentWindow.label,
      });
      this.ui.status.textContent = "waiting launch payload...";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.status.textContent = `payload bridge failed: ${message}`;
    }
  }

  private async start(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.stopLoop();
    this.renderer?.destroy();
    this.renderer = null;
    this.runtime = null;
    this.releaseMvResource();

    this.ui.startButton.disabled = true;
    if (!this.launchPayload) {
      throw new Error("Launch payload is required.");
    }

    const settings = buildSettingsFromPayload(this.launchPayload.settings ?? null);
    this.settings = settings;
    this.frameIntervalMs = 1000 / Math.max(1, settings.fps);
    this.frameIntervalEpsilonMs = Math.max(0.1, this.frameIntervalMs * 0.03);
    this.lastLoopTickMs = 0;
    this.loopAccumulatorMs = 0;
    if (!this.launchPayload.chartData) {
      throw new Error("Launch payload requires chartData.");
    }

    this.ui.status.textContent = "initializing renderer...";
    this.renderer = new PixiRenderer(settings);
    await this.renderer.mount(this.ui.host);

    const rendererRef = this.renderer;
    const noteSkinPayload = this.launchPayload?.skin?.noteSkin ?? null;
    const fieldSkinPayload = this.launchPayload?.skin?.fieldSkin ?? null;
    const assetsPromise = (() => {
      if (!noteSkinPayload) {
        throw new Error("NoteSkin payload is required.");
      }
      return loadNoteSkinTextureBundle(noteSkinPayload, fieldSkinPayload).catch(() => null);
    })();

    this.ui.status.textContent = "loading audio/assets...";
    await this.audio.ensureContext();
    const payloadBgmDataUrl = this.launchPayload?.audio?.bgmDataUrl;
    const payloadSeRuntimeAssets = this.launchPayload?.audio?.seRuntimeAssets;
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

    this.ui.status.textContent = "loading chart...";
    precomputeLut(settings);
    const chart: ParsedChart = parseEditorChart(this.launchPayload.chartData, settings);
    this.renderer.setChartEvents(chart.events, chart.timingGroups);

    if (settings.mvmode) {
      this.chartMvResource = await loadMvResourceFromPayload(this.launchPayload.mv ?? null).catch(() => null);
    }

    this.runtime = new LegacyRuntime(settings, chart);
    this.runtime.start(performance.now());

    this.fpsCounterFrames = 0;
    this.fpsCounterTime = performance.now();
    this.lastLoopTickMs = 0;
    this.loopAccumulatorMs = 0;

    this.ui.status.textContent = `running | notes=${chart.noteCount} | max=${Math.floor(chart.maxTimeMs)}ms`;
    this.ui.startButton.disabled = false;
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

    const stats = this.runtime.update(now);

    if (this.runtime.consumePendingMusicStart()) {
      this.audio.playBgm();
    }

    for (const se of this.runtime.consumePendingSeTypes()) {
      this.audio.playSe(se);
    }

    const hitEffects = this.runtime.consumePendingHitEffects();
    if (hitEffects.length > 0) {
      this.renderer.pushHitEffects(hitEffects);
    }

    const elapsedMs = stats.elapsedMs;
    const mvFrame = this.resolveChartMvFrame(elapsedMs);

    this.renderer.render(this.runtime.getActiveNotes(), stats, this.runtime.getProgress(elapsedMs), mvFrame);
    this.updateRuntimeStatus(stats, now);

    if (!this.runtime.isFinished()) {
      this.rafId = requestAnimationFrame(this.loop);
    } else {
      this.ui.status.textContent =
        `finished | combo=${stats.combo}/${stats.notes} | score=${Math.floor(stats.score)} | fps=${this.fpsText}`;
    }
  };

  private updateRuntimeStatus(stats: RuntimeStats, now: number, prefix?: string): void {
    this.fpsCounterFrames += 1;
    const dt = now - this.fpsCounterTime;
    if (dt >= 500) {
      this.fpsText = ((this.fpsCounterFrames * 1000) / dt).toFixed(1);
      this.fpsCounterFrames = 0;
      this.fpsCounterTime = now;
    }

    const left = prefix
      ? prefix
      : `combo=${stats.combo}/${stats.notes} | objects=${stats.activeObjects}/${stats.totalObjects}`;
    this.ui.status.textContent = `running | ${left} | fps=${this.fpsText}`;
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
    if (duration !== null && targetSeconds >= duration) {
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
    this.lastLoopTickMs = 0;
    this.loopAccumulatorMs = 0;
    this.audio.stopBgm();
    if (this.chartMvResource?.kind === "video") {
      this.chartMvResource.video.pause();
    }
  }
}
