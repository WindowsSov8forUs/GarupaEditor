import { useEffect, useRef, useState } from "react";
import source from "../data/originalSongDetailProfile.json";
import type { ChartMetadata } from "../chartCore";
import type { SimulatorModeSelection } from "../app/simulator/preAdaptationContract";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { UiPageViewport } from "./UiViewport";
import { DIFFICULTY_LABEL_STYLE } from "./text/difficultyLabelStyle";

const prefabs = source.prefabs as unknown as Record<keyof typeof source.prefabs, OriginalPrefab>;
const word = (key: keyof typeof source.wording) => source.wording[key].replace(/\\n/g, "\n");
const rgba = (value: number) => ({ r: (value >> 16 & 255) / 255, g: (value >> 8 & 255) / 255, b: (value & 255) / 255, a: 1 });

function DemoPlayDialog({ open, auto, onClose, onConfirm }: {
  open: boolean; auto: boolean; onClose(): void; onConfirm(auto: boolean): void;
}) {
  const [draft, setDraft] = useState(auto);
  useEffect(() => { if (open) setDraft(auto); }, [open, auto]);
  const model = new OriginalPrefabModel(prefabs.demoPlayDialog, { nodes: { 17: { active: false } }, components: {
    52: { mText: word("dialog_demoPlaySelect_title") },
    40: { mText: word("dialog_demoPlaySelect_message") },
    45: { mText: word("dialog_demoPlaySelect_caution") },
    54: { mText: word("word_demoPlay") },
  } });
  return <OriginalAuthoredDialog open={open} model={model} onClose={onClose} bindings={{
    radios: { 46: { index: draft ? 0 : 1, onChange: index => setDraft(index === 0),
      labelWidth: source.livePreparation.demo.labelWidth, labelHeight: source.livePreparation.demo.labelHeight } },
    buttons: { 47: { action: () => { onConfirm(draft); onClose(); } } },
  }} />;
}

/** SoloLiveDeckSelect's lower components; team/deck and account rewards are omitted. */
export function LivePreparationPage({ metadata, mode, onModeChange, mvEnabled, hasMv, hasSpecialNotes,
  onMvChange, onSettings, onStart, resourcesReady }: {
  metadata: ChartMetadata; mode: SimulatorModeSelection; onModeChange(mode: SimulatorModeSelection): void;
  mvEnabled: boolean; hasMv: boolean; hasSpecialNotes: boolean; onMvChange(enabled: boolean): void;
  onSettings(): void; onStart(mode: SimulatorModeSelection): Promise<void>; resourcesReady: boolean;
}) {
  const [demoOpen, setDemoOpen] = useState(false), [switching, setSwitching] = useState(false);
  const [launching, setLaunching] = useState(false);
  const animationRoot = useRef<HTMLDivElement>(null), animation = useRef(0), locked = useRef(false);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);
  const practice = mode.sessionMode === "rehearsal", auto = mode.inputMode === "auto";
  const switchMode = () => {
    if (locked.current) return;
    locked.current = true; setSwitching(true);
    const duration = source.livePreparation.switchAnimation.durationSeconds * 1000;
    const distance = -source.livePreparation.switchAnimation.hiddenY;
    let start: number | undefined, changed = false;
    const update = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      if (elapsed >= duration && !changed) {
        changed = true;
        onModeChange({ ...mode, sessionMode: practice ? "live" : "rehearsal" });
      }
      const progress = Math.min(1, (changed ? elapsed - duration : elapsed) / duration);
      const eased = 1 - (1 - progress) ** 2;
      if (animationRoot.current) animationRoot.current.style.transform = `translateY(${distance * (changed ? 1 - eased : eased)}px)`;
      if (elapsed < duration * 2) animation.current = requestAnimationFrame(update);
      else { locked.current = false; setSwitching(false); }
    };
    animation.current = requestAnimationFrame(update);
  };
  const start = async () => {
    if (locked.current) return;
    locked.current = true; setLaunching(true);
    try { await onStart(mode); } finally { locked.current = false; setLaunching(false); }
  };
  const difficulty = DIFFICULTY_LABEL_STYLE[metadata.difficulty];
  const original = new OriginalPrefabModel(prefabs.livePreparation);
  const difficultyNode = original.nodes.get(24)!;
  const model = new OriginalPrefabModel(prefabs.livePreparation, { nodes: {
    // Account consumption, clear records, remote MV downloads and 3D cut-in are not chart data.
    61: { active: false }, 93: { active: false }, 42: { active: false }, 40: { active: false },
    65: { active: false }, 12: { active: false }, 49: { active: false },
    2: { active: !practice }, 52: { active: !practice }, 48: { active: practice },
    18: { active: practice }, 14: { active: false }, 83: { active: auto },
    26: { active: !practice }, 89: { active: !practice && hasMv },
    24: { x: difficultyNode.position.x + difficulty.offsetX },
    69: { active: hasMv }, 100: { active: false },
    ...Object.fromEntries(original.prefab.nodes.filter(node => ["Star3DLiveIcon", "CountLabelRoot"].includes(node.name))
      .map(node => [node.id, { active: false }])),
    ...Object.fromEntries(original.prefab.nodes.filter(node => node.name === "SPIcon").map(node => [node.id, { active: hasSpecialNotes }])),
  }, components: {
    224: { mText: metadata.title, mEncoding: false }, 258: { mText: metadata.difficultyLevel },
    241: { mColor: rgba(difficulty.background) },
    242: { mText: metadata.difficulty, mEffectColor: rgba(difficulty.outline), mSpacingX: difficulty.spacing },
    230: { mText: word("word_liveStart") }, 283: { mText: word("button_practiceLive_start") },
    272: { mText: word(practice ? "button_screen_soloLiveDeckSelect_live" : "button_screen_soloLiveDeckSelect_practice") },
    276: { mText: word("button_demoPlaySetting_text") }, 284: { mText: word("balloon_demoPlayOn_text") },
    246: { mText: `${word("word_autoLive")} ${word(auto ? "word_on" : "word_off")}`,
      mColor: rgba(auto ? source.livePreparation.autoLiveAppearance.selectedTextRgb : source.livePreparation.autoLiveAppearance.unselectedTextRgb) },
    264: { mSpriteName: auto ? source.livePreparation.autoLiveAppearance.selectedSprite : source.livePreparation.autoLiveAppearance.unselectedSprite },
    296: { mText: word("word_setting") },
  } });
  const mv = new OriginalPrefabModel(prefabs.preparationMv, { components: {
    // The uploaded video replaces the original selected-song MV title.
    10: { mText: metadata.title, mEncoding: false },
  } });
  // The original OFF view is separate from the selected MV view. 3D cut-in
  // controls are excluded because this editor only supplies an uploaded 2D MV.
  const mvOff = new OriginalPrefabModel(prefabs.preparationMvOff, {
    nodes: { 8: { active: false } }, components: { 28: { mText: word("word_off") } },
  });
  const mvMount = original.transform(104);
  const busy = switching || launching;
  // JP 10.2.0 live MV preparation capture: icon_switch has no resolved sprite,
  // no atlas replacement and no draw call. Keep its owning button functional.
  // Source: live-preparation-device-10-2-0/runtime.json (profile source identity).
  // A fully available MV is a status icon, not another playback toggle.
  const bindings = { omit: new Set([351, 251]), buttons: {
    226: { label: word(practice ? "button_practiceLive_start" : "word_liveStart"), disabled: !resourcesReady, action: () => void start() },
    304: { label: "演出设置", disabled: !resourcesReady, action: onSettings },
    245: { label: word("word_autoLive"), selected: auto, role: "checkbox" as const,
      action: () => onModeChange({ ...mode, inputMode: auto ? "manual" : "auto" }) },
    305: { label: word("dialog_demoPlaySelect_title"), action: () => setDemoOpen(true) },
    334: { label: word(practice ? "button_screen_soloLiveDeckSelect_live" : "button_screen_soloLiveDeckSelect_practice"), action: switchMode },
    355: { label: "切换 MV", disabled: !hasMv, action: () => onMvChange(!mvEnabled) },
  } };
  return <UiPageViewport><section aria-label="演出准备" inert={busy} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <div className="original-prefab-origin" style={{ left: "var(--ui-page-window-center-x)", top: "var(--ui-page-window-center-y)" }}>
      <OriginalPrefabView model={model} root={67} />
      <OriginalPrefabView model={model} root={86} bindings={bindings} />
      <div ref={animationRoot} className="original-prefab-origin" inert={busy}>
        <OriginalPrefabView model={model} root={19} bindings={bindings} />
        {!practice && hasMv && <div className="original-prefab-origin" style={{ left: mvMount.x, top: -mvMount.y }}>
          <OriginalPrefabView model={mvEnabled ? mv : mvOff} />
        </div>}
      </div>
    </div>
    <DemoPlayDialog open={demoOpen} auto={auto} onClose={() => setDemoOpen(false)}
      onConfirm={enabled => onModeChange({ ...mode, inputMode: enabled ? "auto" : "manual" })} />
  </section></UiPageViewport>;
}
