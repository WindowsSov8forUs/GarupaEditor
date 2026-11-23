import { useState } from "react";
import { createPortal } from "react-dom";
import { OriginalTransferDialog } from "../OriginalTransferDialog";
import { OriginalFormButton, OriginalFormInput, OriginalFormNote, OriginalFormSubtitle, ORIGINAL_FORM_SUBTITLE_HEIGHT } from "../OriginalFormParts";
import { OriginalRadioOptions, ORIGINAL_RADIO_HEADING_TO_FIRST_ROW, ORIGINAL_RADIO_HEIGHT_MARGIN, ORIGINAL_RADIO_WIDTH_MARGIN } from "../OriginalRadioOptions";
import { SidebarActionButton } from "./SidebarPanel";

/** Beat divisions most charts switch between: straight 1/2/4/8/16 and triplet 3/6/12 subdivisions of a beat. */
const PRESET_DIVISIONS = [1, 2, 3, 4, 6, 8, 12, 16] as const;
const PRESET_COLUMNS = 4;
const PRESET_LABELS = PRESET_DIVISIONS.map(division => `1/${division}`);
const CUSTOM_LABELS = ["1/"];
/** Spacing of the single custom radio: just its check circle and "1/", so the input follows the label directly. */
const CUSTOM_RADIO_WIDTH = 76;
/** Custom input: a third of what the preset grid's width leaves after the custom radio, in design px. */
const CUSTOM_INPUT_WIDTH = (PRESET_COLUMNS * ORIGINAL_RADIO_WIDTH_MARGIN - CUSTOM_RADIO_WIDTH) / 3;

/** Custom division text, kept for this run of the app only (not saved to settings or the chart). */
let customDivisionText = "";

function parseDivision(text: string): number | null {
  const value = Number(text);
  return /^\+?\d+$/.test(text.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Beat division (the editor's 1/N grid) as a gray action button of the left column; it opens the setting dialog. */
export function EditorBeatDivisionButton({ value, onSave, width, label }: {
  value: number; onSave(value: number): void;
  /** Button width in design px. */
  width: number;
  /** The button's text (default "1/N 分度"). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number | "custom">(value);
  const [customText, setCustomText] = useState(customDivisionText);
  const show = () => {
    const preset = (PRESET_DIVISIONS as readonly number[]).includes(value);
    // A current value outside the presets is shown as the custom value it came from.
    if (!preset) customDivisionText = String(value);
    setCustomText(customDivisionText);
    setChoice(preset ? value : "custom");
    setOpen(true);
  };
  const customValue = parseDivision(customText);
  const next = choice === "custom" ? customValue : choice;
  return <>
    <SidebarActionButton label={label ?? `1/${value} 分度`} ariaLabel={`整拍分度值 1/${value}`} width={width} onClick={show} />
    {createPortal(<OriginalTransferDialog open={open} title="设置整拍分度值" fitContent onClose={() => setOpen(false)}>
      <div className="transfer-body">
        <div className="transfer-page">
          <OriginalFormNote text="设置整拍的分度值，以四分音符为单位。" lines={1} />
          <div style={{ display: "flex", flexDirection: "column" }}>
          <OriginalFormSubtitle text="整拍分度值" />
          {/* As in the original filter: one radio row from the heading's centre to the first row's centre. */}
          <div style={{ display: "flex", flexDirection: "column",
            marginTop: ORIGINAL_RADIO_HEADING_TO_FIRST_ROW - ORIGINAL_FORM_SUBTITLE_HEIGHT / 2 - ORIGINAL_RADIO_HEIGHT_MARGIN / 2 }}>
            <OriginalRadioOptions ariaLabel="整拍分度值预设" options={PRESET_LABELS} columns={PRESET_COLUMNS}
              value={choice === "custom" ? -1 : PRESET_DIVISIONS.indexOf(choice as typeof PRESET_DIVISIONS[number])}
              onChange={index => setChoice(PRESET_DIVISIONS[index]!)} />
            {/* The custom value applies only while this option is selected; typing alone does not select it. */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <OriginalRadioOptions ariaLabel="自定义整拍分度值选项" options={CUSTOM_LABELS} columns={1}
                widthMargin={CUSTOM_RADIO_WIDTH} value={choice === "custom" ? 0 : -1} onChange={() => setChoice("custom")} />
              <div style={{ flex: "0 0 auto", width: CUSTOM_INPUT_WIDTH }}>
                <OriginalFormInput type="text" inputMode="numeric" aria-label="自定义整拍分度值"
                  value={customText} onChange={event => {
                    const text = event.target.value;
                    if (!/^\+?\d*$/.test(text)) return;
                    customDivisionText = text;
                    setCustomText(text);
                  }} />
              </div>
            </div>
          </div>
          </div>
        </div>
        <div className="transfer-actions">
          <OriginalFormButton onClick={() => setOpen(false)}>取消</OriginalFormButton>
          <OriginalFormButton tone="pink" disabled={next === null}
            onClick={() => { if (next !== null) { onSave(next); setOpen(false); } }}>保存</OriginalFormButton>
        </div>
      </div>
    </OriginalTransferDialog>, document.body)}
  </>;
}
