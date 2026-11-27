import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { ChartMetadata } from "../chartCore";
import { Placed, TintedSprite } from "../components/LiveInProgressCover";
import { OriginalSprite } from "../components/OriginalUi";
import { DIFFICULTY_LABEL_STYLE } from "../components/text/difficultyLabelStyle";

/*
 * The live result's title strip (resultHeaderProfile and resultClearProfile's header: the base, the clear star, the
 * difficulty label, the title and the level) at the top of the preview window, centred on it. Positions are the result scene's authored centres in design px (y up, from the screen centre);
 * the clear star, which the preview has no result for, is a music note.
 */

/** The design screen's height: the header's y are from its centre. */
const SCREEN_HEIGHT = 750;
/** The result scene keeps its strip left of the centre (x -571 to 449, its right side for the score); the preview,
 * with nothing beside it, centres it. */
const CENTRE_SHIFT = 61;
/** The note icon's height, about the clear star's (26 × 1.4932 × 0.7 ≈ 27). */
const NOTE_HEIGHT = 28;
const TEXT_COLOR = "#505050";
const srgb = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

export function StaticPreviewTitleBar({ title, difficulty, level }: {
  title: string; difficulty: ChartMetadata["difficulty"]; level: string;
}) {
  const style = DIFFICULTY_LABEL_STYLE[difficulty];
  return <div className="static-render-title-bar">
    <div className="ui-scale-origin" style={{ left: "50%", top: 0 }}>
      <div style={{ position: "absolute", left: CENTRE_SHIFT, top: SCREEN_HEIGHT / 2, width: 0, height: 0 }}>
        {/* bg_base_r12, 1020 × 48, its left edge at x -571. */}
        <Placed x={-571 + 510} y={333} width={1020} height={48}>
          <OriginalSprite atlas="menu" sprite="bg_base_r12" scale={1} spriteType={1} style={{ width: 1020, height: 48 }} />
        </Placed>
        {/* In the clear star's place (ClearStarRoot: x -543), the menu atlas's music note, 45 × 50, 28 tall. */}
        <Placed x={-543} y={333} width={NOTE_HEIGHT * 45 / 50} height={NOTE_HEIGHT}>
          <OriginalSprite atlas="menu" sprite="icon_onpu" scale={1} style={{ width: NOTE_HEIGHT * 45 / 50, height: NOTE_HEIGHT }} />
        </Placed>
        {/* DifficultyLabelPos (x -468): Bg 97 × 27 in the difficulty's colour, its label 20 px, 94 wide. */}
        <Placed x={-468} y={333} width={97} height={27}>
          <TintedSprite sprite="label_square_white" width={97} height={27} color={style.background} />
        </Placed>
        <TextLine x={-468 + style.offsetX} y={331} size={20} maxWidth={94} align="center" color="#fff"
          style={{ letterSpacing: style.spacing, WebkitTextStroke: `2px ${srgb(style.outline)}`, paintOrder: "stroke fill" }}>
          {difficulty}
        </TextLine>
        <TextLine x={-401} y={333} size={28} maxWidth={602} align="left" color={TEXT_COLOR} style={outlined}>{title}</TextLine>
        <TextLine x={369} y={330} size={18} maxWidth={100} align="left" color={TEXT_COLOR} style={{ letterSpacing: 1 }}>Lv.</TextLine>
        <TextLine x={433} y={331} size={22} maxWidth={100} align="right" color={TEXT_COLOR}
          style={{ ...outlined, letterSpacing: 1 }}>{level}</TextLine>
      </div>
    </div>
  </div>;
}

/** The labels' 1 px white outline. */
const outlined: CSSProperties = { WebkitTextStroke: "2px #fff", paintOrder: "stroke fill" };

/** One line at (x, y), aligned on x, shrunk to `maxWidth` when longer (the result header's fitted labels). */
function TextLine({ x, y, size, maxWidth, align, color, style, children }: {
  x: number; y: number; size: number; maxWidth: number; align: "left" | "center" | "right"; color: string;
  style?: CSSProperties; children: ReactNode;
}) {
  const span = useRef<HTMLSpanElement>(null);
  const shift = align === "left" ? "0" : align === "center" ? "-50%" : "-100%";
  const origin = align === "left" ? "left center" : align === "center" ? "center" : "right center";
  useLayoutEffect(() => {
    const element = span.current!;
    element.style.transform = `translate(${shift}, -50%)`;
    const width = element.offsetWidth;
    if (width > maxWidth) element.style.transform = `translate(${shift}, -50%) scale(${maxWidth / width})`;
  });
  return <span ref={span} style={{ position: "absolute", left: x, top: -y, whiteSpace: "pre", fontSize: size,
    lineHeight: `${size}px`, color, transformOrigin: origin, ...style }}>{children}</span>;
}
