import { useEffect, useMemo, useState } from "react";
import { type EditorOptionSettings } from "../chartCore";
import displayIcon from "../assets/icons/display.svg";
import optionsIcon from "../assets/icons/settings.svg";
import { StepperIcon } from "./StepperIcon";
import { SettingPrimaryTitle } from "./SettingPrimaryTitle";
import { StandardModal, StandardValueModal } from "./StandardModal";

type AppSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  windowPresetId: string;
  playbackWindowPresetId: string;
  playbackFps: number;
  playbackMvMode: boolean;
  playbackMvAlphaPercent: number;
  windowPresets: Array<{ id: string; label: string }>;
  onWindowPresetIdChange: (value: string) => void;
  onPlaybackWindowPresetIdChange: (value: string) => void;
  onPlaybackFpsChange: (value: number) => void;
  onPlaybackMvModeChange: (value: boolean) => void;
  onPlaybackMvAlphaPercentChange: (value: number) => void;
  onApplyWindowPreset: () => void;
  optionSettings: EditorOptionSettings;
  onApplyOptionSettings: (value: EditorOptionSettings) => boolean | void | Promise<boolean | void>;
};

type SettingsChildPage = "display" | "options";
type PercentKey =
  | "rhythmNoteSizePercent"
  | "longLineBrightnessPercent"
  | "noteSeVolumePercent"
  | "verticalScalePercent";

const RHYTHM_NOTE_SPEED_MIN = 1;
const RHYTHM_NOTE_SPEED_MAX = 12;
const RHYTHM_NOTE_SPEED_SPAN = RHYTHM_NOTE_SPEED_MAX - RHYTHM_NOTE_SPEED_MIN;
const PLAYBACK_MV_ALPHA_MIN = 30;
const PLAYBACK_MV_ALPHA_MAX = 100;
const PLAYBACK_MV_ALPHA_STEP = 10;

function normalizeRhythmNoteSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return RHYTHM_NOTE_SPEED_MIN;
  }
  return Number(Math.max(RHYTHM_NOTE_SPEED_MIN, Math.min(RHYTHM_NOTE_SPEED_MAX, value)).toFixed(2));
}

function formatRhythmNoteSpeed(value: number): string {
  return normalizeRhythmNoteSpeed(value).toFixed(2);
}

function wrapRhythmNoteSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return RHYTHM_NOTE_SPEED_MIN;
  }
  if (value >= RHYTHM_NOTE_SPEED_MIN && value <= RHYTHM_NOTE_SPEED_MAX) {
    return Number(value.toFixed(2));
  }
  let wrapped = RHYTHM_NOTE_SPEED_MIN + ((value - RHYTHM_NOTE_SPEED_MIN) % RHYTHM_NOTE_SPEED_SPAN);
  if (wrapped < RHYTHM_NOTE_SPEED_MIN) {
    wrapped += RHYTHM_NOTE_SPEED_SPAN;
  }
  if (Math.abs(wrapped - RHYTHM_NOTE_SPEED_MIN) < 1e-9 && value > RHYTHM_NOTE_SPEED_MAX) {
    wrapped = RHYTHM_NOTE_SPEED_MAX;
  }
  return Number(wrapped.toFixed(2));
}

type PercentStepperProps = {
  title: string;
  value: number;
  min: number;
  max: number;
  smallStep: number;
  largeStep: number;
  onStep: (delta: number) => void;
};

function normalizeOptionDraft(value: EditorOptionSettings): EditorOptionSettings {
  return {
    ...value,
    clickEffectEnabled: typeof value.clickEffectEnabled === "boolean" ? value.clickEffectEnabled : true,
    habahiro: typeof value.habahiro === "boolean" ? value.habahiro : false,
    exGarupaEnabled: typeof value.exGarupaEnabled === "boolean" ? value.exGarupaEnabled : true,
    mirrorEnabled: typeof value.mirrorEnabled === "boolean" ? value.mirrorEnabled : false,
    spRhythmNoteEnabled:
      typeof value.spRhythmNoteEnabled === "boolean" ? value.spRhythmNoteEnabled : true,
  };
}

function PercentStepper(props: PercentStepperProps) {
  const { title, value, min, max, smallStep, largeStep, onStep } = props;
  const rounded = Math.round(value);
  const canDown = rounded > min;
  const canUp = rounded < max;

  return (
    <div className="setting-block">
      <span className="setting-title-strip">{title}</span>
      <div className="inline-stepper inline-stepper-extended">
        <button
          type="button"
          className="stepper-btn"
          disabled={!canDown}
          onClick={() => onStep(-largeStep)}
          title={`步退 ${largeStep}%`}
        >
          <StepperIcon type="left" />
        </button>
        <button
          type="button"
          className="stepper-btn"
          disabled={!canDown}
          onClick={() => onStep(-smallStep)}
          title={`步退 ${smallStep}%`}
        >
          <StepperIcon type="minus" />
        </button>
        <input
          type="text"
          className="stepper-input"
          value={`${rounded}%`}
          readOnly
          tabIndex={-1}
        />
        <button
          type="button"
          className="stepper-btn"
          disabled={!canUp}
          onClick={() => onStep(smallStep)}
          title={`步进 ${smallStep}%`}
        >
          <StepperIcon type="plus" />
        </button>
        <button
          type="button"
          className="stepper-btn"
          disabled={!canUp}
          onClick={() => onStep(largeStep)}
          title={`步进 ${largeStep}%`}
        >
          <StepperIcon type="right" />
        </button>
      </div>
    </div>
  );
}

export function AppSettingsModal({
  open,
  onClose,
  windowPresetId,
  playbackWindowPresetId,
  playbackFps,
  playbackMvMode,
  playbackMvAlphaPercent,
  windowPresets,
  onWindowPresetIdChange,
  onPlaybackWindowPresetIdChange,
  onPlaybackFpsChange,
  onPlaybackMvModeChange,
  onPlaybackMvAlphaPercentChange,
  onApplyWindowPreset,
  optionSettings,
  onApplyOptionSettings,
}: AppSettingsModalProps) {
  const [childPage, setChildPage] = useState<SettingsChildPage | null>(null);
  const [draftOptionSettings, setDraftOptionSettings] = useState<EditorOptionSettings>(
    normalizeOptionDraft(optionSettings),
  );

  useEffect(() => {
    if (open) {
      setChildPage(null);
      setDraftOptionSettings(normalizeOptionDraft(optionSettings));
      return;
    }
    setChildPage(null);
  }, [open, optionSettings]);

  const currentPresetIndex = useMemo(
    () => Math.max(0, windowPresets.findIndex((preset) => preset.id === windowPresetId)),
    [windowPresetId, windowPresets],
  );
  const currentPresetLabel = windowPresets[currentPresetIndex]?.label ?? "";
  const canStepPresetDown = currentPresetIndex > 0;
  const canStepPresetUp = currentPresetIndex >= 0 && currentPresetIndex < windowPresets.length - 1;

  const currentPlaybackPresetIndex = useMemo(
    () => Math.max(0, windowPresets.findIndex((preset) => preset.id === playbackWindowPresetId)),
    [playbackWindowPresetId, windowPresets],
  );
  const currentPlaybackPresetLabel = windowPresets[currentPlaybackPresetIndex]?.label ?? "";
  const canStepPlaybackPresetDown = currentPlaybackPresetIndex > 0;
  const canStepPlaybackPresetUp =
    currentPlaybackPresetIndex >= 0 && currentPlaybackPresetIndex < windowPresets.length - 1;
  const resolvedPlaybackFps = playbackFps === 120 ? 120 : 60;
  const resolvedPlaybackMvAlphaPercent = Math.max(
    PLAYBACK_MV_ALPHA_MIN,
    Math.min(PLAYBACK_MV_ALPHA_MAX, Math.round(playbackMvAlphaPercent / PLAYBACK_MV_ALPHA_STEP) * PLAYBACK_MV_ALPHA_STEP),
  );
  const canStepPlaybackMvAlphaDown = resolvedPlaybackMvAlphaPercent > PLAYBACK_MV_ALPHA_MIN;
  const canStepPlaybackMvAlphaUp = resolvedPlaybackMvAlphaPercent < PLAYBACK_MV_ALPHA_MAX;
  const stepWindowPreset = (delta: number) => {
    if (windowPresets.length === 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(windowPresets.length - 1, currentPresetIndex + delta));
    const nextPreset = windowPresets[nextIndex];
    if (!nextPreset) {
      return;
    }
    onWindowPresetIdChange(nextPreset.id);
  };

  const stepPlaybackWindowPreset = (delta: number) => {
    if (windowPresets.length === 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(windowPresets.length - 1, currentPlaybackPresetIndex + delta));
    const nextPreset = windowPresets[nextIndex];
    if (!nextPreset) {
      return;
    }
    onPlaybackWindowPresetIdChange(nextPreset.id);
  };

  const stepOptionPercent = (
    key: PercentKey,
    delta: number,
    min: number,
    max: number,
  ) => {
    setDraftOptionSettings((previous) => ({
      ...previous,
      [key]: Math.max(min, Math.min(max, previous[key] + delta)),
    }));
  };

  const applyDisplaySettings = () => {
    onApplyWindowPreset();
    setChildPage(null);
  };

  const applyOptionSettings = async () => {
    const result = await onApplyOptionSettings(draftOptionSettings);
    if (result === false) {
      return;
    }
    setChildPage(null);
  };
  const rhythmNoteSpeed = normalizeRhythmNoteSpeed(draftOptionSettings.rhythmNoteSpeed);
  const canStepRhythmNoteSpeedDown = true;
  const canStepRhythmNoteSpeedUp = true;
  const stepRhythmNoteSpeed = (delta: number) => {
    setDraftOptionSettings((previous) => ({
      ...previous,
      rhythmNoteSpeed: wrapRhythmNoteSpeed(previous.rhythmNoteSpeed + delta),
    }));
  };

  return (
    <>
      <StandardModal
        open={open}
        title="目录"
        cardClassName="app-settings-modal"
        footerClassName="app-settings-display-actions"
        onClose={onClose}
      >
        <div className="app-settings-menu-grid">
          <button
            type="button"
            className="command-text-button settings-secondary-button app-settings-menu-button"
            onClick={() => setChildPage("display")}
            title="显示"
          >
            <img src={displayIcon} alt="" aria-hidden="true" className="command-text-icon" />
            <span className="command-text-label">显示</span>
          </button>
          <button
            type="button"
            className="command-text-button settings-secondary-button app-settings-menu-button"
            onClick={() => setChildPage("options")}
            title="选项"
          >
            <img src={optionsIcon} alt="" aria-hidden="true" className="command-text-icon" />
            <span className="command-text-label">选项</span>
          </button>
        </div>
      </StandardModal>

      <StandardValueModal
        value={childPage}
        title={(renderedChildPage) => renderedChildPage === "display" ? "显示" : "选项"}
        cardClassName="app-settings-modal"
        hideCloseAction
      >
        {(renderedChildPage) => (
          <>
          {renderedChildPage === "display" && (
            <>
              <div className="app-settings-page-shell">
                <div className="app-settings-group-list">
                  <section className="app-settings-group">
                    <SettingPrimaryTitle text="编辑器" />
                    <div className="app-settings-group-grid app-settings-group-grid-single">
                      <div className="setting-block">
                        <span className="setting-title-strip">分辨率</span>
                        <div className="inline-stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepPresetDown}
                            onClick={() => stepWindowPreset(-1)}
                          >
                            <StepperIcon type="left" />
                          </button>
                          <input
                            type="text"
                            className="stepper-input"
                            value={currentPresetLabel}
                            readOnly
                            tabIndex={-1}
                          />
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepPresetUp}
                            onClick={() => stepWindowPreset(1)}
                          >
                            <StepperIcon type="right" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="app-settings-group">
                    <SettingPrimaryTitle text="播放" />
                    <div className="app-settings-group-grid">
                      <div className="setting-block">
                        <span className="setting-title-strip">分辨率</span>
                        <div className="inline-stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepPlaybackPresetDown}
                            onClick={() => stepPlaybackWindowPreset(-1)}
                          >
                            <StepperIcon type="left" />
                          </button>
                          <input
                            type="text"
                            className="stepper-input"
                            value={currentPlaybackPresetLabel}
                            readOnly
                            tabIndex={-1}
                          />
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepPlaybackPresetUp}
                            onClick={() => stepPlaybackWindowPreset(1)}
                          >
                            <StepperIcon type="right" />
                          </button>
                        </div>
                      </div>

                      <div className="setting-block app-settings-fps-block">
                        <span className="setting-title-strip">帧率</span>
                        <div className="binary-choice-group" role="radiogroup" aria-label="播放帧率">
                          <button
                            type="button"
                            className={`binary-choice ${resolvedPlaybackFps === 120 ? "active" : ""}`}
                            onClick={() => onPlaybackFpsChange(120)}
                            aria-pressed={resolvedPlaybackFps === 120}
                          >
                            <span className="choice-dot" />
                            <span className="btn-content">120FPS</span>
                          </button>
                          <button
                            type="button"
                            className={`binary-choice ${resolvedPlaybackFps === 60 ? "active" : ""}`}
                            onClick={() => onPlaybackFpsChange(60)}
                            aria-pressed={resolvedPlaybackFps === 60}
                          >
                            <span className="choice-dot" />
                            <span className="btn-content">60FPS</span>
                          </button>
                        </div>
                      </div>

                      <div className="app-settings-mv-row">
                        <div className="setting-block">
                          <span className="setting-title-strip">MV演出模式</span>
                          <div className="binary-choice-group" role="radiogroup" aria-label="MV 演出模式">
                            <button
                              type="button"
                              className={`binary-choice ${playbackMvMode ? "active" : ""}`}
                              onClick={() => onPlaybackMvModeChange(true)}
                              aria-pressed={playbackMvMode}
                            >
                              <span className="choice-dot" />
                              <span className="btn-content">开</span>
                            </button>
                            <button
                              type="button"
                              className={`binary-choice ${!playbackMvMode ? "active" : ""}`}
                              onClick={() => onPlaybackMvModeChange(false)}
                              aria-pressed={!playbackMvMode}
                            >
                              <span className="choice-dot" />
                              <span className="btn-content">关</span>
                            </button>
                          </div>
                        </div>

                        <div className="setting-block">
                          <span className="setting-title-strip">MV演出模式透明度</span>
                          <div className="inline-stepper inline-stepper-compact">
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={!canStepPlaybackMvAlphaDown}
                              onClick={() =>
                                onPlaybackMvAlphaPercentChange(
                                  Math.max(
                                    PLAYBACK_MV_ALPHA_MIN,
                                    resolvedPlaybackMvAlphaPercent - PLAYBACK_MV_ALPHA_STEP,
                                  ),
                                )}
                              title={`步退 ${PLAYBACK_MV_ALPHA_STEP}%`}
                            >
                              <StepperIcon type="minus" />
                            </button>
                            <input
                              type="text"
                              className="stepper-input rhythm-note-speed-input"
                              value={`${resolvedPlaybackMvAlphaPercent}%`}
                              readOnly
                              tabIndex={-1}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={!canStepPlaybackMvAlphaUp}
                              onClick={() =>
                                onPlaybackMvAlphaPercentChange(
                                  Math.min(
                                    PLAYBACK_MV_ALPHA_MAX,
                                    resolvedPlaybackMvAlphaPercent + PLAYBACK_MV_ALPHA_STEP,
                                  ),
                                )}
                              title={`步进 ${PLAYBACK_MV_ALPHA_STEP}%`}
                            >
                              <StepperIcon type="plus" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="modal-actions is-centered app-settings-display-actions">
                <button
                  type="button"
                  className="app-settings-apply-button"
                  onClick={applyDisplaySettings}
                >
                  <span className="btn-content">应用</span>
                </button>
                <button
                  type="button"
                  className="app-settings-back-button"
                  onClick={() => setChildPage(null)}
                >
                  <span className="btn-content">返回</span>
                </button>
              </div>
            </>
          )}

          {renderedChildPage === "options" && (
            <>
              <div className="app-settings-page-shell">
                <div className="app-settings-group-list">
                  <section className="app-settings-group">
                    <SettingPrimaryTitle text="演出选项" />
                    <div className="app-settings-group-grid">
                      <div className="setting-block app-settings-rhythm-speed-block">
                        <span className="setting-title-strip">节奏图示速度</span>
                        <div className="inline-stepper inline-stepper-hepta">
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedDown}
                            onClick={() => stepRhythmNoteSpeed(-0.5)}
                            title="步退 0.5"
                          >
                            <StepperIcon type="leftDouble" />
                          </button>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedDown}
                            onClick={() => stepRhythmNoteSpeed(-0.1)}
                            title="步退 0.1"
                          >
                            <StepperIcon type="left" />
                          </button>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedDown}
                            onClick={() => stepRhythmNoteSpeed(-0.01)}
                            title="步退 0.01"
                          >
                            <StepperIcon type="minus" />
                          </button>
                          <input
                            type="text"
                            className="stepper-input rhythm-note-speed-input"
                            value={formatRhythmNoteSpeed(rhythmNoteSpeed)}
                            readOnly
                            tabIndex={-1}
                          />
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedUp}
                            onClick={() => stepRhythmNoteSpeed(0.01)}
                            title="步进 0.01"
                          >
                            <StepperIcon type="plus" />
                          </button>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedUp}
                            onClick={() => stepRhythmNoteSpeed(0.1)}
                            title="步进 0.1"
                          >
                            <StepperIcon type="right" />
                          </button>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={!canStepRhythmNoteSpeedUp}
                            onClick={() => stepRhythmNoteSpeed(0.5)}
                            title="步进 0.5"
                          >
                            <StepperIcon type="rightDouble" />
                          </button>
                        </div>
                      </div>

                      <PercentStepper
                        title="节奏图示大小"
                        value={draftOptionSettings.rhythmNoteSizePercent}
                        min={10}
                        max={200}
                        smallStep={10}
                        largeStep={50}
                        onStep={(delta) => stepOptionPercent("rhythmNoteSizePercent", delta, 10, 200)}
                      />

                      <PercentStepper
                        title="长压线亮度"
                        value={draftOptionSettings.longLineBrightnessPercent}
                        min={10}
                        max={100}
                        smallStep={10}
                        largeStep={20}
                        onStep={(delta) => stepOptionPercent("longLineBrightnessPercent", delta, 10, 100)}
                      />

                      <div className="setting-block">
                        <span className="setting-title-strip">点击特效</span>
                        <div className="binary-choice-group">
                          <button
                            type="button"
                            className={`binary-choice ${draftOptionSettings.clickEffectEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, clickEffectEnabled: true }))}
                            aria-pressed={draftOptionSettings.clickEffectEnabled}
                          >
                            <span className="choice-dot" />
                            <span>开</span>
                          </button>
                          <button
                            type="button"
                            className={`binary-choice ${!draftOptionSettings.clickEffectEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, clickEffectEnabled: false }))}
                            aria-pressed={!draftOptionSettings.clickEffectEnabled}
                          >
                            <span className="choice-dot" />
                            <span>关</span>
                          </button>
                        </div>
                      </div>

                      <div className="setting-block">
                        <span className="setting-title-strip">镜像</span>
                        <div className="binary-choice-group">
                          <button
                            type="button"
                            className={`binary-choice ${draftOptionSettings.mirrorEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, mirrorEnabled: true }))}
                            aria-pressed={draftOptionSettings.mirrorEnabled}
                          >
                            <span className="choice-dot" />
                            <span>开</span>
                          </button>
                          <button
                            type="button"
                            className={`binary-choice ${!draftOptionSettings.mirrorEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, mirrorEnabled: false }))}
                            aria-pressed={!draftOptionSettings.mirrorEnabled}
                          >
                            <span className="choice-dot" />
                            <span>关</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="app-settings-group">
                    <SettingPrimaryTitle text="谱面选项" />
                    <div className="app-settings-group-grid">
                      <div className="setting-block">
                        <span className="setting-title-strip">同时点击线</span>
                        <div className="binary-choice-group">
                          <button
                            type="button"
                            className={`binary-choice ${draftOptionSettings.simultaneousLineEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, simultaneousLineEnabled: true }))}
                            aria-pressed={draftOptionSettings.simultaneousLineEnabled}
                          >
                            <span className="choice-dot" />
                            <span>开</span>
                          </button>
                          <button
                            type="button"
                            className={`binary-choice ${!draftOptionSettings.simultaneousLineEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, simultaneousLineEnabled: false }))}
                            aria-pressed={!draftOptionSettings.simultaneousLineEnabled}
                          >
                            <span className="choice-dot" />
                            <span>关</span>
                          </button>
                        </div>
                      </div>

                      <div className="setting-block">
                        <span className="setting-title-strip">色觉辅助</span>
                        <div className="binary-choice-group">
                          <button
                            type="button"
                            className={`binary-choice ${draftOptionSettings.colorAssistEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, colorAssistEnabled: true }))}
                            aria-pressed={draftOptionSettings.colorAssistEnabled}
                          >
                            <span className="choice-dot" />
                            <span>开</span>
                          </button>
                          <button
                            type="button"
                            className={`binary-choice ${!draftOptionSettings.colorAssistEnabled ? "active" : ""}`}
                            onClick={() =>
                              setDraftOptionSettings((previous) => ({ ...previous, colorAssistEnabled: false }))}
                            aria-pressed={!draftOptionSettings.colorAssistEnabled}
                          >
                            <span className="choice-dot" />
                            <span>关</span>
                          </button>
                        </div>
                      </div>

                      <PercentStepper
                        title="节奏图示SE音量"
                        value={draftOptionSettings.noteSeVolumePercent}
                        min={0}
                        max={100}
                        smallStep={5}
                        largeStep={10}
                        onStep={(delta) => stepOptionPercent("noteSeVolumePercent", delta, 0, 100)}
                      />

                      <PercentStepper
                        title="纵向比例"
                        value={draftOptionSettings.verticalScalePercent}
                        min={50}
                        max={200}
                        smallStep={10}
                        largeStep={50}
                        onStep={(delta) => stepOptionPercent("verticalScalePercent", delta, 50, 200)}
                      />

                      <div className="setting-block app-option-mode-block">
                        <span className="setting-title-strip">模式</span>
                        <div className="app-option-mode-group">
                          <label className="ui-checkbox">
                            <input
                              type="checkbox"
                              className="ui-checkbox-input"
                              checked={draftOptionSettings.spRhythmNoteEnabled}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setDraftOptionSettings((previous) => ({
                                  ...previous,
                                  spRhythmNoteEnabled: checked,
                                }));
                              }}
                            />
                            <span className="ui-checkbox-box" aria-hidden="true" />
                            <span className="ui-checkbox-text">SP节奏图示</span>
                          </label>

                          <label className="ui-checkbox">
                            <input
                              type="checkbox"
                              className="ui-checkbox-input"
                              checked={draftOptionSettings.habahiro}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setDraftOptionSettings((previous) => ({
                                  ...previous,
                                  habahiro: checked,
                                }));
                              }}
                            />
                            <span className="ui-checkbox-box" aria-hidden="true" />
                            <span className="ui-checkbox-text">2026愚人节</span>
                          </label>

                          <label className="ui-checkbox">
                            <input
                              type="checkbox"
                              className="ui-checkbox-input"
                              checked={draftOptionSettings.exGarupaEnabled}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setDraftOptionSettings((previous) => ({
                                  ...previous,
                                  exGarupaEnabled: checked,
                                }));
                              }}
                            />
                            <span className="ui-checkbox-box" aria-hidden="true" />
                            <span className="ui-checkbox-text">ExGarupa</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
              <div className="modal-actions is-centered app-settings-display-actions">
                <button
                  type="button"
                  className="app-settings-apply-button"
                  onClick={applyOptionSettings}
                >
                  <span className="btn-content">应用</span>
                </button>
                <button
                  type="button"
                  className="app-settings-back-button"
                  onClick={() => setChildPage(null)}
                >
                  <span className="btn-content">返回</span>
                </button>
              </div>
            </>
          )}
          </>
        )}
      </StandardValueModal>
    </>
  );
}

