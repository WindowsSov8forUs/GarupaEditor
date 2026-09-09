import type { SimulatorManualInputGeometryBackend } from "../../backends/contracts";
import type { NoteInformation } from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export interface SlideJudgeDecision {
  readonly result: -1 | 1 | 2 | 3 | 4;
  readonly correction: number;
  readonly hasReachedPerfectLine: boolean;
}

export class SlideNoteManager {
  private initialized = false;
  private geometry: SimulatorManualInputGeometryBackend | null = null;

  initialize(
    geometry?: SimulatorManualInputGeometryBackend,
  ): SimulatorResult<void> {
    this.initialized = true;
    this.geometry = geometry ?? null;
    return ok(undefined);
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  selectNearJudgeLineSource(
    firstY: number,
    secondY: number,
  ): SimulatorResult<"first" | "second"> {
    const geometry = this.geometry;
    if (
      !this.initialized ||
      geometry?.getGameplayButtonLocalY === undefined
    ) {
      return integrityFailure(
        "manual.slide-near-line-geometry-unavailable",
        ["D04", "D10", "MJ04", "MJ20"],
        "Slide near-line arbitration requires host-owned gameplay button local positions.",
      );
    }
    const center = geometry.getGameplayButtonLocalY(3);
    if (center.status !== "ok") {
      return center;
    }
    if (
      !isExactFiniteFloat32(center.value) ||
      !isExactFiniteFloat32(firstY) ||
      !isExactFiniteFloat32(secondY)
    ) {
      return integrityFailure(
        "manual.slide-invalid-near-line-geometry",
        ["D04", "D10", "D15", "MJ04", "MJ26"],
        "Slide near-line button positions must be exact finite Float32 owner values.",
      );
    }
    const firstDistance = Math.fround(Math.abs(Math.fround(firstY - center.value)));
    const secondDistance = Math.fround(Math.abs(Math.fround(secondY - center.value)));
    return ok(firstDistance <= secondDistance ? "first" : "second");
  }

  getVirtualPerfectLine(source: NoteInformation): SimulatorResult<number> {
    const result = this.geometry?.getSlideJudgeGeometry?.(source);
    if (result === undefined) return invalidJudgeGeometry("Slide stop requires its bound virtual perfect line.");
    return result.status === "ok" ? ok(result.value.virtualPerfectLine) : result;
  }

  judge(
    source: NoteInformation,
    motionY: number,
  ): SimulatorResult<SlideJudgeDecision> {
    const geometry = this.geometry;
    if (
      !this.initialized ||
      geometry?.getSlideJudgeGeometry === undefined
    ) {
      return integrityFailure(
        "manual.slide-judge-geometry-unavailable",
        ["D10", "D12", "MJ19", "MJ20"],
        "Slide judgement requires the host-owned gameplay-local touch projection and frozen judge positions.",
      );
    }
    const judgeGeometry = geometry.getSlideJudgeGeometry(source);
    if (judgeGeometry.status !== "ok") {
      return judgeGeometry;
    }
    if (!isExactFiniteFloat32(motionY)) {
      return invalidJudgeGeometry("Committed Slide motion Y must be exact finite Float32.");
    }
    const positions = judgeGeometry.value.positions;
    if (
      !Array.isArray(positions) ||
      positions.length < 2 ||
      !isExactFiniteFloat32(judgeGeometry.value.virtualPerfectLine)
    ) {
      return invalidJudgeGeometry("Slide judge geometry requires a bounded position list and virtual line.");
    }
    const copiedPositions: number[] = [];
    for (const value of positions) {
      if (
        !isExactFiniteFloat32(value) ||
        (copiedPositions.length > 0 && value <= copiedPositions[copiedPositions.length - 1]!)
      ) {
        return invalidJudgeGeometry("Slide judge positions must be strictly increasing exact Float32 values.");
      }
      copiedPositions.push(value);
    }
    const overedIndex = copiedPositions.findIndex(
      (value) => value > judgeGeometry.value.virtualPerfectLine,
    );
    if (overedIndex <= 0 || overedIndex >= copiedPositions.length) {
      return invalidJudgeGeometry("VirtualPerfectLine must lie inside the Slide judge position interval.");
    }
    const results = new Array<number>(copiedPositions.length).fill(-1);
    for (let distance = 0; distance < 8; distance += 1) {
      const result = distance <= 2 ? 4 : distance <= 5 ? 3 : distance === 6 ? 2 : 1;
      const leftIndex = overedIndex - 1 - distance;
      const rightIndex = overedIndex + distance;
      if (leftIndex >= 0) results[leftIndex] = result;
      if (rightIndex < results.length) results[rightIndex] = result;
    }
    const position = Math.max(motionY, judgeGeometry.value.virtualPerfectLine);
    const hasReachedPerfectLine = position <= judgeGeometry.value.virtualPerfectLine;
    const intervals = copiedPositions.flatMap((value, index) => results[index] === -1
      ? [] : [{ position: value, result: results[index] as 1 | 2 | 3 | 4 }]).reverse();
    for (let upper = 0; upper < intervals.length / 2; upper += 1) {
      const lower = intervals.length - 1 - upper;
      const selected = intervals[upper]!.position >= position && intervals[upper + 1]!.position < position
        ? upper
        : intervals[lower]!.position <= position && intervals[lower - 1]!.position > position
          ? lower : null;
      if (selected === null) continue;
      const distance = Math.floor(intervals.length / 2) - selected;
      return ok(Object.freeze({
        result: intervals[selected]!.result,
        correction: distance <= 0 ? distance - 1 : distance,
        hasReachedPerfectLine,
      }));
    }
    return ok(Object.freeze({ result: -1, correction: 0, hasReachedPerfectLine }));
  }

  dispose(): void {
    this.initialized = false;
    this.geometry = null;
  }
}

function invalidJudgeGeometry(boundary: string) {
  return integrityFailure(
    "manual.slide-invalid-judge-geometry",
    ["D10", "D12", "D15", "MJ19", "MJ20", "MJ26"],
    boundary,
  );
}

function isExactFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Object.is(value, Math.fround(value));
}
