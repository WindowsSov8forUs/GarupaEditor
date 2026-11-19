import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  GLOBAL_TIMING_GROUP_ID,
  nextTimingGroupId,
  sortTimingGroupIds,
  timingGroupDisplayName,
  type ChartTimingGroupId,
} from "../../chartCore";
import {
  ORIGINAL_FORM_BUTTON_WIDTH,
  ORIGINAL_FORM_STEPPER_WIDTH,
  OriginalFormButton,
  OriginalFormStepper,
  TRANSFER_PAGE_PADDING_X,
} from "../OriginalFormParts";
import { ORIGINAL_SCROLL_POPUP_WIDTH, OriginalScrollPopupList, originalScrollPopupBox } from "../OriginalScrollPopupList";
import { OriginalTransferDialog } from "../OriginalTransferDialog";

/** Space between the picker and the stepper, as between the dialog's sections. */
const GROUP_PICKER_GAP = 16;
/** Both SV dialogs are as wide as the three-button row (as the BPM dialogs are). */
const ROW_WIDTH = 3 * ORIGINAL_FORM_BUTTON_WIDTH;
/**
 * The timing group picker takes what the stepper leaves of the row, so the 「SV 值」 subtitle, the picker with the
 * stepper, and the buttons are all as wide as the row. Its layout box is its hit area, wider than its sprite.
 */
const GROUP_PICKER_WIDTH = (() => {
  const box = ROW_WIDTH - 2 * TRANSFER_PAGE_PADDING_X - GROUP_PICKER_GAP - ORIGINAL_FORM_STEPPER_WIDTH;
  return box - (originalScrollPopupBox().width - ORIGINAL_SCROLL_POPUP_WIDTH);
})();

/** Stands for "a new timing group" in the picker until the dialog is confirmed. */
const NEW_TIMING_GROUP = "\u0000new";

function finiteNumber(text: string, fallback: number) {
  const value = Number(text);
  return text.trim().length > 0 && Number.isFinite(value) ? value : fallback;
}

/**
 * The SV dialog, after the BPM dialog. Without `onDelete` it is the SV tool's setting (取消 / 确定); with it, an SV
 * event's editor (取消 / 删除 / 确定). A narrow original scroll popup list left of the value, under the same
 * 「SV 值」 subtitle, picks the timing group (#0 is the global group); its last item adds the next free #n, created
 * only when the dialog is confirmed.
 */
export function EditorSvDialog({ open, title, value, timingGroup, timingGroups, onClose, onConfirm, onAddTimingGroup, onDelete }: {
  open: boolean;
  title: string;
  value: number;
  timingGroup: ChartTimingGroupId;
  timingGroups: readonly ChartTimingGroupId[];
  onClose(): void;
  onConfirm(value: number, timingGroup: ChartTimingGroupId): void;
  /** Adds the next numbered group and returns its id (null when it cannot). */
  onAddTimingGroup(): ChartTimingGroupId | null;
  onDelete?: () => void;
}) {
  // The typed text and the picked group; null shows what the dialog was opened with.
  const [draft, setDraft] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(null);
      setGroup(null);
    }
  }, [open]);
  const text = draft ?? String(Number(value.toFixed(6)));
  // The current group is listed even when it holds nothing yet (an emptied group is cleaned up; placing recreates it).
  const groups = sortTimingGroupIds([GLOBAL_TIMING_GROUP_ID, ...timingGroups, timingGroup]);
  const newGroupId = nextTimingGroupId(groups);
  const options = [
    ...groups.map(id => ({ key: id, label: timingGroupDisplayName(id) })),
    { key: NEW_TIMING_GROUP, label: `新建 ${newGroupId}` },
  ];
  const picked = group ?? timingGroup;
  const confirm = () => {
    const target = picked === NEW_TIMING_GROUP ? onAddTimingGroup() : picked;
    if (target !== null) onConfirm(finiteNumber(text, value), target);
    onClose();
  };
  return createPortal(<OriginalTransferDialog open={open} title={title} fitContent onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page">
        {/* The subtitle spans the picker and the stepper, which fill the row together. */}
        <div className="editor-sv-dialog-value">
        <OriginalFormStepper title="SV 值" centered steps={[0.1, 1, 10]} value={finiteNumber(text, value)}
          minimum={-Number.MAX_SAFE_INTEGER} maximum={Number.MAX_SAFE_INTEGER}
          onChange={next => setDraft(String(next))}
          editable={{ value: text, onChange: next => { if (/^-?\d*\.?\d*$/.test(next)) setDraft(next); } }}
          leading={{ ...originalScrollPopupBox(GROUP_PICKER_WIDTH), gap: GROUP_PICKER_GAP,
            node: <OriginalScrollPopupList label="Timing Group" width={GROUP_PICKER_WIDTH} options={options} value={picked}
              onChange={setGroup} /> }} />
        </div>
      </div>
      <div className="transfer-actions" style={{ minWidth: ROW_WIDTH }}>
        <OriginalFormButton onClick={onClose}>取消</OriginalFormButton>
        {onDelete && <OriginalFormButton onClick={() => { onDelete(); onClose(); }}>删除</OriginalFormButton>}
        <OriginalFormButton tone="pink" onClick={confirm}>确定</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>, document.body);
}
