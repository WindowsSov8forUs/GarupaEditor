import { memo } from "react";
import {
  LANE_COUNT_OPTIONS,
  normalizeLaneCount,
  normalizePositiveInt,
  type ChartSettings,
} from "../../chartCore";
import { StepperIcon } from "../StepperIcon";

type TimelineStripProps = {
  settings: ChartSettings;
  applySettingsPatch: (patch: Partial<ChartSettings>) => void;
};

export const TimelineStrip = memo(function TimelineStrip({ settings, applySettingsPatch }: TimelineStripProps) {
  const laneCountIndex = LANE_COUNT_OPTIONS.findIndex((value) => value === settings.laneCount);
  const canStepLaneCountDown = laneCountIndex > 0;
  const canStepLaneCountUp = laneCountIndex >= 0 && laneCountIndex < LANE_COUNT_OPTIONS.length - 1;

  const stepLaneCount = (delta: number) => {
    if (laneCountIndex < 0) {
      applySettingsPatch({ laneCount: normalizeLaneCount(settings.laneCount) });
      return;
    }
    const nextIndex = Math.max(0, Math.min(LANE_COUNT_OPTIONS.length - 1, laneCountIndex + delta));
    const nextValue = LANE_COUNT_OPTIONS[nextIndex] ?? settings.laneCount;
    applySettingsPatch({ laneCount: normalizeLaneCount(nextValue) });
  };

  const canStepBeatsPerMeasureDown = settings.timeSignatureNumerator > 1;
  const canStepBeatsPerMeasureUp = true;
  const stepBeatsPerMeasure = (delta: number) => {
    const next = Math.max(1, settings.timeSignatureNumerator + delta);
    applySettingsPatch({
      timeSignatureNumerator: normalizePositiveInt(next, settings.timeSignatureNumerator),
    });
  };

  const canStepBeatDivisionDown = settings.timeSignatureDenominator > 1;
  const canStepBeatDivisionUp = true;
  const stepBeatDivision = (delta: number) => {
    const next = Math.max(1, settings.timeSignatureDenominator + delta);
    applySettingsPatch({
      timeSignatureDenominator: normalizePositiveInt(next, settings.timeSignatureDenominator),
    });
  };

  return (
    <div className="timeline-strip">
      <div className="timeline-item">
        <span className="timeline-key">轨道数</span>
        <div className="inline-stepper timeline-inline-stepper">
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepLaneCountDown}
            onClick={() => stepLaneCount(-1)}
          >
            <StepperIcon type="minus" />
          </button>
          <input
            type="text"
            className="stepper-input timeline-stepper-input"
            value={settings.laneCount}
            readOnly
            tabIndex={-1}
          />
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepLaneCountUp}
            onClick={() => stepLaneCount(1)}
          >
            <StepperIcon type="plus" />
          </button>
        </div>
      </div>

      <div className="timeline-item">
        <span className="timeline-key">每小节拍数</span>
        <div className="inline-stepper timeline-inline-stepper">
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepBeatsPerMeasureDown}
            onClick={() => stepBeatsPerMeasure(-1)}
          >
            <StepperIcon type="minus" />
          </button>
          <input
            type="text"
            className="stepper-input timeline-stepper-input"
            value={settings.timeSignatureNumerator}
            readOnly
            tabIndex={-1}
          />
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepBeatsPerMeasureUp}
            onClick={() => stepBeatsPerMeasure(1)}
          >
            <StepperIcon type="plus" />
          </button>
        </div>
      </div>

      <div className="timeline-item">
        <span className="timeline-key">分割数</span>
        <div className="inline-stepper timeline-inline-stepper">
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepBeatDivisionDown}
            onClick={() => stepBeatDivision(-1)}
          >
            <StepperIcon type="minus" />
          </button>
          <input
            type="text"
            className="stepper-input timeline-stepper-input"
            value={settings.timeSignatureDenominator}
            readOnly
            tabIndex={-1}
          />
          <button
            type="button"
            className="stepper-btn"
            disabled={!canStepBeatDivisionUp}
            onClick={() => stepBeatDivision(1)}
          >
            <StepperIcon type="plus" />
          </button>
        </div>
      </div>
    </div>
  );
});

TimelineStrip.displayName = "TimelineStrip";
