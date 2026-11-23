import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { OriginalFormButton, OriginalFormNote, OriginalFormSubtitle, OriginalStepStepper, ORIGINAL_FORM_BUTTON_WIDTH,
  ORIGINAL_STEP_STEPPER_WIDTH } from "../OriginalFormParts";
import { OriginalRadioOptions } from "../OriginalRadioOptions";
import { OriginalScrollPopupList, originalScrollPopupBox, ORIGINAL_SCROLL_POPUP_WIDTH } from "../OriginalScrollPopupList";
import { GLOBAL_TIMING_GROUP_ID, nextTimingGroupId, sortTimingGroupIds, timingGroupDisplayName } from "../../chartCore";
import { OriginalTransferDialog } from "../OriginalTransferDialog";

/** The selected notes' properties as the dialog shows them (see ChartEditorController's selectedNoteProperties). */
export type SelectedNoteProperties = {
  count: number;
  beat: number;
  lane: number;
  widthMode: "directional" | "rhythm" | null;
  width: number;
  direction: "left" | "right" | null;
  /** Their timing group; null when they are in different ones. */
  timingGroup: string | null;
};

export type NotePropertiesEdit = { beat: number; lane: number; width?: number; direction?: "left" | "right";
  timingGroup?: string };

const DIRECTIONS = ["left", "right"] as const;
/** The time group list's key for a new group. */
const NEW_TIMING_GROUP = "\u0000new";
const DIRECTION_LABELS = ["左", "右"];

/** Typed number text, or `fallback` while it is not a number. */
function numberOf(text: string, fallback: number) {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
}
const shown = (value: number) => String(Number(value.toFixed(6)));

/** The dialog's two columns: each as wide as the button row's half, at least the stepper; design px. */
const COLUMN_GAP = 24;
const COLUMN_WIDTH = Math.max(ORIGINAL_STEP_STEPPER_WIDTH, ORIGINAL_FORM_BUTTON_WIDTH - COLUMN_GAP / 2);
/** Space between a field's subtitle and its control. */
const FIELD_GAP = 10;
/** The list's sprite width that makes its row (wider than the sprite) fill `width`. */
const pickerWidthFor = (width: number) => width - (originalScrollPopupBox().width - ORIGINAL_SCROLL_POPUP_WIDTH);
const numericText = /^-?\d*\.?\d*$/;

/**
 * The note property editor (the left column's 编辑): the selected notes' beat, lane, width and direction. With several
 * notes selected, beat and lane are the earliest and leftmost note's, and the whole selection moves with them; width
 * and direction go to every note that has one.
 */
export function EditorNotePropertiesDialog({ open, properties, laneRange, timingGroups, onAddTimingGroup, onClose,
  onSave }: {
  open: boolean;
  properties: SelectedNoteProperties | null;
  laneRange: { min: number; max: number };
  /** The chart's timing groups, for moving the notes to another (ExGarupa only; absent hides it). */
  timingGroups?: readonly string[];
  /** Makes the next timing group (新建 #n), returning its id. */
  onAddTimingGroup?: () => string | null;
  onClose(): void;
  onSave(edit: NotePropertiesEdit): void;
}) {
  const [beat, setBeat] = useState("");
  const [lane, setLane] = useState("");
  const [width, setWidth] = useState("");
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  // "" while notes in different groups are selected and none is picked.
  const [group, setGroup] = useState("");
  // Each opening starts from the selection as it is.
  useEffect(() => {
    if (!open || !properties) return;
    setBeat(shown(properties.beat));
    setLane(shown(properties.lane));
    setWidth(shown(properties.width));
    setDirection(properties.direction);
    setGroup(properties.timingGroup ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!properties) return null;
  const beatValue = Math.max(0, numberOf(beat, properties.beat));
  const laneValue = numberOf(lane, properties.lane);
  const widthValue = Math.round(numberOf(width, properties.width));
  const widthMax = properties.widthMode === "directional" ? laneRange.max - laneRange.min + 1 : 7;
  const groupIds = sortTimingGroupIds([GLOBAL_TIMING_GROUP_ID, ...(timingGroups ?? [])]);
  const save = () => {
    const targetGroup = group === NEW_TIMING_GROUP ? onAddTimingGroup?.() ?? "" : group;
    onSave({
      beat: beatValue,
      lane: Math.min(laneRange.max, Math.max(laneRange.min, laneValue)),
      ...(properties.widthMode ? { width: Math.min(widthMax, Math.max(1, widthValue)) } : {}),
      ...(properties.direction && direction ? { direction } : {}),
      ...(timingGroups && targetGroup !== "" ? { timingGroup: targetGroup } : {}),
    });
    onClose();
  };
  // The fields this selection has, in order: two columns, the last spanning both when they are odd in number.
  const fields: { title: string; node: (width: number) => ReactNode }[] = [
    { title: "拍", node: () => <OriginalStepStepper label="拍" text={beat} editable={{ value: beat,
      onChange: next => { if (numericText.test(next) && !next.startsWith("-")) setBeat(next); } }}
      canDecrease={beatValue > 0} canIncrease onDecrease={() => setBeat(shown(Math.max(0, beatValue - 1)))}
      onIncrease={() => setBeat(shown(beatValue + 1))} /> },
    { title: "轨道", node: () => <OriginalStepStepper label="轨道" text={lane} editable={{ value: lane,
      onChange: next => { if (numericText.test(next)) setLane(next); } }}
      canDecrease={laneValue - 1 >= laneRange.min} canIncrease={laneValue + 1 <= laneRange.max}
      onDecrease={() => setLane(shown(laneValue - 1))} onIncrease={() => setLane(shown(laneValue + 1))} /> },
    ...(properties.widthMode ? [{ title: "宽度", node: () => <OriginalStepStepper label="宽度" text={width}
      editable={{ value: width, onChange: next => { if (/^\d*$/.test(next)) setWidth(next); } }}
      canDecrease={widthValue > 1} canIncrease={widthValue < widthMax}
      onDecrease={() => setWidth(shown(widthValue - 1))} onIncrease={() => setWidth(shown(widthValue + 1))} /> }] : []),
    ...(properties.direction ? [{ title: "方向", node: () => <OriginalRadioOptions ariaLabel="方向"
      options={DIRECTION_LABELS} columns={2} value={direction ? DIRECTIONS.indexOf(direction) : -1}
      onChange={index => setDirection(DIRECTIONS[index]!)} /> }] : []),
    ...(timingGroups ? [{ title: "时间组", node: (cellWidth: number) => <OriginalScrollPopupList label="时间组"
      width={pickerWidthFor(cellWidth)} value={group} onChange={setGroup}
      options={[...groupIds.map(id => ({ key: id, label: timingGroupDisplayName(id) })),
        ...(onAddTimingGroup ? [{ key: NEW_TIMING_GROUP, label: `新建 ${nextTimingGroupId(groupIds)}` }] : [])]} /> }] : []),
  ];
  return createPortal(<OriginalTransferDialog open={open} title="音符属性" fitContent onClose={onClose}>
    <div className="transfer-body">
      {/* The steppers' hit areas reach past their buttons; they must not make the page scroll. */}
      <div className="transfer-page" style={{ overflow: "visible" }}>
        {properties.count > 1 && <OriginalFormNote lines={1}
          text={`已选中 ${properties.count} 个音符：拍与轨道按最早、最左的音符整体移动。`} />}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${COLUMN_WIDTH}px)`, columnGap: COLUMN_GAP,
          rowGap: "var(--transfer-section-gap)" }}>
          {fields.map((field, index) => {
            const span = index === fields.length - 1 && fields.length % 2 === 1;
            const cellWidth = span ? 2 * COLUMN_WIDTH + COLUMN_GAP : COLUMN_WIDTH;
            return <div key={field.title} style={{ gridColumn: span ? "1 / -1" : undefined, display: "flex",
              flexDirection: "column", alignItems: "center", gap: FIELD_GAP }}>
              <div style={{ alignSelf: "stretch" }}><OriginalFormSubtitle text={field.title} /></div>
              {field.node(cellWidth)}
            </div>;
          })}
        </div>
      </div>
      <div className="transfer-actions" style={{ minWidth: 2 * ORIGINAL_FORM_BUTTON_WIDTH }}>
        <OriginalFormButton onClick={onClose}>取消</OriginalFormButton>
        <OriginalFormButton tone="pink" onClick={save}>保存</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>, document.body);
}
