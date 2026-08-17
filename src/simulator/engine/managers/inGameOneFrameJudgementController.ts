import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type NoteInformation,
} from "../chart/types";
import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
} from "../data/autoLiveJudgement";
import type {
  ManualJudgementData,
  OneFrameDataHandle,
  OneFrameDataPayload,
  OneFrameBusinessData,
  OneFrameJudgementBatch,
  OneFrameJudgementData,
  OneFrameJudgementEntry,
} from "../data/oneFrameData";
import {
  JudgeTiming,
  NoteResultType,
  type ManualJudgementCommitPlan,
  type ManualJudgementOwnership,
  type ManualJudgementRequest,
  type ManualJudgementTransaction,
} from "../data/manualJudgement";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import { validateAutoLiveActivationGraph } from "../notes/noteTypes";

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
      readonly kind: "one-frame.setup-manual";
      readonly containerId: string;
      readonly noteIndex: number;
      readonly noteType: number;
      readonly phase: "head" | "intermediate" | "tail";
      readonly rawResult: 0 | 1 | 2 | 3 | 4;
      readonly multipleDirectionalFlickNoteCount: number;
    }
  | {
      readonly kind: "one-frame.reflect";
      readonly batchIndex: number;
      readonly containerIds: readonly string[];
      readonly noteIndices: readonly number[];
    };

export interface OneFrameReflectPlan {
  readonly batch: OneFrameJudgementBatch;
}

export interface OneFrameJudgementControllerSnapshot {
  readonly initialized: boolean;
  readonly capacity: 5;
  readonly slots: readonly {
    readonly slot: number;
    readonly containerId: string;
    readonly isUse: boolean;
    readonly payload: OneFrameDataPayload | null;
  }[];
  readonly inUseContainerIds: readonly string[];
  readonly lastJudgementBatch: OneFrameJudgementBatch | null;
  readonly trace: readonly OneFrameTraceEntry[];
}

interface OneFrameDataContainer extends OneFrameDataHandle {
  readonly slot: number;
  readonly handle: OneFrameDataHandle;
  inUse: boolean;
  payload: OneFrameDataPayload | null;
}

export type AutoLiveJudgementOwner = (
  noteInformation: AutoLiveJudgementRequest["noteInformation"],
) => AutoLiveJudgementOwnership | null;

export type ManualJudgementOwner = (
  noteInformation: ManualJudgementRequest["noteInformation"],
) => ManualJudgementOwnership | null;

export type OneFrameBusinessOwner = (
  judgement: OneFrameJudgementData,
  source: NoteInformation,
) => SimulatorResult<OneFrameBusinessData>;

export class InGameOneFrameJudgementController {
  private initializedValue = false;
  private readonly containers: OneFrameDataContainer[] = [];
  private readonly ownedHandles = new WeakMap<OneFrameDataHandle, OneFrameDataContainer>();
  private readonly traceValue: OneFrameTraceEntry[] = [];
  private lastJudgementBatchValue: OneFrameJudgementBatch | null = null;
  private nextReflectBatchIndex = 0;
  private autoLiveJudgementOwner: AutoLiveJudgementOwner | null = null;
  private manualJudgementOwner: ManualJudgementOwner | null = null;
  private businessOwner: OneFrameBusinessOwner | null = null;
  private pendingReflectPlan: OneFrameReflectPlan | null = null;

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

  registerManualJudgementOwner(
    owner: ManualJudgementOwner,
  ): SimulatorResult<void> {
    if (typeof owner !== "function" || this.manualJudgementOwner !== null) {
      return evidenceRequired(
        "one-frame.invalid-or-duplicate-manual-owner",
        ["D05", "D14", "D15", "MJ02", "MJ26"],
        "The controller accepts exactly one NoteManager-owned manual judgement source resolver.",
      );
    }
    this.manualJudgementOwner = owner;
    return ok(undefined);
  }

  registerBusinessOwner(owner: OneFrameBusinessOwner): SimulatorResult<void> {
    if (typeof owner !== "function" || this.businessOwner !== null) {
      return evidenceRequired(
        "one-frame.invalid-or-duplicate-business-owner",
        ["SLS-D02", "SLS-D18"],
        "The controller accepts one session-bound Score/Life business projection owner.",
      );
    }
    this.businessOwner = owner;
    return ok(undefined);
  }

  createManualJudgementTransaction(): ManualJudgementTransaction {
    const available = this.containers.filter((container) => !container.inUse);
    const plans = new Map<ManualJudgementCommitPlan, {
      readonly container: OneFrameDataContainer;
      readonly payload: OneFrameDataPayload;
      committed: boolean;
    }>();
    let aborted = false;
    let finished = false;
    return {
      preflight: (request) => {
        if (aborted || finished) {
          return evidenceRequired(
            "one-frame.manual-transaction-closed",
            ["D14", "D15", "MJ25", "MJ26"],
            "A manual OneFrame preflight transaction cannot be reused after abort or finish.",
          );
        }
        const validation = this.validateManualJudgementRequest(request);
        if (validation.status !== "ok") {
          return validation;
        }
        const payload = this.prepareManualJudgementPayload(request);
        if (payload.status !== "ok") return payload;
        const container = available[plans.size];
        if (container === undefined) {
          return evidenceRequired(
            "one-frame.pool-exhausted",
            ["R02", "R03", "D15"],
            "Manual preflight cannot reserve beyond the fixed five native OneFrameData slots.",
          );
        }
        const plan: ManualJudgementCommitPlan = Object.freeze({
          manualJudgementPlan: true,
        });
        plans.set(plan, { container, payload: payload.value, committed: false });
        return ok(plan);
      },
      commit: (plan) => {
        const owned = plans.get(plan);
        if (aborted || finished || owned === undefined || owned.committed) {
          throw new Error("Manual OneFrame transaction received a foreign or repeated plan");
        }
        owned.committed = true;
        this.commitManualJudgementData(owned.container, owned.payload);
      },
      abort: () => {
        aborted = true;
        plans.clear();
      },
      finish: () => {
        if (aborted || finished || [...plans.values()].some((entry) => !entry.committed)) {
          throw new Error("Manual OneFrame transaction finished before every reserved plan committed");
        }
        finished = true;
        plans.clear();
      },
    };
  }

  setupAutoLiveJudgement(
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const validation = this.validateAutoLiveJudgementRequest(request);
    if (validation.status !== "ok") return validation;
    const payload = this.prepareAutoLiveJudgementPayload(request);
    if (payload.status !== "ok") return payload;
    const handle = this.getUsableOneFrameData();
    if (handle.status !== "ok") return handle;
    const container = this.ownedHandles.get(handle.value)!;
    return this.commitAutoLiveJudgementData(container, payload.value, request);
  }

  setupAutoLiveJudgementData(
    handle: OneFrameDataHandle,
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    const validation = this.validateAutoLiveJudgementRequest(request);
    if (validation.status !== "ok") return validation;
    const payload = this.prepareAutoLiveJudgementPayload(request);
    if (payload.status !== "ok") return payload;
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
    return this.commitAutoLiveJudgementData(container, payload.value, request);
  }

  setupBusinessData(): SimulatorResult<void> {
    return evidenceRequired(
      "one-frame.setup-business-data",
      ["E21", "E24", "R02"],
      "Gameplay projection is supplied only by the registered session owner during judgement setup; callers cannot inject a second payload.",
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

  preflightReflectOneFrameData(): SimulatorResult<OneFrameReflectPlan | null> {
    if (!this.initializedValue) {
      return evidenceRequired(
        "one-frame.reflect-before-initialize",
        ["R02", "R03"],
        "ReflectOneFrameData requires the initialized fixed five-slot pool.",
      );
    }
    if (this.pendingReflectPlan !== null) {
      return evidenceRequired(
        "one-frame.reflect-plan-already-pending",
        ["R02", "R03", "D15"],
        "Only one OneFrame reflection capability may be pending for the current container state.",
      );
    }
    if (!this.existsOneFrameData()) return ok(null);

    const entries: OneFrameJudgementEntry[] = [];
    for (const container of this.containers) {
      if (!container.inUse) continue;
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

    const firstEntry = entries[0];
    if (firstEntry === undefined) {
      return evidenceRequired(
        "one-frame.exists-without-entry",
        ["R02", "R03", "D15"],
        "ExistsOneFrameData cannot be true without at least one committed payload.",
      );
    }
    const batch: OneFrameJudgementBatch = Object.freeze({
      batchIndex: this.nextReflectBatchIndex,
      entries: Object.freeze(entries),
      entryCount: entries.length,
      addCombo: entries.reduce((sum, entry) => sum + entry.addCombo, 0),
      rawResult: firstEntry.rawResult,
      adjustedResult: firstEntry.adjustedResult,
      judgeTiming: firstEntry.judgeTiming,
    });
    const plan = Object.freeze({ batch });
    this.pendingReflectPlan = plan;
    return ok(plan);
  }

  commitReflectOneFrameData(
    plan: OneFrameReflectPlan,
  ): SimulatorResult<OneFrameJudgementBatch> {
    if (this.pendingReflectPlan !== plan) {
      return evidenceRequired(
        "one-frame.invalid-reflect-capability",
        ["R02", "R03", "D15"],
        "Only the exact pending OneFrame reflection capability may commit.",
      );
    }
    for (const entry of plan.batch.entries) {
      const container = this.containers[entry.slot];
      if (container?.containerId !== entry.containerId ||
          !container.inUse || container.payload === null) {
        return evidenceRequired(
          "one-frame.reflect-source-changed",
          ["R02", "R03", "D15"],
          "Every reserved OneFrame container must remain committed and unchanged until reflection commit.",
        );
      }
    }
    for (const container of this.containers) {
      if (container.inUse) {
        container.inUse = false;
        container.payload = null;
      }
    }
    this.pendingReflectPlan = null;
    this.nextReflectBatchIndex += 1;
    this.lastJudgementBatchValue = plan.batch;
    this.traceValue.push({
      kind: "one-frame.reflect",
      batchIndex: plan.batch.batchIndex,
      containerIds: plan.batch.entries.map((entry) => entry.containerId),
      noteIndices: plan.batch.entries.map((entry) => entry.noteIndex),
    });
    return ok(cloneBatch(plan.batch));
  }

  discardReflectOneFrameData(plan: OneFrameReflectPlan): SimulatorResult<void> {
    if (this.pendingReflectPlan !== plan) {
      return evidenceRequired(
        "one-frame.invalid-reflect-discard-capability",
        ["R02", "R03", "D15"],
        "Only the exact pending OneFrame reflection capability may be discarded.",
      );
    }
    this.pendingReflectPlan = null;
    return ok(undefined);
  }

  reflectOneFrameData(): SimulatorResult<OneFrameJudgementBatch | null> {
    const planned = this.preflightReflectOneFrameData();
    if (planned.status !== "ok") return planned;
    if (planned.value === null) return ok(null);
    return this.commitReflectOneFrameData(planned.value);
  }

  getReflectOneFrameData(): OneFrameJudgementBatch | null {
    return this.lastJudgementBatchValue === null
      ? null
      : cloneBatch(this.lastJudgementBatchValue);
  }

  dispose(): void {
    this.pendingReflectPlan = null;
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

  private prepareAutoLiveJudgementPayload(
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<OneFrameDataPayload> {
    const judgement: OneFrameJudgementData = Object.freeze({
      noteIndex: request.noteInformation.index,
      buttonTypes: Object.freeze([...request.noteInformation.buttonTypesArray]),
      noteType: request.noteType,
      phase: request.phase,
      rawResult: 4,
      adjustedResult: 4,
      addCombo: 1,
      absolutePosition: request.absolutePosition,
      judgeTiming: 0,
      multipleDirectionalFlickNoteCount: request.multipleDirectionalFlickNoteCount,
    });
    const business = this.businessOwner?.(judgement, request.noteInformation) ?? null;
    if (business?.status === "evidence-required") return business;
    const adjustedResult = business?.value.adjustedResult ?? judgement.adjustedResult;
    return ok(Object.freeze({
      ...judgement,
      adjustedResult,
      addCombo: adjustedResult >= NoteResultType.Great ? 1 : -1,
      ...(business === null ? {} : { business: business.value }),
    }));
  }

  private commitAutoLiveJudgementData(
    container: OneFrameDataContainer,
    payload: OneFrameDataPayload,
    request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    if (container.inUse || container.payload !== null) {
      return evidenceRequired(
        "one-frame.container-already-staged",
        ["R02", "R03"],
        `Container ${container.containerId} already contains a committed OneFrameData payload.`,
      );
    }
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

  private prepareManualJudgementPayload(
    request: ManualJudgementRequest,
  ): SimulatorResult<OneFrameDataPayload> {
    const ownership = this.manualJudgementOwner?.(request.noteInformation) ?? null;
    if (ownership === null) {
      return evidenceRequired(
        "one-frame.manual-source-ownership-lost",
        ["D14", "D15", "MJ25", "MJ26"],
        "Manual business preflight requires the same NoteManager-owned source used by request validation.",
      );
    }
    const adjustedResult = request.rawResult;
    const phase = request.phase ?? "head";
    const buttonTypes = ownership.slideButtonTypes ??
      (phase === "tail"
        ? ownership.longAfterButtonTypes ?? request.noteInformation.buttonTypesArray
        : ownership.multipleDirectionalFlickButtonTypes ??
          request.noteInformation.buttonTypesArray);
    const judgement: ManualJudgementData = Object.freeze({
      noteIndex: request.noteInformation.index,
      buttonTypes: Object.freeze([...buttonTypes]),
      noteType: request.noteType,
      phase,
      rawResult: request.rawResult,
      adjustedResult,
      addCombo: adjustedResult >= NoteResultType.Great ? 1 : -1,
      absolutePosition: request.absolutePosition,
      judgeTiming:
        adjustedResult === NoteResultType.Miss || adjustedResult === NoteResultType.Perfect
          ? JudgeTiming.None
          : request.rawTiming,
      multipleDirectionalFlickNoteCount:
        request.multipleDirectionalFlickNoteCount ?? 0,
    });
    const business = this.businessOwner?.(judgement, request.noteInformation) ?? null;
    if (business?.status === "evidence-required") return business;
    const projectedResult = business?.value.adjustedResult ?? judgement.adjustedResult;
    return ok(Object.freeze({
      ...judgement,
      adjustedResult: projectedResult,
      addCombo: projectedResult >= NoteResultType.Great ? 1 : -1,
      ...(business === null ? {} : { business: business.value }),
    }));
  }

  private commitManualJudgementData(
    container: OneFrameDataContainer,
    payload: OneFrameDataPayload,
  ): void {
    if (container.inUse || container.payload !== null) {
      throw new Error("Manual OneFrame preflight reservation changed before commit");
    }
    this.traceValue.push({
      kind: "one-frame.get-usable",
      containerId: container.containerId,
    });
    container.payload = payload;
    container.inUse = true;
    this.traceValue.push({
      kind: "one-frame.setup-manual",
      containerId: container.containerId,
      noteIndex: payload.noteIndex,
      noteType: payload.noteType,
      phase: payload.phase,
      rawResult: payload.rawResult,
      multipleDirectionalFlickNoteCount: payload.multipleDirectionalFlickNoteCount,
    });
  }

  private validateManualJudgementRequest(
    request: ManualJudgementRequest,
  ): SimulatorResult<void> {
    const source = request?.noteInformation;
    const ownership =
      source !== null && typeof source === "object" && this.manualJudgementOwner !== null
        ? this.manualJudgementOwner(source)
        : null;
    if (
      ownership === null ||
      source === null ||
      typeof source !== "object" ||
      !isClosedManualRequest(source, request, ownership) ||
      !Number.isInteger(request.rawResult) ||
      request.rawResult < NoteResultType.Miss ||
      request.rawResult > NoteResultType.Perfect ||
      !Number.isInteger(request.rawTiming) ||
      request.rawTiming < JudgeTiming.None ||
      request.rawTiming > JudgeTiming.Slow ||
      (request.rawResult === NoteResultType.Perfect && request.rawTiming !== JudgeTiming.None) ||
      (request.rawResult >= NoteResultType.Bad &&
        request.rawResult <= NoteResultType.Great &&
        request.rawTiming === JudgeTiming.None) ||
      !Array.isArray(source.buttonTypesArray) ||
      source.buttonTypesArray.length === 0
    ) {
      return evidenceRequired(
        "one-frame.invalid-manual-payload",
        ["D05", "D07", "D08", "D14", "D15", "MJ02", "MJ08", "MJ09", "MJ10", "MJ26"],
        "Manual Setup accepts only the NoteManager-owned source and its family-derived result, timing, note type, position and Multiple count projection.",
      );
    }
    return ok(undefined);
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

function isClosedManualRequest(
  source: ManualJudgementRequest["noteInformation"],
  request: ManualJudgementRequest,
  ownership: ManualJudgementOwnership,
): boolean {
  const phase = request.phase ?? "head";
  const expectedMultipleCount = ownership.multipleDirectionalFlickNoteCount;
  const expectedMultipleButtons = ownership.multipleDirectionalFlickButtonTypes;
  if (source.fireNoteType === FrontNoteType.MultipleDirectionalFlick) {
    return phase === "head" &&
      request.noteType === 10 &&
      request.rawResult !== NoteResultType.Miss &&
      request.absolutePosition === source.absolutePos &&
      isOwnedButtonGroup(
        request.multipleDirectionalFlickNoteCount,
        expectedMultipleCount,
        expectedMultipleButtons,
      );
  }
  if (ownership.slidePhase !== null) {
    const allowedTypes = ownership.slideAllowedNoteTypes;
    const buttons = ownership.slideButtonTypes;
    return phase === ownership.slidePhase &&
      Array.isArray(allowedTypes) &&
      allowedTypes.includes(request.noteType) &&
      request.absolutePosition === ownership.slideAbsolutePosition &&
      Array.isArray(buttons) &&
      buttons.length > 0 &&
      request.multipleDirectionalFlickNoteCount === undefined;
  }
  if (source.fireNoteType === FrontNoteType.Long) {
    if (expectedMultipleCount !== null || expectedMultipleButtons !== null) {
      return false;
    }
    if (phase === "head") {
      return (
        (request.noteType === 4 && request.rawResult !== NoteResultType.Miss) ||
        (request.noteType === 1 && request.rawResult === NoteResultType.Miss)
      ) &&
        request.absolutePosition === source.absolutePos &&
        request.multipleDirectionalFlickNoteCount === undefined;
    }
    const longButtons = ownership.longAfterButtonTypes;
    const expectedLongCount = ownership.longAfterMultipleCount;
    return request.noteType === ownership.longAfterNoteType &&
      request.absolutePosition === ownership.longAfterAbsolutePosition &&
      Array.isArray(longButtons) &&
      longButtons.length > 0 &&
      (request.noteType === 7
        ? isOwnedButtonGroup(
            request.multipleDirectionalFlickNoteCount,
            expectedLongCount,
            longButtons,
          )
        : request.multipleDirectionalFlickNoteCount === undefined &&
          expectedLongCount === null);
  }
  if (
    phase !== "head" ||
    request.multipleDirectionalFlickNoteCount !== undefined ||
    expectedMultipleCount !== null ||
    expectedMultipleButtons !== null ||
    ownership.longAfterAbsolutePosition !== null ||
    ownership.longAfterNoteType !== null ||
    ownership.longAfterButtonTypes !== null ||
    ownership.longAfterMultipleCount !== null ||
    ownership.slidePhase !== null ||
    ownership.slideAllowedNoteTypes !== null ||
    ownership.slideAbsolutePosition !== null ||
    ownership.slideButtonTypes !== null ||
    request.absolutePosition !== source.absolutePos
  ) {
    return false;
  }
  if (request.rawResult === NoteResultType.Miss && request.noteType === 0) {
    return (
      source.fireNoteType === FrontNoteType.Normal ||
      source.fireNoteType === FrontNoteType.Flick ||
      source.fireNoteType === FrontNoteType.DirectionalFlick
    );
  }
  return (
    (source.fireNoteType === FrontNoteType.Normal && request.noteType === 0) ||
    (source.fireNoteType === FrontNoteType.Flick && request.noteType === 3) ||
    (source.fireNoteType === FrontNoteType.DirectionalFlick && request.noteType === 9)
  );
}

function isOwnedButtonGroup(
  requestedCount: number | undefined,
  expectedCount: number | null,
  expectedButtons: readonly number[] | null,
): boolean {
  return Number.isInteger(requestedCount) &&
    requestedCount === expectedCount &&
    requestedCount > 0 &&
    Array.isArray(expectedButtons) &&
    expectedButtons.length === expectedCount &&
    new Set(expectedButtons).size === expectedButtons.length &&
    expectedButtons.every((button) =>
      Number.isInteger(button) &&
      button >= ButtonType.Button_00_BMS_1P_SC &&
      button <= ButtonType.Button_15_BMS_2P_SC);
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
  if (ownership?.productExtension === "garupa-visible-node") {
    return isClosedGarupaProductAutoRequest(request, ownership);
  }
  if (
    ownership === null ||
    request === null ||
    typeof request !== "object" ||
    request.noteInformation === null ||
    typeof request.noteInformation !== "object" ||
    !Number.isInteger(request.noteInformation.index) ||
    request.noteInformation.index < 0 ||
    request.noteInformation.index > 0x7fffffff ||
    request.noteInformation.isInvisible ||
    request.noteInformation.buttonType < ButtonType.Button_00_BMS_1P_SC ||
    request.noteInformation.buttonType > ButtonType.Button_15_BMS_2P_SC ||
    !Array.isArray(request.noteInformation.buttonTypes) ||
    !Array.isArray(request.noteInformation.buttonTypesArray) ||
    request.noteInformation.buttonTypesArray.length === 0 ||
    !request.noteInformation.buttonTypesArray.includes(
      request.noteInformation.buttonType,
    ) ||
    new Set(request.noteInformation.buttonTypesArray).size !==
      request.noteInformation.buttonTypesArray.length ||
    request.noteInformation.buttonTypes.length !==
      request.noteInformation.buttonTypesArray.length ||
    request.noteInformation.buttonTypes.some(
      (button, index) => button !== request.noteInformation.buttonTypesArray[index],
    ) ||
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
      validateAutoLiveActivationGraph(source).status !== "ok" ||
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
    source.afterNoteType === AfterNoteType.None &&
    ((source.fireNoteType === FrontNoteType.SlideA &&
      source.gameNoteType === GameNoteType.SlideA) ||
      (source.fireNoteType === FrontNoteType.SlideB &&
        source.gameNoteType === GameNoteType.SlideB))
  ) {
    return true;
  }

  if (request.phase !== "tail" || request.multipleDirectionalFlickNoteCount !== 0) {
    return false;
  }
  if (
    source.fireNoteType === FrontNoteType.Long &&
    validateAutoLiveActivationGraph(source).status === "ok" &&
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
  if (
    request.absolutePosition !== source.absolutePos ||
    source.isSlideNoteHead ||
    source.fireNoteType !== FrontNoteType.None ||
    source.afterNoteType !== AfterNoteType.None
  ) {
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

function isClosedGarupaProductAutoRequest(
  request: AutoLiveJudgementRequest,
  ownership: AutoLiveJudgementOwnership,
): boolean {
  const source = request?.noteInformation;
  if (
    ownership.productExtension !== "garupa-visible-node" ||
    ownership.multipleDirectionalFlickNoteCount !== null ||
    source === null || typeof source !== "object" ||
    !Number.isInteger(source.index) || source.index < 0 || source.isInvisible ||
    source.buttonType !== ButtonType.None ||
    source.buttonTypes.length !== 1 || source.buttonTypes[0] !== ButtonType.None ||
    source.buttonTypesArray.length !== 1 || source.buttonTypesArray[0] !== ButtonType.None ||
    request.phase !== "head" || request.absolutePosition !== source.absolutePos ||
    request.multipleDirectionalFlickNoteCount !== 0 || !Number.isInteger(request.noteType)
  ) return false;
  if (source.fireNoteType === FrontNoteType.Normal) return request.noteType === 0;
  if (source.fireNoteType === FrontNoteType.Flick) return request.noteType === 3;
  return source.fireNoteType === FrontNoteType.DirectionalFlick &&
    isDirectionalGameNoteType(source.gameNoteType) && request.noteType === 9;
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
