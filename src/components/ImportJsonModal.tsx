import optionsTitleIcon from "../assets/icons/options-title.svg";
import { useModalTransition } from "./useModalTransition";

type ImportModalLevel = "chart" | "bestdori-v2";

type ImportJsonModalProps = {
  open: boolean;
  level: ImportModalLevel;
  chartJsonText: string;
  bestdoriJsonText: string;
  onChartJsonTextChange: (value: string) => void;
  onBestdoriJsonTextChange: (value: string) => void;
  onApplyChartJson: () => void;
  onApplyBestdoriV2: () => void;
  onImportJsonFile: () => void;
  onOpenBestdoriV2: () => void;
  onBackToChart: () => void;
  onClose: () => void;
};

export function ImportJsonModal({
  open,
  level,
  chartJsonText,
  bestdoriJsonText,
  onChartJsonTextChange,
  onBestdoriJsonTextChange,
  onApplyChartJson,
  onApplyBestdoriV2,
  onImportJsonFile,
  onOpenBestdoriV2,
  onBackToChart,
  onClose,
}: ImportJsonModalProps) {
  const { mounted, phase } = useModalTransition(open);

  if (!mounted) {
    return null;
  }

  const isBestdoriLevel = level === "bestdori-v2";
  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} onClick={onClose}>
      <section
        className={`modal-card export-json-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">{isBestdoriLevel ? "导入 Bestdori V2" : "导入谱面"}</h3>
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
          <div className="export-json-field">
            <textarea
              className="export-json-textarea"
              value={isBestdoriLevel ? bestdoriJsonText : chartJsonText}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                if (isBestdoriLevel) {
                  onBestdoriJsonTextChange(nextValue);
                  return;
                }
                onChartJsonTextChange(nextValue);
              }}
              readOnly={false}
              spellCheck={false}
            />
          </div>

          {!isBestdoriLevel && (
            <>
              <div className="modal-actions">
                <button type="button" onClick={onImportJsonFile}>
                  <span className="btn-content">导入 .json</span>
                </button>
                <button type="button" onClick={onOpenBestdoriV2}>
                  <span className="btn-content">导入 Bestdori V2</span>
                </button>
              </div>

              <div className="modal-actions is-centered app-settings-display-actions">
                <button type="button" className="app-settings-apply-button" onClick={onApplyChartJson}>
                  <span className="btn-content">应用</span>
                </button>
              </div>
            </>
          )}

          {isBestdoriLevel && (
            <div className="modal-actions is-centered app-settings-display-actions">
              <button type="button" className="app-settings-apply-button" onClick={onApplyBestdoriV2}>
                <span className="btn-content">应用</span>
              </button>
              <button type="button" className="app-settings-back-button" onClick={onBackToChart}>
                <span className="btn-content">返回</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
