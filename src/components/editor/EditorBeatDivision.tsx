import { useMemo, useState } from "react";
import profile from "../../data/originalMusicSelectionProfile.json";
import { OriginalPrefabModel, type OriginalPrefab } from "../originalPrefabModel";
import { OriginalPrefabView } from "../OriginalPrefabView";
import { createPortal } from "react-dom";
import { OriginalTransferDialog } from "../OriginalTransferDialog";
import { OriginalFormButton, OriginalFormNote, OriginalFormStepper } from "../OriginalFormParts";

function positiveInteger(text: string) {
  const value = Number(text);
  return /^\+?\d+$/.test(text.trim()) && Number.isSafeInteger(value) && value > 0 ? value : 1;
}
export function EditorBeatDivision({ value, onSave, scale, top, right }: {
  value: number; onSave(value: number): void; scale: number; top: number; right: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // Keep invalid/non-positive drafts intact; only Save applies the fallback to 1.
  const draftNumber = Number(draft);
  const stepValue = Number.isSafeInteger(draftNumber) ? draftNumber : 0;
  const model = useMemo(() => new OriginalPrefabModel(profile.prefabs.filterButton as unknown as OriginalPrefab, {
    nodes: { 81: { x: 0, y: 0 }, 68: { y: 88 } },
    components: { 359: { mText: `1/${value}` } },
  }), [value]);
  return <>
    <div style={{ position: "absolute", top, right, zIndex: 30,
      transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <OriginalPrefabView model={model} root={108} bindings={{ buttons: {
        386: { action: () => { setDraft(String(value)); setOpen(true); } },
      } }} />
    </div>
    {createPortal(<OriginalTransferDialog open={open} title="设置整拍分度值" fitContent onClose={() => setOpen(false)}>
      <div className="transfer-body">
        <div className="transfer-page">
          <OriginalFormNote text="设置整拍的分度值，以四分音符为单位。" />
          <OriginalFormStepper title="整拍分度值" value={stepValue} minimum={1}
            maximum={Number.MAX_SAFE_INTEGER} onChange={next => setDraft(String(next))}
            editable={{ value: draft, onChange: next => { if (/^[+-]?\d*$/.test(next)) setDraft(next); } }} />
        </div>
        <div className="transfer-actions">
          <OriginalFormButton onClick={() => setOpen(false)}>取消</OriginalFormButton>
          <OriginalFormButton tone="pink" onClick={() => { onSave(positiveInteger(draft)); setOpen(false); }}>保存</OriginalFormButton>
        </div>
      </div>
    </OriginalTransferDialog>, document.body)}
  </>;
}
