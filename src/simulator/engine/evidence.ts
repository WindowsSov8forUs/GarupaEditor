export type EvidenceId =
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
  | "E16";

export interface EvidenceReference {
  readonly id: EvidenceId;
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
  readonly requiredEvidence: readonly EvidenceId[];
  readonly boundary: string;
}

export type SimulatorResult<T> = SimulatorOk<T> | EvidenceRequired;

export function ok<T>(value: T): SimulatorOk<T> {
  return { status: "ok", value };
}

export function evidenceRequired(
  capability: string,
  requiredEvidence: readonly EvidenceId[],
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
  requiredEvidence: readonly EvidenceId[],
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
