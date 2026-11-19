import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ORIGINAL_FORM_BUTTON_WIDTH, OriginalFormButton, OriginalFormStepper } from "../OriginalFormParts";
import { OriginalTransferDialog } from "../OriginalTransferDialog";

function positiveNumber(text: string, fallback: number) {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The BPM value dialog. Without `onDelete` it is the BPM tool's setting (取消 / 确定); with it, a BPM event's editor
 * (取消 / 删除 / 确定). `deleteDisabled` keeps the 删除 button but disables it (the Beat 0 base BPM).
 */
export function EditorBpmDialog({ open, title, value, onClose, onConfirm, onDelete, deleteDisabled = false }: {
  open: boolean;
  title: string;
  value: number;
  onClose(): void;
  onConfirm(value: number): void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}) {
  // The typed text; null shows the value the dialog was opened with.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (open) setDraft(null);
  }, [open]);
  const text = draft ?? String(Number(value.toFixed(3)));
  return createPortal(<OriginalTransferDialog open={open} title={title} fitContent onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page">
        <OriginalFormStepper title="BPM 值" centered value={positiveNumber(text, value)} minimum={1}
          maximum={Number.MAX_SAFE_INTEGER} onChange={next => setDraft(String(next))}
          editable={{ value: text, onChange: next => { if (/^\d*\.?\d*$/.test(next)) setDraft(next); } }} />
      </div>
      {/* Both BPM dialogs are as wide as the editor's three-button row, so the setting and the editor match. */}
      <div className="transfer-actions" style={{ minWidth: 3 * ORIGINAL_FORM_BUTTON_WIDTH }}>
        <OriginalFormButton onClick={onClose}>取消</OriginalFormButton>
        {onDelete && <OriginalFormButton disabled={deleteDisabled} onClick={() => { onDelete(); onClose(); }}>删除</OriginalFormButton>}
        <OriginalFormButton tone="pink" onClick={() => { onConfirm(positiveNumber(text, value)); onClose(); }}>确定</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>, document.body);
}
