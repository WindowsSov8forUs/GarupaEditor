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
  | "R09"
  | "R10"
  | "R11"
  | "R12"
  | "R13"
  | "R14"
  | "R15"
  | "R16"
  | `R16.D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17"}`
  | "R17"
  | "R18"
  | "R19"
  | "R20"
  | "U01"
  | "U02"
  | "U03"
  | "U04"
  | "U05";

export type ManualInputEvidenceId =
  | "V01"
  | `D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15"}`
  | `MJ${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26"}`;

export type ScoreLifeStateEvidenceId =
  | `SLS-D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24"}`
  | `BS${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27" | "28" | "29" | "30" | "31" | "32" | "33" | "34" | "35" | "36"}`;

export type ResourcePixiRenderingEvidenceId =
  | `RPR-D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18"}`
  | `RPR-R4-${"001" | "002" | "003" | "004" | "005" | "006" | "007" | "008" | "009" | "010" | "011" | "012" | "013" | "014" | "015" | "016" | "017"}`
  | `RPR-R6-${"001" | "002" | "003" | "004" | "005" | "006" | "007" | "008" | "009"}`
  | `RPR-R7-${"001" | "002" | "003" | "004" | "005" | "006" | "007" | "008" | "009"}`
  | `HAB-A${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"}`
  | `PR${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27" | "28" | "29" | "30" | "31" | "32" | "33" | "34" | "35" | "36" | "37" | "38" | "39" | "40"}`
  | `HA-D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"}`;

export type InitialPracticeSeekEvidenceId =
  | `IPS-F${"01" | "02" | "03" | "04" | "05" | "06" | "07"}`
  | `IPS-P${"01" | "02" | "03" | "04" | "05"}`;

export type WebView2BrowserRasterEvidenceId =
  | `WBR-F${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10"}`
  | `WBR-P${"01" | "02" | "03" | "04"}`;

export type OrdinaryRenderingReauditEvidenceId =
  | "OSR-GAP-01"
  | `OSR-E${"12340" | "12341" | "12342" | "12343" | "12344"}`;

export type LiveRehearsalEvidenceId =
  | `LR-E${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20"}`
  | `LR-R${"01" | "02" | "03" | "04" | "05"}`
  | `LR-C${"01" | "02" | "03" | "04"}`;

export type PublicLifeProfileEvidenceId =
  `PLP-E${"01" | "02" | "03" | "04" | "05" | "06" | "07"}`;

export type GarupaJsonPositionEvidenceId =
  | `GJP-E${"01" | "02" | "03" | "04" | "05" | "06" | "07"}`
  | "GJP-D01";

export type StartupDirectionEvidenceId =
  `SD${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16"}`;

export type SimulatorEvidenceId =
  | EvidenceId
  | AutoLiveEvidenceId
  | ManualInputEvidenceId
  | ScoreLifeStateEvidenceId
  | ResourcePixiRenderingEvidenceId
  | InitialPracticeSeekEvidenceId
  | WebView2BrowserRasterEvidenceId
  | OrdinaryRenderingReauditEvidenceId
  | LiveRehearsalEvidenceId
  | PublicLifeProfileEvidenceId
  | GarupaJsonPositionEvidenceId
  | StartupDirectionEvidenceId;

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
