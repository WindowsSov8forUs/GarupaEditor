import { StandardValueModal } from "./StandardModal";

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
  return (
    <StandardValueModal
      value={dialog}
      title={(renderedDialog) => OVERLAY_DIALOG_TITLES[renderedDialog.tone]}
      maskClassName="overlay-dialog-mask"
      cardClassName="overlay-dialog-card"
      hideCloseAction
    >
      {(renderedDialog) => {
        const showCancel = renderedDialog.tone === "warning";
        return (
          <>
            <p className="overlay-dialog-message">{renderedDialog.message}</p>
            <div className="modal-actions is-centered overlay-dialog-actions">
              <button type="button" className="app-settings-apply-button overlay-dialog-confirm-button" onClick={onConfirm}>
                <span className="btn-content">确定</span>
              </button>
              {showCancel && (
                <button type="button" className="app-settings-back-button overlay-dialog-cancel-button" onClick={onCancel}>
                  <span className="btn-content">关闭</span>
                </button>
              )}
            </div>
          </>
        );
      }}
    </StandardValueModal>
  );
}
