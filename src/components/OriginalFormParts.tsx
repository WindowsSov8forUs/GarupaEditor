import { Children, isValidElement, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalPrefabModel, ORIGINAL_PREFABS, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalSprite } from "./OriginalUi";
import { useOriginalSurface } from "./useOriginalSurface";
import { useOriginalFontRevision } from "./useOriginalFontRevision";
import { originalLabelBaseline, originalLabelFirstBaseline } from "./text/originalLabelMetrics";
import formProfile from "../data/originalFormProfile.json";
import "./OriginalFormParts.css";

const caption = ORIGINAL_PREFABS.optionpagecaption!;
const settingsLayout = new OriginalPrefabModel(ORIGINAL_PREFABS.livesettingstabpage!);
const captionToSubtitle = settingsLayout.transform(settingsLayout.components.get(516)!.node).y
  - settingsLayout.transform(settingsLayout.components.get(561)!.node).y;
const subtitleRowHeight = Math.max(44, settingsLayout.rect(settingsLayout.components.get(561)!).height);
/** Height of the OriginalFormSubtitle row, in design px; its bar is centred in it. */
export const ORIGINAL_FORM_SUBTITLE_HEIGHT = subtitleRowHeight;

function useFormWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const formPrefabs = formProfile.prefabs as unknown as Record<string, OriginalPrefab>;

const stepperSource = new OriginalPrefabModel(ORIGINAL_PREFABS.livesettingstabpage!);
const stepperRoot = stepperSource.nodeAt("HiSpeed");
const stepperNodes = stepperSource.prefab.nodes.filter(node => stepperSource.isWithin(node.id, stepperRoot.id))
  .map(node => node.id === stepperRoot.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const stepperPrefab = { ...stepperSource.prefab, nodes: stepperNodes,
  components: stepperSource.prefab.components.filter(component => stepperNodes.some(node => node.id === component.node)) };
const stepperLayout = new OriginalPrefabModel(stepperPrefab);
const stepperBody = stepperLayout.nodeAt("HiSpeed/Body");

/** The authored HiSpeed row, with integer steps and bounds supplied by the editor field. */
/** Width of the original stepper body (its buttons, value box and hit areas), whatever value it shows. */
export const ORIGINAL_FORM_STEPPER_WIDTH = (() => {
  const model = new OriginalPrefabModel(stepperPrefab);
  const boxes = [...model.components.values()].filter(component => model.isActive(component.node)
    && model.isWithin(component.node, stepperBody.id)
    && ["UISprite", "UILabel", "BoxCollider2D"].includes(component.kind)).map(component => model.rect(component));
  return Math.max(...boxes.map(box => box.x + box.width)) - Math.min(0, ...boxes.map(box => box.x));
})();
/**
 * How far OriginalFormStepper's box reaches below its visible buttons and value box: its height takes in the hit areas
 * and the value label's box, which reach lower. A layout that spaces from the visible stepper subtracts it.
 */
export const ORIGINAL_FORM_STEPPER_BOTTOM_OVERHANG = (() => {
  const model = new OriginalPrefabModel(stepperPrefab);
  const parts = [...model.components.values()].filter(component => model.isActive(component.node)
    && model.isWithin(component.node, stepperBody.id));
  const bottom = (kinds: readonly string[]) => Math.max(...parts.filter(component => kinds.includes(component.kind))
    .map(component => { const box = model.rect(component); return box.y + box.height; }));
  return bottom(["UISprite", "UILabel", "BoxCollider2D"]) - bottom(["UISprite"]);
})();
/** Horizontal padding of a transfer dialog page (`.transfer-page` in OriginalFormParts.css). */
export const TRANSFER_PAGE_PADDING_X = 12;

export function OriginalFormStepper({ title, value, minimum, maximum, onChange, editable, centered = false,
  steps = [1, 5, 10], leading }: {
  title: string; value: number; minimum: number; maximum: number; onChange(value: number): void;
  editable?: { value: string; onChange(value: string): void };
  /** Centres the stepper horizontally in its row; the subtitle stays at the start. */
  centered?: boolean;
  /** The amounts of the three button pairs, inner to outer (the original's ±1 / ±5 / ±10 by default). */
  steps?: readonly [number, number, number];
  /**
   * A control set left of the stepper, sharing its subtitle: it and the stepper form one group (centred together when
   * `centered`), and it is centred vertically on the value box.
   */
  leading?: { node: ReactNode; width: number; height: number; gap: number };
}) {
  const model = new OriginalPrefabModel(stepperPrefab, { components: {
    570: { mText: String(value) },
  } });
  const [small, middle, large] = steps;
  const buttons = Object.fromEntries([[466, -large], [545, -middle], [621, -small], [486, small], [628, middle], [648, large]]
    .map(([id, amount]) => [id, { label: `${title}${amount < 0 ? "减少" : "增加"}${Math.abs(amount)}`,
      disabled: amount < 0 ? value <= minimum : value >= maximum,
      // Rounded so decimal steps (0.1) do not accumulate binary error.
      action: () => onChange(Math.min(maximum, Math.max(minimum, Number((value + amount).toFixed(6))))) }]));
  const boxes = [...model.components.values()].filter(component => model.isActive(component.node)
    && model.isWithin(component.node, stepperBody.id)
    && ["UISprite", "UILabel", "BoxCollider2D"].includes(component.kind)).map(component => model.rect(component));
  const left = Math.min(0, ...boxes.map(box => box.x));
  const top = model.rect(model.components.get(574)!).y;
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  const label = model.components.get(570)!;
  const labelRect = model.rect(label);
  const leadingSpace = leading ? leading.width + leading.gap : 0;
  const groupWidth = leadingSpace + right - left;
  const groupLeft = centered ? `calc(50% - ${groupWidth / 2}px)` : "0px";
  return <div style={{ position: "relative", minWidth: groupWidth, height: bottom - top, flexShrink: 0, alignSelf: "stretch" }}>
    <OriginalFormSubtitle text={title} />
    {leading && <div style={{ position: "absolute", left: groupLeft, width: leading.width, height: leading.height,
      top: labelRect.y - top + labelRect.height / 2 - leading.height / 2 }}>{leading.node}</div>}
    <div className="original-prefab-origin"
      style={{ left: `calc(${groupLeft} + ${leadingSpace - left}px)`, top: -top }}>
      <OriginalPrefabView model={model} root={stepperBody.id} bindings={{ buttons,
        omit: editable ? new Set([570]) : undefined }} />
      {editable && <input type="text" inputMode="numeric" aria-label={title}
        className="original-stepper-editor" value={editable.value}
        onChange={event => editable.onChange(event.target.value)}
        style={{ left: labelRect.x, top: labelRect.y, width: labelRect.width, height: labelRect.height,
          fontSize: label.data.mFontSize, fontWeight: label.data.mFontStyle === 1 ? 700 : 400,
          letterSpacing: label.data.mSpacingX,
          color: `rgba(${label.data.mColor.r * 255},${label.data.mColor.g * 255},${label.data.mColor.b * 255},${label.data.mColor.a})`,
          zIndex: label.data.mDepth + 1 }} />}
    </div>
  </div>;
}

const stepperPlus = stepperLayout.nodeAt("HiSpeed/Body/SmallPlusButton");
const stepperMinus = stepperLayout.nodeAt("HiSpeed/Body/SmallMinusButton");
const stepperValue = stepperLayout.nodeAt("HiSpeed/Body/baseImage");
const stepperPlusButton = stepperLayout.componentAt(stepperPlus.id, "StarUIButton")!;
const stepperMinusButton = stepperLayout.componentAt(stepperMinus.id, "StarUIButton")!;
const stepperPlusSurface = stepperLayout.componentAt(stepperPlus.id, "UISprite")!;
const stepperMinusSurface = stepperLayout.componentAt(stepperMinus.id, "UISprite")!;
const stepperValueSurface = stepperLayout.componentAt(stepperValue.id, "UISprite")!;
const stepperValueText = stepperLayout.componentAt(stepperLayout.nodeAt("HiSpeed/Body/baseImage/valueText").id, "UILabel")!;

/**
 * The HiSpeed row's ±1 buttons and value field, stacked vertically: plus above the value, minus below.
 * `width` resizes the sliced value field and `gap` separates the parts, both in the row's design px.
 */
export function OriginalVerticalStepper({ title, text, width, gap, fontSize, canIncrease, canDecrease, onIncrease, onDecrease }: {
  title: string; text: string; width: number; gap: number;
  /** Value text size; defaults to the row's authored size. */
  fontSize?: number;
  canIncrease: boolean; canDecrease: boolean; onIncrease(): void; onDecrease(): void;
}) {
  const valueHeight = stepperValueSurface.data.mHeight as number;
  const offset = (height: number) => valueHeight / 2 + gap + height / 2;
  const model = useMemo(() => new OriginalPrefabModel(stepperPrefab, {
    nodes: {
      [stepperValue.id]: { x: 0, y: 0 },
      [stepperPlus.id]: { x: 0, y: offset(stepperPlusSurface.data.mHeight) },
      [stepperMinus.id]: { x: 0, y: -offset(stepperMinusSurface.data.mHeight) },
    },
    components: { [stepperValueSurface.id]: { mWidth: width },
      [stepperValueText.id]: { mText: text, mWidth: width, ...(fontSize === undefined ? {} : { mFontSize: fontSize }) } },
  }), [text, width, gap, fontSize]);
  const boxes = [stepperPlusSurface, stepperValueSurface, stepperMinusSurface]
    .map(component => model.rect(model.components.get(component.id)!));
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  const bindings = { buttons: {
    [stepperPlusButton.id]: { label: `${title}增加`, disabled: !canIncrease, action: onIncrease },
    [stepperMinusButton.id]: { label: `${title}减少`, disabled: !canDecrease, action: onDecrease },
  } };
  return <div role="group" aria-label={title} style={{ position: "relative", width: right - left, height: bottom - top }}>
    <div className="original-prefab-origin" style={{ left: -left, top: -top }}>
      {[stepperPlus, stepperValue, stepperMinus].map(node =>
        <OriginalPrefabView key={node.id} model={model} root={node.id} bindings={bindings} />)}
    </div>
  </div>;
}

/**
 * The HiSpeed row with only its ±1 buttons and the value field, in their authored horizontal places
 * (− [value] +). The caller decides what a step means and its bounds.
 */
export function OriginalStepStepper({ label, text, canIncrease, canDecrease, onIncrease, onDecrease, disabled = false }: {
  label: string; text: string; canIncrease: boolean; canDecrease: boolean; onIncrease(): void; onDecrease(): void;
  disabled?: boolean;
}) {
  const model = useMemo(() => new OriginalPrefabModel(stepperPrefab, {
    nodes: Object.fromEntries(["SuperMinusButton", "MinusButton", "PlusButton", "SuperPlusButton", "DefaultButton"]
      .map(name => [stepperLayout.nodeAt(`HiSpeed/Body/${name}`).id, { active: false }])),
    components: { [stepperValueText.id]: { mText: text } },
  }), [text]);
  const boxes = [stepperMinusSurface, stepperValueSurface, stepperPlusSurface].map(component => model.rect(component));
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  return <div role="group" aria-label={label} style={{ position: "relative", width: right - left, height: bottom - top }}>
    <div className="original-prefab-origin" style={{ left: -left, top: -top }}>
      <OriginalPrefabView model={model} root={stepperBody.id} bindings={{ buttons: {
        [stepperPlusButton.id]: { label: `${label}增加`, disabled: disabled || !canIncrease, action: onIncrease },
        [stepperMinusButton.id]: { label: `${label}减少`, disabled: disabled || !canDecrease, action: onDecrease },
      } }} />
    </div>
  </div>;
}

export interface OriginalInputSource {
  model: OriginalPrefabModel;
  background: number;
  label: number;
  marker: number;
  input: number;
}
const defaultInputSource: OriginalInputSource = {
  model: new OriginalPrefabModel(formPrefabs.takeoversettingdialog!),
  background: 134, label: 101, marker: 125, input: 114,
};
type FieldProps = { multiline?: boolean; source?: OriginalInputSource;
  /** A multiline field this tall in place of its rows' height (filling a measured area). */
  fillHeight?: number } & InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>;
const inputColor = (color: { r: number; g: number; b: number; a: number }) =>
  `rgba(${color.r * 255},${color.g * 255},${color.b * 255},${color.a})`;
/** Original sliced surface and label geometry, with host caret/selection/IME.
 * Multiline rows are editor content sizing, not a copied original UIInput mode. */
export function OriginalFormInput({ multiline = false, rows = 6, className = "", style, source = defaultInputSource,
  onFocus, onBlur, placeholder, fillHeight, ...props }: FieldProps) {
  const fieldSource = source.model;
  const fieldBackground = fieldSource.components.get(source.background)!;
  const fieldLabel = fieldSource.components.get(source.label)!;
  const fieldMarker = fieldSource.components.get(source.marker)!;
  const backgroundRect = fieldSource.rect(fieldBackground);
  const labelRect = fieldSource.rect(fieldLabel);
  const markerRect = fieldSource.rect(fieldMarker);
  const { ref, width } = useFormWidth();
  const [focused, setFocused] = useState(false);
  const fontRevision = useOriginalFontRevision();
  const baselineProbe = useRef<HTMLSpanElement>(null);
  const fontMetrics = useRef<CanvasRenderingContext2D | null>(null);
  const label = fieldLabel.data;
  const lineHeight = label.mFontSize + label.mSpacingY;
  const left = labelRect.x - backgroundRect.x;
  const [textTop, setTextTop] = useState(left);
  useLayoutEffect(() => {
    const probe = baselineProbe.current, marker = probe?.firstElementChild;
    if (!probe || !(marker instanceof HTMLElement)) return;
    fontMetrics.current ??= document.createElement("canvas").getContext("2d");
    const context = fontMetrics.current;
    if (!context) return;
    const computed = getComputedStyle(probe);
    context.font = `${computed.fontStyle} ${computed.fontWeight} ${label.mFontSize}px ${computed.fontFamily}`;
    const baseline = originalLabelBaseline(context, label.mFontSize);
    const pivotY = Math.floor(label.mPivot / 3) / 2;
    const target = multiline ? left + baseline
      : labelRect.y - backgroundRect.y + labelRect.height * pivotY
        + originalLabelFirstBaseline(baseline, label.mFontSize, 1, label.mSpacingY, pivotY);
    // Measure the host line's baseline, then place it using the same source
    // UILabel baseline calculation as OriginalPrefabView. Background stays fixed.
    setTextTop(target - marker.offsetTop);
  }, [fontRevision, multiline, label, left]);
  const height = multiline ? (fillHeight && fillHeight > 0 ? fillHeight : Math.max(1, rows) * lineHeight + textTop + left)
    : backgroundRect.height;
  const surface = useOriginalSurface(fieldBackground.data.mSpriteName,
    Math.abs(fieldSource.transform(fieldBackground.node).scaleX), "menu", Math.max(1, width), height);
  const input = fieldSource.components.get(source.input)!.data;
  const color = focused ? input.activeTextColor : label.mColor;
  const markerRight = backgroundRect.width - (markerRect.x - backgroundRect.x) - markerRect.width;
  const right = props.readOnly ? left : markerRight + markerRect.width + left;
  const bottom = multiline ? left : height - lineHeight - textTop;
  const textStyle = {
    fontSize: label.mFontSize, fontWeight: label.mFontStyle === 1 ? 700 : 400,
    lineHeight: `${lineHeight}px`, letterSpacing: label.mSpacingX };
  const inputStyle: CSSProperties = { ...style, ...surface, ...textStyle, width: "100%", height,
    padding: `${textTop}px ${right}px ${bottom}px ${left}px`,
    textAlign: label.mAlignment === 2 ? "center" : label.mAlignment === 3 ? "right" : "left",
    color: inputColor(color), caretColor: props.readOnly ? "transparent" : inputColor(input.caretColor),
    "--original-input-selection": inputColor(input.selectionColor),
    "--original-input-placeholder": inputColor(label.mColor),
  } as CSSProperties;
  const ready = surface.visibility !== "hidden";
  return <div ref={ref} className="original-form-input" style={{ height }}>
    <span ref={baselineProbe} className="original-form-baseline-probe" aria-hidden="true" style={textStyle}>
      <span style={{ display: "inline-block", width: 0, height: 0, padding: 0, margin: 0, verticalAlign: "baseline" }} />M
    </span>
    {multiline ? <textarea {...props} rows={rows} wrap="soft" placeholder={focused ? "" : placeholder}
      className={`original-form-editor ${className}`} style={inputStyle}
      data-original-surface-ready={ready}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }} />
      : <input {...props} placeholder={focused ? "" : placeholder} className={`original-form-editor ${className}`} style={inputStyle}
        data-original-surface-ready={ready}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }} />}
    {!props.readOnly && <OriginalSprite sprite={fieldMarker.data.mSpriteName} scale={1}
      spriteType={fieldMarker.data.mType} className="original-form-input-marker"
      style={{ position: "absolute", right: markerRight,
        top: markerRect.y - backgroundRect.y, width: markerRect.width, height: markerRect.height,
        visibility: ready ? undefined : "hidden" }} />}
  </div>;
}

/** SubTitle/base is a separate source component, not an OptionPageCaption. */
export function OriginalFormSubtitle({ text }: { text: string }) {
  const { ref, width } = useFormWidth();
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS.livesettingstabpage!);
  const root = source.nodeAt("HiSpeed/SubTitle");
  const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, root.id))
    .map(node => node.id === root.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
  const prefab = { ...source.prefab, nodes,
    components: source.prefab.components.filter(component => nodes.some(node => node.id === component.node)) };
  const local = new OriginalPrefabModel(prefab), background = local.components.get(561)!;
  const rect = local.rect(background), label = local.components.get(574)!;
  const inset = local.rect(label).x - rect.x;
  const model = new OriginalPrefabModel(prefab, { components: {
    561: { mWidth: Math.max(1, width / Math.abs(local.transform(background.node).scaleX)) },
    574: { mText: text, mWidth: Math.max(1, (width - inset * 2) / Math.abs(local.transform(label.node).scaleX)), mMaxLineCount: 1 },
  } });
  return <div ref={ref} className="original-form-subtitle" role="heading" aria-level={3} style={{ height: subtitleRowHeight }}>
    {width > 0 && <div className="original-prefab-origin" style={{ left: -rect.x, top: subtitleRowHeight / 2 - rect.y - rect.height / 2 }}>
      <OriginalPrefabView model={model} />
    </div>}
  </div>;
}

/**
 * Original settings description UILabel: 20px, grey, no heading background/effect. Its authored box is 100px tall
 * for multi-line notes; `lines` sizes the (top-anchored) box to that many text lines instead.
 */
export function OriginalFormNote({ text, lines }: { text: string; lines?: number }) {
  const { ref, width } = useFormWidth();
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS.systemtabpage!);
  const label = source.components.get(351)!, node = source.nodes.get(label.node)!;
  const height = lines === undefined ? label.data.mHeight
    : lines * (label.data.mFontSize + label.data.mSpacingY);
  const model = new OriginalPrefabModel({ resource: source.prefab.resource,
    nodes: [{ ...node, parent: null, active: true, position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
    components: [label] }, { components: { [label.id]: { mText: text, mWidth: Math.max(1, width), mHeight: height } } });
  return <div ref={ref} className="original-form-note" style={{ height }}>
    {width > 0 && <OriginalPrefabView model={model} />}
  </div>;
}

/**
 * A window's body text: the common dialog's message (SelectableCommonDialog ContentsText: 24px, line spacing 6,
 * centred, dark grey) across the page, `lines` text lines tall.
 */
export function OriginalFormMessage({ text, lines = 1 }: { text: string; lines?: number }) {
  const { ref, width } = useFormWidth();
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS.selectablecommondialog!);
  const label = source.componentAt(source.nodeAt("Window/ContentsText").id, "UILabel")!, node = source.nodes.get(label.node)!;
  const height = lines * (label.data.mFontSize + label.data.mSpacingY);
  const model = new OriginalPrefabModel({ resource: source.prefab.resource,
    nodes: [{ ...node, parent: null, active: true, position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
    components: [label] }, { components: { [label.id]: { mText: text, mWidth: Math.max(1, width), mHeight: height } } });
  const box = width > 0 ? model.rect(model.components.get(label.id)!) : null;
  // A fixed row: a scrolling page must not shrink it into the next one.
  return <div ref={ref} className="original-form-message" style={{ position: "relative", height, flexShrink: 0 }}>
    {box && <div className="original-prefab-origin" style={{ left: -box.x, top: -box.y }}><OriginalPrefabView model={model} /></div>}
  </div>;
}

export const ORIGINAL_DIFFICULTIES = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;
export function OriginalDifficultySelect({ value, onChange, layout, children, available, readOnly = false }: {
  value: typeof ORIGINAL_DIFFICULTIES[number] | null; onChange(value: typeof ORIGINAL_DIFFICULTIES[number]): void;
  available?: readonly typeof ORIGINAL_DIFFICULTIES[number][];
  readOnly?: boolean;
  layout?: { width: number; height: number; positions: readonly { x: number; y: number }[] };
  children?: ReactNode;
}) {
  return <div className="original-difficulty-select" role={readOnly ? "img" : "radiogroup"} aria-label={readOnly ? value === null ? "未提供难易度分类" : `谱面难度：${value}` : "难度"}
    style={layout ? { position: "relative", width: layout.width, height: layout.height } : undefined}>
    {children}
    {ORIGINAL_DIFFICULTIES.map((difficulty, index) => {
      if (available && !available.includes(difficulty)) return null;
      const prefix = formProfile.difficulty.prefixes[difficulty.toLowerCase() as keyof typeof formProfile.difficulty.prefixes];
      const sprite = prefix + (value === difficulty ? "on" : "off");
      const model = new OriginalPrefabModel(formPrefabs.difficultybutton!, {
        nodes: { 3: { active: false } },
        components: { 8: { mSpriteName: sprite }, 11: { mSpriteName: sprite }, 10: { mNormalSprite: sprite } },
      });
      return <div className="original-difficulty-button" key={difficulty} style={layout ? {
        position: "absolute", left: layout.positions[index].x - 51, top: layout.positions[index].y - 51,
      } : undefined}>
        <div className="original-prefab-origin" style={{ left: 51, top: 51 }}>
          <OriginalPrefabView model={model} bindings={{ omit: readOnly ? new Set([10]) : undefined, buttons: { 10: { label: difficulty,
            role: "radio", selected: value === difficulty, navigationIndex: index, action: () => onChange(difficulty) } } }} />
        </div>
      </div>;
    })}
  </div>;
}
/** Editor content inside the original caption prefab; only the available width is adapted. */
export function OriginalFormTitle({ text, followedBySubtitle = false }: { text: string; followedBySubtitle?: boolean }) {
  const { ref, width } = useFormWidth();
  const source = new OriginalPrefabModel(caption);
  const sourceBackground = source.components.get(11)!;
  const background = source.rect(sourceBackground);
  const sourceLabel = source.components.get(9)!;
  const sourceLabelRect = source.rect(sourceLabel);
  const sourceStar = source.components.get(12)!;
  const inset = sourceLabelRect.x - background.x;
  const horizontalShift = (background.width - width) / 2;
  const model = new OriginalPrefabModel(caption, {
    nodes: {
      [sourceLabel.node]: { x: source.nodes.get(sourceLabel.node)!.position.x + horizontalShift },
      [sourceStar.node]: { x: source.nodes.get(sourceStar.node)!.position.x + horizontalShift },
    },
    components: {
      9: { mText: text, mWidth: Math.max(1, width - inset * 2), mMaxLineCount: 1 },
      11: { mWidth: Math.max(1, width / Math.abs(source.transform(sourceBackground.node).scaleX)) },
    },
  });
  // The label is taller than the painted strip. Reserve its complete authored
  // widget and effect extent so a scrolling page cannot clip the heading.
  const bounds = [9, 11, 12].map(id => model.rect(model.components.get(id)!));
  const effect = sourceLabel.data.mEffectStyle ? Math.abs(sourceLabel.data.mEffectDistance?.y ?? 0) : 0;
  const top = Math.min(...bounds.map(box => box.y)) - effect;
  const bottom = Math.max(...bounds.map(box => box.y + box.height)) + effect;
  const painted = model.rect(model.components.get(11)!);
  const nextRowTop = painted.y + painted.height / 2 - top + captionToSubtitle - subtitleRowHeight / 2;
  return <div ref={ref} className="original-form-title" role="heading" aria-level={2} aria-label={text}
    style={{ height: bottom - top, marginBottom: followedBySubtitle
      ? `calc(${nextRowTop - (bottom - top)}px - var(--transfer-section-gap))` : undefined }}>
    {width > 0 && <div className="original-prefab-origin" style={{ left: width / 2, top: -top }}>
      <OriginalPrefabView model={model} />
    </div>}
  </div>;
}

const buttonSource = new OriginalPrefabModel(ORIGINAL_PREFABS.selectablecommondialog!);
/** Layout width of a normal OriginalFormButton: its original hit area (SelectableCommonDialog OKButton), wider than its sprite. */
export const ORIGINAL_FORM_BUTTON_WIDTH = (() => {
  const node = buttonSource.components.get(45)!.node;
  const collider = buttonSource.componentAt(node, "BoxCollider2D");
  return Math.max(buttonSource.componentAt(node, "UISprite")!.data.mWidth, collider?.data.m_Size.x ?? 0);
})();
/** A normal OriginalFormButton's visible sprite width. */
export const ORIGINAL_FORM_BUTTON_SPRITE_WIDTH = (() => {
  const node = buttonSource.components.get(45)!.node;
  return buttonSource.componentAt(node, "UISprite")!.data.mWidth as number;
})();
/** The label text of an OriginalFormButton (SelectableCommonDialog's button labels): its size and colour, for content
 * drawn in its place. */
export function originalFormButtonLabelStyle(tone: "pink" | "gray"): CSSProperties {
  const label = buttonSource.components.get(tone === "pink" ? 42 : 38)!.data;
  const c = label.mColor as { r: number; g: number; b: number; a: number };
  return { fontSize: label.mFontSize as number, color: `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, ${c.a})` };
}
/** A normal OriginalFormButton's visible sprite height. */
export const ORIGINAL_FORM_BUTTON_SPRITE_HEIGHT = (() => {
  const node = buttonSource.components.get(45)!.node;
  return buttonSource.componentAt(node, "UISprite")!.data.mHeight as number;
})();
/** How far a normal OriginalFormButton's visible sprite is inset from its layout box on each side (its hit area is
 * the wider). */
export const ORIGINAL_FORM_BUTTON_SPRITE_INSET = (() => {
  const node = buttonSource.components.get(45)!.node;
  return (ORIGINAL_FORM_BUTTON_WIDTH - buttonSource.componentAt(node, "UISprite")!.data.mWidth) / 2;
})();
function labelText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? labelText(child.props.children) : "").join("");
}

/** Original button subtree, including its label, hit box, template and press cover. */
export function OriginalFormButton({ tone = "gray", size = "normal", children, content, onClick, disabled, className = "",
  "aria-label": ariaLabel, title, singleLine = false }: {
  /** small: template 4 × 3 (168 × 48); tall: the same width, template height 4 (64), for two lines of content. */
  tone?: "pink" | "gray"; size?: "normal" | "small" | "tall" | "icon"; children?: ReactNode; onClick?: () => void; disabled?: boolean;
  /** Drawn in place of the label (left empty), centred on the button; `children` is then only its accessible text. */
  content?: ReactNode;
  /** The label kept on one line, shrunk to fit as the source label shrinks its content (a long label). */
  singleLine?: boolean;
  className?: string; "aria-label"?: string; title?: string; type?: "button";
}) {
  // The model and its layout depend only on tone, size and the label text; keep them across re-renders.
  const buttonId = tone === "pink" ? 45 : 39;
  const label = content === undefined ? labelText(children) : "";
  const { model, left, top, width, height } = useMemo(() => {
    const labelId = tone === "pink" ? 42 : 38;
    const root = buttonSource.nodes.get(buttonSource.components.get(buttonId)!.node)!;
    const nodes = buttonSource.prefab.nodes.filter(node => buttonSource.isWithin(node.id, root.id))
      .map(node => node.id === root.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
    const model = new OriginalPrefabModel({ ...buttonSource.prefab, nodes,
      components: buttonSource.prefab.components.filter(component => nodes.some(node => node.id === component.node))
        .map(component => component.id === buttonId && size !== "normal" ? { ...component, data: { ...component.data,
          initializeTemplateWidth: size === "icon" ? 8 : 4, initializeTemplateHeight: size === "tall" ? 4 : 3 } } : component) },
      { components: { [labelId]: { mText: label, ...(size !== "normal"
        ? { mWidth: size === "icon" ? 54 : 150, mHeight: size === "tall" ? 64 : 48, mMaxLineCount: 1 } : singleLine ? { mMaxLineCount: 1 } : {}) } } });
    const sprite = model.componentAt(root.id, "UISprite")!;
    // Layout must reserve the original hit region as well as the visible sprite.
    const collider = model.componentAt(root.id, "BoxCollider2D");
    const boxes = [sprite, ...(collider ? [collider] : [])].map(component => model.rect(component));
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const width = Math.max(...boxes.map(box => box.x + box.width)) - left;
    const height = Math.max(...boxes.map(box => box.y + box.height)) - top;
    return { model, left, top, width, height };
  }, [tone, size, label, singleLine]);
  return <div className={`transfer-authored-button ${className}`} title={title}
    style={{ width, height }}>
    <div className="original-prefab-origin" style={{ left: -left, top: -top }}>
      <OriginalPrefabView model={model} bindings={{ buttons: {
        [buttonId]: { action: onClick, disabled, label: ariaLabel ?? labelText(children ?? content) },
      } }} />
    </div>
    {/* Text children are the prefab label's own text; only content without text (an icon) is drawn over it. */}
    {label !== "" ? null : <div className="transfer-authored-button-content">{content ?? children}</div>}
  </div>;
}
