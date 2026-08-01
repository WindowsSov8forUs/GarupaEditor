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
import {
  copyManualInputPosition,
  type ManualInputButtonResolution,
  type ManualInputFrame,
  type ManualInputPosition,
} from "../engine/data/manualInput";
import {
  InGameDirector,
  validateDirectorDeltaTime,
} from "../engine/managers/inGameDirector";
import { InGameManager } from "../engine/managers/inGameManager";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { ScoreLifeStateManager } from "../engine/managers/scoreLifeStateManager";
import type { FeverTimeCommandName } from "../engine/managers/feverTimeManager";
import {
  GamePlayInputDispatcher,
  InputManager,
} from "../engine/managers/inputBoundaries";
import { NoteManager } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import {
  RenderCommandProducer,
  validateOrdinaryFixedNoteSceneInput,
} from "../engine/rendering/renderCommandProducer";
import {
  validateAutoLiveActivationGraph,
  validateAutoLiveChartOwnership,
} from "../engine/notes/noteTypes";
import type {
  SimulatorEngine,
  SimulatorEngineInput,
  SimulatorSnapshot,
} from "./contracts";

class SimulatorEngineHost implements SimulatorEngine {
  constructor(
    private readonly inGameDirector: InGameDirector,
    private readonly inGameManager: InGameManager,
    private readonly inputDispatcher: GamePlayInputDispatcher,
    private readonly renderingSessionId: string | null,
    private readonly renderProducer: RenderCommandProducer | null,
    readonly backends: SimulatorBackends,
  ) {}

  initialize(): SimulatorResult<void> {
    const renderer = validateRendererSession(this.renderingSessionId, this.backends);
    if (renderer.status !== "ok") return renderer;
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

  step(
    deltaTimeSeconds: number,
    inputFrame?: ManualInputFrame,
  ): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    if (this.inGameManager.state !== "initialized") {
      return this.inGameManager.execUpdate(deltaTimeSeconds);
    }
    if (this.inGameManager.snapshot().paused) {
      return this.inGameDirector.update(deltaTimeSeconds);
    }
    const deltaValidation = validateDirectorDeltaTime(deltaTimeSeconds);
    if (deltaValidation.status !== "ok") {
      return deltaValidation;
    }
    const inputValidation =
      this.inGameManager.inputManager.prepareOuterFrame(inputFrame, deltaTimeSeconds);
    if (inputValidation.status !== "ok") {
      return inputValidation;
    }
    return this.inGameDirector.update(deltaTimeSeconds);
  }

  resolveManualInputButton(
    position: ManualInputPosition,
  ): SimulatorResult<ManualInputButtonResolution | null> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    const managerSnapshot = this.inGameManager.snapshot();
    if (this.inGameManager.state !== "initialized" || managerSnapshot.paused) {
      return evidenceRequired(
        "manual-input.resolve-outside-active-session",
        ["D03", "D14", "MJ25"],
        "Raw input geometry can be resolved only by an initialized, running manual engine session.",
      );
    }
    if (managerSnapshot.noteManager.calculatedData.playMode !== "manual") {
      return evidenceRequired(
        "manual-input.resolve-in-auto-live",
        ["D03", "D14", "MJ25"],
        "Real-touch button capabilities are unavailable in Auto Live.",
      );
    }
    const copied = copyManualInputPosition(position);
    if (copied.status !== "ok") {
      return copied;
    }
    const resolved = this.backends.manualInputGeometry.resolveButton(copied.value);
    if (resolved.status !== "ok") {
      return resolved;
    }
    if (resolved.value === null) {
      return ok(null);
    }
    const button = this.inputDispatcher.getButtonForResolver(resolved.value);
    if (button.status !== "ok") {
      return button;
    }
    return this.inGameManager.inputManager.issueButtonResolution(
      copied.value,
      button.value,
    );
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

  updateFeverMemberPoint(
    displayIndex: number,
    point: number,
    isOwnTeam: boolean,
  ): SimulatorResult<void> {
    return this.inGameManager.updateFeverMemberPoint(displayIndex, point, isOwnTeam);
  }

  changeFeverCommand(command: FeverTimeCommandName): SimulatorResult<void> {
    return this.inGameManager.changeFeverCommand(command);
  }

  continueLive(): SimulatorResult<void> {
    return this.inGameManager.continueLive();
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
    if (this.inGameManager.state === "disposed") {
      return this.backends.rendering?.dispose() ?? ok(undefined);
    }
    const rendererState = this.backends.rendering?.snapshot().state;
    if (rendererState === "faulted" || rendererState === "disposed") {
      this.inGameManager.disposeAfterTerminalRendererFault();
      return this.backends.rendering?.dispose() ?? ok(undefined);
    }
    const rendererValidation = this.renderProducer?.validate();
    if (rendererValidation?.status === "evidence-required") return rendererValidation;
    const domainDispose = this.inGameManager.dispose();
    if (domainDispose.status !== "ok") return domainDispose;
    const release = this.renderProducer?.preflightSessionRelease() ?? null;
    if (release?.status === "evidence-required") return release;
    if (release?.status === "ok") {
      const committed = release.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return this.backends.rendering?.dispose() ?? ok(undefined);
  }
}

export function createSimulatorEngine(
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
): SimulatorResult<SimulatorEngine> {
  const renderingSessionId = input.rendering?.sessionId ?? null;
  const rendererValidation = validateRendererSession(renderingSessionId, backends);
  if (rendererValidation.status !== "ok") return rendererValidation;
  if (input.rendering !== undefined && backends.rendering !== undefined) {
    if (backends.rendering.snapshot().fidelity?.mode !== "ordinary") {
      return evidenceRequired(
        "render.note.non-ordinary-scene-lifecycle-unimplemented",
        ["RPR-D05", "RPR-D13", "PR04", "PR39", "HA-D04"],
        "The connected Note scene/motion lifecycle is authorized only for the fixed ordinary 10.1.4 profile.",
      );
    }
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(
      input.rendering.ordinaryNoteScene,
    );
    if (sceneValidation.status !== "ok") return sceneValidation;
  }
  const renderProducer = input.rendering !== undefined && backends.rendering !== undefined
    ? new RenderCommandProducer(
        input.rendering.sessionId,
        backends.rendering,
        input.rendering.resources,
      )
    : null;
  const producerValidation = renderProducer?.validate();
  if (producerValidation?.status === "evidence-required") return producerValidation;
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
  const scoreLifeStateResult = input.scoreLifeState === undefined
    ? ok<ScoreLifeStateManager | null>(null)
    : ScoreLifeStateManager.create(
        input.scoreLifeState,
        input.chart,
        playModeValidation.value.kind,
      );
  if (scoreLifeStateResult.status !== "ok") return scoreLifeStateResult;
  const scoreLifeStateManager = scoreLifeStateResult.value;
  const musicScoreController = new InGameMusicScoreController(input.chart);
  const oneFrameJudgementController = new InGameOneFrameJudgementController();
  if (scoreLifeStateManager !== null) {
    const businessOwner = oneFrameJudgementController.registerBusinessOwner(
      (judgement) => scoreLifeStateManager.freezeOneFrame(judgement),
    );
    if (businessOwner.status !== "ok") return businessOwner;
  }
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
    undefined,
    () => oneFrameJudgementController.createManualJudgementTransaction(),
    backends.manualInputGeometry,
    renderProducer,
    input.rendering?.ordinaryNoteScene ?? null,
  );
  const judgementOwner =
    oneFrameJudgementController.registerAutoLiveJudgementOwner(
      (noteInformation) =>
        noteManager.getAutoLiveJudgementOwnership(noteInformation),
    );
  if (judgementOwner.status !== "ok") {
    return judgementOwner;
  }
  const manualJudgementOwner =
    oneFrameJudgementController.registerManualJudgementOwner(
      (noteInformation) => noteManager.getManualJudgementOwnership(noteInformation),
    );
  if (manualJudgementOwner.status !== "ok") {
    return manualJudgementOwner;
  }
  const inputManager = new InputManager(inGameCalculatedData.playMode);
  const inputDispatcher = new GamePlayInputDispatcher(noteManager);
  const inputDispatcherRegistration = inputManager.registerDispatcher(inputDispatcher);
  if (inputDispatcherRegistration.status !== "ok") {
    return inputDispatcherRegistration;
  }
  const inGameManager = new InGameManager(
    musicScoreController,
    noteManager,
    oneFrameJudgementController,
    inputManager,
    scoreLifeStateManager,
    renderProducer,
  );
  const inGameDirector = new InGameDirector(
    inGameManager,
    input.runtime.highFrequencyMode,
    backends.frameRate,
  );

  return ok(new SimulatorEngineHost(
    inGameDirector,
    inGameManager,
    inputDispatcher,
    renderingSessionId,
    renderProducer,
    backends,
  ));
}

function validateRendererSession(
  sessionId: string | null,
  backends: SimulatorBackends,
): SimulatorResult<void> {
  if (sessionId === null && backends.rendering === undefined) {
    return ok(undefined);
  }
  if (
    sessionId === null ||
    sessionId.length === 0 ||
    backends.rendering === undefined
  ) {
    return evidenceRequired(
      "render.session.incomplete-host-binding",
      ["RPR-D14", "RPR-D17", "PR35", "PR38"],
      "A rendering engine requires both one explicit session identity and one prepared typed renderer backend.",
    );
  }
  const snapshot = backends.rendering.snapshot();
  if (
    snapshot.state !== "ready" ||
    snapshot.sessionId !== sessionId ||
    snapshot.fault !== null
  ) {
    return evidenceRequired(
      "render.session.renderer-not-ready",
      ["RPR-D14", "RPR-D17", "PR35", "PR38"],
      "Renderer readiness and the exact host session must validate before chart or domain owners are created or initialized.",
    );
  }
  return ok(undefined);
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

  const ownershipValidation = validateAutoLiveChartOwnership(chart.noteBatches);
  if (ownershipValidation.status !== "ok") {
    return ownershipValidation;
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
  return validateAutoLiveActivationGraph(noteInformation);
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
