import type { SimulatorBackends } from "../backends/contracts";
import {
  ButtonType,
  FrontNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../engine/chart/types";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../engine/evidence";
import { getConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import {
  InGameCalculatedData,
  type SimulatorPlayMode,
} from "../engine/data/inGameCalculatedData";
import { InGameDirector } from "../engine/managers/inGameDirector";
import { InGameManager } from "../engine/managers/inGameManager";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { InputManager } from "../engine/managers/inputBoundaries";
import { NoteManager } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import type {
  SimulatorEngine,
  SimulatorEngineInput,
  SimulatorSnapshot,
} from "./contracts";

class SimulatorEngineHost implements SimulatorEngine {
  constructor(
    private readonly inGameDirector: InGameDirector,
    private readonly inGameManager: InGameManager,
    readonly backends: SimulatorBackends,
  ) {}

  initialize(): SimulatorResult<void> {
    if (
      this.inGameManager.state === "faulted" ||
      this.inGameManager.state === "disposed"
    ) {
      return this.inGameManager.initialize();
    }
    const awake = this.inGameDirector.awake();
    if (awake.status !== "ok") {
      return awake;
    }
    return this.inGameManager.initialize();
  }

  step(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    if (this.inGameManager.state !== "initialized") {
      return this.inGameManager.execUpdate(deltaTimeSeconds);
    }
    return this.inGameDirector.update(deltaTimeSeconds);
  }

  pause(): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
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
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    if (this.inGameManager.state !== "initialized") {
      return this.inGameManager.resume();
    }
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

  getAdjustedMusicPosition(): SimulatorResult<number> {
    return this.inGameManager.getAdjustedMusicPosition();
  }

  snapshot(): SimulatorResult<SimulatorSnapshot> {
    const adjustedMusicPosition =
      this.inGameManager.noteManager.peekAdjustedMusicPosition();
    return ok({
      director: this.inGameDirector.snapshot(),
      managers: this.inGameManager.snapshot(),
      adjustedMusicPosition,
      backendTrace: this.backends.snapshot(),
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
  const chartValidation = validateChart(input.chart);
  if (chartValidation.status !== "ok") {
    return chartValidation;
  }
  const runtimeMetadata = getConstructedChartRuntimeMetadata(input.chart);
  if (runtimeMetadata === undefined) {
    return evidenceRequired(
      "runtime.unregistered-chart-construction",
      ["E07", "E25"],
      "The runtime only accepts the exact ChartConstructionResult produced by the recovered chart factory; cloned or caller-synthesized charts have no proven process-history BPM count.",
    );
  }
  if (runtimeMetadata.isCommand) {
    return evidenceRequired(
      "runtime.command-parse-chart",
      ["E07", "E25"],
      "The gameplay runtime consumes the normal construction result captured before the separate command parse, not an isCommand construction result.",
    );
  }
  if (
    typeof input.runtime.highFrequencyMode !== "boolean" ||
    !Number.isInteger(input.runtime.judgeOffsetFrames) ||
    input.runtime.judgeOffsetFrames < -5 ||
    input.runtime.judgeOffsetFrames > 5
  ) {
    return evidenceRequired(
      "runtime.invalid-confirmed-settings",
      ["E19", "E22"],
      "High Frequency must be boolean and the confirmed production judgement-offset range is the signed integer interval [-5, 5].",
    );
  }
  const playModeValidation = validatePlayMode(input.runtime.playMode);
  if (playModeValidation.status !== "ok") {
    return playModeValidation;
  }
  const slideNoteManager = new SlideNoteManager();
  const inGameCalculatedData = new InGameCalculatedData(playModeValidation.value);
  const musicScoreController = new InGameMusicScoreController(input.chart);
  const oneFrameJudgementController = new InGameOneFrameJudgementController();
  const noteManager = new NoteManager(
    input.chart.noteBatches,
    slideNoteManager,
    musicScoreController,
    musicScoreController,
    runtimeMetadata.processBpmChangeCount,
    input.runtime.judgeOffsetFrames,
    inGameCalculatedData,
    () => oneFrameJudgementController.getUsableOneFrameData(),
    (request) => oneFrameJudgementController.setupAutoLiveJudgement(request),
  );
  const inGameManager = new InGameManager(
    musicScoreController,
    noteManager,
    oneFrameJudgementController,
    new InputManager(),
  );
  const inGameDirector = new InGameDirector(
    inGameManager,
    input.runtime.highFrequencyMode,
    backends.frameRate,
  );

  return ok(new SimulatorEngineHost(inGameDirector, inGameManager, backends));
}

function validatePlayMode(
  value: SimulatorEngineInput["runtime"]["playMode"],
): SimulatorResult<SimulatorPlayMode> {
  if (value === null || typeof value !== "object") {
    return evidenceRequired(
      "runtime.invalid-play-mode",
      ["R01", "R02", "R04"],
      "The runtime requires an explicit manual or Auto Live play-mode object.",
    );
  }
  const kind = value.kind;
  if (kind === "manual") {
    return ok(Object.freeze({ kind: "manual" }));
  }
  if (
    kind === "auto-live" &&
    value.resultTransform === "identity-no-active-situation-skill"
  ) {
    return ok(Object.freeze({
      kind: "auto-live",
      resultTransform: "identity-no-active-situation-skill",
    }));
  }
  return evidenceRequired(
    "runtime.unsupported-play-mode-or-result-transform",
    ["R01", "R02", "R04"],
    "Mode 14, debug Force Perfect and active result-transform Skill contexts are outside the closed Auto Live contract.",
  );
}

function validateChart(chart: ChartConstructionResult): SimulatorResult<void> {
  if (
    !isValidBpm(chart.startBpm) ||
    chart.startBpmString.length === 0 ||
    chart.bpmChangeRealValueList.length !==
      chart.bpmChangeStringRealValueList.length
  ) {
    return evidenceRequired(
      "runtime.invalid-chart-bpm-state",
      ["E07", "E08"],
      "The chart must preserve positive finite start/change BPM values and their original parallel strings.",
    );
  }

  for (const batch of chart.noteBatches) {
    if (
      !isInt32(batch.barIndex) ||
      !isInt32(batch.numerator) ||
      !isInt32(batch.denominator) ||
      !isInt32(batch.absolutePos)
    ) {
      return evidenceRequired(
        "runtime.invalid-chart-batch-position",
        ["E10", "E14"],
        "Runtime batches must preserve the recovered Int32 position fields.",
      );
    }
    for (const noteInformation of batch.informationList) {
      const validation = validateNoteInformation(noteInformation);
      if (validation.status !== "ok") {
        return validation;
      }
    }
  }
  return ok(undefined);
}

function validateNoteInformation(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (
    !isInt32(noteInformation.index) ||
    !isInt32(noteInformation.barIndex) ||
    !isInt32(noteInformation.numerator) ||
    !isInt32(noteInformation.denominator) ||
    !isInt32(noteInformation.absolutePos)
  ) {
    return evidenceRequired(
      "runtime.invalid-note-position",
      ["E10", "E14"],
      "NoteInformation must preserve recovered Int32 fields.",
    );
  }
  if (noteInformation.ccNum === 3 || noteInformation.ccNum === 8) {
    if (
      noteInformation.denominator === 0 ||
      !isValidBpm(noteInformation.bpm) ||
      noteInformation.bpmString.length === 0
    ) {
      return evidenceRequired(
        "runtime.invalid-bpm-command",
        ["E07", "E10"],
        "CC03/CC08 commands require a nonzero denominator, positive finite BPM and original string.",
      );
    }
    return ok(undefined);
  }
  if (noteInformation.buttonType === ButtonType.None) {
    return ok(undefined);
  }
  const validFrontType =
    noteInformation.fireNoteType >= FrontNoteType.Normal &&
    noteInformation.fireNoteType <=
      FrontNoteType.SlideBMultipleDirectionalFlickAdd;
  if (
    !validFrontType
  ) {
    return evidenceRequired(
      "runtime.unrepresented-note-root",
      ["E11", "E13"],
      `A surviving non-BPM record must map to a confirmed playable root family (index=${noteInformation.index}, ccNum=${noteInformation.ccNum}, buttonType=${noteInformation.buttonType}, fireNoteType=${noteInformation.fireNoteType}).`,
    );
  }
  return ok(undefined);
}

function isValidBpm(value: number): boolean {
  const floatValue = Math.fround(value);
  return Number.isFinite(value) && Number.isFinite(floatValue) && floatValue > 0;
}

function isInt32(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  );
}
