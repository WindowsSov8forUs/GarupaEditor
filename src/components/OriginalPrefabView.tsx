import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { OriginalSprite } from "./OriginalUi";
import { originalSurfaceRow } from "./useOriginalSurface";
import { originalSpriteDrawingRect, originalUiRound, ORIGINAL_PROGRESS_HIDE_THRESHOLD } from "./originalSpriteGeometry";
import { useOriginalFontRevision } from "./useOriginalFontRevision";
import { originalLabelTextShadow } from "./originalLabelEffects";
import { useOriginalButtonAction } from "./useOriginalButtonAction";
import { useOriginalUiSound } from "./OriginalUiSound";
import { moveOriginalOptionFocus } from "./originalOptionKeyboard";
import { OriginalPrefabModel, originalAtlasFor, originalRef, ORIGINAL_PREFABS, ORIGINAL_WORDING,
  type OriginalComponent, type OriginalData } from "./originalPrefabModel";
import "./OriginalPrefab.css";

export const OriginalPageVisible = createContext(true);

export interface OriginalButtonBinding { action?: () => void; disabled?: boolean; label?: string; selected?: boolean; navigationIndex?: number; role?: "tab" | "radio" | "checkbox" }
export interface OriginalRadioBinding {
  index: number; onChange?: (index: number) => void; disabled?: boolean;
  labelWidth?: number; labelHeight?: number; renderOption?: (index: number) => ReactNode;
  fontSize?: number; maxLineCount?: number; labelOffset?: { x: number; y: number };
  optionLayouts?: Readonly<Record<number, { labelWidth?: number; labelHeight?: number; offsetX?: number }>>;
  labelNaturalSize?: { width: boolean; height: boolean };
}
export interface OriginalSliderBinding {
  value: number; onChange?: (value: number) => void; label: string;
}
export interface OriginalViewBindings {
  buttons?: Readonly<Record<number, OriginalButtonBinding | undefined>>;
  radios?: Readonly<Record<number, OriginalRadioBinding | undefined>>;
  sliders?: Readonly<Record<number, OriginalSliderBinding>>;
  checkboxes?: Readonly<Record<number, { checked: boolean; disabled?: boolean; onChange?: (value: boolean) => void }>>;
  textures?: Readonly<Record<number, ReactNode>>;
  omit?: ReadonlySet<number>;
  beforeClick?: (type: number) => void;
  labelMeasurements?: Readonly<Record<number, (width: number) => void>>;
  labelNaturalSizes?: Readonly<Record<number, { width: boolean; height: boolean }>>;
}
const color = (value: OriginalData) => `rgba(${value.r * 255},${value.g * 255},${value.b * 255},${value.a})`;
const rectStyle = (model: OriginalPrefabModel, component: OriginalComponent): CSSProperties => {
  const box = model.rect(component);
  return { position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height,
    zIndex: component.data.mDepth ?? 0, boxSizing: "border-box" };
};

function SpriteView({ model, component, tint }: { model: OriginalPrefabModel; component: OriginalComponent; tint?: OriginalData }) {
  const filterId = `original-sprite-${useId().replace(/:/g, "")}`;
  const data = component.data, box = model.rect(component), rgba = tint ?? data.mColor;
  if (!data.mSpriteName || !originalRef(data.mAtlas) || box.width === 0 || box.height === 0) return null;
  const atlas = originalAtlasFor(component), transform = model.transform(component.node);
  const flipX = box.flipX !== (data.mFlip === 1 || data.mFlip === 3);
  const flipY = box.flipY !== (data.mFlip === 2 || data.mFlip === 3);
  const drawingBox = originalSpriteDrawingRect(box, originalSurfaceRow(atlas, data.mSpriteName),
    data.mType, transform.scaleX, transform.scaleY, data.mFlip === 1 || data.mFlip === 3,
    data.mFlip === 2 || data.mFlip === 3, data.mDrawRegion);
  if (drawingBox.width <= 0 || drawingBox.height <= 0) return null;
  const filled = originalRef(data.mAtlas) === 1809;
  const grayscale = rgba.r === rgba.g && rgba.g === rgba.b;
  const filter = grayscale && rgba.r === 0 ? "brightness(0)"
    : filled && grayscale ? `brightness(0) invert(1) brightness(${rgba.r})`
      : grayscale ? rgba.r !== 1 ? `brightness(${rgba.r})` : undefined : `url(#${filterId})`;
  const matrix = filled
    ? `0 0 0 0 ${rgba.r} 0 0 0 0 ${rgba.g} 0 0 0 0 ${rgba.b} 0 0 0 1 0`
    : `${rgba.r} 0 0 0 0 0 ${rgba.g} 0 0 0 0 0 ${rgba.b} 0 0 0 0 0 1 0`;
  return <>
    {!grayscale && <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs><filter id={filterId} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={matrix} />
      </filter></defs>
    </svg>}
    <OriginalSprite atlas={atlas} sprite={data.mSpriteName} spriteType={data.mType} scale={Math.abs(transform.scaleX)} scaleY={Math.abs(transform.scaleY)}
    data-original-widget={component.id} style={{ ...rectStyle(model, component), left: 0, top: 0,
      width: drawingBox.width, height: drawingBox.height, opacity: rgba.a, filter,
      transform: model.spriteMatrix(component.node, drawingBox, flipX, flipY), transformOrigin: "0 0", pointerEvents: "none" }} />
  </>;
}

function richText(text: string, initial: string): ReactNode {
  const parts = text.split(/(\[(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8}|-)\])/g);
  const colors = [initial];
  return parts.map((part, index) => {
    if (/^\[[0-9A-Fa-f]{6,8}\]$/.test(part)) { colors.push(`#${part.slice(1, -1)}`); return null; }
    if (part === "[-]") { if (colors.length > 1) colors.pop(); return null; }
    return <span key={index} style={{ color: colors[colors.length - 1] }}>{part}</span>;
  });
}
function LabelView({ model, component, fontRevision, onMeasured, naturalSize }: { model: OriginalPrefabModel;
  component: OriginalComponent; fontRevision: number; onMeasured?: (width: number) => void;
  naturalSize?: { width: boolean; height: boolean } }) {
  const label = useRef<HTMLSpanElement>(null);
  const visible = useContext(OriginalPageVisible);
  const data = component.data, text = model.text(component), transform = model.transform(component.node);
  const textColor = color(data.mColor), scale = Math.abs(transform.scaleY);
  const box = model.rect(component), fontSize = data.mFontSize * scale;
  const spacingX = (data.mUseFloatSpacing ? data.mFloatSpacingX : data.mSpacingX ?? 0) * Math.abs(transform.scaleX);
  const spacingY = (data.mUseFloatSpacing ? data.mFloatSpacingY : data.mSpacingY ?? 0) * scale;
  useLayoutEffect(() => {
    const element = label.current, content = element?.firstElementChild;
    if (!visible || !element || !element.getClientRects().length || !(content instanceof HTMLElement) || data.mOverflow !== 0 || box.width <= 0 || box.height <= 0) return;
    let widthLimit = box.width, heightLimit = box.height;
    if (naturalSize?.width || naturalSize?.height) {
      // Reverse ce9f2695: changing maxLineCount in ShrinkContent invokes
      // MakePixelPerfect, expanding dimensions before normal text fitting.
      element.style.fontSize = `${fontSize}px`; element.style.lineHeight = `${fontSize + spacingY}px`;
      const previous = content.getAttribute("style");
      Object.assign(content.style, { width: "max-content", maxWidth: "none", flexShrink: "0", whiteSpace: "pre" });
      const measured = getComputedStyle(content);
      const evenSize = (pixels: number, axisScale: number) => {
        const size = Math.max(2, originalUiRound(pixels / axisScale));
        return (size + size % 2) * axisScale;
      };
      if (naturalSize.width) widthLimit = Math.max(widthLimit, evenSize(Number.parseFloat(measured.width), Math.abs(transform.scaleX)));
      if (naturalSize.height) heightLimit = Math.max(heightLimit, evenSize(Number.parseFloat(measured.height), scale));
      if (previous === null) content.removeAttribute("style"); else content.setAttribute("style", previous);
    }
    element.style.width = `${widthLimit}px`; element.style.height = `${heightLimit}px`;
    element.style.left = `${box.x - (widthLimit - box.width) * (data.mPivot % 3) / 2}px`;
    element.style.top = `${box.y - (heightLimit - box.height) * Math.floor(data.mPivot / 3) / 2}px`;
    // ShrinkContent applies to every authored line limit, including unlimited wrapping.
    // Measure used CSS dimensions, independent of the dialog opening transform.
    // Reverse b8260bb7: UILabel.ProcessText retries ShrinkContent at size - 2.
    for (let size = data.mFontSize; size >= 1; size -= 2) {
      const pixels = size * scale, lineHeight = pixels + spacingY;
      element.style.fontSize = `${pixels}px`; element.style.lineHeight = `${lineHeight}px`;
      const measured = getComputedStyle(content);
      const width = Number.parseFloat(measured.width), height = Number.parseFloat(measured.height);
      // scrollWidth/Height round to whole CSS pixels. A 20.8px single line becomes
      // 21px and would incorrectly fail the one-line limit. Keep host subpixel layout.
      const tolerance = 1 / 64;
      if (width <= widthLimit + tolerance && height <= heightLimit + tolerance &&
        (data.mMaxLineCount === 0 || height <= lineHeight * data.mMaxLineCount + tolerance)) break;
    }
    const printedWidth = Number.parseFloat(getComputedStyle(content).width);
    if (Number.isFinite(printedWidth)) onMeasured?.(printedWidth);
  }, [visible, fontRevision, text, box.x, box.y, box.width, box.height, fontSize, scale, transform.scaleX, spacingX, spacingY, data.mFontSize, data.mOverflow,
    data.mMaxLineCount, data.mFontStyle, data.mEncoding, data.mPivot, naturalSize?.width, naturalSize?.height, onMeasured]);
  const align = data.mAlignment === 1 ? "left" : data.mAlignment === 2 ? "center" : data.mAlignment === 3 ? "right"
    : data.mPivot % 3 === 0 ? "left" : data.mPivot % 3 === 2 ? "right" : "center";
  return <span ref={label} className="original-prefab-label" data-original-widget={component.id} style={{ ...rectStyle(model, component),
    fontSize, alignItems: data.mPivot < 3 ? "flex-start" : data.mPivot > 5 ? "flex-end" : "center",
    whiteSpace: data.mMaxLineCount === 1 ? "pre" : "pre-wrap", color: textColor, textAlign: align, justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
    fontWeight: data.mFontStyle === 1 ? 700 : 400, letterSpacing: spacingX,
    lineHeight: `${fontSize + spacingY}px`,
    textShadow: originalLabelTextShadow(data.mEffectStyle, data.mEffectDistance, data.mEffectColor,
      transform.scaleX, transform.scaleY, data.mColor.a),
    paintOrder: "stroke fill" }}><span style={data.mMaxLineCount === 1
      ? { maxWidth: "none", flexShrink: 0 } : { overflowWrap: "anywhere" }}>
      {data.mEncoding ? richText(text, textColor) : text}</span></span>;
}
function ButtonView({ model, component, binding, beforeClick }: { model: OriginalPrefabModel;
  component: OriginalComponent; binding?: OriginalButtonBinding; beforeClick?: (type: number) => void }) {
  const data = component.data, disabled = !binding?.action || !!binding.disabled;
  const sound = useOriginalUiSound();
  const { pressed, handlers } = useOriginalButtonAction(binding?.action, disabled, !!data.enableDoubleTap,
    data.longPressJudgementTime, () => (beforeClick ?? sound?.play)?.(data.clickSEType));
  const collider = model.componentAt(component.node, "BoxCollider2D");
  const content = model.components.get(originalRef(data.contentSprite));
  const hit = collider ?? content; if (!hit) return null;
  const state = disabled ? data.disableSpriteElement : pressed ? data.pressedSpriteElement : undefined;
  const cover = state && model.components.get(originalRef(state.widget));
  const label = binding?.label ?? [...model.components.values()].filter(item =>
    item.kind === "UILabel" && model.isWithin(item.node, component.node)).map(item => model.text(item)).join(" ");
  return <>
    {cover && <SpriteView model={model} component={cover} tint={state.color} />}
    <button {...handlers} type="button" className="original-button original-prefab-hit"
      data-original-button={component.id} data-original-option-index={binding?.navigationIndex} disabled={disabled} aria-label={label || model.nodes.get(component.node)?.name}
      onKeyDown={event => { handlers.onKeyDown?.(event); if (!event.defaultPrevented) moveOriginalOptionFocus(event, binding?.role); }}
      role={binding?.role} aria-selected={binding?.role === "tab" ? binding.selected : undefined}
      aria-checked={binding?.role === "radio" || binding?.role === "checkbox" ? binding.selected : undefined}
      tabIndex={(binding?.role === "radio" || binding?.role === "tab") && !binding.selected ? -1 : 0}
      style={{ ...rectStyle(model, hit), zIndex: 1000 }} />
  </>;
}
const RADIO_MODEL = new OriginalPrefabModel(ORIGINAL_PREFABS.staruiradiobutton!);
function radioText(key: string): string {
  // Literal ON/OFF are also visible in the original runtime captures; no translated aliases.
  if (key === "word_on") return "ON";
  if (key === "word_off") return "OFF";
  return ORIGINAL_WORDING[key] ?? "";
}
function RadioGroupView({ model, component, binding, beforeClick }: { model: OriginalPrefabModel;
  component: OriginalComponent; binding?: OriginalRadioBinding; beforeClick?: (type: number) => void }) {
  const [printedWidths, setPrintedWidths] = useState<Readonly<Record<number, number>>>({});
  const data = component.data;
  const startNode = [...model.nodes.values()].find(node => node.transformId === originalRef(data.startPosTransform));
  if (!startNode) return null;
  const start = model.transform(startNode.id), labels = data.radioButtonNameList as string[];
  return <div role="radiogroup" data-original-radio={component.id}>
    {labels.map((key, index) => {
      const text = data.RawNameFlag ? key : radioText(key);
      const checked = binding?.index === index;
      const check = RADIO_MODEL.components.get(12)!;
      const label = RADIO_MODEL.components.get(14)!;
      const labelNode = RADIO_MODEL.nodes.get(label.node)!;
      const layout = binding?.optionLayouts?.[index];
      const labelWidth = layout?.labelWidth ?? binding?.labelWidth ?? label.data.mWidth;
      const fontSize = binding?.fontSize ?? label.data.mFontSize;
      const maxLineCount = binding?.maxLineCount ?? label.data.mMaxLineCount;
      // AdjustCollider consumes the same label's printed size, not a second font fitter.
      const printedWidth = printedWidths[index] ?? 0;
      const radioWithCheck = new OriginalPrefabModel(RADIO_MODEL.prefab, {
        nodes: { [check.node]: { active: checked }, [label.node]: {
          x: labelNode.position.x + (binding?.labelOffset?.x ?? 0),
          y: labelNode.position.y + (binding?.labelOffset?.y ?? 0),
        } },
        components: {
          14: { mText: text, mWidth: labelWidth, mHeight: layout?.labelHeight ?? binding?.labelHeight ?? label.data.mHeight,
            mFontSize: fontSize, mMaxLineCount: maxLineCount },
          9: { m_Size: { x: printedWidth + 50, y: 50 }, m_Offset: { x: printedWidth / 2, y: 0 } },
        },
      });
      return <div key={index} className="original-prefab-origin" style={{ left: start.x +
        (index % data.columnCount * data.widthMargin + (layout?.offsetX ?? 0)) * start.scaleX,
        top: -start.y + Math.floor(index / data.columnCount) * data.heightMargin * Math.abs(start.scaleY),
        transform: `scale(${start.scaleX},${start.scaleY})` }}>
        <OriginalPrefabView model={radioWithCheck} bindings={{ beforeClick,
          labelNaturalSizes: binding?.labelNaturalSize ? { 14: {
            width: binding.labelNaturalSize.width && layout?.labelWidth === undefined,
            height: binding.labelNaturalSize.height && layout?.labelHeight === undefined,
          } } : undefined,
          labelMeasurements: { 14: width => setPrintedWidths(previous => previous[index] === width
            ? previous : { ...previous, [index]: width }) }, buttons: {
          13: { label: text, selected: checked, navigationIndex: index, role: "radio", disabled: !binding?.onChange || !!binding.disabled,
            action: binding?.onChange ? () => binding.onChange?.(index) : undefined },
        } }} />
        {binding?.renderOption?.(index)}
      </div>;
    })}
  </div>;
}
function bindOriginalCheckboxes(source: OriginalPrefabModel, bindings: OriginalViewBindings) {
  if (!bindings.checkboxes) return { model: source, bindings };
  const components = { ...source.overrides.components }, nodes = { ...source.overrides.nodes };
  const buttons = { ...bindings.buttons };
  for (const [id, state] of Object.entries(bindings.checkboxes)) {
    const control = source.components.get(Number(id));
    if (!control || control.kind !== "StarUICheckBox") throw new Error(`Missing original checkbox ${id}.`);
    const check = source.components.get(originalRef(control.data.checkSprite))!;
    const cover = source.components.get(originalRef(control.data.grayoutCover))!;
    const button = originalRef(control.data.button), enabled = !!state.onChange && !state.disabled;
    components[check.id] = { ...components[check.id], m_Enabled: state.checked ? 1 : 0 };
    components[button] = { ...components[button], m_Enabled: 1 };
    nodes[cover.node] = { ...nodes[cover.node], active: !enabled };
    const label = source.components.get(originalRef(control.data.label));
    buttons[button] = { role: "checkbox", selected: state.checked, disabled: !enabled,
      label: label ? source.text(label) : undefined, action: state.onChange ? () => state.onChange?.(!state.checked) : undefined };
  }
  return { model: new OriginalPrefabModel(source.prefab, { components, nodes }), bindings: { ...bindings, buttons } };
}

export function OriginalPrefabView({ model: source, root, bindings: initialBindings = {} }: {
  model: OriginalPrefabModel; root?: number; bindings?: OriginalViewBindings;
}) {
  const fontRevision = useOriginalFontRevision();
  const { model, bindings } = useMemo(() => bindOriginalCheckboxes(source, initialBindings), [source, initialBindings]);
  const components = useMemo(() => [...model.components.values()].filter(component =>
    (root === undefined || model.isWithin(component.node, root)) && model.isActive(component.node) &&
    component.data.m_Enabled !== 0 && !bindings.omit?.has(component.id)), [model, root, bindings.omit]);
  const covers = new Set([...model.components.values()].filter(item => item.kind === "StarUIButton").flatMap(item =>
    [originalRef(item.data.pressedSpriteElement?.widget), originalRef(item.data.disableSpriteElement?.widget)]));
  const sliderParts = new Set<number>();
  for (const component of components) {
    if (component.kind !== "UISlider" || !bindings.sliders?.[component.id]) continue;
    sliderParts.add(originalRef(component.data.mFG));
    const thumb = [...model.nodes.values()].find(node => node.transformId === originalRef(component.data.thumb));
    if (thumb) for (const child of model.components.values()) if (child.kind === "UISprite" && model.isWithin(child.node, thumb.id)) sliderParts.add(child.id);
  }
  return <>
    {components.map(component => {
      if (covers.has(component.id) || sliderParts.has(component.id)) return null;
      switch (component.kind) {
        case "UISprite": return <SpriteView key={component.id} model={model} component={component} />;
        case "UILabel": return <LabelView key={component.id} model={model} component={component} fontRevision={fontRevision}
          onMeasured={bindings.labelMeasurements?.[component.id]} naturalSize={bindings.labelNaturalSizes?.[component.id]} />;
        case "UITexture": return bindings.textures?.[component.id] === undefined ? null :
          <div key={component.id} style={rectStyle(model, component)}>{bindings.textures[component.id]}</div>;
        case "StarUIButton": return <ButtonView key={component.id} model={model} component={component}
          binding={bindings.buttons?.[component.id]} beforeClick={bindings.beforeClick} />;
        case "UISlider": return bindings.sliders?.[component.id] ? <SliderView key={component.id} model={model} component={component} binding={bindings.sliders[component.id]!} /> : null;
        case "StarUIRadioButtonManager": return <RadioGroupView key={component.id} model={model} component={component}
          binding={bindings.radios?.[component.id]} beforeClick={bindings.beforeClick} />;
        default: return null;
      }
    })}
  </>;
}
function SliderView({ model, component, binding }: { model: OriginalPrefabModel; component: OriginalComponent;
  binding: OriginalSliderBinding }) {
  const pointer = useRef<{ id: number; offset: number } | null>(null);
  const foreground = model.components.get(originalRef(component.data.mFG))!;
  const thumb = [...model.nodes.values()].find(node => node.transformId === originalRef(component.data.thumb))!;
  const track = model.rect(foreground), own = model.transform(foreground.node);
  const parent = thumb.parent === null ? { x: 0, y: 0, scaleX: 1, scaleY: 1 } : model.transform(thumb.parent);
  const atlas = originalSurfaceRow(originalAtlasFor(foreground), foreground.data.mSpriteName);
  const fraction = binding.value / 100;
  const left = track.x + (track.flipX ? atlas.borderRight : atlas.borderLeft) * Math.abs(own.scaleX);
  const right = track.x + track.width - (track.flipX ? atlas.borderLeft : atlas.borderRight) * Math.abs(own.scaleX);
  const centerY = track.y + track.height / 2;
  const view = new OriginalPrefabModel(model.prefab, { ...model.overrides,
    nodes: { ...model.overrides.nodes, [thumb.id]: { ...model.overrides.nodes?.[thumb.id],
      x: originalUiRound((left + (right - left) * fraction - parent.x) / parent.scaleX),
      y: originalUiRound((-centerY - parent.y) / parent.scaleY) } },
    components: { ...model.overrides.components, [foreground.id]: { ...foreground.data,
      mDrawRegion: { x: 0, y: 0, z: fraction, w: 1 } } },
  });
  const thumbCollider = view.componentAt(thumb.id, "BoxCollider2D");
  const thumbWidget = [...view.components.values()].find(item => item.kind === "UISprite" && item.node === thumb.id)!;
  const thumbHit = view.rect(thumbCollider ?? thumbWidget);
  const normalized = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 ? (clientX - bounds.left) / bounds.width : fraction;
  };
  const setValue = (value: number) => binding.onChange?.(Math.fround(Math.min(1, Math.max(0, value))) * 100);
  return <>
    {fraction >= ORIGINAL_PROGRESS_HIDE_THRESHOLD &&
      <SpriteView model={view} component={view.components.get(foreground.id)!} />}
    {[...view.components.values()].filter(item => item.kind === "UISprite" && view.isWithin(item.node, thumb.id))
      .map(item => <SpriteView key={item.id} model={view} component={item} />)}
    <div className="original-prefab-slider-hit" role="slider" tabIndex={binding.onChange ? 0 : -1}
      aria-disabled={!binding.onChange} aria-label={binding.label}
      data-original-slider={component.id} aria-valuemin={0} aria-valuemax={100} aria-valuenow={binding.value}
      aria-orientation="horizontal" style={{ left: track.x, top: track.y, width: track.width, height: track.height }}
      onPointerDown={event => {
        if (!binding.onChange || event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        const position = normalized(event.clientX, event.currentTarget);
        const grabbedThumb = event.target instanceof Element && !!event.target.closest('[data-original-slider-thumb]');
        pointer.current = { id: event.pointerId, offset: grabbedThumb ? fraction - position : 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (!grabbedThumb) setValue(position);
      }}
      onPointerMove={event => {
        if (pointer.current?.id === event.pointerId)
          setValue(normalized(event.clientX, event.currentTarget) + pointer.current.offset);
      }}
      onPointerUp={event => { if (pointer.current?.id === event.pointerId) pointer.current = null; }}
      onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}
      onKeyDown={event => {
        const value = event.key === "Home" ? 0 : event.key === "End" ? 100
          : event.key === "ArrowRight" || event.key === "ArrowUp" ? binding.value + 1
            : event.key === "ArrowLeft" || event.key === "ArrowDown" ? binding.value - 1 : null;
        if (value !== null && binding.onChange) { event.preventDefault(); binding.onChange(Math.min(100, Math.max(0, value))); }
      }}>
      <span data-original-slider-thumb={component.id} aria-hidden="true" style={{ position: "absolute",
        left: thumbHit.x - track.x, top: thumbHit.y - track.y, width: thumbHit.width, height: thumbHit.height }} />
    </div>
  </>;
}
