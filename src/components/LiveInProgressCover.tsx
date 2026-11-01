import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import lineStarUrl from "../assets/game/prefabs/bms/information/startup-line-star.png?url&no-inline";
import titleBaseUrl from "../assets/game/prefabs/bms/information/startup-title-base.png?url&no-inline";
import type { ChartMetadata } from "../chartCore";
import { DIFFICULTY_LABEL_STYLE } from "./text/difficultyLabelStyle";
import { OriginalSprite } from "./OriginalUi";
import { UiAuthoredSurface } from "./UiViewport";

export interface LiveInProgressSong {
  readonly title: string;
  readonly bandName: string;
  readonly difficulty: ChartMetadata["difficulty"];
  readonly isFullLength: boolean;
}

const srgb = (value: number) => `#${value.toString(16).padStart(6, "0")}`;
const frames = {
  EASY: "bg_jacket_frame_rank_1_easy", NORMAL: "bg_jacket_frame_rank_1_normal", HARD: "bg_jacket_frame_rank_1_hard",
  EXPERT: "bg_jacket_frame_rank_1_expert", SPECIAL: "bg_jacket_frame_rank_1_special",
} as const;

/** The live's FirstView information (title strip, jacket and difficulty frames, band) over the
 * main window while the live runs in its own window. A GarupaEditor cover: it blocks the
 * preparation page and its keys, and the opener removes it before leaving the preparation.
 * The jacket follows the current chart media lease, whose object URL may be renewed. */
export function LiveInProgressCover({ song, jacketUrl }: { song: LiveInProgressSong | null; jacketUrl: string }) {
  useEffect(() => {
    if (song === null) return;
    const block = (event: KeyboardEvent) => { event.stopImmediatePropagation(); event.preventDefault(); };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => { window.removeEventListener("keydown", block, true); window.removeEventListener("keyup", block, true); };
  }, [song]);
  if (song === null) return null;
  const difficulty = DIFFICULTY_LABEL_STYLE[song.difficulty];
  return createPortal(<div data-live-in-progress-cover="" style={{ position: "fixed", inset: 0, zIndex: 9000,
    background: "#000", display: "grid", placeItems: "center", overflow: "hidden" }}
    onPointerDown={event => event.preventDefault()}>
    <UiAuthoredSurface width={1334} height={750} className="original-authored-viewport">
      {/* Positions are the start scene's authored centers (Unity y up), sizes in UI units. */}
      <Placed x={0} y={-159} width={1334} height={88}><img src={titleBaseUrl} alt="" style={fill} /></Placed>
      <Placed x={0} y={-170} width={1346} height={196}><img src={lineStarUrl} alt="" style={fill} /></Placed>
      <Placed x={6} y={144} width={374} height={374}>
        <OriginalSprite atlas="common" sprite={frames[song.difficulty]} scale={1} style={{ width: 374, height: 374 }} />
      </Placed>
      <Placed x={0} y={138} width={374} height={374}>
        <OriginalSprite atlas="common" sprite="bg_base_jacket_frame" scale={1} style={{ width: 374, height: 374 }} />
      </Placed>
      <Placed x={0} y={138} width={360} height={360}><img src={jacketUrl} alt="" style={fill} /></Placed>
      <Placed x={7} y={-77} width={97} height={27}><TintedSprite sprite="label_square_white" width={97} height={27} color={difficulty.background} /></Placed>
      <Line x={7 + difficulty.offsetX} y={-79} size={20} maxWidth={94} color="#fff"
        style={{ letterSpacing: difficulty.spacing, WebkitTextStroke: `2px ${srgb(difficulty.outline)}`, paintOrder: "stroke fill" }}>
        {song.difficulty}
      </Line>
      <Line x={0} y={-162} size={38} maxWidth={1110} color="#505050">{song.title}</Line>
      <Line x={0} y={-236} size={28} maxWidth={932} color="#fff">{song.bandName}</Line>
      {song.isFullLength && <Placed x={161} y={293} width={70} height={34}>
        <OriginalSprite atlas="common" sprite="icon_fullmusic_gray" scale={1} style={{ width: 70, height: 34 }} />
      </Placed>}
    </UiAuthoredSurface>
  </div>, document.body);
}

const fill: CSSProperties = { display: "block", width: "100%", height: "100%" };

function Placed({ x, y, width, height, children }: { x: number; y: number; width: number; height: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x - width / 2, top: -y - height / 2, width, height }}>{children}</div>;
}

/** A centered single line shrunk to its authored width, like fitText in the start scene. */
function Line({ x, y, size, maxWidth, color, style, children }: {
  x: number; y: number; size: number; maxWidth: number; color: string; style?: CSSProperties; children: ReactNode;
}) {
  const span = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = span.current!;
    element.style.transform = "translate(-50%, -50%)";
    const width = element.offsetWidth;
    if (width > maxWidth) element.style.transform = `translate(-50%, -50%) scale(${maxWidth / width})`;
  });
  return <span ref={span} style={{ position: "absolute", left: x, top: -y, whiteSpace: "pre", fontSize: size,
    lineHeight: `${size}px`, color, ...style }}>{children}</span>;
}

/** label_square_white multiplied by the difficulty color, as the start scene tints it. */
function TintedSprite({ sprite, width, height, color }: { sprite: string; width: number; height: number; color: number }) {
  const filterId = `live-cover-tint-${useId().replace(/:/g, "")}`;
  const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs><filter id={filterId} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`} />
      </filter></defs>
    </svg>
    <OriginalSprite atlas="common" sprite={sprite} scale={1} style={{ width, height, filter: `url(#${filterId})` }} />
  </>;
}
