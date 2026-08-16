import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import { GameState, type GameStateValue } from "../data/inGameState";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import {
  freezeStartupDirectionSceneState,
  INITIAL_STARTUP_DIRECTION_SCENE_STATE,
  type StartupDirectionSceneBackend,
  type StartupDirectionSceneState,
} from "../../scene/startupDirectionScene";

const FIRST_VIEW_FADE = Math.fround(0.1);
const INFORMATION_HOLD = Math.fround(0.9);
const INFORMATION_FADE = Math.fround(1.0);
const HUD_FADE = Math.fround(0.5);
const BACKGROUND_PRE_DELAY = Math.fround(0.5);
const STAGE_WAIT = Math.fround(1.5);
const STAGE_TRANSFORM = Math.fround(0.75);
const CHARACTER_DELAY = Math.fround(0.25);
const CHARACTER_FADE = Math.fround(1.25);
const LINE_DELAY = Math.fround(2.5);
const LINE_FADE = Math.fround(1.0);
const MUSIC_WAIT = Math.fround(1.0);

export type StartupDirectionPhase =
  | "first-view"
  | "information-hold"
  | "information-fade"
  | "op-first-end"
  | "opening-last"
  | "music-wait"
  | "playing-none"
  | "playing-sound";

export interface StartupDirectionSnapshot {
  readonly phase: StartupDirectionPhase;
  readonly phaseElapsed: number;
  readonly openingElapsed: number;
  readonly currentGameState: GameStateValue;
  readonly playable: boolean;
  readonly musicStartRequested: boolean;
  readonly scene: StartupDirectionSceneState;
}

export class StartupDirectionController {
  private phaseValue: StartupDirectionPhase = "first-view";
  private phaseElapsedValue = Math.fround(0);
  private openingElapsedValue = Math.fround(0);
  private stateValue: GameStateValue = GameState.Prepare;
  private sequence = 0;
  private sceneValue = INITIAL_STARTUP_DIRECTION_SCENE_STATE;
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly mode: SimulatorModeIdentity,
    private readonly scene: StartupDirectionSceneBackend | null,
  ) {}

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("startup-direction.initialize-after-dispose", "A disposed startup owner cannot be reconstructed.");
    if (this.initialized) return ok(undefined);
    this.initialized = true;
    this.publish({
      informationPhase: "revealing",
      informationAlpha: Math.fround(0),
    });
    return ok(undefined);
  }

  step(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.initialized || this.disposed || !Number.isFinite(deltaTimeSeconds) ||
      deltaTimeSeconds < 0 || !Object.is(deltaTimeSeconds, Math.fround(deltaTimeSeconds))) {
      return rejected("startup-direction.invalid-step", "Startup direction accepts only initialized exact non-negative Float32 engine delta.");
    }
    this.advanceParallelOwners(deltaTimeSeconds);
    switch (this.phaseValue) {
      case "first-view": {
        const sample = advance(this.phaseElapsedValue, FIRST_VIEW_FADE, deltaTimeSeconds);
        this.phaseElapsedValue = sample.elapsed;
        this.publish({ informationPhase: "revealing", informationAlpha: sample.ratio });
        if (sample.done) this.enter("information-hold", GameState.OPFirstAnimStart);
        break;
      }
      case "information-hold": {
        const sample = advance(this.phaseElapsedValue, INFORMATION_HOLD, deltaTimeSeconds);
        this.phaseElapsedValue = sample.elapsed;
        this.publish({ informationPhase: "holding", informationAlpha: Math.fround(1) });
        if (sample.done) this.enter("information-fade", GameState.OPFirstAnimStart);
        break;
      }
      case "information-fade": {
        const sample = advance(this.phaseElapsedValue, INFORMATION_FADE, deltaTimeSeconds);
        this.phaseElapsedValue = sample.elapsed;
        this.publish({ informationPhase: "fading", informationAlpha: Math.fround(1 - sample.ratio) });
        if (sample.done) this.enter("op-first-end", GameState.OPFirstAnimEnd);
        break;
      }
      case "op-first-end":
        this.publish({ informationPhase: "complete", informationAlpha: Math.fround(0) });
        this.enter("opening-last", GameState.OPLastAnimStart);
        break;
      case "opening-last": {
        const duration = Math.fround(BACKGROUND_PRE_DELAY + STAGE_WAIT);
        const sample = advance(this.phaseElapsedValue, duration, deltaTimeSeconds);
        this.phaseElapsedValue = sample.elapsed;
        if (sample.done) this.enter("music-wait", GameState.OPLastAnimStart);
        break;
      }
      case "music-wait": {
        const sample = advance(this.phaseElapsedValue, MUSIC_WAIT, deltaTimeSeconds);
        this.phaseElapsedValue = sample.elapsed;
        if (sample.done) this.enter("playing-none", GameState.PlayingNone);
        break;
      }
      case "playing-none":
        this.enter("playing-sound", GameState.PlayingSound);
        this.publish({ gameplayVisible: true, rehearsalControlsVisible: this.mode.sessionMode === "rehearsal" });
        break;
      case "playing-sound":
        break;
    }
    return ok(undefined);
  }

  snapshot(): StartupDirectionSnapshot {
    return Object.freeze({
      phase: this.phaseValue,
      phaseElapsed: this.phaseElapsedValue,
      openingElapsed: this.openingElapsedValue,
      currentGameState: this.stateValue,
      playable: this.stateValue === GameState.PlayingSound,
      musicStartRequested: this.phaseValue === "music-wait" || this.stateValue >= GameState.PlayingNone,
      scene: this.sceneValue,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene?.dispose();
  }

  private advanceParallelOwners(delta: number): void {
    if (this.phaseValue !== "opening-last" && this.phaseValue !== "music-wait" &&
      this.phaseValue !== "playing-none" && this.phaseValue !== "playing-sound") return;
    this.openingElapsedValue = Math.fround(this.openingElapsedValue + delta);
    const elapsed = this.openingElapsedValue;
    const hud = unit(elapsed, HUD_FADE);
    const stageElapsed = Math.fround(elapsed - BACKGROUND_PRE_DELAY);
    const stage = stageElapsed <= 0 ? Math.fround(0) : unit(stageElapsed, STAGE_TRANSFORM);
    const characterElapsed = Math.fround(stageElapsed - CHARACTER_DELAY);
    const character = characterElapsed <= 0 ? Math.fround(0) : unit(characterElapsed, CHARACTER_FADE);
    const lineElapsed = Math.fround(elapsed - LINE_DELAY);
    const line = lineElapsed <= 0 ? Math.fround(0) : unit(lineElapsed, LINE_FADE);
    this.publish({
      hudAlpha: hud,
      darkCoverAlpha: Math.fround(1 - stage),
      stagePhase: stageElapsed <= 0 ? "waiting" : stage < 1 ? "introducing" : "idle",
      stageProgress: stage,
      characterAlpha: character,
      linePhase: lineElapsed <= 0 ? "waiting" : line < 1 ? "fading" : "visible",
      lineAlpha: line,
    });
  }

  private enter(phase: StartupDirectionPhase, state: GameStateValue): void {
    this.phaseValue = phase;
    this.phaseElapsedValue = Math.fround(0);
    this.stateValue = state;
  }

  private publish(change: Partial<StartupDirectionSceneState>): void {
    this.sequence += 1;
    this.sceneValue = freezeStartupDirectionSceneState({
      ...this.sceneValue,
      ...change,
      sequence: this.sequence,
    });
    this.scene?.publish(this.sceneValue);
  }
}

function advance(elapsed: number, duration: number, delta: number): Readonly<{ elapsed: number; ratio: number; done: boolean }> {
  if (elapsed >= duration) return Object.freeze({ elapsed: duration, ratio: Math.fround(1), done: true });
  const next = Math.fround(elapsed + delta);
  return Object.freeze({ elapsed: next, ratio: Math.fround(Math.min(1, next / duration)), done: false });
}
function unit(elapsed: number, duration: number): number { return Math.fround(Math.min(1, elapsed / duration)); }
function rejected(capability: string, boundary: string) {
  return evidenceRequired(capability, ["SD03", "SD05", "SD06", "SD07", "SD08", "SD09", "SD11", "SD12"], boundary);
}
