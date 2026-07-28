import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
} from "../chart/types";
import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
} from "../data/autoLiveJudgement";
import type {
  AutoLiveJudgementData,
  OneFrameDataHandle,
  OneFrameJudgementBatch,
  OneFrameJudgementEntry,
} from "../data/oneFrameData";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";

const ONE_FRAME_CAPACITY = 5;

export type OneFrameTraceEntry =
  | {
      readonly kind: "one-frame.get-usable";
      readonly containerId: string;
    }
  | {
      readonly kind: "one-frame.setup-auto-live";
      readonly containerId: string;
      readonly noteIndex: number;
      readonly phase: "head" | "intermediate" | "tail";
      readonly multipleDirectionalFlickNoteCount: number;
    }
  | {
      readonly kind: "one-frame.reflect";
      readonly batchIndex: number;
      readonly containerIds: readonly string[];
      readonly noteIndices: readonly number[];
    };

export interface OneFrameJudgementControllerSnapshot {
  readonly initialized: boolean;
  readonly capacity: 5;
  readonly slots: readonly {
    readonly slot: number;
    readonly containerId: string;
    readonly isUse: boolean;
    readonly payload: AutoLiveJudgementData | null;
  }[];
  readonly inUseContainerIds: readonly string[];
  readonly lastJudgementBatch: OneFrameJudgementBatch | null;
  readonly trace: readonly OneFrameTraceEntry[];
}

interface OneFrameDataContainer extends OneFrameDataHandle {
  readonly slot: number;
  readonly handle: OneFrameDataHandle;
  inUse: boolean;
  payload: AutoLiveJudgementData | null;
}

export type AutoLiveJudgementOwner = (
  noteInformation: AutoLiveJudgementRequest["noteInformation"],
) => AutoLiveJudgementOwnership | null;

export class InGameOneFrameJudgementController {
  private initializedValue = false;
  private readonly containers: OneFrameDataContainer[] = [];
  private readonly ownedHandles = new WeakMap<OneFrameDataHandle, OneFrameDataContainer>();
  private readonly traceValue: OneFrameTraceEntry[] = [];
  private lastJudgementBatchValue: OneFrameJudgementBatch | null = null;
  private nextReflectBatchIndex = 0;
  private autoLiveJudgementOwner: AutoLiveJudgementOwner | null = null;

  get isInitialized(): boolean {
    return this.initializedValue;
  }

  initialize(): SimulatorResult<void> {
    if (this.initializedValue) {
      return ok(undefined);
    }
    for (let index = 0; index < ONE_FRAME_CAPACITY; index += 1) {
      const handle = Object.freeze({ containerId: `one-frame:${index}` });
      const container: OneFrameDataContainer = {
        slot: index,
        containerId: handle.containerId,
        handle,
        inUse: false,
        payload: null,
      };
      this.containers.push(container);
      this.ownedHandles.set(handle, container);
    }
    this.initializedValue = true;
    return ok(undefined);
  }

  getUsableOneFrameData(): SimulatorResult<OneFrameDataHandle> {
    if (!this.initializedValue) {
      return evidenceRequired(
        "one-frame.get-before-initialize",
        ["R02", "R03"],
        "InitOneFrameDataList must establish the fixed five controller-owned slots before acquisition.",
      );
    }
    const container = this.containers.find((candidate) => !candidate.inUse);
    if (container === undefined) {
      return evidenceRequired(
        "one-frame.pool-exhausted",
        ["R02", "R03"],
        "All five native OneFrameData slots are in use; the sixth entry cannot resize, overwrite, or clamp the pool.",
      );
    }
    this.traceValue.push({
      kind: "one-frame.get-usable",
      containerId: container.containerId,
    });
    return ok(container.handle);
  }

  registerAutoLiveJudgementOwner(
    owner: AutoLiveJudgementOwner,
  ): SimulatorResult<void> {
    if (typeof owner !== "function") {
      return evidenceRequired(
        "one-frame.invalid-judgement-owner",
        ["R02", "R03", "R10", "R12", "R16"],
        "The judgement owner must be the NoteManager-owned source resolver.",
      );
    }
    if (this.autoLiveJudgementOwner !== null) {
      return evidenceRequired(
        "one-frame.judgement-owner-already-registered",
        ["R02", "R03", "R10", "R12", "R16"],
        "The controller accepts one NoteManager-owned judgement source and Multiple count resolver.",
      );
    }
    this.autoLiveJudgementOwner = owner;
    return ok(undefined);
  }

  setupAutoLiveJudgement(
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const validation = this.validateAutoLiveJudgementRequest(request);
    if (validation.status !== "ok") {
      return validation;
    }
    const handle = this.getUsableOneFrameData();
    if (handle.status !== "ok") {
      return handle;
    }
    return this.setupAutoLiveJudgementData(handle.value, request);
  }

  setupAutoLiveJudgementData(
    handle: OneFrameDataHandle,
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const validation = this.validateAutoLiveJudgementRequest(request);
    if (validation.status !== "ok") {
      return validation;
    }
    const container = handle !== null && typeof handle === "object"
      ? this.ownedHandles.get(handle)
      : undefined;
    if (container === undefined) {
      return evidenceRequired(
        "one-frame.foreign-container",
        ["R02", "R03"],
        `Container ${String(handle?.containerId)} is not owned by this controller.`,
      );
    }
    if (container.inUse || container.payload !== null) {
      return evidenceRequired(
        "one-frame.container-already-staged",
        ["R02", "R03"],
        `Container ${handle.containerId} already contains a committed OneFrameData payload.`,
      );
    }

    const payload: AutoLiveJudgementData = Object.freeze({
      noteIndex: request.noteInformation.index,
      buttonTypes: Object.freeze([...request.noteInformation.buttonTypesArray]),
      noteType: request.noteType,
      phase: request.phase,
      rawResult: 4,
      adjustedResult: 4,
      addCombo: 1,
      absolutePosition: request.absolutePosition,
      judgeTiming: 0,
    });
    container.payload = payload;
    container.inUse = true;
    this.traceValue.push({
      kind: "one-frame.setup-auto-live",
      containerId: container.containerId,
      noteIndex: payload.noteIndex,
      phase: payload.phase,
      multipleDirectionalFlickNoteCount: request.multipleDirectionalFlickNoteCount,
    });
    return ok(undefined);
  }

  setupBusinessData(): SimulatorResult<void> {
    return evidenceRequired(
      "one-frame.setup-business-data",
      ["E21", "E24", "R02"],
      "Score, power, life, skill, Fever, audio, particle and HUD consumers are absent from the Auto Live judgement projection.",
    );
  }

  existsOneFrameData(): boolean {
    return this.containers.some((container) => container.inUse);
  }

  collectOneFrameData(): readonly OneFrameDataHandle[] {
    return this.containers
      .filter((container) => container.inUse)
      .map((container) => container.handle);
  }

  reflectOneFrameData(): SimulatorResult<OneFrameJudgementBatch | null> {
    if (!this.initializedValue) {
      return evidenceRequired(
        "one-frame.reflect-before-initialize",
        ["R02", "R03"],
        "ReflectOneFrameData requires the initialized fixed five-slot pool.",
      );
    }
    if (!this.existsOneFrameData()) {
      return ok(null);
    }

    const entries: OneFrameJudgementEntry[] = [];
    for (const container of this.containers) {
      if (!container.inUse) {
        continue;
      }
      if (container.payload === null) {
        return evidenceRequired(
          "one-frame.in-use-without-payload",
          ["R02", "R03"],
          `Slot ${container.slot} is marked IsUse without a confirmed Setup payload.`,
        );
      }
      entries.push(Object.freeze({
        slot: container.slot,
        containerId: container.containerId,
        ...container.payload,
        buttonTypes: Object.freeze([...container.payload.buttonTypes]),
      }));
    }

    const batch: OneFrameJudgementBatch = Object.freeze({
      batchIndex: this.nextReflectBatchIndex,
      entries: Object.freeze(entries),
      entryCount: entries.length,
      addCombo: entries.reduce((sum, entry) => sum + entry.addCombo, 0),
      rawResult: 4,
      adjustedResult: 4,
      judgeTiming: 0,
    });
    for (const container of this.containers) {
      if (container.inUse) {
        container.inUse = false;
        container.payload = null;
      }
    }
    this.nextReflectBatchIndex += 1;
    this.lastJudgementBatchValue = batch;
    this.traceValue.push({
      kind: "one-frame.reflect",
      batchIndex: batch.batchIndex,
      containerIds: batch.entries.map((entry) => entry.containerId),
      noteIndices: batch.entries.map((entry) => entry.noteIndex),
    });
    return ok(cloneBatch(batch));
  }

  getReflectOneFrameData(): OneFrameJudgementBatch | null {
    return this.lastJudgementBatchValue === null
      ? null
      : cloneBatch(this.lastJudgementBatchValue);
  }

  dispose(): void {
    for (const container of this.containers) {
      container.inUse = false;
      container.payload = null;
    }
  }

  snapshot(): OneFrameJudgementControllerSnapshot {
    return {
      initialized: this.initializedValue,
      capacity: 5,
      slots: this.containers.map((container) => ({
        slot: container.slot,
        containerId: container.containerId,
        isUse: container.inUse,
        payload: container.payload === null
          ? null
          : { ...container.payload, buttonTypes: [...container.payload.buttonTypes] },
      })),
      inUseContainerIds: this.collectOneFrameData().map(
        (container) => container.containerId,
      ),
      lastJudgementBatch: this.getReflectOneFrameData(),
      trace: this.traceValue.map((entry) =>
        entry.kind === "one-frame.reflect"
          ? {
              ...entry,
              containerIds: [...entry.containerIds],
              noteIndices: [...entry.noteIndices],
            }
          : { ...entry },
      ),
    };
  }

  private validateAutoLiveJudgementRequest(
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const ownership =
      request?.noteInformation !== undefined && this.autoLiveJudgementOwner !== null
        ? this.autoLiveJudgementOwner(request.noteInformation)
        : null;
    return validateAutoLiveJudgementRequest(request, ownership);
  }
}

function validateAutoLiveJudgementRequest(
  request: AutoLiveJudgementRequest,
  ownership: AutoLiveJudgementOwnership | null,
): SimulatorResult<void> {
  if (!isClosedAutoLiveJudgementRequest(request, ownership)) {
    return evidenceRequired(
      "one-frame.invalid-auto-live-payload",
      ["R02", "R03", "R04"],
      "Auto Live Setup accepts only the closed owner-generated note identity, phase, note type, position and Multiple callback-count combinations before committing IsUse and payload state.",
    );
  }
  return ok(undefined);
}

function isClosedAutoLiveJudgementRequest(
  request: AutoLiveJudgementRequest,
  ownership: AutoLiveJudgementOwnership | null,
): boolean {
  if (
    ownership === null ||
    request === null ||
    typeof request !== "object" ||
    request.noteInformation === null ||
    typeof request.noteInformation !== "object" ||
    !Number.isInteger(request.noteInformation.index) ||
    request.noteInformation.index < 0 ||
    request.noteInformation.isInvisible ||
    request.noteInformation.buttonType < ButtonType.Button_00_BMS_1P_SC ||
    request.noteInformation.buttonType > ButtonType.Button_15_BMS_2P_SC ||
    !Array.isArray(request.noteInformation.buttonTypesArray) ||
    request.noteInformation.buttonTypesArray.length === 0 ||
    !request.noteInformation.buttonTypesArray.includes(
      request.noteInformation.buttonType,
    ) ||
    new Set(request.noteInformation.buttonTypesArray).size !==
      request.noteInformation.buttonTypesArray.length ||
    request.noteInformation.buttonTypesArray.some((button) =>
      !Number.isInteger(button) ||
      button < ButtonType.Button_00_BMS_1P_SC ||
      button > ButtonType.Button_15_BMS_2P_SC) ||
    !Number.isInteger(request.noteType) ||
    !Number.isInteger(request.multipleDirectionalFlickNoteCount) ||
    !Number.isFinite(request.absolutePosition)
  ) {
    return false;
  }

  const source = request.noteInformation;
  const expectedMultipleDirectionalCount =
    ownership.multipleDirectionalFlickNoteCount;
  if (request.phase === "head") {
    if (
      request.absolutePosition !== source.absolutePos ||
      (request.noteType === 10
        ? expectedMultipleDirectionalCount === null ||
          !Number.isInteger(expectedMultipleDirectionalCount) ||
          expectedMultipleDirectionalCount < 1 ||
          request.multipleDirectionalFlickNoteCount !== expectedMultipleDirectionalCount
        : request.multipleDirectionalFlickNoteCount !== 0)
    ) {
      return false;
    }
    switch (source.fireNoteType) {
      case FrontNoteType.Normal:
      case FrontNoteType.Long:
      case FrontNoteType.SlideA:
      case FrontNoteType.SlideB:
        return request.noteType === 0;
      case FrontNoteType.Flick:
        return request.noteType === 3;
      case FrontNoteType.DirectionalFlick:
        return request.noteType === 9 && isDirectionalGameNoteType(source.gameNoteType);
      case FrontNoteType.MultipleDirectionalFlick:
        return request.noteType === 10 && isDirectionalGameNoteType(source.gameNoteType);
      default:
        return false;
    }
  }

  if (
    request.phase === "intermediate" &&
    request.multipleDirectionalFlickNoteCount === 0 &&
    request.noteType === 8 &&
    request.absolutePosition === source.absolutePos &&
    !source.isSlideNoteHead &&
    (source.gameNoteType === GameNoteType.SlideA ||
      source.gameNoteType === GameNoteType.SlideB)
  ) {
    return true;
  }

  if (request.phase !== "tail" || request.multipleDirectionalFlickNoteCount !== 0) {
    return false;
  }
  if (
    source.fireNoteType === FrontNoteType.Long &&
    request.absolutePosition === source.afterNoteAbsolutePos
  ) {
    switch (source.afterNoteType) {
      case AfterNoteType.Normal:
        return request.noteType === 1;
      case AfterNoteType.Flick:
        return request.noteType === 3;
      case AfterNoteType.DirectionalFlickLeft:
      case AfterNoteType.DirectionalFlickRight:
      case AfterNoteType.MultipleDirectionalFlickLeft:
      case AfterNoteType.MultipleDirectionalFlickRight:
        return request.noteType === 9;
      default:
        return false;
    }
  }
  if (request.absolutePosition !== source.absolutePos) {
    return false;
  }
  switch (source.gameNoteType) {
    case GameNoteType.SlideEndA:
    case GameNoteType.SlideEndB:
      return request.noteType === 8;
    case GameNoteType.SlideEndFlickA:
    case GameNoteType.SlideEndFlickB:
      return request.noteType === 5;
    case GameNoteType.SlideADirectionalFlickLeft:
    case GameNoteType.SlideADirectionalFlickRight:
    case GameNoteType.SlideBDirectionalFlickLeft:
    case GameNoteType.SlideBDirectionalFlickRight:
      return request.noteType === 6;
    case GameNoteType.SlideADirectionalFlickLeftAdd:
    case GameNoteType.SlideADirectionalFlickRightAdd:
    case GameNoteType.SlideBDirectionalFlickLeftAdd:
    case GameNoteType.SlideBDirectionalFlickRightAdd:
      return request.noteType === 7;
    default:
      return false;
  }
}

function isDirectionalGameNoteType(gameNoteType: number): boolean {
  return gameNoteType === GameNoteType.DirectionalFlickLeft ||
    gameNoteType === GameNoteType.DirectionalFlickRight;
}

function cloneBatch(batch: OneFrameJudgementBatch): OneFrameJudgementBatch {
  return {
    ...batch,
    entries: batch.entries.map((entry) => ({
      ...entry,
      buttonTypes: [...entry.buttonTypes],
    })),
  };
}
