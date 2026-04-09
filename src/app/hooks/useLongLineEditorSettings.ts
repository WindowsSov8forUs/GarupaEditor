import { useMemo, useState } from "react";

export type LongLineShape =
  | "line"
  | "sine"
  | "quad"
  | "cubic"
  | "quart"
  | "quint"
  | "expo"
  | "semicircle"
  | "back"
  | "elastic"
  | "bounce";

export type LongLineCurveType = "in" | "out" | "in_out" | "out_in";
export type LongLinePrecision = "1" | "1/16" | "1/32" | "1/64" | "1/128";
export type LongLineDivision = "-" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32" | "1/64" | "1/128";

type LongLineEditorSettings = {
  shape: LongLineShape;
  curveType: LongLineCurveType | null;
  precision: LongLinePrecision;
  division: LongLineDivision;
  vibration: number;
};

const LINEAR_PRECISIONS: LongLinePrecision[] = ["1", "1/16", "1/32", "1/64", "1/128"];
const CURVED_PRECISIONS: LongLinePrecision[] = ["1/16", "1/32", "1/64", "1/128"];
const DIVISIONS: LongLineDivision[] = ["-", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1/128"];
const CURVE_TYPES: LongLineCurveType[] = ["in", "out", "in_out", "out_in"];

const DEFAULT_SETTINGS: LongLineEditorSettings = {
  shape: "line",
  curveType: null,
  precision: "1",
  division: "-",
  vibration: 0,
};

function parseDenominator(value: string): number {
  if (value === "-") {
    return 0;
  }
  if (value === "1") {
    return 1;
  }
  const denominator = Number(value.split("/")[1]);
  return Number.isFinite(denominator) ? denominator : 1;
}

function clampByIndex<T>(values: T[], index: number): T {
  const clamped = Math.max(0, Math.min(values.length - 1, index));
  return values[clamped];
}

function normalizeCurveType(shape: LongLineShape, curveType: unknown): LongLineCurveType | null {
  if (shape === "line") {
    return null;
  }
  return CURVE_TYPES.includes(curveType as LongLineCurveType) ? (curveType as LongLineCurveType) : "in";
}

function normalizeSettings(input: LongLineEditorSettings): LongLineEditorSettings {
  let next = {
    ...input,
    curveType: normalizeCurveType(input.shape, input.curveType),
    vibration: Number.isFinite(input.vibration) ? input.vibration : 0,
  };
  const precisionValues = next.shape === "line" ? LINEAR_PRECISIONS : CURVED_PRECISIONS;
  if (!precisionValues.includes(next.precision)) {
    next = {
      ...next,
      precision: next.shape === "line" ? "1" : "1/32",
    };
  }
  const maxDivisionDenominator = Math.max(2, parseDenominator(next.precision));
  const validDivisionValues = DIVISIONS.filter((value) => parseDenominator(value) <= maxDivisionDenominator);
  if (!validDivisionValues.includes(next.division)) {
    next = {
      ...next,
      division: "-",
    };
  }
  return next;
}

export function useLongLineEditorSettings(_selectedLongLineSegmentId: string | null) {
  const [activeSettings, setActiveSettings] = useState<LongLineEditorSettings>(DEFAULT_SETTINGS);

  const availableDivisions = useMemo<LongLineDivision[]>(() => {
    const precisionDenominator = parseDenominator(activeSettings.precision);
    const maxDivisionDenominator = Math.max(2, precisionDenominator);
    return DIVISIONS.filter((value) => parseDenominator(value) <= maxDivisionDenominator);
  }, [activeSettings.precision]);
  const isSlideDivisionDisabled = activeSettings.precision === "1";

  const patchActive = (updater: (current: LongLineEditorSettings) => LongLineEditorSettings) => {
    setActiveSettings((current) => {
      const next = updater(current);
      return normalizeSettings(next);
    });
  };

  const setSlideShape = (shape: LongLineShape) => {
    patchActive((current) => ({
      ...current,
      shape,
      curveType: shape === "line" ? null : (current.curveType ?? "in"),
      precision:
        shape === "line"
          ? (LINEAR_PRECISIONS.includes(current.precision) ? current.precision : "1")
          : (CURVED_PRECISIONS.includes(current.precision) ? current.precision : "1/32"),
    }));
  };

  const setSlideCurveType = (curveType: LongLineCurveType) => {
    patchActive((current) => {
      if (current.shape === "line") {
        return current;
      }
      if (!CURVE_TYPES.includes(curveType)) {
        return {
          ...current,
          curveType: "in",
        };
      }
      return {
        ...current,
        curveType,
      };
    });
  };

  const stepSlidePrecision = (delta: number) => {
    patchActive((current) => {
      const precisionValues = current.shape === "line" ? LINEAR_PRECISIONS : CURVED_PRECISIONS;
      const currentIndex = precisionValues.indexOf(current.precision);
      const nextPrecision = clampByIndex(precisionValues, currentIndex + delta);
      return {
        ...current,
        precision: nextPrecision,
      };
    });
  };

  const setSlidePrecisionValue = (precision: LongLinePrecision) => {
    patchActive((current) => {
      const precisionValues = current.shape === "line" ? LINEAR_PRECISIONS : CURVED_PRECISIONS;
      const nextPrecision = precisionValues.includes(precision) ? precision : current.precision;
      return {
        ...current,
        precision: nextPrecision,
      };
    });
  };

  const stepSlideDivision = (delta: number) => {
    patchActive((current) => {
      const maxDivisionDenominator = Math.max(2, parseDenominator(current.precision));
      const values = DIVISIONS.filter((value) => parseDenominator(value) <= maxDivisionDenominator);
      const currentIndex = values.indexOf(current.division);
      const nextDivision = clampByIndex(values, (currentIndex < 0 ? values.length - 1 : currentIndex) + delta);
      return {
        ...current,
        division: nextDivision,
      };
    });
  };

  const setSlideDivisionValue = (division: LongLineDivision) => {
    patchActive((current) => {
      const maxDivisionDenominator = Math.max(2, parseDenominator(current.precision));
      const values = DIVISIONS.filter((value) => parseDenominator(value) <= maxDivisionDenominator);
      const nextDivision = values.includes(division) ? division : current.division;
      return {
        ...current,
        division: nextDivision,
      };
    });
  };

  const setSlideSettings = (settings: LongLineEditorSettings) => {
    patchActive(() => settings);
  };

  const setSlideVibrationValue = (value: number) => {
    patchActive((current) => ({
      ...current,
      vibration: Number.isFinite(value) ? Number(value.toFixed(6)) : current.vibration,
    }));
  };

  const stepSlideVibration = (delta: number) => {
    patchActive((current) => ({
      ...current,
      vibration: Number((current.vibration + delta).toFixed(6)),
    }));
  };

  const precisionValues = activeSettings.shape === "line" ? LINEAR_PRECISIONS : CURVED_PRECISIONS;
  const currentPrecisionIndex = precisionValues.indexOf(activeSettings.precision);
  const currentDivisionIndex = availableDivisions.indexOf(activeSettings.division);

  return {
    slideShape: activeSettings.shape,
    slideCurveType: activeSettings.curveType,
    slidePrecision: activeSettings.precision,
    slideDivision: activeSettings.division,
    slideVibration: activeSettings.vibration,
    isSlideCurveTypeDisabled: activeSettings.shape === "line",
    isSlideDivisionDisabled,
    setSlideShape,
    setSlideCurveType,
    stepSlidePrecision,
    stepSlideDivision,
    setSlidePrecisionValue,
    setSlideDivisionValue,
    setSlideSettings,
    setSlideVibrationValue,
    stepSlideVibration,
    canStepSlidePrecisionDown: currentPrecisionIndex > 0,
    canStepSlidePrecisionUp: currentPrecisionIndex >= 0 && currentPrecisionIndex < precisionValues.length - 1,
    canStepSlideDivisionDown: !isSlideDivisionDisabled && currentDivisionIndex > 0,
    canStepSlideDivisionUp:
      !isSlideDivisionDisabled && currentDivisionIndex >= 0 && currentDivisionIndex < availableDivisions.length - 1,
  };
}
