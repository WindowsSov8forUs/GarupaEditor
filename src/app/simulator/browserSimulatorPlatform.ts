import { Application, type Container } from "pixi.js";
import { assemblyAccepted, rejected, type SimulatorAssemblyResult } from "../../simulator/assembly/result";
import type { SimulatorLifecycleBackendState } from "../../simulator/backends/contracts";
import {
  ManualTouchPhase,
  type ManualInputFrame,
  type ManualInputTouch,
} from "../../simulator/engine/data/manualInput";
import type { SimulatorTimelineControlState } from "../../simulator/host/portableReplaySession";
import type { SimulatorResourceCapability } from "../../simulator/platform/resourceContracts";
import {
  releaseProductionAutonomousSimulatorPlatform,
  type AutonomousSimulatorPlatformCapabilities,
  type SimulatorGraphicsMount,
  type SimulatorGraphicsSurface,
} from "../../simulator/platform/platformComposition";
import type { SimulatorSurfaceState } from "../../simulator/platform/surfaceContracts";
import { measureCssSafeArea } from "./mobileSafeArea";
import type {
  SimulatorFrameScheduler,
  SimulatorFrameSubscription,
  SimulatorRuntimeCommand,
  SimulatorRuntimeInputBatch,
  SimulatorRuntimeInputSource,
} from "../../simulator/runtime/contracts";

export interface BrowserSimulatorPlatformOwner {
  readonly platform: AutonomousSimulatorPlatformCapabilities;
  requestClose(): void;
  dispose(): void;
}

export async function createBrowserSimulatorPlatform(input: {
  readonly host: HTMLElement;
  readonly audioContext: AudioContext;
  readonly resources: SimulatorResourceCapability;
  readonly safeArea: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"];
  readonly onLifecycleState: (state: SimulatorLifecycleBackendState) => void;
}): Promise<BrowserSimulatorPlatformOwner> {
  const graphics = await BrowserPixiGraphicsSurface.create(input.host, input.safeArea);
  const pointerInput = new BrowserPointerInputSource(graphics.canvas, () => graphics.readSurfaceState());
  const scheduler = new BrowserRafScheduler(() => graphics.render());
  const platform: AutonomousSimulatorPlatformCapabilities = Object.freeze({
    resources: input.resources,
    audioContext: input.audioContext,
    graphics,
    scheduler,
    input: pointerInput,
    requestTargetFrameRate(value: 60 | 120) { scheduler.setTargetFrameRate(value); },
    publishLifecycleState: input.onLifecycleState,
  });
  return Object.freeze({
    platform,
    requestClose() { pointerInput.enqueue({ kind: "user-close" }); },
    dispose() {
      releaseProductionAutonomousSimulatorPlatform(platform);
      pointerInput.dispose();
      scheduler.dispose();
      graphics.dispose();
    },
  });
}

class BrowserPixiGraphicsSurface implements SimulatorGraphicsSurface {
  private revision = 0;
  private lastWidth: number;
  private lastHeight: number;
  private lastClientWidth: number;
  private lastClientHeight: number;
  private mountOwner: Container | null = null;
  private readonly resizeObserver: ResizeObserver | null;

  private constructor(
    private readonly app: Application,
    readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly safeAreaPolicy: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"],
  ) {
    this.lastWidth = canvas.width;
    this.lastHeight = canvas.height;
    this.lastClientWidth = host.clientWidth;
    this.lastClientHeight = host.clientHeight;
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.synchronizeSurfaceMetrics())
      : null;
    this.resizeObserver?.observe(host);
    window.addEventListener("orientationchange", this.onSurfaceEnvironmentChange);
    window.visualViewport?.addEventListener("resize", this.onSurfaceEnvironmentChange);
  }

  static async create(
    host: HTMLElement,
    safeArea: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"],
  ): Promise<BrowserPixiGraphicsSurface> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      autoStart: false,
      roundPixels: false,
    });
    const canvas = app.canvas;
    const backingToPixiX = app.screen.width / canvas.width;
    const backingToPixiY = app.screen.height / canvas.height;
    if (
      !Number.isFinite(backingToPixiX) || !Number.isFinite(backingToPixiY) ||
      !(backingToPixiX > 0) || !(backingToPixiY > 0)
    ) throw new Error("Browser Pixi surface cannot map its backing-store viewport to renderer logical coordinates.");
    app.stage.scale.set(backingToPixiX, backingToPixiY);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    host.replaceChildren(canvas);
    return new BrowserPixiGraphicsSurface(app, canvas, host, safeArea);
  }

  readSurfaceState(): SimulatorSurfaceState {
    this.synchronizeSurfaceMetrics();
    const width = this.canvas.width;
    const height = this.canvas.height;
    const safeArea = this.safeAreaPolicy === "full-surface"
      ? Object.freeze({ x: Math.fround(0), y: Math.fround(0), width: Math.fround(width), height: Math.fround(height) })
      : this.safeAreaPolicy === "css-safe-area"
        ? measureCssSafeArea(this.canvas, width, height)
        : this.safeAreaPolicy;
    return Object.freeze({
      revision: this.revision,
      viewportWidth: width,
      viewportHeight: height,
      safeArea,
      origin: "bottom-left" as const,
    });
  }

  mount(_sessionId: string, sceneRoot: Container): SimulatorAssemblyResult<SimulatorGraphicsMount> {
    if (this.mountOwner !== null || sceneRoot.destroyed) {
      return rejected("launch-failed", "simulator.browser.graphics-invalid-mount", "Browser graphics accepts one live combined scene root exactly once.");
    }
    this.mountOwner = sceneRoot;
    this.app.stage.addChild(sceneRoot);
    this.app.render();
    let disposed = false;
    return assemblyAccepted(Object.freeze({
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.mountOwner === sceneRoot) this.mountOwner = null;
        if (sceneRoot.parent === this.app.stage) this.app.stage.removeChild(sceneRoot);
      },
    }));
  }

  private readonly onSurfaceEnvironmentChange = () => {
    this.revision += 1;
    this.synchronizeStageScale();
  };
  private synchronizeSurfaceMetrics(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const clientWidth = this.host.clientWidth;
    const clientHeight = this.host.clientHeight;
    if (
      width !== this.lastWidth || height !== this.lastHeight ||
      clientWidth !== this.lastClientWidth || clientHeight !== this.lastClientHeight
    ) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.lastClientWidth = clientWidth;
      this.lastClientHeight = clientHeight;
      this.revision += 1;
    }
    this.synchronizeStageScale();
  }
  private synchronizeStageScale(): void {
    const backingToPixiX = this.app.screen.width / this.canvas.width;
    const backingToPixiY = this.app.screen.height / this.canvas.height;
    if (Number.isFinite(backingToPixiX) && Number.isFinite(backingToPixiY) &&
      backingToPixiX > 0 && backingToPixiY > 0) {
      this.app.stage.scale.set(backingToPixiX, backingToPixiY);
    }
  }
  render(): void { this.synchronizeSurfaceMetrics(); this.app.render(); }
  dispose(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener("orientationchange", this.onSurfaceEnvironmentChange);
    window.visualViewport?.removeEventListener("resize", this.onSurfaceEnvironmentChange);
    this.mountOwner = null;
    this.app.destroy({ removeView: true }, { children: false, texture: false, textureSource: false });
  }
}

class BrowserRafScheduler implements SimulatorFrameScheduler {
  private target: 60 | 120 = 60;
  private frameId: number | null = null;
  private stopped = true;
  private sequence = 0;
  private previousTimestamp: number | null = null;

  constructor(private readonly render: () => void) {}
  setTargetFrameRate(value: 60 | 120): void { this.target = value; }

  start(consumer: (tick: { sequence: number; deltaTimeSeconds: number }) => Promise<void>): SimulatorAssemblyResult<SimulatorFrameSubscription> {
    if (!this.stopped) return rejected("launch-failed", "simulator.browser.scheduler-already-started", "Browser scheduler can start only once per autonomous runtime.");
    this.stopped = false;
    const tick = (timestamp: number) => {
      if (this.stopped) return;
      const delta = this.previousTimestamp === null
        ? Math.fround(1 / this.target)
        : Math.fround((timestamp - this.previousTimestamp) / 1000);
      this.previousTimestamp = timestamp;
      const sequence = this.sequence++;
      void consumer(Object.freeze({ sequence, deltaTimeSeconds: delta })).then(() => {
        if (!this.stopped) this.render();
      }).finally(() => {
        if (!this.stopped) this.frameId = requestAnimationFrame(tick);
      });
    };
    this.frameId = requestAnimationFrame(tick);
    return assemblyAccepted(Object.freeze({ stop: () => this.dispose() }));
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }
}

interface PointerState {
  readonly fingerId: number;
  position: { x: number; y: number };
  terminal: boolean;
  readonly pending: Array<Readonly<{
    phase: typeof ManualTouchPhase[keyof typeof ManualTouchPhase];
    position: { x: number; y: number };
  }>>;
}

class BrowserPointerInputSource implements SimulatorRuntimeInputSource {
  private readonly pointers = new Map<number, PointerState>();
  private readonly fingerByPointer = new Map<number, number>();
  private readonly commands: SimulatorRuntimeCommand[] = [];
  private disposed = false;
  private hardwareBack = false;
  private lifecyclePaused = false;
  private lifecyclePauseApplied = false;
  private closeQueued = false;
  private abortQueued = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly surface: () => SimulatorSurfaceState,
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onWindowBlur);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  consume(_sequence: number, controlState: SimulatorTimelineControlState, surface: SimulatorSurfaceState): SimulatorAssemblyResult<SimulatorRuntimeInputBatch> {
    if (this.disposed) return rejected("launch-failed", "simulator.browser.input-disposed", "Disposed browser input cannot publish empty fallback frames.");
    const touches: ManualInputTouch[] = [];
    for (const [pointerId, pointer] of this.pointers) {
      const pending = pointer.pending.shift();
      const phase = pending?.phase ?? ManualTouchPhase.Stationary;
      const position = pending?.position ?? pointer.position;
      touches.push(Object.freeze({
        fingerId: pointer.fingerId,
        phase,
        position: Object.freeze({ ...position }),
        buttonResolution: null,
      }));
      if (phase === ManualTouchPhase.Ended && pointer.pending.length === 0) {
        this.pointers.delete(pointerId);
        this.fingerByPointer.delete(pointerId);
      }
    }
    const frame: ManualInputFrame = Object.freeze({ touches: Object.freeze(touches) });
    let hardwareBack = this.hardwareBack;
    this.hardwareBack = false;
    if (hardwareBack && !controlState.playable) {
      this.enqueue({ kind: "user-close" });
      hardwareBack = false;
    }
    const commands: SimulatorRuntimeCommand[] = [];
    for (const command of this.commands.splice(0)) {
      if (command.kind === "platform-pause") {
        if (controlState.paused) {
          this.lifecyclePauseApplied = false;
          continue;
        }
        this.lifecyclePauseApplied = true;
      } else if (command.kind === "platform-resume") {
        if (!this.lifecyclePauseApplied) continue;
        this.lifecyclePauseApplied = false;
      }
      commands.push(command);
    }
    return assemblyAccepted(Object.freeze({
      surfaceRevision: surface.revision,
      manualFrame: frame,
      hardwareBack,
      commands: Object.freeze(commands),
    }));
  }

  enqueue(command: SimulatorRuntimeCommand): void {
    if (this.disposed) return;
    if (command.kind === "user-close") {
      if (this.closeQueued) return;
      this.closeQueued = true;
    }
    if (command.kind === "platform-abort") {
      if (this.abortQueued) return;
      this.abortQueued = true;
    }
    this.commands.push(Object.freeze(command));
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.disposed || this.fingerByPointer.has(event.pointerId)) return;
    const fingerId = this.allocateFinger();
    if (fingerId === null) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.fingerByPointer.set(event.pointerId, fingerId);
    const position = this.position(event);
    this.pointers.set(event.pointerId, {
      fingerId,
      position,
      terminal: false,
      pending: [{ phase: ManualTouchPhase.Began, position }],
    });
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer === undefined || pointer.terminal) return;
    pointer.position = this.position(event);
    pointer.pending.push({ phase: ManualTouchPhase.Moved, position: pointer.position });
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer === undefined) return;
    pointer.position = this.position(event);
    pointer.terminal = true;
    pointer.pending.push({ phase: ManualTouchPhase.Ended, position: pointer.position });
  };
  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      if (!this.lifecyclePaused) {
        this.lifecyclePaused = true;
        this.enqueue({ kind: "platform-pause" });
      }
    } else if (this.lifecyclePaused) {
      this.lifecyclePaused = false;
      this.enqueue({ kind: "platform-resume" });
    }
  };
  private readonly onPageHide = () => { this.enqueue({ kind: "user-close" }); };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.disposed || (event.key !== "Escape" && event.key !== "BrowserBack")) return;
    event.preventDefault();
    this.hardwareBack = true;
  };
  private readonly onContextLost = (event: Event) => { event.preventDefault(); this.enqueue({ kind: "platform-abort" }); };
  private readonly onWindowBlur = () => {
    for (const pointer of this.pointers.values()) {
      if (pointer.terminal) continue;
      pointer.terminal = true;
      pointer.pending.push({ phase: ManualTouchPhase.Ended, position: pointer.position });
    }
  };

  private position(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const surface = this.surface();
    return Object.freeze({
      x: Math.fround((event.clientX - rect.left) * surface.viewportWidth / rect.width),
      y: Math.fround((rect.bottom - event.clientY) * surface.viewportHeight / rect.height),
    });
  }
  private allocateFinger(): number | null {
    const used = new Set(this.fingerByPointer.values());
    for (let value = 0; value <= 14; value += 1) if (!used.has(value)) return value;
    return null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onWindowBlur);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.pointers.clear();
    this.fingerByPointer.clear();
    this.commands.length = 0;
    this.hardwareBack = false;
    this.lifecyclePaused = false;
    this.lifecyclePauseApplied = false;
    this.closeQueued = false;
    this.abortQueued = false;
  }
}
