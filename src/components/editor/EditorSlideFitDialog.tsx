import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  EASINGS,
  normalizeSlideFitSettings,
  SLIDE_FIT_ATTACHMENTS,
  SLIDE_FIT_FUNCTIONS,
  slideFitFunctionOf,
  PIXEL_ATTACHMENT,
  ROUND_TRIP_ATTACHMENT,
  SAWTOOTH_ATTACHMENT,
  type PixelParams,
  type SlideFitSettings,
  type ZigzagParams,
} from "../../app/slideFitShapes";
import {
  ORIGINAL_FORM_STEPPER_BOTTOM_OVERHANG,
  ORIGINAL_FORM_SUBTITLE_HEIGHT,
  OriginalFormButton,
  OriginalFormStepper,
  OriginalFormSubtitle,
  OriginalStepStepper,
} from "../OriginalFormParts";
import {
  OriginalRadioOptions,
  ORIGINAL_RADIO_HEADING_TO_FIRST_ROW,
  ORIGINAL_RADIO_HEIGHT_MARGIN,
  ORIGINAL_RADIO_WIDTH_MARGIN,
} from "../OriginalRadioOptions";
import { OriginalScrollPopupList } from "../OriginalScrollPopupList";
import { OriginalTabSwitch } from "../OriginalTabSwitch";
import { OriginalTransferDialog } from "../OriginalTransferDialog";
import { SlideFitTrackPreview } from "./SlideFitTrackPreview";

const SHAPE_OPTIONS = SLIDE_FIT_FUNCTIONS.map(fit => ({ key: fit.id, label: fit.label }));
const ATTACHMENT_OPTIONS = SLIDE_FIT_ATTACHMENTS.map(attachment => ({ key: attachment.id, label: attachment.label }));
/** The attachments taking an amplitude and a direction. */
const ZIGZAG_ATTACHMENT_IDS: readonly string[] = [SAWTOOTH_ATTACHMENT.id, ROUND_TRIP_ATTACHMENT.id];
const DIRECTIONS: readonly ZigzagParams["direction"][] = ["left", "right"];
const DIRECTION_LABELS = ["左", "右"];
const PIXEL_STARTS: readonly PixelParams["start"][] = ["break", "hold"];
const PIXEL_START_LABELS = ["隔断", "不隔断"];
const EASING_LABELS = ["缓入", "缓出", "缓入缓出", "缓出缓入"];
/** The settings column is as wide as the easing radios, all four in one row at the original radio spacing. */
const CONTROLS_WIDTH = EASING_LABELS.length * ORIGINAL_RADIO_WIDTH_MARGIN;
type SettingsTab = "shape" | "extra";
/** The settings' pages: the fit function (形状) and the attachment (附加). */
const SETTINGS_TABS: ReadonlyArray<{ key: SettingsTab; label: string }> = [
  { key: "shape", label: "形状" },
  { key: "extra", label: "附加" },
];
/** The preview, a crop of the board: a Slide running one beat from its head to its tail two lanes left of it. */
const PREVIEW_GRID = { lanes: -2, beats: 1 };
const PREVIEW_BOX = { width: 340, height: 440 };

/**
 * The curve tool's setting: the shape function applied to a Slide segment, as its fit function (形状: which one, its
 * easing and precision) combined with its attachment (附加: which one and its parameters); see slideFitShapes.ts. Opened by the curve tool's button; 保存 keeps the
 * setting (the tool stays armed), 取消 drops it.
 */
export function EditorSlideFitDialog({ open, settings, onSave, onCancel, preview }: {
  open: boolean;
  settings: SlideFitSettings;
  onSave(settings: SlideFitSettings): void;
  onCancel(): void;
  /** What the preview draws the board crop with (see SlideFitTrackPreview). */
  preview: { slideNote?: string; longLine?: string; curveSlideLine?: string; trackLane?: string | null; boardLaneWidth: number };
}) {
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState<SettingsTab>("shape");
  // The amplitude being typed; null shows the setting's.
  const [amplitudeText, setAmplitudeText] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setDraft(settings); setTab("shape"); setAmplitudeText(null); }
    // Only on opening: the draft is the setting being edited until 保存.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const patchFit = (next: Partial<SlideFitSettings["fit"]>) =>
    setDraft(current => normalizeSlideFitSettings({ ...current, fit: { ...current.fit, ...next } }));
  /** Another attachment keeps the parameters set so far: each reads those it takes (the sawtooth and the round trip
   * share theirs) and takes its defaults for the rest. */
  const selectAttachment = (id: string) => { setAmplitudeText(null); setDraft(current => ({ ...current, attachment: { ...current.attachment, id } })); };
  const patchAttachmentParams = (next: Record<string, unknown>) => setDraft(current => ({ ...current,
    attachment: { ...current.attachment, params: { ...(current.attachment.params as object | undefined), ...next } } }));

  const { fit } = draft;
  const fitFunction = slideFitFunctionOf(fit.id);
  const precisions = fitFunction.precisions;
  const precisionIndex = precisions.indexOf(fit.precision);
  const { attachment } = draft;
  const zigzag = SAWTOOTH_ATTACHMENT.normalize(attachment.params);
  const pixel = PIXEL_ATTACHMENT.normalize(attachment.params);
  const amplitudeShown = amplitudeText ?? String(zigzag.amplitude);
  const sectionGap = ORIGINAL_RADIO_HEADING_TO_FIRST_ROW - ORIGINAL_FORM_SUBTITLE_HEIGHT / 2 - ORIGINAL_RADIO_HEIGHT_MARGIN / 2;

  return createPortal(<OriginalTransferDialog open={open} title="形状预设" fitContent onClose={onCancel}>
    <div className="transfer-body editor-slide-fit-dialog-body">
      <div className="transfer-page editor-slide-fit-dialog">
        {/* Left: the preview of the preset being edited; right: its settings. */}
        <div className="editor-slide-fit-dialog-preview" style={PREVIEW_BOX}>
          <SlideFitTrackPreview settings={draft} grid={PREVIEW_GRID} box={PREVIEW_BOX} {...preview} />
        </div>
        <div className="editor-slide-fit-dialog-controls" style={{ width: CONTROLS_WIDTH }}>
          <OriginalTabSwitch<SettingsTab> ariaLabel="形状预设分栏" tabs={SETTINGS_TABS} selected={tab} onSelect={setTab} width={CONTROLS_WIDTH} />
          {tab === "shape" ? <>
            <div className="editor-slide-fit-dialog-section">
              <OriginalFormSubtitle text="预设" />
              <OriginalScrollPopupList label="预设" options={SHAPE_OPTIONS} value={fit.id}
                onChange={key => patchFit({ id: key })} />
            </div>
            <div className="editor-slide-fit-dialog-section">
              <OriginalFormSubtitle text="缓动" />
              <div style={{ marginTop: sectionGap }}>
                <OriginalRadioOptions ariaLabel="缓动方向" options={EASING_LABELS} columns={EASING_LABELS.length}
                  disabled={!fitFunction.easing} value={fit.easing === null ? -1 : EASINGS.indexOf(fit.easing)}
                  onChange={index => patchFit({ easing: EASINGS[index]! })} />
              </div>
            </div>
            <div className="editor-slide-fit-dialog-section">
              <OriginalFormSubtitle text="精度" />
              <OriginalStepStepper label="精度" text={fit.precision}
                canDecrease={precisionIndex > 0} canIncrease={precisionIndex >= 0 && precisionIndex < precisions.length - 1}
                onDecrease={() => patchFit({ precision: precisions[precisionIndex - 1]! })}
                onIncrease={() => patchFit({ precision: precisions[precisionIndex + 1]! })} />
            </div>
          </> : <>
            <div className="editor-slide-fit-dialog-section">
              <OriginalFormSubtitle text="附加" />
              <OriginalScrollPopupList label="附加" options={ATTACHMENT_OPTIONS} value={attachment.id}
                onChange={key => { if (key !== attachment.id) selectAttachment(key); }} />
            </div>
            {/* Each attachment's own parameters. */}
            {ZIGZAG_ATTACHMENT_IDS.includes(attachment.id) && <>
              {/* Spaced from its visible buttons, not its hit areas below them. */}
              <div style={{ marginBottom: -ORIGINAL_FORM_STEPPER_BOTTOM_OVERHANG }}>
              <OriginalFormStepper title="振幅" centered steps={[0.1, 0.5, 1]} value={zigzag.amplitude}
                minimum={0} maximum={Number.MAX_SAFE_INTEGER}
                onChange={value => { setAmplitudeText(null); patchAttachmentParams({ amplitude: value }); }}
                editable={{ value: amplitudeShown, onChange: next => {
                  if (!/^\d*\.?\d*$/.test(next)) return;
                  setAmplitudeText(next);
                  const value = Number(next);
                  if (next !== "" && next !== "." && Number.isFinite(value)) patchAttachmentParams({ amplitude: value });
                } }} />
              </div>
              <div className="editor-slide-fit-dialog-section">
                <OriginalFormSubtitle text="方向" />
                <div style={{ marginTop: sectionGap }}>
                  <OriginalRadioOptions ariaLabel="方向" options={DIRECTION_LABELS} columns={DIRECTION_LABELS.length}
                    value={DIRECTIONS.indexOf(zigzag.direction)}
                    onChange={index => patchAttachmentParams({ direction: DIRECTIONS[index]! })} />
                </div>
              </div>
            </>}
            {attachment.id === PIXEL_ATTACHMENT.id && <div className="editor-slide-fit-dialog-section">
              <OriginalFormSubtitle text="起点" />
              <div style={{ marginTop: sectionGap }}>
                <OriginalRadioOptions ariaLabel="起点" options={PIXEL_START_LABELS} columns={PIXEL_START_LABELS.length}
                  value={PIXEL_STARTS.indexOf(pixel.start)}
                  onChange={index => patchAttachmentParams({ start: PIXEL_STARTS[index]! })} />
              </div>
            </div>}
          </>}
        </div>
      </div>
      <div className="transfer-actions">
        <OriginalFormButton onClick={onCancel}>取消</OriginalFormButton>
        <OriginalFormButton tone="pink" onClick={() => onSave(draft)}>保存</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>, document.body);
}
