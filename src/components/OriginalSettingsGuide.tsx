import { useLayoutEffect, useRef, useState } from "react";
import profile from "../data/originalSettingsGuides.json";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS, ORIGINAL_WORDING } from "./originalPrefabModel";
import { useOriginalSettingsGuideResources } from "./useOriginalSettingsGuideResources";

export type OriginalSettingsGuideKey = "sudden" | "timingA" | "timingB";
export const ORIGINAL_SETTINGS_GUIDE_ROUTES = profile.routes;
const source = new OriginalPrefabModel(ORIGINAL_PREFABS.tutorialslidewindow!);
const ids = profile.sourceComponents;
const panel = source.components.get(ids.contentPanel)!;
const clip = panel.data.mClipRange;
const origin = source.transform(panel.node);
const empty: readonly string[] = [];

/** TutorialSlideWindow has no AbstractDialog entry/exit tween. Its pages slide independently. */
export function OriginalSettingsGuide({ route, onClose, onError }: {
  route: OriginalSettingsGuideKey | null; onClose(): void; onError(message: string): void;
}) {
  const selected = profile.routes.find(item => item.key === route);
  const urls = useOriginalSettingsGuideResources(route !== null, selected?.pages ?? empty, message => {
    onClose(); onError(message);
  });
  const strip = useRef<HTMLDivElement>(null);
  const tween = useRef<{ frame: number; moving: boolean; page: number }>({ frame: 0, moving: false, page: 1 });
  const [page, setPage] = useState(1), [moving, setMoving] = useState(false);
  const [resetKey, setResetKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    const state = tween.current;
    cancelAnimationFrame(state.frame); state.moving = false; state.page = 1;
    setPage(1); setMoving(false); setResetKey(route);
    if (strip.current) strip.current.style.transform = "translateX(0px)";
    return () => { cancelAnimationFrame(state.frame); state.moving = false; };
  }, [route, urls]);
  const count = selected?.pages.length ?? 0;
  const navigate = (delta: number) => {
    const state = tween.current, destination = state.page + delta;
    if (!urls || state.moving || destination < 1 || destination > count) return;
    const from = -(state.page - 1) * clip.z, to = -(destination - 1) * clip.z;
    state.page = destination; state.moving = true; setPage(destination); setMoving(true);
    let started: number | null = null;
    const update = (time: number) => {
      started ??= time;
      const progress = Math.min(1, (time - started) / (profile.navigation.durationSeconds * 1000));
      const eased = 1 - Math.pow(1 - progress, 3);
      if (strip.current) strip.current.style.transform = `translateX(${from + (to - from) * eased}px)`;
      if (progress < 1) state.frame = requestAnimationFrame(update);
      else { state.moving = false; setMoving(false); }
    };
    state.frame = requestAnimationFrame(update);
  };
  const close = () => { if (!tween.current.moving) onClose(); };
  const model = new OriginalPrefabModel(source.prefab, {
    nodes: {
      [source.components.get(ids.previousButton)!.node]: { active: page > 1 },
      [source.components.get(ids.nextButton)!.node]: { active: page < count },
      [source.components.get(ids.closeButton)!.node]: { active: page === count },
    },
    components: {
      [ids.titleLabel]: { mText: selected ? ORIGINAL_WORDING[selected.titleKey] : "" },
      [ids.pageLabel]: { mText: page + "/" + count },
    },
  });
  const open = route !== null && resetKey === route && urls !== null;
  return <OriginalAuthoredDialog open={open} model={model} onClose={close} motion="none"
    busy={moving} frameComponentId={ids.frameSprite} coverAlpha={profile.navigation.coverAlpha}
    bindings={{ buttons: {
      [ids.previousButton]: { action: () => navigate(-1) },
      [ids.nextButton]: { action: () => navigate(1) },
      [ids.closeButton]: { action: close },
    } }}>
    <div data-original-guide={route ?? undefined} data-original-guide-page={page}
      data-original-guide-moving={moving} style={{ position: "absolute", overflow: "hidden",
        left: origin.x + clip.x - clip.z / 2, top: -(origin.y + clip.y + clip.w / 2),
        width: clip.z, height: clip.w, zIndex: panel.data.mDepth }}>
      <div ref={strip} style={{ position: "absolute", display: "flex", width: clip.z * count, height: clip.w }}>
        {urls?.map((url, index) => <img key={url} src={url} alt="" draggable={false}
          data-original-guide-image={selected!.pages[index]} style={{ display: "block", flex: "none",
            width: clip.z, height: clip.w, userSelect: "none", pointerEvents: "none" }} />)}
      </div>
    </div>
  </OriginalAuthoredDialog>;
}
