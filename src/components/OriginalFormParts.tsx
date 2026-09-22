import { Children, isValidElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
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
const fieldSource = new OriginalPrefabModel(formPrefabs.takeoversettingdialog!);
const fieldBackground = fieldSource.components.get(134)!;
const fieldLabel = fieldSource.components.get(101)!;
const fieldMarker = fieldSource.components.get(125)!;
const backgroundRect = fieldSource.rect(fieldBackground);
const labelRect = fieldSource.rect(fieldLabel);
const markerRect = fieldSource.rect(fieldMarker);

type FieldProps = { multiline?: boolean } & InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>;
const inputColor = (color: { r: number; g: number; b: number; a: number }) =>
  `rgba(${color.r * 255},${color.g * 255},${color.b * 255},${color.a})`;
/** Original sliced surface and label geometry, with host caret/selection/IME.
 * Multiline rows are editor content sizing, not a copied original UIInput mode. */
export function OriginalFormInput({ multiline = false, rows = 6, className = "", style,
  onFocus, onBlur, placeholder, ...props }: FieldProps) {
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
  const height = multiline ? Math.max(1, rows) * lineHeight + textTop + left : backgroundRect.height;
  const surface = useOriginalSurface(fieldBackground.data.mSpriteName,
    Math.abs(fieldSource.transform(fieldBackground.node).scaleX), "menu", Math.max(1, width), height);
  const input = fieldSource.components.get(114)!.data;
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

/** Original settings description UILabel: 20px, grey, no heading background/effect. */
export function OriginalFormNote({ text }: { text: string }) {
  const { ref, width } = useFormWidth();
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS.systemtabpage!);
  const label = source.components.get(351)!, node = source.nodes.get(label.node)!;
  const model = new OriginalPrefabModel({ resource: source.prefab.resource,
    nodes: [{ ...node, parent: null, active: true, position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
    components: [label] }, { components: { [label.id]: { mText: text, mWidth: Math.max(1, width) } } });
  return <div ref={ref} className="original-form-note" style={{ height: label.data.mHeight }}>
    {width > 0 && <OriginalPrefabView model={model} />}
  </div>;
}

export const ORIGINAL_DIFFICULTIES = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;
export function OriginalDifficultySelect({ value, onChange }: {
  value: typeof ORIGINAL_DIFFICULTIES[number]; onChange(value: typeof ORIGINAL_DIFFICULTIES[number]): void;
}) {
  return <div className="original-difficulty-select" role="radiogroup" aria-label="难度">
    {ORIGINAL_DIFFICULTIES.map((difficulty, index) => {
      const prefix = formProfile.difficulty.prefixes[difficulty.toLowerCase() as keyof typeof formProfile.difficulty.prefixes];
      const sprite = prefix + (value === difficulty ? "on" : "off");
      const model = new OriginalPrefabModel(formPrefabs.difficultybutton!, {
        nodes: { 3: { active: false } },
        components: { 8: { mSpriteName: sprite }, 11: { mSpriteName: sprite }, 10: { mNormalSprite: sprite } },
      });
      return <div className="original-difficulty-button" key={difficulty}>
        <div className="original-prefab-origin" style={{ left: 51, top: 51 }}>
          <OriginalPrefabView model={model} bindings={{ buttons: { 10: { label: difficulty,
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
function labelText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? labelText(child.props.children) : "").join("");
}

/** Original button subtree, including its label, hit box, template and press cover. */
export function OriginalFormButton({ tone = "gray", size = "normal", children, onClick, disabled, className = "",
  "aria-label": ariaLabel, title }: {
  tone?: "pink" | "gray"; size?: "normal" | "small" | "icon"; children: ReactNode; onClick?: () => void; disabled?: boolean;
  className?: string; "aria-label"?: string; title?: string; type?: "button";
}) {
  const buttonId = tone === "pink" ? 45 : 39, labelId = tone === "pink" ? 42 : 38;
  const root = buttonSource.nodes.get(buttonSource.components.get(buttonId)!.node)!;
  const nodes = buttonSource.prefab.nodes.filter(node => buttonSource.isWithin(node.id, root.id))
    .map(node => node.id === root.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
  const model = new OriginalPrefabModel({ ...buttonSource.prefab, nodes,
    components: buttonSource.prefab.components.filter(component => nodes.some(node => node.id === component.node))
      .map(component => component.id === buttonId && size !== "normal" ? { ...component, data: { ...component.data,
        initializeTemplateWidth: size === "icon" ? 8 : 4, initializeTemplateHeight: 3 } } : component) },
    { components: { [labelId]: { mText: labelText(children), ...(size !== "normal"
      ? { mWidth: size === "icon" ? 54 : 150, mHeight: 48, mMaxLineCount: 1 } : {}) } } });
  const sprite = model.componentAt(root.id, "UISprite")!;
  return <div className={`transfer-authored-button ${className}`} title={title}
    style={{ width: sprite.data.mWidth, height: sprite.data.mHeight }}>
    <div className="original-prefab-origin" style={{ left: "50%", top: "50%" }}>
      <OriginalPrefabView model={model} bindings={{ buttons: {
        [buttonId]: { action: onClick, disabled, label: ariaLabel ?? labelText(children) },
      } }} />
    </div>
  </div>;
}
