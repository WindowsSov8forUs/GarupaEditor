import type { AutoLiveJudgementRequest } from "../data/autoLiveJudgement";
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
  inUse: boolean;
  payload: AutoLiveJudgementData | null;
}

export class InGameOneFrameJudgementController {
  private initializedValue = false;
  private readonly containers: OneFrameDataContainer[] = [];
  private readonly traceValue: OneFrameTraceEntry[] = [];
  private lastJudgementBatchValue: OneFrameJudgementBatch | null = null;
  private nextReflectBatchIndex = 0;

  get isInitialized(): boolean {
    return this.initializedValue;
  }

  initialize(): SimulatorResult<void> {
    if (this.initializedValue) {
      return ok(undefined);
    }
    for (let index = 0; index < ONE_FRAME_CAPACITY; index += 1) {
      this.containers.push({
        slot: index,
        containerId: `one-frame:${index}`,
        inUse: false,
        payload: null,
      });
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
    return ok({ containerId: container.containerId });
  }

  setupAutoLiveJudgement(
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const validation = validateAutoLiveJudgementRequest(request);
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
    const validation = validateAutoLiveJudgementRequest(request);
    if (validation.status !== "ok") {
      return validation;
    }
    const container = this.containers.find(
      (candidate) => candidate.containerId === handle.containerId,
    );
    if (container === undefined) {
      return evidenceRequired(
        "one-frame.foreign-container",
        ["R02", "R03"],
        `Container ${handle.containerId} is not owned by this controller.`,
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
      .map((container) => ({ containerId: container.containerId }));
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
}

function validateAutoLiveJudgementRequest(
  request: AutoLiveJudgementRequest,
): SimulatorResult<void> {
  if (
    request === null ||
    typeof request !== "object" ||
    request.noteInformation === null ||
    typeof request.noteInformation !== "object" ||
    !Number.isInteger(request.noteInformation.index) ||
    !Array.isArray(request.noteInformation.buttonTypesArray) ||
    request.noteInformation.buttonTypesArray.some((button) => !Number.isInteger(button)) ||
    !Number.isInteger(request.noteType) ||
    !Number.isFinite(request.absolutePosition) ||
    (request.phase !== "head" && request.phase !== "intermediate" && request.phase !== "tail")
  ) {
    return evidenceRequired(
      "one-frame.invalid-auto-live-payload",
      ["R02", "R03", "R04"],
      "Auto Live Setup validates every represented payload field before committing IsUse and payload state.",
    );
  }
  return ok(undefined);
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
