import { Application, type Container } from "pixi.js";
import { installPixiFlashBlend } from "../../simulator/backends/pixi/pixiFlashBlend";
import {
  installPixiLinearOutput,
  type PixiLinearOutputOwner,
} from "../../simulator/backends/pixi/pixiLinearColorPipeline";
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
  type SimulatorPreparationPresentation,
} from "../../simulator/platform/platformComposition";
import type { SimulatorSurfaceState } from "../../simulator/platform/surfaceContracts";
import { fitSimulatorCanvas, measureCssSafeArea } from "./mobileSafeArea";
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
  readonly onPresentationReady: () => void;
  readonly onRenderPreparationProgress?: (completed: number, total: number) => void;
}): Promise<BrowserSimulatorPlatformOwner> {
  const graphics = await BrowserPixiGraphicsSurface.create(
    input.host, input.safeArea, input.onPresentationReady, () => scheduler.resetClock(),
  );
  const pointerInput = new BrowserPointerInputSource(graphics.canvas, () => graphics.readSurfaceState());
  const scheduler = new BrowserRafScheduler(() => graphics.render(), input.onPresentationReady);
  const platform: AutonomousSimulatorPlatformCapabilities = Object.freeze({
    resources: input.resources,
    audioContext: input.audioContext,
    graphics,
    scheduler,
    input: pointerInput,
    requestTargetFrameRate(value: 60 | 120) { scheduler.setTargetFrameRate(value); },
    publishLifecycleState: input.onLifecycleState,
    publishRenderPreparationProgress: input.onRenderPreparationProgress,
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
  private readonly surface: SimulatorSurfaceState;
  private mountOwner: Container | null = null;
  private linearOutputOwner: PixiLinearOutputOwner | null = null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly releaseFlashBlend: () => void;
  private preparation: SimulatorPreparationPresentation | null = null;

  private constructor(
    private readonly app: Application,
    readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly safeAreaPolicy: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"],
    private readonly onPresentationReady: () => void,
    private readonly onMount: () => void,
  ) {
    this.releaseFlashBlend = installPixiFlashBlend(app.renderer);
    const width = canvas.width, height = canvas.height;
    const safeArea = safeAreaPolicy === "full-surface"
      ? { x: 0, y: 0, width, height }
      : safeAreaPolicy === "css-safe-area" ? measureCssSafeArea(canvas, width, height) : safeAreaPolicy;
    this.surface = Object.freeze({ revision: 0, viewportWidth: width, viewportHeight: height,
      safeArea: Object.freeze({ ...safeArea }), origin: "bottom-left" as const });
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(this.onSurfaceEnvironmentChange)
      : null;
    this.resizeObserver?.observe(host);
    window.addEventListener("resize", this.onSurfaceEnvironmentChange);
    window.addEventListener("orientationchange", this.onSurfaceEnvironmentChange);
    window.visualViewport?.addEventListener("resize", this.onSurfaceEnvironmentChange);
    this.fitCanvas();
  }

  static async create(
    host: HTMLElement,
    safeArea: "full-surface" | "css-safe-area" | SimulatorSurfaceState["safeArea"],
    onPresentationReady: () => void,
    onMount: () => void,
  ): Promise<BrowserPixiGraphicsSurface> {
    const app = new Application();
    await app.init({
      width: host.clientWidth,
      height: host.clientHeight,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      autoStart: false,
      roundPixels: false,
      preference: "webgl",
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
    canvas.style.position = "relative";
    canvas.style.touchAction = "none";
    host.replaceChildren(canvas);
    return new BrowserPixiGraphicsSurface(app, canvas, host, safeArea, onPresentationReady, onMount);
  }

  readSurfaceState(): SimulatorSurfaceState {
    return this.surface;
  }

  presentPreparation(root: Container, advance: (deltaSeconds: number) => boolean): SimulatorPreparationPresentation {
    if (this.preparation !== null) throw new Error("A preparation presentation is already active.");
    const output = installPixiLinearOutput(root, this.canvas.width, this.canvas.height);
    this.app.stage.addChild(root);
    let stopped = false, previous: number | null = null, frame = 0;
    let resolveFirst!: () => void;
    let rejectFirst!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
    const owner: SimulatorPreparationPresentation = {
      ready,
      stop: () => {
        if (stopped) return;
        stopped = true;
        rejectFirst(new Error("Preparation presentation stopped before readiness."));
        cancelAnimationFrame(frame);
        output.dispose();
        root.removeChildren();
        root.removeFromParent();
        root.destroy({ children: false });
        if (this.preparation === owner) this.preparation = null;
      },
    };
    const tick = (timestamp: number) => {
      if (stopped) return;
      try {
        const complete = advance(previous === null ? 0 : Math.max(0, (timestamp - previous) / 1000));
        this.app.render();
        if (previous === null) {
          this.onPresentationReady();
          previous = performance.now();
        } else previous = timestamp;
        if (complete) resolveFirst();
        frame = requestAnimationFrame(tick);
      } catch (error) {
        rejectFirst(error);
        owner.stop();
      }
    };
    this.preparation = owner;
    frame = requestAnimationFrame(tick);
    return owner;
  }

  mount(_sessionId: string, sceneRoot: Container): SimulatorAssemblyResult<SimulatorGraphicsMount> {
    if (this.mountOwner !== null || sceneRoot.destroyed) {
      return rejected("launch-failed", "simulator.browser.graphics-invalid-mount", "Browser graphics accepts one live combined scene root exactly once.");
    }
    this.mountOwner = sceneRoot;
    this.linearOutputOwner = installPixiLinearOutput(
      sceneRoot,
      this.canvas.width,
      this.canvas.height,
    );
    this.app.stage.addChild(sceneRoot);
    this.app.render();
    this.onMount();
    let disposed = false;
    return assemblyAccepted(Object.freeze({
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.mountOwner === sceneRoot) this.mountOwner = null;
        this.linearOutputOwner?.dispose();
        this.linearOutputOwner = null;
        if (sceneRoot.parent === this.app.stage) this.app.stage.removeChild(sceneRoot);
      },
    }));
  }

  private readonly onSurfaceEnvironmentChange = () => {
    this.fitCanvas();
  };
  private fitCanvas(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (width <= 0 || height <= 0) {
      this.canvas.style.visibility = "hidden";
      return;
    }
    const source = this.surface;
    const safe = this.safeAreaPolicy === "css-safe-area"
      ? measureCssSafeArea(this.host, width, height)
      : this.safeAreaPolicy === "full-surface" ? { x: 0, y: 0, width, height }
        : { x: source.safeArea.x * width / source.viewportWidth,
            y: source.safeArea.y * height / source.viewportHeight,
            width: source.safeArea.width * width / source.viewportWidth,
            height: source.safeArea.height * height / source.viewportHeight };
    const fitted = fitSimulatorCanvas(source, width, height, safe);
    this.canvas.style.visibility = "visible";
    this.canvas.style.width = `${fitted.width}px`;
    this.canvas.style.height = `${fitted.height}px`;
    this.canvas.style.left = `${fitted.x}px`;
    this.canvas.style.top = `${height - fitted.y - fitted.height}px`;
  }
  render(): void { this.app.render(); }
  dispose(): void {
    this.preparation?.stop();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onSurfaceEnvironmentChange);
    window.removeEventListener("orientationchange", this.onSurfaceEnvironmentChange);
    window.visualViewport?.removeEventListener("resize", this.onSurfaceEnvironmentChange);
    this.mountOwner = null;
    this.linearOutputOwner?.dispose();
    this.linearOutputOwner = null;
    this.releaseFlashBlend();
    this.app.destroy({ removeView: true }, { children: false, texture: false, textureSource: false });
  }
}

class BrowserRafScheduler implements SimulatorFrameScheduler {
  private target: 60 | 120 = 60;
  private frameId: number | null = null;
  private stopped = true;
  private sequence = 0;
  private previousTimestamp: number | null = null;
  private nextFrameTimestamp: number | null = null;
  private generation = 0;

  constructor(private readonly render: () => void, private readonly onPresentationReady: () => void) {}
  setTargetFrameRate(value: 60 | 120): void { this.target = value; }

  resetClock(): void {
    // Resource preparation belongs to the generation handoff, not to the
    // first frame of the newly mounted Retry/MoveTime scene.
    this.previousTimestamp = performance.now();
    this.nextFrameTimestamp = this.previousTimestamp + 1000 / this.target;
  }

  start(consumer: (tick: { sequence: number; deltaTimeSeconds: number }) => Promise<void>): SimulatorAssemblyResult<SimulatorFrameSubscription> {
    if (!this.stopped) return rejected("launch-failed", "simulator.browser.scheduler-already-started", "Browser scheduler can start only once per autonomous runtime.");
    this.stopped = false;
    this.sequence = 0;
    this.previousTimestamp = null;
    this.nextFrameTimestamp = null;
    const generation = ++this.generation;
    const tick = (timestamp: number) => {
      if (this.stopped || generation !== this.generation) return;
      if (this.nextFrameTimestamp !== null && timestamp < this.nextFrameTimestamp) {
        this.frameId = requestAnimationFrame(tick);
        return;
      }
      const interval = 1000 / this.target;
      const deadline = this.nextFrameTimestamp ?? timestamp;
      // Keep the requested cadence on high-refresh displays. Missed deadlines
      // are skipped; they never create extra gameplay/animation updates.
      this.nextFrameTimestamp = deadline +
        (Math.floor(Math.max(0, timestamp - deadline) / interval) + 1) * interval;
      // Prepare the engine's initial frame at t=0. Its CPU/GPU setup cost
      // must not consume the opening phase before the host presents that frame.
      const preparing = this.sequence === 0;
      const delta = preparing ? 0 : this.previousTimestamp === null
        ? Math.fround(1 / this.target)
        : Math.fround((timestamp - this.previousTimestamp) / 1000);
      this.previousTimestamp = timestamp;
      const sequence = this.sequence++;
      void consumer(Object.freeze({ sequence, deltaTimeSeconds: delta })).then(() => {
        if (!this.stopped && generation === this.generation) {
          this.render();
          if (preparing) {
            this.onPresentationReady();
            this.resetClock();
          }
        }
      }).finally(() => {
        if (!this.stopped && generation === this.generation) this.frameId = requestAnimationFrame(tick);
      });
    };
    this.frameId = requestAnimationFrame(tick);
    return assemblyAccepted(Object.freeze({ stop: () => { if (generation === this.generation) this.dispose(); } }));
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
    let pausedAfterCommands = controlState.paused;
    for (const command of this.commands.splice(0)) {
      if ((command.kind === "platform-pause" || command.kind === "platform-resume") &&
        !controlState.playable) {
        this.lifecyclePauseApplied = false;
        continue;
      }
      if (command.kind === "platform-pause") {
        if (pausedAfterCommands) continue;
        this.lifecyclePauseApplied = true;
        pausedAfterCommands = true;
      } else if (command.kind === "platform-resume") {
        if (!this.lifecyclePauseApplied) continue;
        this.lifecyclePauseApplied = false;
        pausedAfterCommands = false;
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
