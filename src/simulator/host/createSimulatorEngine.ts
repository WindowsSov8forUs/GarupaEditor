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
  "G01",
  "G02",
  "G03",
  "G04",
  "G05",
  "G06",
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
  const initialPosition = readEvidenceBound(
    input.clock.initialMusicPosition,
    "clock.initial-music-position",
    ["E03", "E10"],
    "Initial music position must be tied to the frozen clock and preconstructed-score evidence.",
  );
  if (initialPosition.status !== "ok") {
    return initialPosition;
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

    let previousSourceOrder = Number.NEGATIVE_INFINITY;
    const sourceOrders = new Set<number>();
    for (const note of batch.informationList) {
      if (
        !Number.isInteger(note.sourceOrder) ||
        sourceOrders.has(note.sourceOrder) ||
        note.sourceOrder <= previousSourceOrder
      ) {
        return evidenceRequired(
          "note-batches.source-order",
          ["E04", "E06", "E10"],
          `Batch ${batch.fixtureId} must carry unique ascending sourceOrder values in informationList order.`,
        );
      }
      sourceOrders.add(note.sourceOrder);
      previousSourceOrder = note.sourceOrder;
      const noteValues = [
        note.family,
        note.gameNoteType,
        note.frontNoteType,
        note.afterNoteType,
        note.absolutePosition,
      ];
      if (noteValues.some((value) => value.evidence.length === 0)) {
        return evidenceRequired(
          "note-batches.note-evidence",
          ["E10", "E12", "E13"],
          `Note ${note.fixtureId} contains a value without frozen note evidence.`,
        );
      }
    }
  }
  return ok(undefined);
}
