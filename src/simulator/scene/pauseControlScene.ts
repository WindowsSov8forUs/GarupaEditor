import { ManualTouchPhase, type ManualInputFrame, type ManualInputTouch } from "../engine/data/manualInput";
import { integrityFailure, ok, productSemantic, type SimulatorResult } from "../engine/evidence";
import type { SimulatorTimelineControlState } from "../host/portableReplaySession";
import type { SimulatorSurfaceState } from "../platform/surfaceContracts";
import type { OriginalSurfaceLayout } from "./originalSurfaceLayout";
import {
  createRehearsalControlSceneLayout,
  resolveRehearsalControlTouch,
  type RehearsalControlCommand,
  type RehearsalControlSceneLayout,
} from "./rehearsalControlScene";

export type PauseControlState =
  | "playing"
  | "pause-menu"
  | "retry-confirm"
  | "abort-confirm"
  | "resume-countdown";

export type PauseControlCommandKind = "pause" | "resume" | "retry" | "abort";
export interface PauseControlCommand {
  readonly kind: PauseControlCommandKind;
  readonly capability: object;
}

export interface PauseControlBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PauseControlLayout {
  readonly surfaceRevision: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly controlScale: number;
  readonly pause: {
    readonly centerBottomLeft: readonly [number, number];
    readonly visibleBoundsTopLeft: PauseControlBounds;
    readonly hitCircleRadiusPixels: number;
  };
  readonly pauseMenu: {
    readonly windowBoundsTopLeft: PauseControlBounds;
    readonly abortBoundsTopLeft: PauseControlBounds;
    readonly retryBoundsTopLeft: PauseControlBounds;
    readonly resumeBoundsTopLeft: PauseControlBounds;
  };
  readonly confirmation: {
    readonly windowBoundsTopLeft: PauseControlBounds;
    readonly cancelBoundsTopLeft: PauseControlBounds;
    readonly confirmBoundsTopLeft: PauseControlBounds;
  };
  readonly rehearsal: RehearsalControlSceneLayout;
}

export interface PauseControlSceneSnapshot {
  readonly state: PauseControlState;
  readonly surfaceRevision: number;
  readonly mode: SimulatorTimelineControlState["mode"];
  readonly playable: boolean;
  readonly layout: PauseControlLayout;
  readonly resumeCountdownSecondsRemaining: number | null;
  readonly words: {
    readonly pause: { readonly title: "一時停止"; readonly message: "ライブを一時停止しています"; readonly buttons: readonly ["中断", "リトライ", "再開"] };
    readonly retry: { readonly title: "リトライ"; readonly message: "リトライしてライブを最初からプレイしますか？"; readonly buttons: readonly ["キャンセル", "リトライ"] };
    readonly abort: { readonly title: "中断"; readonly message: "ライブを中断してホーム画面に戻りますか？"; readonly annotation: "※中断した場合、ライブ報酬を獲得できません。"; readonly buttons: readonly ["キャンセル", "中断"] };
  };
}

export interface PauseControlRouteResult {
  readonly manualFrame: ManualInputFrame | null;
  readonly commands: readonly (PauseControlCommand | RehearsalControlCommand)[];
  readonly snapshot: PauseControlSceneSnapshot;
}

const RESUME_COUNTDOWN_SECONDS = Math.fround(3);
const PAUSE_LOCAL_X = Math.fround(-42);
const PAUSE_LOCAL_Y = Math.fround(-54);
const PAUSE_WIDTH = Math.fround(68);
const PAUSE_HEIGHT = Math.fround(70);
const PAUSE_RADIUS_WORLD = Math.fround(0.15000000596046448);
const RETRYABLE_WINDOW_WIDTH = Math.fround(922);
const RETRYABLE_WINDOW_HEIGHT = Math.fround(320);
const RETRYABLE_BUTTON_WIDTH = Math.fround(248);
const RETRYABLE_BUTTON_HEIGHT = Math.fround(72);
const RETRYABLE_BUTTON_Y = Math.fround(-94.00001525878906);
const ABORT_BUTTON_X = Math.fround(-274);
const RETRY_BUTTON_X = Math.fround(0);
const RESUME_BUTTON_X = Math.fround(272.0000305175781);
const CONFIRM_WINDOW_WIDTH = Math.fround(640);
const CONFIRM_WINDOW_HEIGHT = Math.fround(318);
const CONFIRM_BUTTON_Y = RETRYABLE_BUTTON_Y;
const CANCEL_BUTTON_X = Math.fround(-136.00001525878906);
const CONFIRM_BUTTON_X = Math.fround(135);

const VISIBLE_WORDS: PauseControlSceneSnapshot["words"] = deepFreeze({
  pause: { title: "一時停止", message: "ライブを一時停止しています", buttons: ["中断", "リトライ", "再開"] as const },
  retry: { title: "リトライ", message: "リトライしてライブを最初からプレイしますか？", buttons: ["キャンセル", "リトライ"] as const },
  abort: { title: "中断", message: "ライブを中断してホーム画面に戻りますか？", annotation: "※中断した場合、ライブ報酬を獲得できません。", buttons: ["キャンセル", "中断"] as const },
});

type PressTarget = "abort" | "retry" | "resume" | "cancel" | "confirm";

interface IssuedPauseCommand {
  readonly kind: PauseControlCommandKind;
  readonly mode: SimulatorTimelineControlState["mode"];
  readonly surfaceRevision: number;
  consumed: boolean;
}

const issuedCommands = new WeakMap<object, IssuedPauseCommand>();

export class PauseControlSceneOwner {
  private state: PauseControlState = "playing";
  private countdown = Math.fround(0);
  private readonly pressed = new Map<number, PressTarget>();
  private disposed = false;

  route(
    deltaTimeSeconds: number,
    manualFrame: ManualInputFrame | null,
    controlState: SimulatorTimelineControlState,
    layout: PauseControlLayout,
    hardwareBack = false,
  ): SimulatorResult<PauseControlRouteResult> {
    if (this.disposed || !validControlState(controlState) || !validLayout(layout) ||
      !Number.isFinite(deltaTimeSeconds) || Math.fround(deltaTimeSeconds) < 0 ||
      typeof hardwareBack !== "boolean" ||
      (manualFrame !== null && (typeof manualFrame !== "object" || !Array.isArray(manualFrame.touches)))) {
      return integrityFailure(
        "pause.control.invalid-route-state",
        ["PAU-B01", "PAU-B02", "PAU-B04", "PAU-B05"],
        "The Pause owner consumes one live owner, exact four-mode state, initial-surface layout, finite non-negative Float32 frame and explicit raw touch array.",
      );
    }
    const commands: Array<PauseControlCommand | RehearsalControlCommand> = [];
    const touches = manualFrame?.touches ?? [];
    const gameplay: ManualInputTouch[] = [];
    let hardwareBackProductSemanticsId: string | null = null;

    if (hardwareBack) {
      if (this.state === "playing" && controlState.playable && !controlState.paused && !controlState.moveTimeInProgress) {
        commands.push(issue("pause", controlState.mode, layout.surfaceRevision));
        this.state = "pause-menu";
        this.pressed.clear();
        hardwareBackProductSemanticsId = "GE-PS-BACK-PLAYING-OPENS-PAUSE";
      } else if (this.state === "pause-menu" && controlState.playable && controlState.paused && !controlState.moveTimeInProgress) {
        this.state = "resume-countdown";
        this.countdown = RESUME_COUNTDOWN_SECONDS;
        this.pressed.clear();
      } else if (this.state === "retry-confirm" || this.state === "abort-confirm") {
        this.state = "pause-menu";
        this.pressed.clear();
        hardwareBackProductSemanticsId = "GE-PS-BACK-CONFIRM-TO-PAUSE";
      } else if (this.state === "resume-countdown") {
        hardwareBackProductSemanticsId = "GE-PS-BACK-COUNTDOWN-CONSUMED";
      }
    }

    if (this.state === "resume-countdown") {
      if (!controlState.paused) return this.reject("pause.control.countdown-engine-not-paused", "Resume countdown requires the engine to remain paused until its exact three-second callback.");
      this.countdown = Math.fround(this.countdown - Math.fround(deltaTimeSeconds));
      if (this.countdown <= 0) {
        this.countdown = Math.fround(0);
        commands.push(issue("resume", controlState.mode, layout.surfaceRevision));
        this.state = "playing";
      }
    }

    for (const touch of touches) {
      if (!validTouch(touch)) return this.reject("pause.control.invalid-touch", "Pause routing rejects malformed raw touches without forwarding a repaired gameplay frame.");
      if (this.state !== "playing") {
        const routed = this.routeModalTouch(touch, controlState, layout, commands);
        if (routed.status !== "ok") return routed;
        continue;
      }
      if (!controlState.playable || controlState.paused || controlState.moveTimeInProgress) {
        continue;
      }
      if (touch.phase === ManualTouchPhase.Began && insideCircle(touch.position, layout.pause)) {
        commands.push(issue("pause", controlState.mode, layout.surfaceRevision));
        this.state = "pause-menu";
        this.pressed.clear();
        continue;
      }
      const rehearsal = resolveRehearsalControlTouch(
        controlState.mode,
        phaseName(touch.phase),
        touch.position,
        controlState,
        layout.rehearsal,
      );
      if (rehearsal.status !== "ok") return rehearsal;
      if (rehearsal.value !== null) {
        commands.push(rehearsal.value);
        continue;
      }
      if (controlState.mode.inputMode === "manual") gameplay.push(touch);
    }

    const filtered = manualFrame === null
      ? null
      : Object.freeze({ touches: Object.freeze(gameplay) });
    const result = Object.freeze({
      manualFrame: filtered,
      commands: Object.freeze(commands),
      snapshot: this.snapshot(controlState.mode, layout, controlState.playable),
    });
    return hardwareBackProductSemanticsId === null
      ? ok(result)
      : productSemantic(
          result,
          "pause.control.product-hardware-back",
          ["PAU-B04"],
          "Android Back outside the observed open Pause-menu callback follows an explicit GarupaEditor navigation semantic without claiming original equivalence.",
          hardwareBackProductSemanticsId,
        );
  }

  snapshot(mode: SimulatorTimelineControlState["mode"], layout: PauseControlLayout, playable = true): PauseControlSceneSnapshot {
    return deepFreeze({
      state: this.state,
      surfaceRevision: layout.surfaceRevision,
      mode,
      playable,
      layout,
      resumeCountdownSecondsRemaining: this.state === "resume-countdown" ? this.countdown : null,
      words: VISIBLE_WORDS,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pressed.clear();
    this.countdown = Math.fround(0);
  }

  private routeModalTouch(
    touch: ManualInputTouch,
    controlState: SimulatorTimelineControlState,
    layout: PauseControlLayout,
    commands: Array<PauseControlCommand | RehearsalControlCommand>,
  ): SimulatorResult<void> {
    if (this.state === "resume-countdown") return ok(undefined);
    const target = this.targetAt(touch.position, layout);
    if (touch.phase === ManualTouchPhase.Began) {
      if (target !== null) this.pressed.set(touch.fingerId, target);
      return ok(undefined);
    }
    if (touch.phase !== ManualTouchPhase.Ended) return ok(undefined);
    const pressed = this.pressed.get(touch.fingerId) ?? null;
    this.pressed.delete(touch.fingerId);
    if (pressed === null || target !== pressed) return ok(undefined);
    if (this.state === "pause-menu") {
      if (pressed === "resume") {
        this.state = "resume-countdown";
        this.countdown = RESUME_COUNTDOWN_SECONDS;
        this.pressed.clear();
      } else if (pressed === "retry") {
        this.state = "retry-confirm";
        this.pressed.clear();
      } else if (pressed === "abort") {
        this.state = "abort-confirm";
        this.pressed.clear();
      }
      return ok(undefined);
    }
    if (pressed === "cancel") {
      this.state = "pause-menu";
      this.pressed.clear();
      return ok(undefined);
    }
    if (pressed === "confirm") {
      commands.push(issue(this.state === "retry-confirm" ? "retry" : "abort", controlState.mode, layout.surfaceRevision));
      this.state = "playing";
      this.pressed.clear();
    }
    return ok(undefined);
  }

  private targetAt(position: Readonly<{ x: number; y: number }>, layout: PauseControlLayout): PressTarget | null {
    const topLeft = { x: position.x, y: Math.fround(layout.viewportHeight - position.y) };
    if (this.state === "pause-menu") {
      if (insideBounds(topLeft, layout.pauseMenu.abortBoundsTopLeft)) return "abort";
      if (insideBounds(topLeft, layout.pauseMenu.retryBoundsTopLeft)) return "retry";
      if (insideBounds(topLeft, layout.pauseMenu.resumeBoundsTopLeft)) return "resume";
      return null;
    }
    if (this.state === "retry-confirm" || this.state === "abort-confirm") {
      if (insideBounds(topLeft, layout.confirmation.cancelBoundsTopLeft)) return "cancel";
      if (insideBounds(topLeft, layout.confirmation.confirmBoundsTopLeft)) return "confirm";
    }
    return null;
  }

  private reject<T>(capability: string, boundary: string): SimulatorResult<T> {
    return integrityFailure(capability, ["PAU-B01", "PAU-B04"], boundary);
  }
}

export function createPauseControlLayout(layout: OriginalSurfaceLayout): SimulatorResult<PauseControlLayout> {
  if (layout === null || typeof layout !== "object" || layout.surface?.origin !== "bottom-left" ||
    !Number.isFinite(layout.ui.screenToSafeChildScale) || layout.ui.screenToSafeChildScale <= 0) {
    return integrityFailure(
      "pause.control.invalid-surface-layout",
      ["PAU-B02", "PAU-B05"],
      "Pause layout requires the exact initial-landscape StarUI/FitWidth/ScreenToSafeArea owner and never derives geometry from a screenshot.",
    );
  }
  const scale = layout.ui.screenToSafeChildScale;
  const width = layout.surface.viewportWidth;
  const height = layout.surface.viewportHeight;
  const safe = layout.starUi.safeArea;
  const safeRight = add(safe.x, safe.width);
  const safeTop = add(safe.y, safe.height);
  const centerBottomLeft = Object.freeze([
    add(safeRight, mul(PAUSE_LOCAL_X, scale)),
    add(safeTop, mul(PAUSE_LOCAL_Y, scale)),
  ] as const);
  const pauseWidth = mul(PAUSE_WIDTH, scale);
  const pauseHeight = mul(PAUSE_HEIGHT, scale);
  const centered = (localX: number, localY: number, widgetWidth: number, widgetHeight: number): PauseControlBounds => {
    const centerX = add(Math.fround(width / 2), mul(localX, scale));
    const centerTopY = sub(Math.fround(height / 2), mul(localY, scale));
    return bounds(sub(centerX, div(mul(widgetWidth, scale), 2)), sub(centerTopY, div(mul(widgetHeight, scale), 2)), mul(widgetWidth, scale), mul(widgetHeight, scale));
  };
  const pauseWindowWidth = mul(RETRYABLE_WINDOW_WIDTH, scale);
  const pauseWindowHeight = mul(RETRYABLE_WINDOW_HEIGHT, scale);
  const confirmWindowWidth = mul(CONFIRM_WINDOW_WIDTH, scale);
  const confirmWindowHeight = mul(CONFIRM_WINDOW_HEIGHT, scale);
  return ok(deepFreeze({
    surfaceRevision: layout.surface.revision,
    viewportWidth: width,
    viewportHeight: height,
    controlScale: scale,
    pause: {
      centerBottomLeft,
      visibleBoundsTopLeft: bounds(
        sub(centerBottomLeft[0], div(pauseWidth, 2)),
        sub(height, add(centerBottomLeft[1], div(pauseHeight, 2))),
        pauseWidth,
        pauseHeight,
      ),
      hitCircleRadiusPixels: mul(PAUSE_RADIUS_WORLD, layout.camera.pixelsPerWorldUnit),
    },
    pauseMenu: {
      windowBoundsTopLeft: bounds(sub(width / 2, pauseWindowWidth / 2), sub(height / 2, pauseWindowHeight / 2), pauseWindowWidth, pauseWindowHeight),
      abortBoundsTopLeft: centered(ABORT_BUTTON_X, RETRYABLE_BUTTON_Y, RETRYABLE_BUTTON_WIDTH, RETRYABLE_BUTTON_HEIGHT),
      retryBoundsTopLeft: centered(RETRY_BUTTON_X, RETRYABLE_BUTTON_Y, RETRYABLE_BUTTON_WIDTH, RETRYABLE_BUTTON_HEIGHT),
      resumeBoundsTopLeft: centered(RESUME_BUTTON_X, RETRYABLE_BUTTON_Y, RETRYABLE_BUTTON_WIDTH, RETRYABLE_BUTTON_HEIGHT),
    },
    confirmation: {
      windowBoundsTopLeft: bounds(sub(width / 2, confirmWindowWidth / 2), sub(height / 2, confirmWindowHeight / 2), confirmWindowWidth, confirmWindowHeight),
      cancelBoundsTopLeft: centered(CANCEL_BUTTON_X, CONFIRM_BUTTON_Y, RETRYABLE_BUTTON_WIDTH, RETRYABLE_BUTTON_HEIGHT),
      confirmBoundsTopLeft: centered(CONFIRM_BUTTON_X, CONFIRM_BUTTON_Y, RETRYABLE_BUTTON_WIDTH, RETRYABLE_BUTTON_HEIGHT),
    },
    rehearsal: createRehearsalControlSceneLayout(layout),
  }));
}

export function consumePauseControlCommand(
  command: PauseControlCommand,
  state: SimulatorTimelineControlState,
  surface: SimulatorSurfaceState,
): SimulatorResult<PauseControlCommandKind> {
  if (command === null || typeof command !== "object" ||
    !["pause", "resume", "retry", "abort"].includes(command.kind) ||
    command.capability === null || typeof command.capability !== "object") {
    return integrityFailure("pause.control.invalid-command", ["PAU-B01", "PAU-B04"], "Only opaque one-use Pause scene commands are accepted.");
  }
  const issued = issuedCommands.get(command.capability);
  const expectedPaused = command.kind !== "pause";
  if (issued === undefined || issued.consumed || issued.kind !== command.kind || issued.mode !== state.mode ||
    issued.surfaceRevision !== surface.revision || !state.playable || state.paused !== expectedPaused || state.moveTimeInProgress) {
    return integrityFailure(
      "pause.control.foreign-stale-or-state-mismatched-command",
      ["PAU-B01", "PAU-B04", "PAU-B05"],
      "Pause command identity, canonical mode, initial surface, playable state and paused transition must still match at consumption.",
    );
  }
  issued.consumed = true;
  return ok(command.kind);
}

function issue(kind: PauseControlCommandKind, mode: SimulatorTimelineControlState["mode"], surfaceRevision: number): PauseControlCommand {
  const capability = Object.freeze({});
  issuedCommands.set(capability, { kind, mode, surfaceRevision, consumed: false });
  return Object.freeze({ kind, capability });
}

function phaseName(phase: ManualInputTouch["phase"]): "began" | "moved" | "ended" {
  return phase === ManualTouchPhase.Began ? "began" : phase === ManualTouchPhase.Ended ? "ended" : "moved";
}

function validControlState(value: unknown): value is SimulatorTimelineControlState {
  if (value === null || typeof value !== "object") return false;
  const state = value as SimulatorTimelineControlState;
  return typeof state.playable === "boolean" && typeof state.paused === "boolean" && typeof state.moveTimeInProgress === "boolean" &&
    Number.isFinite(state.timelineSeconds) && state.timelineSeconds >= 0;
}
function validLayout(value: unknown): value is PauseControlLayout {
  if (value === null || typeof value !== "object") return false;
  const layout = value as PauseControlLayout;
  return Number.isSafeInteger(layout.surfaceRevision) && layout.surfaceRevision >= 0 &&
    Number.isSafeInteger(layout.viewportWidth) && layout.viewportWidth > 0 && Number.isSafeInteger(layout.viewportHeight) && layout.viewportHeight > 0 &&
    Number.isFinite(layout.pause?.hitCircleRadiusPixels) && layout.pause.hitCircleRadiusPixels > 0;
}
function validTouch(value: unknown): value is ManualInputTouch {
  if (value === null || typeof value !== "object") return false;
  const touch = value as ManualInputTouch;
  return Number.isSafeInteger(touch.fingerId) && touch.fingerId >= 0 && touch.fingerId <= 14 &&
    [ManualTouchPhase.Began, ManualTouchPhase.Moved, ManualTouchPhase.Stationary, ManualTouchPhase.Ended].includes(touch.phase) &&
    Number.isFinite(touch.position?.x) && Number.isFinite(touch.position?.y);
}
function insideCircle(point: Readonly<{ x: number; y: number }>, control: PauseControlLayout["pause"]): boolean {
  const dx = Math.fround(point.x - control.centerBottomLeft[0]);
  const dy = Math.fround(point.y - control.centerBottomLeft[1]);
  return Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy)) <= Math.fround(control.hitCircleRadiusPixels * control.hitCircleRadiusPixels);
}
function insideBounds(point: Readonly<{ x: number; y: number }>, value: PauseControlBounds): boolean {
  return point.x >= value.x && point.x <= value.x + value.width && point.y >= value.y && point.y <= value.y + value.height;
}
function bounds(x: number, y: number, width: number, height: number): PauseControlBounds {
  return Object.freeze({ x: Math.fround(x), y: Math.fround(y), width: Math.fround(width), height: Math.fround(height) });
}
function add(a: number, b: number): number { return Math.fround(Math.fround(a) + Math.fround(b)); }
function sub(a: number, b: number): number { return Math.fround(Math.fround(a) - Math.fround(b)); }
function mul(a: number, b: number): number { return Math.fround(Math.fround(a) * Math.fround(b)); }
function div(a: number, b: number): number { return Math.fround(Math.fround(a) / Math.fround(b)); }
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
