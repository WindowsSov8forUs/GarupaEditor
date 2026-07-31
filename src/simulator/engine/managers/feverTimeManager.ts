import type { FeverDifficulty } from "../data/scoreLifeState";
import type { NoteResultTypeValue } from "../data/manualJudgement";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export const FeverTimeState = {
  None: 0,
  FeverLevel1: 1,
  FeverTimeFailed: 2,
} as const;

export const FeverTimeCommand = {
  None: 0,
  FeverReady: 1,
  FeverStart: 2,
  FeverEnd: 3,
} as const;

export type FeverTimeCommandName = "ready" | "start" | "end";

export interface FeverTimeSnapshot {
  readonly state: 0 | 1 | 2;
  readonly command: 0 | 1 | 2 | 3;
  readonly myPoint: number;
  readonly ownTeamPassCount: number;
  readonly ownTeamMemberCount: number;
  readonly reservationFrame: number;
  readonly reservationCommand: 0 | 1 | 2 | 3;
  readonly reservationAfterState: 0 | 1 | 2;
  readonly trace: readonly string[];
}

const DIFFICULTY_POINTS = Object.freeze({
  easy: 20,
  normal: 12,
  hard: 6,
  expert: 4,
  special: 4,
});

export class FeverTimeManager {
  private stateValue: 0 | 1 | 2 = FeverTimeState.None;
  private commandValue: 0 | 1 | 2 | 3 = FeverTimeCommand.None;
  private myPointValue = 0;
  private ownTeamPassCountValue = 0;
  private reservationFrameValue = 0;
  private reservationCommandValue: 0 | 1 | 2 | 3 = FeverTimeCommand.None;
  private reservationAfterStateValue: 0 | 1 | 2 = FeverTimeState.None;
  private readonly passedDisplayIndices = new Set<number>();
  private readonly traceValue: string[] = [];

  constructor(
    private readonly difficulty: FeverDifficulty,
    private readonly ownTeamMemberCount: number,
    private readonly enabled: boolean,
  ) {}

  judge(
    result: Exclude<NoteResultTypeValue, -1>,
  ): void {
    if (!this.enabled || this.stateValue !== FeverTimeState.None || result < 3) return;
    const point = DIFFICULTY_POINTS[this.difficulty];
    this.myPointValue = addInt32(this.myPointValue, point);
    this.traceValue.push(`point:${point}`);
    if (this.myPointValue >= 80 && !this.passedDisplayIndices.has(0)) {
      this.passedDisplayIndices.add(0);
      this.ownTeamPassCountValue = addInt32(this.ownTeamPassCountValue, 1);
      this.traceValue.push("pass:local");
    }
  }

  updateMemberPoint(
    displayIndex: number,
    point: number,
    isOwnTeam: boolean,
  ): SimulatorResult<void> {
    if (!this.enabled || !Number.isInteger(displayIndex) || displayIndex < 0 ||
      !Number.isInteger(point) || point < 0) {
      return evidenceRequired(
        "score-life.invalid-fever-member-adapter",
        ["SLS-D15", "SLS-D16", "SLS-D24"],
        "The Fever network adapter accepts only anonymous non-negative display indices and points in an enabled Team Live profile.",
      );
    }
    if (isOwnTeam && point >= 80 && !this.passedDisplayIndices.has(displayIndex)) {
      this.passedDisplayIndices.add(displayIndex);
      this.ownTeamPassCountValue = addInt32(this.ownTeamPassCountValue, 1);
      this.traceValue.push(`pass:${displayIndex}`);
    }
    return ok(undefined);
  }

  changeCommand(
    command: FeverTimeCommandName,
    gameFrameCounter: number,
  ): SimulatorResult<void> {
    if (!this.enabled) {
      return evidenceRequired(
        "score-life.fever-disabled-mode",
        ["SLS-D16"],
        "Fever commands require an explicit Team Live Festival profile.",
      );
    }
    const before = this.stateValue;
    if (command === "ready") {
      this.commandValue = FeverTimeCommand.FeverReady;
    } else if (command === "start") {
      this.commandValue = FeverTimeCommand.FeverStart;
      this.stateValue = this.ownTeamPassCountValue >= this.ownTeamMemberCount
        ? FeverTimeState.FeverLevel1
        : FeverTimeState.FeverTimeFailed;
      this.resetProgress();
    } else if (command === "end") {
      this.commandValue = FeverTimeCommand.FeverEnd;
      this.resetProgress();
      this.stateValue = FeverTimeState.None;
    } else {
      return evidenceRequired(
        "score-life.invalid-fever-command",
        ["SLS-D16"],
        "Only Ready, Start and End are part of the closed Fever command surface.",
      );
    }
    this.traceValue.push(`command:${command}:${before}->${this.stateValue}`);
    this.reservationFrameValue = addInt32(gameFrameCounter, 1);
    this.reservationCommandValue = this.commandValue;
    this.reservationAfterStateValue = this.stateValue;
    return ok(undefined);
  }

  get scoreRate(): number {
    return this.stateValue === FeverTimeState.FeverLevel1
      ? Math.fround(2)
      : Math.fround(1);
  }

  get state(): 0 | 1 | 2 { return this.stateValue; }

  snapshot(): FeverTimeSnapshot {
    return {
      state: this.stateValue,
      command: this.commandValue,
      myPoint: this.myPointValue,
      ownTeamPassCount: this.ownTeamPassCountValue,
      ownTeamMemberCount: this.ownTeamMemberCount,
      reservationFrame: this.reservationFrameValue,
      reservationCommand: this.reservationCommandValue,
      reservationAfterState: this.reservationAfterStateValue,
      trace: [...this.traceValue],
    };
  }

  private resetProgress(): void {
    this.myPointValue = 0;
    this.ownTeamPassCountValue = 0;
    this.passedDisplayIndices.clear();
  }
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
