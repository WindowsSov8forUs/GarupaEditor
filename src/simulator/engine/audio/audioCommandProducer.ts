import type {
  AudioCommand,
  AudioCommandBatch,
  AudioOperationResult,
  SimulatorAudioBackend,
} from "../../backends/audioContracts";
import {
  audioFloat32FromBits,
  audioFloat32ToBits,
} from "../../backends/audioValidation";
import type { ChartConstructionResult, NoteInformation } from "../chart/types";
import type { OneFrameJudgementBatch, OneFrameJudgementEntry } from "../data/oneFrameData";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export interface SimulatorAudioSessionInput {
  readonly sessionId: string;
  readonly bgmCue: "bgm003";
  readonly seekMilliseconds: number;
  readonly masterGainBits: string;
  readonly bgmGainBits: string;
  readonly seGainBits: string;
  readonly voiceGainBits: string;
  readonly practiceMode: boolean;
}

interface TapStatusSnapshot {
  readonly beforeJudgeNoteType: number;
  readonly beforeMultipleDirectionalFlickNoteCount: number;
  readonly absolutePosition: number;
  readonly adjustedResult: 0 | 1 | 2 | 3 | 4;
  readonly frameCounter: number;
}

export class AudioOwnerTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    private readonly backend: SimulatorAudioBackend,
    private readonly batch: AudioCommandBatch | null,
    private readonly onCommit: () => void = () => {},
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "audio.transaction.repeated-commit",
        `Audio transaction cannot commit from ${this.state}.`,
      );
    }
    const committed = this.batch === null
      ? ok(undefined)
      : mapAudioResult(this.backend.commit(this.batch));
    if (committed.status === "ok") {
      this.state = "committed";
      this.onCommit();
    }
    return committed;
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "audio.transaction.repeated-discard",
        `Audio transaction cannot discard from ${this.state}.`,
      );
    }
    const discarded = this.batch === null
      ? ok(undefined)
      : mapAudioResult(this.backend.discard(this.batch));
    if (discarded.status === "ok") this.state = "discarded";
    return discarded;
  }
}

export class AudioCommandProducer {
  private readonly notesByIndex = new Map<number, NoteInformation>();
  private tapStatus: TapStatusSnapshot = Object.freeze({
    beforeJudgeNoteType: 0,
    beforeMultipleDirectionalFlickNoteCount: 0,
    absolutePosition: 0,
    adjustedResult: 0,
    frameCounter: 0,
  });
  private naturallyEnded = false;
  private gameOverTriggered = false;
  private completionTriggered = false;

  constructor(
    readonly input: SimulatorAudioSessionInput,
    private readonly backend: SimulatorAudioBackend,
    chart: ChartConstructionResult,
  ) {
    for (const batch of chart.noteBatches) {
      for (const note of batch.informationList) this.registerNote(note);
    }
  }

  validate(): SimulatorResult<void> {
    if (
      this.input === null || typeof this.input !== "object" ||
      Object.keys(this.input).sort().join(",") !==
        "bgmCue,bgmGainBits,masterGainBits,practiceMode,seGainBits,seekMilliseconds,sessionId,voiceGainBits" ||
      typeof this.input.sessionId !== "string" || this.input.sessionId.length === 0 ||
      this.input.bgmCue !== "bgm003" ||
      !Number.isSafeInteger(this.input.seekMilliseconds) || this.input.seekMilliseconds < 0 ||
      typeof this.input.practiceMode !== "boolean" ||
      !isUnitGain(this.input.masterGainBits) || !isUnitGain(this.input.bgmGainBits) ||
      !isUnitGain(this.input.seGainBits) || !isUnitGain(this.input.voiceGainBits)
    ) {
      return rejected(
        "audio.session.invalid-input",
        "Audio session identity, exact BGM, millisecond seek, four binary32 gains and practice mode must be explicit.",
      );
    }
    const snapshot = this.backend.snapshot();
    if (snapshot.state !== "ready" || snapshot.sessionId !== this.input.sessionId) {
      return rejected(
        "audio.session.backend-not-prepared",
        "The host must prepare the selected audio backend for the exact session before engine creation.",
      );
    }
    return ok(undefined);
  }

  beginOuterFrame(): void {
    if (this.tapStatus.frameCounter <= 0) return;
    this.tapStatus = Object.freeze({
      ...this.tapStatus,
      frameCounter: this.tapStatus.frameCounter - 1,
    });
  }

  preflightInitialize(): SimulatorResult<AudioOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const gain = this.gainCommand();
    if (gain.status !== "ok") return gain;
    return this.preflightCommands([
      {
        kind: "session.open",
        bgm_pool: 8,
        se_pool: 12,
        one_shot_pool: 1,
      },
      gain.value,
      {
        kind: "bgm.load",
        cue: "bgm003",
        seek_ms: this.input.seekMilliseconds,
        priority: 255,
        fade_bits: "0x00000000",
      },
      { kind: "audio.pause-all", paused: true },
      { kind: "audio.pause-all", paused: false },
    ]);
  }

  preflightPause(): SimulatorResult<AudioOwnerTransaction> {
    const commands: AudioCommand[] = [
      { kind: "bgm.pause" },
      { kind: "se.pause" },
      ...this.backend.snapshot().semantic.holds.map((hold) => ({
        kind: "hold.pause" as const,
        owner_key: hold.ownerKey,
      })),
    ];
    return this.preflightCommands(commands);
  }

  preflightResume(): SimulatorResult<AudioOwnerTransaction> {
    const commands: AudioCommand[] = [
      { kind: "bgm.resume" },
      { kind: "se.resume" },
      ...this.backend.snapshot().semantic.holds.map((hold) => ({
        kind: "hold.resume" as const,
        owner_key: hold.ownerKey,
      })),
    ];
    return this.preflightCommands(commands);
  }

  preflightJudgement(
    batch: OneFrameJudgementBatch,
    gameOverAfterReflect = false,
  ): SimulatorResult<AudioOwnerTransaction> {
    const nextTap = { ...this.tapStatus };
    const activeHolds = new Set(
      this.backend.snapshot().semantic.holds.map((hold) => hold.ownerKey),
    );
    const commands: AudioCommand[] = [];
    for (const entry of batch.entries) {
      const note = this.notesByIndex.get(entry.noteIndex);
      if (note === undefined) {
        return rejected(
          "audio.judgement.missing-note-owner",
          "Judgement audio requires the parent chart's stable note identity.",
        );
      }
      const holdOwner = holdOwnerKey(note);
      if (holdOwner !== null && entry.phase !== "head" && activeHolds.has(holdOwner)) {
        commands.push(fadeHold(holdOwner));
        activeHolds.delete(holdOwner);
      }
      if (holdOwner !== null && entry.phase === "head" && entry.adjustedResult > 0) {
        if (activeHolds.has(holdOwner)) {
          return rejected(
            "audio.hold.duplicate-owner",
            "A Long/Slide note cannot acquire a second loop for its stable owner.",
          );
        }
        commands.push({
          kind: "hold.start-loop",
          cue: "SE_RHYTHM_TAP_LONG",
          owner_key: holdOwner,
          volume_bits: "0x3F800000",
          fade_in_bits: "0x00000000",
        });
        activeHolds.add(holdOwner);
      }
      if (!shouldSilent(nextTap, entry)) {
        const cue = judgementCue(entry);
        if (cue.status !== "ok") return cue;
        if (cue.value !== null) commands.push(oneShot(cue.value, "one-shot-0"));
      }
      updateTapStatus(nextTap, entry);
    }
    if (gameOverAfterReflect) {
      if (this.gameOverTriggered) {
        return rejected(
          "audio.game-over.duplicate",
          "The life-zero Game Over audio coroutine starts once.",
        );
      }
      commands.push(
        {
          kind: "audio.pause-all",
          paused: true,
          delay_seconds_bits: "0x3D4CCCCD",
        },
        {
          kind: "audio.pause-all",
          paused: true,
          delay_seconds_bits: "0x3DCCCCCD",
        },
      );
    }
    return this.preflightCommands(
      commands,
      () => {
        this.tapStatus = Object.freeze({ ...nextTap });
        if (gameOverAfterReflect) this.gameOverTriggered = true;
      },
    );
  }

  preflightSkillTriggered(): SimulatorResult<AudioOwnerTransaction> {
    const commands: AudioCommand[] = [
      oneShot("SE_RHYTHM_CUTIN_SKILL", "skill"),
    ];
    if (!this.input.practiceMode) {
      commands.push(oneShot("SE_RHYTHM_CUTIN_AUDIENCE", "audience"));
    }
    return this.preflightCommands(commands);
  }

  preflightGameOver(): SimulatorResult<AudioOwnerTransaction> {
    if (this.gameOverTriggered) {
      return rejected(
        "audio.game-over.duplicate",
        "The life-zero Game Over audio coroutine starts once.",
      );
    }
    return this.preflightCommands([
      {
        kind: "audio.pause-all",
        paused: true,
        delay_seconds_bits: "0x3D4CCCCD",
      },
      {
        kind: "audio.pause-all",
        paused: true,
        delay_seconds_bits: "0x3DCCCCCD",
      },
    ], () => { this.gameOverTriggered = true; });
  }

  preflightCompleteLive(
    clearStatus: 1 | 2 | 3,
  ): SimulatorResult<AudioOwnerTransaction> {
    if (this.completionTriggered) {
      return rejected(
        "audio.complete.duplicate",
        "Full Combo/Game Clear audio is evaluated once after natural BGM end.",
      );
    }
    const commands: AudioCommand[] = [];
    if (clearStatus === 2 || clearStatus === 3) {
      commands.push(oneShot("SE_RHYTHM_FULLCOMBO", "full-combo"));
    }
    commands.push(oneShot("SE_RHYTHM_CLEAR", "game-clear"));
    if (!this.input.practiceMode) {
      commands.push(oneShot("SE_RHYTHM_CLEAR_VO", "game-clear-voice"));
    }
    return this.preflightCommands(commands, () => {
      this.naturallyEnded = true;
      this.completionTriggered = true;
    });
  }

  preflightNaturalEnd(): SimulatorResult<AudioOwnerTransaction> {
    if (this.naturallyEnded) {
      return rejected(
        "audio.bgm.duplicate-natural-end",
        "Natural BGM completion transitions once and emits no explicit stop command.",
      );
    }
    return ok(new AudioOwnerTransaction(
      this.backend,
      null,
      () => { this.naturallyEnded = true; },
    ));
  }

  private preflightCommands(
    commands: readonly AudioCommand[],
    onCommit: () => void = () => {},
  ): SimulatorResult<AudioOwnerTransaction> {
    if (commands.length === 0) {
      return ok(new AudioOwnerTransaction(this.backend, null, onCommit));
    }
    const batch = mapAudioResult(this.backend.preflight(commands));
    return batch.status === "ok"
      ? ok(new AudioOwnerTransaction(this.backend, batch.value, onCommit))
      : batch;
  }

  private gainCommand(): SimulatorResult<Extract<AudioCommand, { kind: "gain.set" }>> {
    const master = audioFloat32FromBits(this.input.masterGainBits)!;
    const bgm = multiplyGain(master, this.input.bgmGainBits);
    const se = multiplyGain(master, this.input.seGainBits);
    const voice = multiplyGain(master, this.input.voiceGainBits);
    if (bgm === null || se === null || voice === null) {
      return rejected(
        "audio.gain.invalid-binary32-product",
        "Option gains must produce finite binary32 values without browser clamping.",
      );
    }
    return ok({
      kind: "gain.set",
      bgm_bits: bgm,
      se_bits: se,
      voice_bits: voice,
    });
  }

  private registerNote(note: NoteInformation): void {
    if (!this.notesByIndex.has(note.index)) this.notesByIndex.set(note.index, note);
    for (const child of note.slideNoteList) this.registerNote(child);
  }
}

export function mapAudioResult<T>(result: AudioOperationResult<T>): SimulatorResult<T> {
  return result.status === "accepted"
    ? ok(result.value)
    : evidenceRequired(
        `audio.${result.status}.${result.failure.capability}`,
        [],
        result.failure.boundary,
      );
}

function judgementCue(entry: OneFrameJudgementEntry): SimulatorResult<string | null> {
  if (entry.adjustedResult < 2) return ok(null);
  const flickMask = 0x6e8;
  if (((1 << entry.noteType) & flickMask) !== 0) {
    if (entry.noteType === 6 || entry.noteType === 9) return ok("directional_fl");
    if (entry.noteType === 7 || entry.noteType === 10) {
      const count = entry.multipleDirectionalFlickNoteCount;
      if (count === 1) return ok("directional_fl");
      if (count === 2) return ok("directional_fl_2");
      if (count >= 3 && count <= 7) return ok("directional_fl_3");
      return rejected(
        "audio.judgement.invalid-multiple-directional-count",
        "Multiple Directional cue selection is confirmed only for count 1 through 7.",
      );
    }
    return ok("flick");
  }
  if (entry.adjustedResult === 2) return ok("good");
  if (entry.adjustedResult === 3) return ok("great");
  return entry.adjustedResult === 4 ? ok("perfect") : ok(null);
}

function shouldSilent(status: TapStatusSnapshot, entry: OneFrameJudgementEntry): boolean {
  if (entry.adjustedResult === 0 || status.frameCounter < 1 ||
      status.absolutePosition !== entry.absolutePosition) return false;
  const before = status.beforeJudgeNoteType;
  if (before >= 0 && before <= 10) {
    const bit = 1 << before;
    if ((bit & 0x28) !== 0) return entry.noteType === 3 || entry.noteType === 5;
    if ((bit & 0x240) !== 0) return entry.noteType === 6 || entry.noteType === 9;
    if ((bit & 0x480) !== 0) {
      return (entry.noteType === 7 || entry.noteType === 10) &&
        status.beforeMultipleDirectionalFlickNoteCount ===
          entry.multipleDirectionalFlickNoteCount;
    }
  }
  if (status.adjustedResult !== entry.adjustedResult) return false;
  const offset = entry.noteType - 3;
  if (offset < 0 || offset >= 8) return true;
  return ((0x22 >>> offset) & 1) === 1;
}

function updateTapStatus(status: {
  beforeJudgeNoteType: number;
  beforeMultipleDirectionalFlickNoteCount: number;
  absolutePosition: number;
  adjustedResult: 0 | 1 | 2 | 3 | 4;
  frameCounter: number;
}, entry: OneFrameJudgementEntry): void {
  status.beforeJudgeNoteType = entry.noteType;
  status.beforeMultipleDirectionalFlickNoteCount =
    entry.multipleDirectionalFlickNoteCount;
  status.absolutePosition = entry.absolutePosition;
  status.adjustedResult = entry.adjustedResult;
  status.frameCounter = 3;
}

function holdOwnerKey(note: NoteInformation): string | null {
  if (note.fireNoteType === 1) return `long:${note.index}`;
  if (note.fireNoteType === 3 || note.fireNoteType === 4) return `slide:${note.index}`;
  return null;
}

function fadeHold(ownerKey: string): AudioCommand {
  return {
    kind: "hold.fade",
    owner_key: ownerKey,
    target_bits: "0x00000000",
    duration_bits: "0x3E99999A",
    stop_at_zero: true,
  };
}

function oneShot(cue: string, voiceKey: string): AudioCommand {
  return {
    kind: "se.play-one-shot",
    cue,
    voice_key: voiceKey,
    volume_bits: "0x3F800000",
    pitch_bits: "0x00000000",
    pan_distance_bits: "0x00000000",
    pan_angle_bits: "0x00000000",
  };
}

function multiplyGain(master: number, sourceBits: string): string | null {
  const source = audioFloat32FromBits(sourceBits);
  return source === null
    ? null
    : audioFloat32ToBits(Math.fround(master * source));
}

function isUnitGain(bits: string): boolean {
  const value = audioFloat32FromBits(bits);
  return value !== null && value >= 0 && value <= 1;
}

function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return evidenceRequired(capability, [], boundary);
}
