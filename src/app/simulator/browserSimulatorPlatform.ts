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
import type {
  AutonomousSimulatorPlatformCapabilities,
  SimulatorGraphicsMount,
  SimulatorGraphicsSurface,
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
      pointerInput.dispose();
      scheduler.dispose();
      graphics.dispose();
    },
  });
}

class BrowserPixiGraphicsSurface implements SimulatorGraphicsSurface {
  private revision = 0;
  private readonly initialWidth: number;
  private readonly initialHeight: number;
  private readonly initialClientWidth: number;
  private readonly initialClientHeight: number;
  private mountOwner: Container | null = null;
  private readonly resizeObserver: ResizeObserver | null;

  private constructor(
    private readonly app: Application,
    readonly canvas: HTMLCanvasElement,
    host: HTMLElement,
    private readonly safeAreaPolicy: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"],
  ) {
    this.initialWidth = canvas.width;
    this.initialHeight = canvas.height;
    this.initialClientWidth = host.clientWidth;
    this.initialClientHeight = host.clientHeight;
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (host.clientWidth !== this.initialClientWidth || host.clientHeight !== this.initialClientHeight ||
            canvas.width !== this.initialWidth || canvas.height !== this.initialHeight) this.revision += 1;
        })
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

  private readonly onSurfaceEnvironmentChange = () => { this.revision += 1; };
  render(): void { this.app.render(); }
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
  phase: typeof ManualTouchPhase[keyof typeof ManualTouchPhase];
  position: { x: number; y: number };
  terminal: boolean;
}

class BrowserPointerInputSource implements SimulatorRuntimeInputSource {
  private readonly pointers = new Map<number, PointerState>();
  private readonly fingerByPointer = new Map<number, number>();
  private readonly commands: SimulatorRuntimeCommand[] = [];
  private disposed = false;

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
    canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  consume(_sequence: number, _controlState: SimulatorTimelineControlState, surface: SimulatorSurfaceState): SimulatorAssemblyResult<SimulatorRuntimeInputBatch> {
    if (this.disposed) return rejected("launch-failed", "simulator.browser.input-disposed", "Disposed browser input cannot publish empty fallback frames.");
    const touches: ManualInputTouch[] = [];
    for (const [pointerId, pointer] of this.pointers) {
      touches.push(Object.freeze({
        fingerId: pointer.fingerId,
        phase: pointer.phase,
        position: Object.freeze({ ...pointer.position }),
        buttonResolution: null,
      }));
      if (pointer.terminal) {
        this.pointers.delete(pointerId);
        this.fingerByPointer.delete(pointerId);
      } else {
        pointer.phase = ManualTouchPhase.Stationary;
      }
    }
    const frame: ManualInputFrame = Object.freeze({ touches: Object.freeze(touches) });
    const commands = Object.freeze(this.commands.splice(0));
    return assemblyAccepted(Object.freeze({ surfaceRevision: surface.revision, manualFrame: frame, commands }));
  }

  enqueue(command: SimulatorRuntimeCommand): void { if (!this.disposed) this.commands.push(Object.freeze(command)); }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.disposed || this.fingerByPointer.has(event.pointerId)) return;
    const fingerId = this.allocateFinger();
    if (fingerId === null) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.fingerByPointer.set(event.pointerId, fingerId);
    this.pointers.set(event.pointerId, { fingerId, phase: ManualTouchPhase.Began, position: this.position(event), terminal: false });
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer === undefined || pointer.terminal) return;
    pointer.phase = ManualTouchPhase.Moved;
    pointer.position = this.position(event);
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer === undefined) return;
    pointer.phase = ManualTouchPhase.Ended;
    pointer.position = this.position(event);
    pointer.terminal = true;
  };
  private readonly onVisibilityChange = () => { this.enqueue({ kind: document.hidden ? "pause" : "resume" }); };
  private readonly onPageHide = () => { this.enqueue({ kind: "user-close" }); };
  private readonly onContextLost = (event: Event) => { event.preventDefault(); this.enqueue({ kind: "abort" }); };

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
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.pointers.clear();
    this.fingerByPointer.clear();
    this.commands.length = 0;
  }
}
