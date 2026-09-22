import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { useOriginalCanvasSurface, useOriginalSurface, type OriginalAtlas } from "./useOriginalSurface";
import { useOriginalButtonAction } from "./useOriginalButtonAction";
import { useOriginalUiSound } from "./OriginalUiSound";
import { ORIGINAL_DIALOG_COLORS, ORIGINAL_DIALOG_HEADER } from "./originalDialogProfile";
import "./OriginalUi.css";

const labelColor = (rgb: readonly number[]) => `rgb(${rgb.map(value => value * 255).join(" ")})`;

type OriginalSpriteProps = HTMLAttributes<HTMLSpanElement> & { sprite: string; atlas?: OriginalAtlas; scale?: number; scaleY?: number; spriteType?: number; fillCenter?: boolean };
export function OriginalSprite(props: OriginalSpriteProps) {
  return typeof props.style?.width === "number" && typeof props.style?.height === "number"
    ? <OriginalCanvasSprite {...props} /> : <OriginalBackgroundSprite {...props} />;
}
function OriginalCanvasSprite({ sprite, atlas = "menu", scale = 0.75, scaleY = scale, spriteType = 1, fillCenter = true, style, ...props }: OriginalSpriteProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ready = useOriginalCanvasSurface(canvas, sprite, atlas, style!.width as number, style!.height as number, scale, scaleY, spriteType, fillCenter);
  return <span {...props} aria-hidden="true" data-original-surface-ready={ready}
    style={{ display: "inline-block", border: "0 solid transparent", ...style }}>
    <canvas ref={canvas} style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} />
  </span>;
}
function OriginalBackgroundSprite({ sprite, atlas = "menu", scale = 0.75, scaleY = scale, spriteType: _spriteType, fillCenter = true, style, ...props }: OriginalSpriteProps) {
  const surface = useOriginalSurface(sprite, scale, atlas, typeof style?.width === "number" ? style.width : undefined, typeof style?.height === "number" ? style.height : undefined, scaleY, fillCenter);
  return <span {...props} aria-hidden="true" data-original-surface-ready={surface.visibility !== "hidden"}
    style={{ display: "inline-block", border: "0 solid transparent", ...surface, ...style }} />;
}

export function OriginalDialogFrame({ className = "", style, children, atlas = "common", ...props }: HTMLAttributes<HTMLElement> & { atlas?: OriginalAtlas }) {
  const surface = useOriginalSurface("bg_base_r12", 0.75, atlas);
  return <section {...props} className={`original-dialog-frame ${className}`} style={{ ...surface,
    color: labelColor(ORIGINAL_DIALOG_COLORS.content), ...style }}>
    {children}
  </section>;
}

export function OriginalDialogHeader({ children, atlas = "common" }: { children: ReactNode; atlas?: OriginalAtlas }) {
  const surface = useOriginalSurface("bg_header_dialog", 0.75, atlas);
  const header = ORIGINAL_DIALOG_HEADER, scale = 0.75;
  return <header className="original-dialog-header" style={{ ...surface, height: header.height * scale,
    margin: `${header.top * scale}px ${header.marginX * scale}px 0` }}>
    <h3 style={{ paddingLeft: header.labelX * scale, transform: `translateY(${header.labelY * scale}px)`,
      color: labelColor(ORIGINAL_DIALOG_COLORS.title), fontSize: header.fontSize * scale,
      letterSpacing: header.spacingX * scale }}>{children}</h3>
  </header>;
}

export function OriginalButton({ tone = "gray", sprite, atlas = "common", spriteScale = 0.5,
  flipX = false, enableDoubleTap = false, longPressJudgementTime = 1, clickSEType = 1, className = "", style,
  children, disabled, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
  onLostPointerCapture, onKeyDown, onKeyUp, onBlur, onClick, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "gray" | "pink"; sprite?: string; atlas?: OriginalAtlas; spriteScale?: number;
  flipX?: boolean; enableDoubleTap?: boolean; longPressJudgementTime?: number; clickSEType?: number;
}) {
  const surface = useOriginalSurface(sprite ?? (tone === "pink" ? "button_pink" : "button_gray"), spriteScale, atlas);
  const painted = { ...surface, transform: flipX ? "scaleX(-1)" : undefined };
  const sound = useOriginalUiSound();
  const { pressed, handlers } = useOriginalButtonAction(onClick, !!disabled, enableDoubleTap, longPressJudgementTime,
    () => sound?.play(clickSEType));
  return <button {...props} {...handlers} type={props.type ?? "button"} disabled={disabled}
    className={`original-button ${className}`} data-tone={tone}
    style={{ color: tone === "pink" ? `#${ORIGINAL_DIALOG_COLORS.positiveButton.toString(16)}` : labelColor(ORIGINAL_DIALOG_COLORS.button), ...style }}
    onPointerDown={event => { onPointerDown?.(event); if (!event.defaultPrevented) handlers.onPointerDown?.(event); }}
    onPointerMove={event => { handlers.onPointerMove?.(event); onPointerMove?.(event); }}
    onPointerUp={event => { handlers.onPointerUp?.(event); onPointerUp?.(event); }}
    onPointerCancel={event => { handlers.onPointerCancel?.(event); onPointerCancel?.(event); }}
    onLostPointerCapture={event => { handlers.onLostPointerCapture?.(event); onLostPointerCapture?.(event); }}
    onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented) handlers.onKeyDown?.(event); }}
    onKeyUp={event => { handlers.onKeyUp?.(event); onKeyUp?.(event); }}
    onBlur={event => { handlers.onBlur?.(event); onBlur?.(event); }}>
    <span aria-hidden="true" className="original-button-surface" style={painted} />
    <span className="original-button-label">{children}</span>
    <span aria-hidden="true" className="original-button-cover" style={{ ...painted,
      opacity: pressed && !disabled ? 0.5 : 0 }} />
  </button>;
}
