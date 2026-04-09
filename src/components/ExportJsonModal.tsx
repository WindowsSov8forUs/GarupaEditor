import optionsTitleIcon from "../assets/icons/options-title.svg";
import { useModalTransition } from "./useModalTransition";

type ExportJsonModalProps = {
  open: boolean;
  jsonText: string;
  onClose: () => void;
  onSaveAs: () => void;
  onExportBestdoriV2: () => void;
};

export function ExportJsonModal({
  open,
  jsonText,
  onClose,
  onSaveAs,
  onExportBestdoriV2,
}: ExportJsonModalProps) {
  const { mounted, phase } = useModalTransition(open);

  if (!mounted) {
    return null;
  }

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
              <h3 className="modal-titleline-text">导出谱面</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <span className="btn-content">×</span>
          </button>
        </header>

        <div className="modal-body">
          <div className="export-json-field">
            <textarea
              className="export-json-textarea"
              value={jsonText}
              readOnly
              spellCheck={false}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onSaveAs}>
              <span className="btn-content">另存为 .json</span>
            </button>
            <button type="button" onClick={onExportBestdoriV2}>
              <span className="btn-content">导出为 Bestdori V2</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
