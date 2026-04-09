import { useEffect, useState } from "react";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { useModalTransition } from "./useModalTransition";

export type OverlayDialogTone = "info" | "warning" | "error";

export type OverlayDialogState = {
  tone: OverlayDialogTone;
  message: string;
};

type OverlayDialogModalProps = {
  dialog: OverlayDialogState | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const OVERLAY_DIALOG_TITLES: Record<OverlayDialogTone, string> = {
  info: "提示",
  warning: "警告",
  error: "错误",
};

export function OverlayDialogModal({
  dialog,
  onConfirm,
  onCancel,
}: OverlayDialogModalProps) {
  const { mounted, phase } = useModalTransition(dialog !== null);
  const [lastDialog, setLastDialog] = useState<OverlayDialogState | null>(dialog);

  useEffect(() => {
    if (dialog) {
      setLastDialog(dialog);
    }
  }, [dialog]);

  if (!mounted || !lastDialog) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";
  const showCancel = lastDialog.tone === "warning";

  return (
    <div className={`overlay-dialog-mask modal-transition-mask ${transitionClassName}`}>
      <section
        className={`modal-card overlay-dialog-card modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">{OVERLAY_DIALOG_TITLES[lastDialog.tone]}</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
        </header>

        <div className="modal-body">
          <p className="overlay-dialog-message">{lastDialog.message}</p>
          <div className="modal-actions is-centered overlay-dialog-actions">
            <button type="button" className="app-settings-apply-button overlay-dialog-confirm-button" onClick={onConfirm}>
              <span className="btn-content">确定</span>
            </button>
            {showCancel && (
              <button type="button" className="app-settings-back-button overlay-dialog-cancel-button" onClick={onCancel}>
                <span className="btn-content">返回</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
