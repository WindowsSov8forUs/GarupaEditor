export const ChartConstructionEvidence = {
  E01: "chart-construction:E01",
  E02: "chart-construction:E02",
  E03: "chart-construction:E03",
  E04: "chart-construction:E04",
  E05: "chart-construction:E05",
  E06: "chart-construction:E06",
  E07: "chart-construction:E07",
  E08: "chart-construction:E08",
  E09: "chart-construction:E09",
  E10: "chart-construction:E10",
  E11: "chart-construction:E11",
  E12: "chart-construction:E12",
  E13: "chart-construction:E13",
  E14: "chart-construction:E14",
  E15: "chart-construction:E15",
  E16: "chart-construction:E16",
  E17: "chart-construction:E17",
  E18: "chart-construction:E18",
} as const;

export type ChartConstructionEvidenceId =
  (typeof ChartConstructionEvidence)[keyof typeof ChartConstructionEvidence];
