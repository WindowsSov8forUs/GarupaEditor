import { useEffect, useState } from "react";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { FileTriggerInput } from "./FileTriggerInput";
import { SettingPrimaryTitle } from "./SettingPrimaryTitle";
import { StepperIcon } from "./StepperIcon";
import { TopTabs } from "./TopTabs";
import { useModalTransition } from "./useModalTransition";

type ImportModalLevel = "chart" | "bestdori-v2";
const OFFICIAL_DIFFICULTIES = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;
type OfficialChartDifficulty = (typeof OFFICIAL_DIFFICULTIES)[number];

type ImportJsonModalProps = {
  open: boolean;
  level: ImportModalLevel;
  chartJsonText: string;
  officialChartId: string;
  officialChartDifficulty: OfficialChartDifficulty;
  communityPostId: string;
  importJsonSelectedPath: string;
  importBestdoriV2SelectedPath: string;
  onChartJsonTextChange: (value: string) => void;
  onOfficialChartIdChange: (value: string) => void;
  onOfficialChartDifficultyChange: (value: OfficialChartDifficulty) => void;
  onCommunityPostIdChange: (value: string) => void;
  onApplyChartJson: () => void;
  onApplyOfficialChart: () => void;
  onApplyCommunityChart: () => void;
  onImportJsonFile: () => void;
  onImportBestdoriV2File: () => void;
  onClose: () => void;
};

type ImportModalTab = "chart-code" | "official" | "community";

export function ImportJsonModal(props: ImportJsonModalProps) {
  const {
    open,
    level,
    chartJsonText,
    officialChartId,
    officialChartDifficulty,
    communityPostId,
    importJsonSelectedPath,
    importBestdoriV2SelectedPath,
    onChartJsonTextChange,
    onOfficialChartIdChange,
    onOfficialChartDifficultyChange,
    onCommunityPostIdChange,
    onApplyChartJson,
    onApplyOfficialChart,
    onApplyCommunityChart,
    onImportJsonFile,
    onImportBestdoriV2File,
    onClose,
  } = props;
  const { mounted, phase } = useModalTransition(open);
  const [tab, setTab] = useState<ImportModalTab>(level === "bestdori-v2" ? "official" : "chart-code");
  const officialDifficultyIndex = Math.max(0, OFFICIAL_DIFFICULTIES.indexOf(officialChartDifficulty));

  useEffect(() => {
    if (open) {
      setTab(level === "bestdori-v2" ? "official" : "chart-code");
    }
  }, [open, level]);

  if (!mounted) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";
  const showApplyAction = tab === "chart-code" || tab === "official" || tab === "community";
  const applyHandler = tab === "official"
    ? onApplyOfficialChart
    : tab === "community"
      ? onApplyCommunityChart
      : onApplyChartJson;

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} onClick={onClose}>
      <section
        className={`modal-card export-json-modal import-json-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">导入谱面</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="icon-button" onClick={onClose} title="关闭">
              <span className="btn-content">×</span>
            </button>
          </div>
        </header>

        <div className="modal-body">
          <TopTabs
            className="import-json-tabs"
            ariaLabel="导入谱面分组"
            tabs={[
              { key: "chart-code", label: "导入谱面代码" },
              { key: "official", label: "导入官方谱面" },
              { key: "community", label: "导入社区谱面" },
            ]}
            activeKey={tab}
            onChange={(key) => setTab(key as ImportModalTab)}
          />

          {tab === "chart-code" && (
            <div className="import-json-page-shell import-json-page-shell-scrollable">
              <SettingPrimaryTitle text="谱面代码" />
              <div className="export-json-field">
                <textarea
                  className="export-json-textarea"
                  value={chartJsonText}
                  onChange={(event) => onChartJsonTextChange(event.currentTarget.value)}
                  readOnly={false}
                  spellCheck={false}
                />
              </div>

              <SettingPrimaryTitle text="加载谱面代码" />
              <div className="import-json-load-grid">
                <div className="setting-block">
                  <span className="setting-title-strip">加载谱面文件</span>
                  <FileTriggerInput
                    value={importJsonSelectedPath}
                    placeholder="选择谱面文件"
                    onTrigger={onImportJsonFile}
                    ariaLabel="加载谱面文件"
                  />
                </div>

                <div className="setting-block">
                  <span className="setting-title-strip">加载 Bestdori V2 代码</span>
                  <FileTriggerInput
                    value={importBestdoriV2SelectedPath}
                    placeholder="选择 Bestdori V2 文件"
                    onTrigger={onImportBestdoriV2File}
                    ariaLabel="加载 Bestdori V2 代码"
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "official" && (
            <div className="import-json-page-shell import-json-page-shell-static">
              <SettingPrimaryTitle text="官方谱面" />
              <div className="import-json-load-grid">
                <div className="setting-block">
                  <span className="setting-title-strip">ID</span>
                  <input
                    type="text"
                    className="value-input metadata-left-input"
                    value={officialChartId}
                    onChange={(event) => onOfficialChartIdChange(event.currentTarget.value)}
                  />
                </div>
                <div className="setting-block">
                  <span className="setting-title-strip">难度</span>
                  <div className="inline-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => {
                        const nextIndex =
                          (officialDifficultyIndex - 1 + OFFICIAL_DIFFICULTIES.length) % OFFICIAL_DIFFICULTIES.length;
                        onOfficialChartDifficultyChange(OFFICIAL_DIFFICULTIES[nextIndex]);
                      }}
                    >
                      <StepperIcon type="left" />
                    </button>
                    <input
                      type="text"
                      className="stepper-input"
                      value={OFFICIAL_DIFFICULTIES[officialDifficultyIndex]}
                      readOnly
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => {
                        const nextIndex = (officialDifficultyIndex + 1) % OFFICIAL_DIFFICULTIES.length;
                        onOfficialChartDifficultyChange(OFFICIAL_DIFFICULTIES[nextIndex]);
                      }}
                    >
                      <StepperIcon type="right" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "community" && (
            <div className="import-json-page-shell import-json-page-shell-static">
              <SettingPrimaryTitle text="Bestdori 社区谱面" />
              <div className="import-json-load-grid">
                <div className="setting-block">
                  <span className="setting-title-strip">谱面 ID</span>
                  <input
                    type="text"
                    className="value-input metadata-left-input"
                    value={communityPostId}
                    onChange={(event) => onCommunityPostIdChange(event.currentTarget.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {showApplyAction && (
            <div className="modal-actions is-centered app-settings-display-actions import-json-actions">
              <button type="button" className="app-settings-apply-button" onClick={applyHandler}>
                <span className="btn-content">应用</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

