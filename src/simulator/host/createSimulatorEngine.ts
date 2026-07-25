import type { SimulatorBackends } from "../backends/contracts";
import type { NoteBatchInformationList } from "../engine/data/noteData";
import type {
  FirstSliceEvidenceGap,
  SimulatorEngine,
  SimulatorEngineInput,
  SimulatorSnapshot,
} from "./contracts";
import {
  evidenceRequired,
  readEvidenceBound,
  ok,
  type SimulatorResult,
} from "../engine/evidence";
import { InGameManager } from "../engine/managers/inGameManager";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { InputManager } from "../engine/managers/inputBoundaries";
import { NoteManager } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";

const firstSliceEvidenceGaps: readonly FirstSliceEvidenceGap[] = [
  "G04",
  "G05",
];

class SimulatorEngineHost implements SimulatorEngine {
  constructor(
    private readonly inGameManager: InGameManager,
    readonly backends: SimulatorBackends,
  ) {}

  initialize(): SimulatorResult<void> {
    return this.inGameManager.initialize();
  }

  step(deltaTimeSeconds: number): SimulatorResult<void> {
    return this.inGameManager.step(deltaTimeSeconds);
  }

  pause(): SimulatorResult<void> {
    if (this.inGameManager.snapshot().paused) {
      return ok(undefined);
    }
    const pauseResult = this.inGameManager.pause();
    if (pauseResult.status !== "ok") {
      return pauseResult;
    }
    this.backends.lifecycle.recordState("paused");
    return ok(undefined);
  }

  resume(): SimulatorResult<void> {
    if (!this.inGameManager.snapshot().paused) {
      return ok(undefined);
    }
    const resumeResult = this.inGameManager.resume();
    if (resumeResult.status !== "ok") {
      return resumeResult;
    }
    this.backends.lifecycle.recordState("running");
    return ok(undefined);
  }

  snapshot(): SimulatorResult<SimulatorSnapshot> {
    return ok({
      managers: this.inGameManager.snapshot(),
      backendTrace: this.backends.snapshot(),
      evidenceGaps: [...firstSliceEvidenceGaps],
    });
  }

  dispose(): SimulatorResult<void> {
    return this.inGameManager.dispose();
  }
}

export function createSimulatorEngine(
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
): SimulatorResult<SimulatorEngine> {
  const bpm = readEvidenceBound(
    input.clock.currentBpm,
    "clock.current-bpm",
    ["E03"],
    "Current BPM must be tied to the frozen music-score evidence.",
  );
  if (bpm.status !== "ok") {
    return bpm;
  }
  const nextBpm = readEvidenceBound(
    input.clock.nextBpm,
    "clock.next-bpm",
    ["E14"],
    "Launcher BPM must be tied to the frozen G01 clock evidence.",
  );
  if (nextBpm.status !== "ok") {
    return nextBpm;
  }
  const initialPosition = readEvidenceBound(
    input.clock.initialMusicPosition,
    "clock.initial-music-position",
    ["E03", "E10"],
    "Initial music position must be tied to the frozen clock and preconstructed-score evidence.",
  );
  if (initialPosition.status !== "ok") {
    return initialPosition;
  }
  const initialLauncherPosition = readEvidenceBound(
    input.clock.initialLauncherMusicPosition,
    "clock.initial-launcher-music-position",
    ["E14"],
    "Initial launcher position must be tied to the frozen G01 activation-window evidence.",
  );
  if (initialLauncherPosition.status !== "ok") {
    return initialLauncherPosition;
  }
  if (
    !isValidBpm(bpm.value) ||
    !isValidBpm(nextBpm.value) ||
    !isValidMusicPosition(initialPosition.value) ||
    !isValidMusicPosition(initialLauncherPosition.value)
  ) {
    return evidenceRequired(
      "clock.invalid-profile",
      ["E03", "E14"],
      "The recovered Float32 clock requires positive finite BPM values, Int32 bar counters, and finite beat progress.",
    );
  }
  const bpmChangeCount = readEvidenceBound(
    input.noteManager.bpmChangeCount,
    "note-manager.bpm-change-count",
    ["E14"],
    "The adaptive scheduler gate must use the parsed BMS BPM-change count.",
  );
  if (bpmChangeCount.status !== "ok") {
    return bpmChangeCount;
  }
  if (
    !Number.isInteger(bpmChangeCount.value) ||
    bpmChangeCount.value < 0 ||
    bpmChangeCount.value > 0x7fffffff
  ) {
    return evidenceRequired(
      "note-manager.invalid-bpm-change-count",
      ["E14"],
      "The recovered NoteManager field is a non-negative Int32 parsed BPM-change count.",
    );
  }
  const noteBatchValidation = validateNoteBatches(input.noteBatches);
  if (noteBatchValidation.status !== "ok") {
    return noteBatchValidation;
  }
  const oneFrameCapacity = readEvidenceBound(
    input.oneFrameData.capacity,
    "one-frame.pool-capacity",
    ["E02", "E08"],
    "OneFrameData pool capacity must be tied to the frozen controller and aggregation evidence.",
  );
  if (oneFrameCapacity.status !== "ok") {
    return oneFrameCapacity;
  }

  const slideNoteManager = new SlideNoteManager();
  const musicScoreController = new InGameMusicScoreController(input.clock);
  const oneFrameJudgementController = new InGameOneFrameJudgementController(
    input.oneFrameData,
  );
  const noteManager = new NoteManager(
    input.noteBatches,
    slideNoteManager,
    musicScoreController,
    bpmChangeCount.value,
    () => oneFrameJudgementController.getUsableOneFrameData(),
  );
  const inGameManager = new InGameManager(
    musicScoreController,
    noteManager,
    oneFrameJudgementController,
    new InputManager(),
  );

  return ok(new SimulatorEngineHost(inGameManager, backends));
}

function isValidBpm(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidMusicPosition(value: { readonly bar: number; readonly beatProgress: number }): boolean {
  return (
    Number.isInteger(value.bar) &&
    value.bar >= -0x80000000 &&
    value.bar <= 0x7fffffff &&
    Number.isFinite(value.beatProgress)
  );
}

function validateNoteBatches(noteBatches: NoteBatchInformationList): SimulatorResult<void> {
  for (const batch of noteBatches) {
    const batchValues = [batch.barIndex, batch.numerator, batch.denominator];
    if (batchValues.some((value) => value.evidence.length === 0)) {
      return evidenceRequired(
        "note-batches.batch-evidence",
        ["E10"],
        `Batch ${batch.fixtureId} contains a value without frozen batch evidence.`,
      );
    }
    if (batchValues.some((value) => !isInt32(value.value))) {
      return evidenceRequired(
        "note-batches.batch-int32",
        ["E10", "E14"],
        `Batch ${batch.fixtureId} must preserve the original Int32 position fields.`,
      );
    }

    for (const note of batch.informationList) {
      const noteValues = [
        note.family,
        note.gameNoteType,
        note.frontNoteType,
        note.afterNoteType,
        note.barIndex,
        note.absolutePosition,
      ];
      if (noteValues.some((value) => value.evidence.length === 0)) {
        return evidenceRequired(
          "note-batches.note-evidence",
          ["E10", "E12", "E13"],
          `Note ${note.fixtureId} contains a value without frozen note evidence.`,
        );
      }
      if (!isInt32(note.barIndex.value) || !isInt32(note.absolutePosition.value)) {
        return evidenceRequired(
          "note-batches.note-position-int32",
          ["E10", "E14"],
          `Note ${note.fixtureId} must preserve the original Int32 position fields.`,
        );
      }
    }
  }
  return ok(undefined);
}

function isInt32(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  );
}
