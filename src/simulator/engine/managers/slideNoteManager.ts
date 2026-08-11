import type { SimulatorManualInputGeometryBackend } from "../../backends/contracts";
import type { NoteInformation } from "../chart/types";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export interface SlideJudgeDecision {
  readonly result: -1 | 1 | 2 | 3 | 4;
  readonly correction: number;
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
    firstSource: NoteInformation,
    secondSource: NoteInformation,
    adjustedMusicPosition: number,
  ): SimulatorResult<"first" | "second"> {
    const geometry = this.geometry;
    if (
      !this.initialized ||
      geometry?.getGameplayButtonLocalY === undefined ||
      geometry.getSlideCurrentLocalY === undefined
    ) {
      return evidenceRequired(
        "manual.slide-near-line-geometry-unavailable",
        ["D04", "D10", "MJ04", "MJ20"],
        "Slide near-line arbitration requires host-owned gameplay button local positions.",
      );
    }
    const center = geometry.getGameplayButtonLocalY(3);
    if (center.status !== "ok") {
      return center;
    }
    const first = geometry.getSlideCurrentLocalY(firstSource, adjustedMusicPosition);
    if (first.status !== "ok") {
      return first;
    }
    const second = geometry.getSlideCurrentLocalY(secondSource, adjustedMusicPosition);
    if (second.status !== "ok") {
      return second;
    }
    if (
      !isExactFiniteFloat32(center.value) ||
      !isExactFiniteFloat32(first.value) ||
      !isExactFiniteFloat32(second.value)
    ) {
      return evidenceRequired(
        "manual.slide-invalid-near-line-geometry",
        ["D04", "D10", "D15", "MJ04", "MJ26"],
        "Slide near-line button positions must be exact finite Float32 owner values.",
      );
    }
    const firstDistance = Math.fround(Math.abs(Math.fround(first.value - center.value)));
    const secondDistance = Math.fround(Math.abs(Math.fround(second.value - center.value)));
    return ok(firstDistance <= secondDistance ? "first" : "second");
  }

  judge(
    source: NoteInformation,
    adjustedMusicPosition: number,
  ): SimulatorResult<SlideJudgeDecision> {
    const geometry = this.geometry;
    if (
      !this.initialized ||
      geometry?.getSlideCurrentLocalY === undefined ||
      geometry.getSlideJudgeGeometry === undefined
    ) {
      return evidenceRequired(
        "manual.slide-judge-geometry-unavailable",
        ["D10", "D12", "MJ19", "MJ20"],
        "Slide judgement requires the host-owned gameplay-local touch projection and frozen judge positions.",
      );
    }
    const projected = geometry.getSlideCurrentLocalY(source, adjustedMusicPosition);
    if (projected.status !== "ok") {
      return projected;
    }
    const judgeGeometry = geometry.getSlideJudgeGeometry(source);
    if (judgeGeometry.status !== "ok") {
      return judgeGeometry;
    }
    if (!isExactFiniteFloat32(projected.value)) {
      return invalidJudgeGeometry("Projected Slide input must be exact finite Float32.");
    }
    const positions = judgeGeometry.value.positions;
    if (
      !Array.isArray(positions) ||
      positions.length < 2 ||
      positions.length > 64 ||
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
    const selectedIndex = copiedPositions.findIndex((value) => projected.value <= value);
    if (selectedIndex < 0) {
      return ok(Object.freeze({ result: -1, correction: 0 }));
    }
    const result = results[selectedIndex] as -1 | 1 | 2 | 3 | 4;
    if (result === -1) {
      return ok(Object.freeze({ result, correction: 0 }));
    }
    const correction = overedIndex - selectedIndex - (selectedIndex >= overedIndex ? 1 : 0);
    return ok(Object.freeze({ result, correction }));
  }

  dispose(): void {
    this.initialized = false;
    this.geometry = null;
  }
}

function invalidJudgeGeometry(boundary: string) {
  return evidenceRequired(
    "manual.slide-invalid-judge-geometry",
    ["D10", "D12", "D15", "MJ19", "MJ20", "MJ26"],
    boundary,
  );
}

function isExactFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Object.is(value, Math.fround(value));
}
