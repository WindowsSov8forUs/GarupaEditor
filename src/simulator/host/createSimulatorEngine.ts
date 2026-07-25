import type { SimulatorBackends } from "../backends/contracts";
import type { NoteBatchInformationList } from "../engine/data/noteData";
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
import type { SimulatorEngine, SimulatorEngineInput } from "./contracts";

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
    return this.inGameManager.pause();
  }

  resume(): SimulatorResult<void> {
    return this.inGameManager.resume();
  }

  snapshot(): SimulatorResult<ReturnType<InGameManager["snapshot"]>> {
    return evidenceRequired(
      "engine.snapshot",
      ["E11"],
      "The public snapshot contract and recording backend are implemented in T10.",
    );
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

  const slideNoteManager = new SlideNoteManager();
  const noteManager = new NoteManager(input.noteBatches, slideNoteManager);
  const inGameManager = new InGameManager(
    new InGameMusicScoreController(input.clock),
    noteManager,
    new InGameOneFrameJudgementController(),
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

    for (const note of batch.informationList) {
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
