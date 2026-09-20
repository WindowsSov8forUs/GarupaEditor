import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useOriginalUiSound } from "./OriginalUiSound";
import type { EditorSettingsModalProps } from "./EditorSettingsModal";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPageViewport } from "./OriginalPageViewport";
import { OriginalSkinSettingsPage } from "./OriginalSkinSettingsPage";
import { useOriginalSkinPreviewResources } from "./useOriginalSkinPreviewResources";
import { useOriginalAnimatedSkinResources } from "./useOriginalAnimatedSkinResources";
import { useOriginalPreviewParticleResources } from "./useOriginalPreviewParticleResources";
import { useOriginalSkinSound } from "./useOriginalSkinSound";
import { OriginalSettingsGuide, type OriginalSettingsGuideKey } from "./OriginalSettingsGuide";
import { OriginalRhythmAdjustDialog } from "./OriginalRhythmAdjustDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef, type OriginalData } from "./originalPrefabModel";
import { buildOriginalSettingsPage, type OriginalSettingsDraft } from "./originalSettingsPage";
import { OriginalPageVisible, type OriginalButtonBinding } from "./OriginalPrefabView";

type Props = EditorSettingsModalProps & { onSettingsError?: (message: string) => void };
const shell = new OriginalPrefabModel(ORIGINAL_PREFABS.rhythmgamesettingdialog!);
const tabComponents = [...shell.components.values()].filter(item => item.kind === "LockableTabButton")
  .sort((a, b) => a.data.tabIndex - b.data.tabIndex);
const fromProps = (props: Props): OriginalSettingsDraft => ({ options: props.optionSettings, fps: props.playbackFps,
  mv: props.playbackMvMode, alpha: props.playbackMvAlphaPercent, combo: props.playbackAllPerfectStatusDisplayMode });

export function OriginalGameSettingsModal(props: Props) {
  const [draft, setDraft] = useState(() => fromProps(props));
  const [saving, setSaving] = useState(false);
  const [guide, setGuide] = useState<OriginalSettingsGuideKey | null>(null);
  const [rhythmAdjust, setRhythmAdjust] = useState(false);
  // OptionTabPageController hides its pages; LiveSkinSettings retains the preview.
  const scrollStates = useRef(Array.from({ length: 4 }, () => ({ value: 0 })));
  const visitedPages = useRef(new Set<number>());
  const sound = useOriginalUiSound();
  useLayoutEffect(() => {
    sound?.previewVolume(props.open ? draft.options.simulatorSettings.systemSeVolumePercent : null);
    return () => sound?.previewVolume(null);
  }, [sound, props.open, draft.options.simulatorSettings.systemSeVolumePercent]);
  const savingRef = useRef(false), current = useRef(props); current.current = props;
  const [ready, setReady] = useState(false);
  // Prepare the selected resources during editor startup and retain their leases
  // across dialog lifetimes. Only the visible page owns a renderer and playback.
  const previewOptions = props.open && ready ? draft.options : props.optionSettings;
  const skin = previewOptions.simulatorSettings.skin;
  const previewResources = useOriginalSkinPreviewResources(skin.fieldSkin, props.onSettingsError);
  const previewAnimated = useOriginalAnimatedSkinResources(skin.noteSkin, skin.directionalFlick, props.onSettingsError);
  const previewEffects = useOriginalPreviewParticleResources(skin, props.onSettingsError);
  const previewSound = useOriginalSkinSound(skin.judgeSE,
    previewOptions.noteSeVolumePercent * previewOptions.simulatorSettings.masterVolumePercent / 10000, props.onSettingsError);
  useEffect(() => {
    if (props.open) {
      scrollStates.current.forEach(state => { state.value = 0; });
      setDraft(fromProps(current.current)); setReady(true);
    }
    else { setReady(false); setGuide(null); setRhythmAdjust(false); visitedPages.current.clear(); }
  }, [props.open]);
  const tab = draft.options.simulatorSettings.lastTab;
  if (props.open && ready) visitedPages.current.add(tab);
  const pages = useMemo(() => Array.from({ length: 4 }, (_, index) =>
    buildOriginalSettingsPage(index, draft, setDraft, setGuide, () => setRhythmAdjust(true))), [draft]);
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const accepted = await props.onApplyOptionSettings(draft.options);
      if (accepted === false) return;
      props.onPlaybackFpsChange(draft.fps); props.onPlaybackMvModeChange(draft.mv);
      props.onPlaybackMvAlphaPercentChange(draft.alpha); props.onPlaybackAllPerfectStatusDisplayModeChange(draft.combo);
      setReady(false); props.onClose();
    } catch (error) {
      props.onSettingsError?.(error instanceof Error ? error.message : String(error));
    } finally { savingRef.current = false; setSaving(false); }
  };
  const components: Record<number, OriginalData> = {};
  const unlockedNodes: Record<number, { active: boolean }> = {};
  const buttons: Record<number, OriginalButtonBinding | undefined> = {};
  for (const item of tabComponents) {
    const active = item.data.tabIndex === tab;
    for (const ref of [item.data.lockSprite, item.data.lockCoverSprite]) {
      const component = shell.components.get(originalRef(ref));
      if (component) unlockedNodes[component.node] = { active: false };
    }
    components[originalRef(item.data.tabSprite)] = {
      mSpriteName: active ? item.data.tabActiveSpriteName : item.data.tabDeactiveSpriteName,
    };
    components[originalRef(item.data.captionLabel)] = { mColor: active
      ? { r: 1, g: 59 / 255, b: 114 / 255, a: 1 } : { r: 1, g: 1, b: 1, a: 1 } };
    const button = shell.componentAt(item.node, "StarUIButton")!;
    buttons[button.id] = { role: "tab", selected: active, navigationIndex: item.data.tabIndex,
      label: shell.text(shell.components.get(originalRef(item.data.captionLabel))!),
      action: () => setDraft(old => ({ ...old, options: { ...old.options,
        simulatorSettings: { ...old.options.simulatorSettings, lastTab: item.data.tabIndex } } })),
    };
  }
  buttons[127] = { action: () => void save(), label: shell.text(shell.components.get(124)!) };
  const model = new OriginalPrefabModel(shell.prefab, { components, nodes: {
    ...unlockedNodes,
    [shell.nodeAt("etc/specialSkinBalloon").id]: { active: false },
  } });
  const pageOrigin = shell.transform(shell.nodeAt("Pages/PageRoot").id);
  return <><OriginalAuthoredDialog open={props.open && ready} model={model} bindings={{ buttons }}
    motion="slide-left" busy={saving} onClose={() => void save()}>
    {props.open && ready && <div className="original-prefab-origin" style={{ left: pageOrigin.x, top: -pageOrigin.y }}>
      {[...visitedPages.current].map(index => <OriginalPageVisible.Provider key={index} value={index === tab}>
        <div style={{ display: index === tab ? "contents" : "none" }}>
        {index === 2 ? <OriginalSkinSettingsPage model={pages[index]!.model} bindings={pages[index]!.bindings}
          resources={previewResources} animated={previewAnimated} effects={previewEffects} sound={previewSound}
          draft={draft} visible={index === tab} onError={props.onSettingsError} scrollState={scrollStates.current[index]} />
          : <OriginalPageViewport model={pages[index]!.model} bindings={pages[index]!.bindings} scrollState={scrollStates.current[index]} />}
      </div></OriginalPageVisible.Provider>)}
    </div>}
  </OriginalAuthoredDialog>
    <OriginalSettingsGuide route={props.open ? guide : null} onClose={() => setGuide(null)}
      onError={message => props.onSettingsError?.(message)} />
    {props.open && rhythmAdjust && <OriginalRhythmAdjustDialog draft={draft} onClose={() => setRhythmAdjust(false)}
      onError={message => props.onSettingsError?.(message)} onDecide={value => setDraft(old => ({ ...old,
        options: { ...old.options, simulatorSettings: { ...old.options.simulatorSettings, judgementAdjustValue: value } } }))} />}
  </>;
}
