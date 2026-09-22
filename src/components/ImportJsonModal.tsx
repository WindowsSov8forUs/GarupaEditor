import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { useEffect, useState } from "react";
import { OriginalFormTitle, OriginalFormSubtitle, OriginalFormInput, OriginalDifficultySelect, OriginalFormButton as OriginalButton } from "./OriginalFormParts";

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
  const [tab, setTab] = useState<ImportModalTab>(level === "bestdori-v2" ? "official" : "chart-code");

  useEffect(() => {
    if (open) {
      setTab(level === "bestdori-v2" ? "official" : "chart-code");
    }
  }, [open, level]);


  const applyHandler = tab === "official"
    ? onApplyOfficialChart
    : tab === "community"
      ? onApplyCommunityChart
      : onApplyChartJson;

  return (
    <OriginalTransferDialog open={open} title="导入谱面" onClose={onClose}
      tabs={[
              { key: "chart-code", label: "导入谱面代码" },
              { key: "official", label: "导入官方谱面" },
              { key: "community", label: "导入社区谱面" },
            ]}
      selected={tab} onSelect={key => setTab(key as ImportModalTab)}>
        <div className="transfer-body">
          {tab === "chart-code" && (
            <div className="transfer-page">
              <OriginalFormTitle text="谱面代码" />
              <div className="export-json-field">
                <OriginalFormInput multiline
                  aria-label="谱面 JSON 代码"
                  value={chartJsonText}
                  onChange={(event) => onChartJsonTextChange(event.currentTarget.value)}
                  readOnly={false}
                  spellCheck={false}
                />
              </div>

              <OriginalFormTitle text="加载谱面代码" followedBySubtitle />
              <div className="import-json-load-grid">
                <div className="setting-block">
                  <OriginalFormSubtitle text="加载谱面文件" />
                  <div className="original-file-select">
                    <OriginalFormInput readOnly aria-label="谱面文件路径" title={importJsonSelectedPath} value={importJsonSelectedPath || "未选择文件"} />
                    <OriginalButton size="small" onClick={onImportJsonFile} aria-label="选择谱面文件">选择文件</OriginalButton>
                  </div>
                </div>

                <div className="setting-block">
                  <OriginalFormSubtitle text="加载 Bestdori V2 代码" />
                  <div className="original-file-select">
                    <OriginalFormInput readOnly aria-label="Bestdori V2 文件路径" title={importBestdoriV2SelectedPath} value={importBestdoriV2SelectedPath || "未选择文件"} />
                    <OriginalButton size="small" onClick={onImportBestdoriV2File} aria-label="选择Bestdori V2 文件">选择文件</OriginalButton>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "official" && (
            <div className="transfer-page">
              <OriginalFormTitle text="官方谱面" followedBySubtitle />
              <div className="import-official-fields">
                <div className="setting-block">
                  <OriginalFormSubtitle text="ID" />
                  <OriginalFormInput
                    type="text"
                    aria-label="官方歌曲 ID"
                    value={officialChartId}
                    onChange={(event) => onOfficialChartIdChange(event.currentTarget.value)}
                  />
                </div>
                <div className="setting-block">
                  <OriginalFormSubtitle text="难度" />
                  <OriginalDifficultySelect value={officialChartDifficulty} onChange={onOfficialChartDifficultyChange} />
                </div>
              </div>
            </div>
          )}

          {tab === "community" && (
            <div className="transfer-page">
              <OriginalFormTitle text="Bestdori 社区谱面" followedBySubtitle />
              <div className="import-json-load-grid">
                <div className="setting-block">
                  <OriginalFormSubtitle text="谱面 ID" />
                  <OriginalFormInput
                    type="text"
                    aria-label="社区谱面 ID"
                    value={communityPostId}
                    onChange={(event) => onCommunityPostIdChange(event.currentTarget.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {(
            <div className="transfer-actions">
              <OriginalButton tone="pink" type="button" onClick={applyHandler}>
                <span className="btn-content">导入</span>
              </OriginalButton>
              <OriginalButton tone="gray" type="button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </OriginalButton>
            </div>
          )}
        </div>
    </OriginalTransferDialog>
  );
}

