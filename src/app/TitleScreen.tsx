import { useEffect, useRef, useState } from "react";
import { useUiViewport } from "../components/useUiViewport";
import { sampleOrdinaryVisibleClip } from "../simulator/backends/ordinaryVisibleAnimation";
import type { OrdinaryVisibleClip } from "../simulator/backends/resources/currentOrdinaryVisibleProfile";
import profile from "../data/title/profile.json";
import logoMotion from "../data/title/logoMotion.json";
import logoLayout from "../data/title/logoLayout.json";
import { TitlePlayback, type TitlePhase as Phase } from "./TitlePlayback";
import { TitleLogoMotion } from "./TitleLogoMotion";
import { TitleAudio } from "./TitleAudio";
import logo from "../../assets/garupaeditor-logo.png?url";
import { version } from "../../package.json";

const textures = import.meta.glob<string>("../assets/game/title/*.png", { eager: true, query: "?url", import: "default" });
const texture = (name: string) => textures[`../assets/game/title/${name}.png`]!;
type Pose = { x: number; y: number; sx: number; sy: number; angle: number; active: boolean; alpha: number; depth?: number };
type World = { a: number; b: number; c: number; d: number; x: number; y: number; alpha: number; active: boolean; panel: number };


// Keep the scene and instantiated logo on their original independent clocks.
function activationTime(node: number) {
  const clip = profile.clips.show_9th;
  const index = clip.bindings.findIndex(binding => binding.node === node && binding.property === "m_IsActive");
  const curve = clip.curves[index];
  if (!curve?.keys) throw new Error("Title activation cue is missing.");
  const key = curve.keys.find(key => key.coefficients[3] === 1);
  if (!key) throw new Error("Title activation cue is missing.");
  return key.time;
}
const logoCue = activationTime(profile.logoNode);
// Start at the authored cut after the last individual character leaves. Keep
// source timestamps so every remaining background/prompt channel stays aligned.
const characterRoot = profile.nodes.find(node => node.path.endsWith("/01_Ch_Root"))!;
const characterNodes = new Set(profile.nodes.filter(node => node.parent === characterRoot.id).map(node => node.id));
const showStart = Math.max(...profile.clips.show_9th.bindings.flatMap((binding, index) => {
  if (binding.property !== "m_IsActive" || !characterNodes.has(binding.node)) return [];
  const curve = profile.clips.show_9th.curves[index]!;
  return (curve.keys ?? []).filter(key => key.coefficients[3] === 0).map(key => key.time);
}));


/** CN level0 ninth-anniversary scene. Coordinates and animation channels come
 * from the delivered title-startup contract; only the brand image is replaced. */
export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const viewport = useUiViewport();
  // Fit the complete project artwork inside the original assembled-title region,
  // including the prefab's internal hierarchy (not just its scene mount point).
  const logoWidth = Math.min(logoLayout.rect.width, logoLayout.rect.height * (2128 / 1104));
  const logoHeight = logoWidth * (1104 / 2128);
  const logoStyle = { position: "absolute" as const, width: logoWidth, height: logoHeight,
    objectFit: "contain" as const, left: -logoWidth / 2, top: -logoHeight / 2,
    transformOrigin: "50% 50%", visibility: "hidden" as const, pointerEvents: "none" as const };
  const elements = useRef(new Map<number, HTMLImageElement>());
  const brand = useRef<HTMLImageElement>(null);
  const brandTouch = useRef<HTMLImageElement>(null);
  const brandWhite = useRef<HTMLImageElement>(null);
  const click = useRef<() => void>(() => {});
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false, frame = 0;
    const audio = new TitleAudio();
    click.current = () => {};
    setAvailable(false); setError("");
    const pose = new Map<number, Pose>(profile.nodes.map(node => [node.id, {
      x: node.position[0]!, y: node.position[1]!, sx: node.scale[0]!, sy: node.scale[1]!,
      angle: 2 * Math.atan2(node.rotation[2]!, node.rotation[3]!) * 180 / Math.PI,
      active: node.active || node.id === profile.animatedRoot, alpha: 1,
    }]));
    for (const panel of profile.panels) pose.get(panel.node)!.alpha = panel.alpha;
    for (const widget of profile.widgets) { const p = pose.get(widget.node)!; p.alpha = widget.alpha; p.depth = widget.depth; }
    const sample = (kind: Phase, time: number) => {
      const clip = profile.clips[kind];
      const values = sampleOrdinaryVisibleClip(clip as unknown as OrdinaryVisibleClip, time);
      clip.bindings.forEach((binding, index) => {
        const p = pose.get(binding.node)!, value = values[index]!;
        switch (binding.property) {
          case "position": if (binding.axis === 0) p.x = value; else if (binding.axis === 1) p.y = value; break;
          case "scale": if (binding.axis === 0) p.sx = value; else if (binding.axis === 1) p.sy = value; break;
          case "euler": if (binding.axis === 2) p.angle = value; break;
          case "alpha": case "mColor.a": p.alpha = value; break;
          case "mDepth": case "m_SortingOrder": p.depth = value; break;
          case "m_IsActive": p.active = value !== 0; break;
        }
      });
    };
    const draw = (logoPose: ReturnType<TitleLogoMotion["sample"]>) => {
      const worlds = new Map<number, World>();
      for (const node of profile.nodes) {
        const p = pose.get(node.id)!;
        const parent = node.parent === null ? { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0, alpha: 1, active: true, panel: 0 } : worlds.get(node.parent)!;
        const angle = p.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const world: World = {
          a: (parent.a * c + parent.c * s) * p.sx, b: (parent.b * c + parent.d * s) * p.sx,
          c: (-parent.a * s + parent.c * c) * p.sy, d: (-parent.b * s + parent.d * c) * p.sy,
          x: parent.x + parent.a * p.x + parent.c * p.y, y: parent.y + parent.b * p.x + parent.d * p.y,
          alpha: parent.alpha * p.alpha, active: parent.active && p.active,
          panel: profile.panels.find(panel => panel.node === node.id)?.depth ?? parent.panel,
        };
        worlds.set(node.id, world);
        const element = elements.current.get(node.id) ?? (node.id === profile.logoNode ? brand.current : null);
        if (!element) continue;
        element.style.transform = `matrix(${world.a},${-world.b},${-world.c},${world.d},${world.x},${-world.y})`;
        element.style.opacity = String(Math.max(0, Math.min(1, world.alpha)));
        element.style.visibility = world.active ? "visible" : "hidden";
        element.style.zIndex = String(Math.round((node.id === profile.logoNode ? 14 : world.panel) * 10000 + (p.depth ?? 500)));
        if (node.id === profile.logoNode) {
          const logoTransform = `${element.style.transform} translate(${logoLayout.rect.centerX}px,${-logoLayout.rect.centerY + logoPose.y}px)`;
          element.style.transform = `${logoTransform} scale(${logoPose.scale})`;
          element.style.opacity = String(Math.max(0, Math.min(1, world.alpha * logoPose.alpha)));
          for (const [overlay, scaleX, scaleY, alpha, offset] of [
            [brandTouch.current, logoPose.glowScaleX, logoPose.glowScaleY, logoPose.glow, 1],
            [brandWhite.current, logoPose.scale, logoPose.scale, logoPose.white, 2],
          ] as const) {
            if (!overlay) continue;
            overlay.style.visibility = world.active ? "visible" : "hidden";
            overlay.style.transform = `${logoTransform} scale(${scaleX},${scaleY})`;
            overlay.style.opacity = String(Math.max(0, Math.min(1, world.alpha * alpha)));
            overlay.style.zIndex = String(Number(element.style.zIndex) + offset);
          }
        }
      }
    };
    void Promise.all([audio.prepare(), ...[...Object.values(textures), logo].map(async src => { const image = new Image(); image.src = src; await image.decode(); })]).then(() => {
      if (cancelled) return;
      const started = performance.now() / 1000;
      const logoAnimation = new TitleLogoMotion(started + logoCue - showStart);
      const playback = new TitlePlayback(started, {
        show: profile.clips.show_9th.durationSeconds, touch: profile.clips.touch_9th.durationSeconds,
        logoShow: logoMotion.show.durationSeconds, logoCue, skip: logoMotion.skipNormalizedTime, showStart,
      });
      let settled: number | null = null;
      const render = (now: number) => {
        const state = playback.sample(now);
        if (state.settledShowTime !== null && settled !== state.settledShowTime) {
          settled = state.settledShowTime; sample("show_9th", settled);
        }
        sample(state.phase, state.time); draw(logoAnimation.sample(now));
        return state.complete;
      };
      click.current = () => {
        const now = performance.now() / 1000;
        const action = playback.click(now);
        if (action === "skip") logoAnimation.skip(now);
        if (action === "enter") {
          logoAnimation.enter(now);
          void audio.play().catch(cause => { if (!cancelled) setError(String(cause)); });
        }
        render(now);
      };
      const tick = (now: number) => {
        if (cancelled) return;
        if (render(now / 1000)) { click.current = () => {}; onEnter(); return; }
        frame = requestAnimationFrame(tick);
      };
      render(performance.now() / 1000); setAvailable(true);
      frame = requestAnimationFrame(tick);
    }).catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; click.current = () => {}; cancelAnimationFrame(frame); audio.dispose(); };
  }, [onEnter, attempt]);
  return <main aria-label="GarupaEditor 标题页" style={{ position: "fixed", inset: 0, overflow: "hidden", background: `#fff url("${texture("40")}") center / cover` }}>
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: `scale(${viewport.scale})`, width: 0, height: 0 }}>
      {profile.widgets.map(widget => {
        const pivot = widget.pivot;
        const x = (pivot % 3) / 2, y = Math.floor(pivot / 3) / 2;
        const sliced = widget.type === 1 && widget.texture === "base_title_taptostart";
        return <img key={widget.node} data-title-node={widget.node} ref={element => { if (element) elements.current.set(widget.node, element); else elements.current.delete(widget.node); }}
          src={sliced ? "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" : texture(widget.texture)} alt="" draggable={false} style={{ position: "absolute", width: widget.width, height: widget.height,
            left: -widget.width * x, top: -widget.height * y, transformOrigin: `${x * 100}% ${y * 100}%`, visibility: "hidden",
            ...(widget.color.r === 0 && widget.color.g === 0 && widget.color.b === 0 ? { filter: "brightness(0)" } : {}),
            ...(sliced ? { boxSizing: "border-box" as const, borderStyle: "solid", borderColor: "transparent", borderWidth: "0 95px", borderImageSource: `url("${texture(widget.texture)}")`, borderImageSlice: "0 95 fill", borderImageWidth: "0 95px", borderImageRepeat: "stretch" } : {}) }} />;
      })}
      {/* Project logo uses its own aspect-fit box; it does not inherit the obsolete game-logo widget dimensions. */}
      <img ref={brand} src={logo} alt="" style={logoStyle} />
      <img ref={brandTouch} src={logo} alt="" style={logoStyle} />
      <img ref={brandWhite} src={logo} alt="" style={{ ...logoStyle, filter: "brightness(0) invert(1)", mixBlendMode: "plus-lighter" }} />
    </div>
    <span style={{ position: "absolute", left: 16 * viewport.scale, top: 17 * viewport.scale, fontSize: 16 * viewport.scale, color: "#555" }}>Ver. {version}</span>
    {/* Input-only surface must not receive global button artwork or its pseudo-elements. */}
    <button data-input-only="" aria-label="点击开始" disabled={!available} onClick={() => click.current()} style={{ position: "absolute", inset: 0, padding: 0, border: 0, borderRadius: 0, boxShadow: "none", background: "transparent", cursor: available ? "pointer" : "default" }} />
    {error && <div role="alert" style={{ position: "absolute", bottom: 20, left: 20, right: 20, background: "white", color: "#505050" }}>标题素材无法读取：{error}<button onClick={() => setAttempt(value => value + 1)}><span className="btn-content">重试</span></button></div>}
  </main>;
}
