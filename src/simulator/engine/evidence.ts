import type { ChartConstructionEvidenceId } from "./chart/evidence";

export type FirstSliceEvidenceId =
  | "E01"
  | "E02"
  | "E03"
  | "E04"
  | "E05"
  | "E06"
  | "E07"
  | "E08"
  | "E09"
  | "E10"
  | "E11"
  | "E12"
  | "E13"
  | "E14"
  | "E15"
  | "E16"
  | "E17"
  | "E18"
  | "E19"
  | "E20"
  | "E21"
  | "E22"
  | "E23"
  | "E24"
  | "E25";

export type EvidenceId = FirstSliceEvidenceId | ChartConstructionEvidenceId;
export type AutoLiveEvidenceId =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R06"
  | "R07"
  | "R08"
  | "U01"
  | "U02"
  | "U03"
  | "U04"
  | "U05";

export type SimulatorEvidenceId = EvidenceId | AutoLiveEvidenceId;

export interface EvidenceReference {
  readonly id: SimulatorEvidenceId;
  readonly assertion: string;
}

export interface EvidenceBound<T> {
  readonly value: T;
  readonly evidence: readonly EvidenceReference[];
}

export interface SimulatorOk<T> {
  readonly status: "ok";
  readonly value: T;
}

export interface EvidenceRequired {
  readonly status: "evidence-required";
  readonly capability: string;
  readonly requiredEvidence: readonly SimulatorEvidenceId[];
  readonly boundary: string;
}

export type SimulatorResult<T> = SimulatorOk<T> | EvidenceRequired;

export function ok<T>(value: T): SimulatorOk<T> {
  return { status: "ok", value };
}

export function evidenceRequired(
  capability: string,
  requiredEvidence: readonly SimulatorEvidenceId[],
  boundary: string,
): EvidenceRequired {
  return {
    status: "evidence-required",
    capability,
    requiredEvidence,
    boundary,
  };
}

export function readEvidenceBound<T>(
  input: EvidenceBound<T>,
  capability: string,
  requiredEvidence: readonly SimulatorEvidenceId[],
  boundary: string,
): SimulatorResult<T> {
  if (input.evidence.length === 0) {
    return evidenceRequired(
      capability,
      requiredEvidence,
      boundary,
    );
  }
  return ok(input.value);
}
