import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export type SimulatorSessionMode = "live" | "rehearsal";
export type SimulatorInputMode = "manual" | "auto";
export type SimulatorInGameMode = "single-normal" | "practice";

export interface SimulatorModeSelection {
  readonly sessionMode: SimulatorSessionMode;
  readonly inputMode: SimulatorInputMode;
}

export interface SimulatorModeIdentity extends SimulatorModeSelection {
  readonly inGameMode: SimulatorInGameMode;
  readonly isEnablePractice: boolean;
  readonly isDemoPlayMode: boolean;
  readonly isAutoLive: boolean;
  readonly isAutoPlay: boolean;
}

export type InGameCalculatedDataSnapshot = SimulatorModeIdentity;

export function createSimulatorModeIdentity(
  sessionMode: SimulatorSessionMode,
  inputMode: SimulatorInputMode,
): SimulatorModeIdentity {
  const rehearsal = sessionMode === "rehearsal";
  const auto = inputMode === "auto";
  return Object.freeze({
    sessionMode,
    inputMode,
    inGameMode: rehearsal ? "practice" as const : "single-normal" as const,
    isEnablePractice: rehearsal,
    isDemoPlayMode: rehearsal && auto,
    isAutoLive: !rehearsal && auto,
    isAutoPlay: auto,
  });
}

export function validateSimulatorModeIdentity(
  value: unknown,
): SimulatorResult<SimulatorModeIdentity> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidMode();
  }
  const mode = value as Record<string, unknown>;
  if (
    Object.keys(mode).sort().join(",") !==
      "inGameMode,inputMode,isAutoLive,isAutoPlay,isDemoPlayMode,isEnablePractice,sessionMode" ||
    (mode.sessionMode !== "live" && mode.sessionMode !== "rehearsal") ||
    (mode.inputMode !== "manual" && mode.inputMode !== "auto")
  ) {
    return invalidMode();
  }
  const expected = createSimulatorModeIdentity(mode.sessionMode, mode.inputMode);
  for (const key of Object.keys(expected) as (keyof SimulatorModeIdentity)[]) {
    if (mode[key] !== expected[key]) return invalidMode();
  }
  return ok(expected);
}

export class InGameCalculatedData {
  private readonly modeValue: SimulatorModeIdentity;

  constructor(mode: SimulatorModeIdentity) {
    this.modeValue = mode;
  }

  get isAutoPlay(): boolean { return this.modeValue.isAutoPlay; }
  get mode(): SimulatorModeIdentity { return this.modeValue; }

  snapshot(): InGameCalculatedDataSnapshot {
    return Object.freeze({ ...this.modeValue });
  }
}

function invalidMode(): ReturnType<typeof evidenceRequired> {
  return evidenceRequired(
    "runtime.invalid-mode-identity",
    ["LR-E01", "LR-E02", "LR-R01", "LR-R02"],
    "Runtime mode identity must be the exact immutable derivation of independent Live/Rehearsal and Manual/Auto axes; no axis may infer or overwrite the other.",
  );
}
