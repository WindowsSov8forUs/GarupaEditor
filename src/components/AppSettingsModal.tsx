import { useEffect, useMemo, useState } from "react";
import { type EditorOptionSettings } from "../chartCore";
import displayIcon from "../assets/icons/display.svg";
import optionsIcon from "../assets/icons/settings.svg";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { StepperIcon } from "./StepperIcon";
import { useModalTransition } from "./useModalTransition";

type AppSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  windowPresetId: string;
  windowPresets: Array<{ id: string; label: string }>;
  onWindowPresetIdChange: (value: string) => void;
  onApplyWindowPreset: () => void;
  optionSettings: EditorOptionSettings;
  onApplyOptionSettings: (value: EditorOptionSettings) => boolean | void | Promise<boolean | void>;
};

type SettingsPage = "menu" | "display" | "options";
type PercentKey =
  | "rhythmNoteSizePercent"
  | "longLineBrightnessPercent"
  | "noteSeVolumePercent"
  | "verticalScalePercent";

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
    habahiro: typeof value.habahiro === "boolean" ? value.habahiro : false,
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
  windowPresets,
  onWindowPresetIdChange,
  onApplyWindowPreset,
  optionSettings,
  onApplyOptionSettings,
}: AppSettingsModalProps) {
  const { mounted, phase } = useModalTransition(open);
  const [page, setPage] = useState<SettingsPage>("menu");
  const [draftOptionSettings, setDraftOptionSettings] = useState<EditorOptionSettings>(
    normalizeOptionDraft(optionSettings),
  );

  useEffect(() => {
    if (open) {
      setPage("menu");
      setDraftOptionSettings(normalizeOptionDraft(optionSettings));
    }
  }, [open, optionSettings]);

  const currentPresetIndex = useMemo(
    () => Math.max(0, windowPresets.findIndex((preset) => preset.id === windowPresetId)),
    [windowPresetId, windowPresets],
  );
  const currentPresetLabel = windowPresets[currentPresetIndex]?.label ?? "";
  const canStepPresetDown = currentPresetIndex > 0;
  const canStepPresetUp = currentPresetIndex >= 0 && currentPresetIndex < windowPresets.length - 1;
  const pageTitle = page === "menu" ? "目录" : page === "display" ? "显示" : "选项";

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
    setPage("menu");
  };

  const applyOptionSettings = async () => {
    const result = await onApplyOptionSettings(draftOptionSettings);
    if (result === false) {
      return;
    }
    setPage("menu");
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className={`modal-mask modal-transition-mask ${phase === "enter" ? "is-enter" : "is-exit"}`} onClick={onClose}>
      <section
        className={`modal-card app-settings-modal modal-transition-card ${phase === "enter" ? "is-enter" : "is-exit"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">{pageTitle}</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="icon-button" onClick={onClose}>
              <span className="btn-content">×</span>
            </button>
          </div>
        </header>

        <div className="modal-body">
          {page === "menu" && (
            <div className="app-settings-menu-grid">
              <button
                type="button"
                className="command-text-button settings-secondary-button app-settings-menu-button"
                onClick={() => setPage("display")}
                title="显示"
              >
                <img src={displayIcon} alt="" aria-hidden="true" className="command-text-icon" />
                <span className="command-text-label">显示</span>
              </button>
              <button
                type="button"
                className="command-text-button settings-secondary-button app-settings-menu-button"
                onClick={() => setPage("options")}
                title="选项"
              >
                <img src={optionsIcon} alt="" aria-hidden="true" className="command-text-icon" />
                <span className="command-text-label">选项</span>
              </button>
            </div>
          )}

          {page === "display" && (
            <>
              <div className="modal-grid app-settings-detail-grid">
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
                  onClick={() => setPage("menu")}
                >
                  <span className="btn-content">返回</span>
                </button>
              </div>
            </>
          )}

          {page === "options" && (
            <>
              <div className="modal-grid">
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
                  </div>
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
                  onClick={() => setPage("menu")}
                >
                  <span className="btn-content">返回</span>
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

