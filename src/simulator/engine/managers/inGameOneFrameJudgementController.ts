import type {
  OneFrameDataHandle,
  OneFrameDataPoolProfile,
} from "../data/oneFrameData";
import {
  evidenceRequired,
  ok,
  readEvidenceBound,
  type EvidenceReference,
  type SimulatorResult,
} from "../evidence";
import type { AutoLiveJudgementRequest } from "../data/autoLiveJudgement";

export type OneFrameTraceEntry =
  | {
      readonly kind: "one-frame.get-usable";
      readonly containerId: string;
    }
  | {
      readonly kind: "one-frame.stage-fixture";
      readonly containerId: string;
    }
  | {
      readonly kind: "one-frame.reflect";
      readonly batchIndex: number;
      readonly containerIds: readonly string[];
    };

export interface OneFrameReflectBatch {
  readonly batchIndex: number;
  readonly containerIds: readonly string[];
}

export interface OneFrameJudgementControllerSnapshot {
  readonly initialized: boolean;
  readonly capacity: number;
  readonly inUseContainerIds: readonly string[];
  readonly lastReflectBatch: OneFrameReflectBatch | null;
  readonly trace: readonly OneFrameTraceEntry[];
}

interface OneFrameDataContainer extends OneFrameDataHandle {
  inUse: boolean;
}

export class InGameOneFrameJudgementController {
  private initializedValue = false;
  private readonly containers: OneFrameDataContainer[] = [];
  private readonly traceValue: OneFrameTraceEntry[] = [];
  private lastReflectBatchValue: OneFrameReflectBatch | null = null;
  private nextReflectBatchIndex = 0;

  constructor(private readonly profile: OneFrameDataPoolProfile) {}

  get isInitialized(): boolean {
    return this.initializedValue;
  }

  initialize(): SimulatorResult<void> {
    if (this.initializedValue) {
      return ok(undefined);
    }
    const capacityResult = readEvidenceBound(
      this.profile.capacity,
      "one-frame.pool-capacity",
      ["E02", "E08"],
      "The portable fixture must bind its OneFrameData pool capacity to evidence; the original capacity is not guessed.",
    );
    if (capacityResult.status !== "ok") {
      return capacityResult;
    }
    if (!Number.isInteger(capacityResult.value) || capacityResult.value < 0) {
      return evidenceRequired(
        "one-frame.invalid-pool-capacity",
        ["E02", "E08"],
        "OneFrameData pool capacity must be a non-negative integer.",
      );
    }

    for (let index = 0; index < capacityResult.value; index += 1) {
      this.containers.push({
        containerId: `one-frame:${index}`,
        inUse: false,
      });
    }
    this.initializedValue = true;
    return ok(undefined);
  }

  getUsableOneFrameData(): SimulatorResult<OneFrameDataHandle> {
    if (!this.initializedValue) {
      return evidenceRequired(
        "one-frame.get-before-initialize",
        ["E02", "E08"],
        "InitOneFrameDataList must establish controller-owned containers before acquisition.",
      );
    }
    const container = this.containers.find((candidate) => !candidate.inUse);
    if (container === undefined) {
      return evidenceRequired(
        "one-frame.pool-exhausted",
        ["E08"],
        "No unused OneFrameData container remains; the original overflow behavior is outside the frozen evidence.",
      );
    }
    this.traceValue.push({
      kind: "one-frame.get-usable",
      containerId: container.containerId,
    });
    return ok({ containerId: container.containerId });
  }

  stageFixture(
    handle: OneFrameDataHandle,
    evidence: readonly EvidenceReference[],
  ): SimulatorResult<void> {
    if (evidence.length === 0) {
      return evidenceRequired(
        "one-frame.stage-fixture-evidence",
        ["E08"],
        "The test-only staging boundary requires an explicit OneFrameData evidence reference.",
      );
    }
    const container = this.containers.find(
      (candidate) => candidate.containerId === handle.containerId,
    );
    if (container === undefined) {
      return evidenceRequired(
        "one-frame.foreign-container",
        ["E02", "E08"],
        `Container ${handle.containerId} is not owned by this controller.`,
      );
    }
    if (container.inUse) {
      return evidenceRequired(
        "one-frame.container-already-staged",
        ["E08"],
        `Container ${handle.containerId} is already staged for ReflectOneFrameData.`,
      );
    }
    container.inUse = true;
    this.traceValue.push({
      kind: "one-frame.stage-fixture",
      containerId: container.containerId,
    });
    return ok(undefined);
  }

  setupBusinessData(): SimulatorResult<void> {
    return evidenceRequired(
      "one-frame.setup-business-data",
      ["E08", "E12", "E13"],
      "OneFrameData.Setup fields require judgement, score, power, combo, timing, and note behavior outside the first slice.",
    );
  }

  setupAutoLiveJudgement(
    _request: AutoLiveJudgementRequest,
  ): SimulatorResult<void> {
    return evidenceRequired(
      "one-frame.auto-live-setup-pending",
      ["R02", "R03", "R04"],
      "A05 restores the note-family Force Perfect route; the confirmed five-slot Auto Live Setup/Reflect payload is implemented in A08.",
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

  reflectOneFrameData(): SimulatorResult<OneFrameReflectBatch> {
    if (!this.initializedValue) {
      return evidenceRequired(
        "one-frame.reflect-before-initialize",
        ["E02", "E08"],
        "ReflectOneFrameData requires an initialized controller-owned pool.",
      );
    }
    const containerIds = this.containers
      .filter((container) => container.inUse)
      .map((container) => container.containerId);
    for (const container of this.containers) {
      if (container.inUse) {
        container.inUse = false;
      }
    }
    const batch: OneFrameReflectBatch = {
      batchIndex: this.nextReflectBatchIndex,
      containerIds,
    };
    this.nextReflectBatchIndex += 1;
    this.lastReflectBatchValue = batch;
    this.traceValue.push({
      kind: "one-frame.reflect",
      batchIndex: batch.batchIndex,
      containerIds: [...containerIds],
    });
    return ok(batch);
  }

  getReflectOneFrameData(): OneFrameReflectBatch | null {
    if (this.lastReflectBatchValue === null) {
      return null;
    }
    return {
      batchIndex: this.lastReflectBatchValue.batchIndex,
      containerIds: [...this.lastReflectBatchValue.containerIds],
    };
  }

  snapshot(): OneFrameJudgementControllerSnapshot {
    return {
      initialized: this.initializedValue,
      capacity: this.containers.length,
      inUseContainerIds: this.collectOneFrameData().map(
        (container) => container.containerId,
      ),
      lastReflectBatch: this.getReflectOneFrameData(),
      trace: this.traceValue.map((entry) =>
        entry.kind === "one-frame.reflect"
          ? { ...entry, containerIds: [...entry.containerIds] }
          : { ...entry },
      ),
    };
  }
}
