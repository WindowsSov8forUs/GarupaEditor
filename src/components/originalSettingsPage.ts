import { originalSoundVolumeLabel } from "./originalSettingsValues";
import guideProfile from "../data/originalSettingsGuides.json";
import type { OriginalSettingsGuideKey } from "./OriginalSettingsGuide";
import { ORIGINAL_SUDDEN_DEFAULT, ORIGINAL_SUDDEN_MIN, ORIGINAL_SUDDEN_MAX,
  ORIGINAL_SUDDEN_STEP, ORIGINAL_SUDDEN_SMALL_STEP } from "../simulator/public/settings";
import { LONG_NOTE_LINE_BRIGHTNESS_MIN, LONG_NOTE_LINE_BRIGHTNESS_MAX, LONG_NOTE_LINE_BRIGHTNESS_DEFAULT } from "../simulator/public/settings";
import type { EditorOptionSettings } from "../chartCore";
import skinSelection from "../data/originalSkinSelection.json";
import runtime from "../data/originalSettingsRuntime.json";
import radioLayout from "../data/originalSettingsRadioLayout.json";
import type { SimulatorMenuSettings } from "../app/simulator/menuSettings";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef, type OriginalData, type OriginalOverrides } from "./originalPrefabModel";
import type { OriginalButtonBinding, OriginalRadioBinding, OriginalSliderBinding, OriginalViewBindings } from "./OriginalPrefabView";

export interface OriginalSettingsDraft { options: EditorOptionSettings; fps: number; mv: boolean; alpha: number; combo: boolean }
export const ORIGINAL_SETTINGS_PAGES = ["livesettingstabpage", "liveeffectvolumetabpage", "liveskintabpage", "systemtabpage"] as const;
type PageUpdate = (change: (previous: OriginalSettingsDraft) => OriginalSettingsDraft) => void;

export function buildOriginalSettingsPage(page: number, draft: OriginalSettingsDraft, update: PageUpdate,
  openGuide?: (key: OriginalSettingsGuideKey) => void, openRhythmAdjust?: () => void) {
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS[ORIGINAL_SETTINGS_PAGES[page]!]!);
  const components: Record<number, OriginalData> = {};
  const nodes: NonNullable<OriginalOverrides["nodes"]> extends Readonly<infer T> ? T : never = {};
  const buttons: Record<number, OriginalButtonBinding | undefined> = {};
  const radios: Record<number, OriginalRadioBinding | undefined> = {};
  const sliders: Record<number, OriginalSliderBinding> = {};
  const checkboxes: NonNullable<OriginalViewBindings["checkboxes"]> extends Readonly<infer T> ? T : never = {};
  const retainChildren = (path: string, names: readonly string[]) => {
    const parent = source.nodeAt(path);
    for (const child of source.nodes.values()) {
      if (child.parent === parent.id && !names.includes(child.name)) nodes[child.id] = { active: false };
    }
  };
  const place = (path: string, y: number, x?: number) => {
    const node = source.nodeAt(path);
    nodes[node.id] = { ...nodes[node.id], y, ...(x === undefined ? {} : { x }) };
  };
  const option = <K extends keyof EditorOptionSettings>(key: K, value: EditorOptionSettings[K]) =>
    update(old => ({ ...old, options: { ...old.options, [key]: value } }));
  const native = <K extends keyof SimulatorMenuSettings>(key: K, value: SimulatorMenuSettings[K]) =>
    update(old => ({ ...old, options: { ...old.options, simulatorSettings: { ...old.options.simulatorSettings, [key]: value } } }));
  const wrap = (value: number, minimum: number, maximum: number) => value > maximum ? minimum : value < minimum ? maximum : value;
  const number = (id: number, value: number, minimum: number, maximum: number, step: number, changed: (value: number) => void,
    display: (value: number) => string, defaultValue?: number) => {
    const controller = source.components.get(id)!;
    const label = originalRef(controller.data.label ?? controller.data.valueLabel);
    components[label] = { mText: display(value) };
    for (const button of source.components.values()) {
      if (button.kind !== "StarUIButton") continue;
      const delegates = (button.data.onClick ?? []) as OriginalData[];
      const method = delegates.find(item => originalRef(item.mTarget) === id)?.mMethodName as string | undefined;
      const direction = button.id === originalRef(controller.data.plusButton) || method?.includes("UpButton") ? 1
        : button.id === originalRef(controller.data.minusButton) || method?.includes("DownButton") ? -1 : 0;
      if (direction) {
        const amount = id === 604 ? method?.includes("Super") ? 0.5 : method?.includes("Small") ? 0.01 : 0.1
          : id === 614 && method?.includes("Small") ? ORIGINAL_SUDDEN_SMALL_STEP : step;
        buttons[button.id] = { action: () => {
          const sum = Math.fround(Math.fround(value) + Math.fround(direction * amount));
          const next = controller.kind === "LiveSettingsHiSpeed"
            ? sum > maximum + runtime.speedUpperTolerance.value ? minimum
              : sum < runtime.speedLowerThreshold.value ? maximum : Number(sum.toFixed(2))
            : wrap(Math.round(sum), minimum, maximum);
          changed(next);
        } };
      } else if (method === "OnPressDefaultButton" && defaultValue !== undefined) {
        buttons[button.id] = { action: () => changed(defaultValue) };
      }
    }
  };
  const radio = (controllerId: number, index: number, onChange: (index: number) => void) => {
    const controller = source.components.get(controllerId)!;
    radios[originalRef(controller.data.radioButtonManager)] = { index, onChange };
  };
  const boolean = (controllerId: number, value: boolean, onChange: (value: boolean) => void) =>
    radio(controllerId, value ? 0 : 1, index => onChange(index === 0));
  const volume = (id: number, value: number, changed: (value: number) => void, minimum = 0) => {
    const controller = source.components.get(id)!;
    const title = [...source.components.values()].find(item => item.kind === "UILabel" &&
      source.isWithin(item.node, controller.node) && source.nodes.get(item.node)?.path.endsWith("/bg/text"));
    sliders[originalRef(controller.data.slider)] = { value, onChange: percent => changed(Math.fround(Math.max(minimum / 100, percent / 100)) * 100), label: title ? source.text(title) : "" };
    components[originalRef(controller.data.valueLabel)] = { mText: originalSoundVolumeLabel(value) };
    buttons[originalRef(controller.data.defaultButton)] = { action: () => changed(70) };
  };
  if (page === 0) {
    if (openRhythmAdjust) buttons[465] = { action: openRhythmAdjust };
    if (openGuide) for (const guide of guideProfile.routes)
      buttons[guide.buttonId] = { action: () => openGuide(guide.key as OriginalSettingsGuideKey) };
    number(604, draft.options.rhythmNoteSpeed, 1, 12, 0.1, value => option("rhythmNoteSpeed", value), value => value.toFixed(2), 5);
    number(569, draft.options.rhythmNoteSizePercent, 80, 150, 10, value => option("rhythmNoteSizePercent", value), value => `${value}%`, 100);
    number(547, draft.options.simulatorSettings.judgementAdjustValue, -30, 30, 1,
      value => native("judgementAdjustValue", value), String);
    number(439, draft.options.simulatorSettings.judgementAdjustValueB, -5, 5, 1,
      value => native("judgementAdjustValueB", value), String);
    number(614, draft.options.simulatorSettings.suddenRate, ORIGINAL_SUDDEN_MIN, ORIGINAL_SUDDEN_MAX,
      ORIGINAL_SUDDEN_STEP, value => native("suddenRate", value), value => `${value}%`, ORIGINAL_SUDDEN_DEFAULT);
    checkboxes[519] = { checked: draft.options.simulatorSettings.suddenLane, onChange: value => native("suddenLane", value) };
    const comboPosition = draft.options.simulatorSettings.displayComboPosition;
    boolean(453, !draft.options.simulatorSettings.hideCombo, value => native("hideCombo", !value));
    radio(492, comboPosition < 3 ? 0 : 1, index => native("displayComboPosition", index * 3 + comboPosition % 3));
    radio(636, comboPosition % 3, index => native("displayComboPosition", (comboPosition < 3 ? 0 : 3) + index));
    if (draft.options.simulatorSettings.hideCombo) {
      radios[541] = { ...radios[541]!, disabled: true };
      radios[456] = { ...radios[456]!, disabled: true };
    }
    boolean(473, draft.options.simultaneousLineEnabled, value => option("simultaneousLineEnabled", value));
    boolean(508, draft.options.colorAssistEnabled, value => option("colorAssistEnabled", value));
    boolean(573, draft.options.mirrorEnabled, value => option("mirrorEnabled", value));
    boolean(458, draft.options.clickEffectEnabled, value => option("clickEffectEnabled", value));
    number(596, draft.options.longLineBrightnessPercent, LONG_NOTE_LINE_BRIGHTNESS_MIN, LONG_NOTE_LINE_BRIGHTNESS_MAX, 10,
      value => option("longLineBrightnessPercent", value), value => `${value}%`, LONG_NOTE_LINE_BRIGHTNESS_DEFAULT);
  } else if (page === 1) {
    const root = "Contents/ScrollView/Contents";
    // Expose implemented settings, not disabled controls for absent game systems.
    retainChildren(root, ["LiveMode", "LiveEffect", "MV", "LiveSoundVolume"]);
    retainChildren(`${root}/LiveMode`, ["OptionPageCaption", "HighFrequencyMode", "Grid"]);
    retainChildren(`${root}/LiveMode/Grid`, ["HighFrequencyModeDescription"]);
    retainChildren(`${root}/LiveEffect`, ["OptionPageCaption", "DisplayFastSlow", "DisplayAllPerfectStatus"]);
    retainChildren(`${root}/LiveEffect/DisplayAllPerfectStatus`, ["DisplayAllPerfectStatusRadioButton"]);
    retainChildren(`${root}/MV`, ["OptionPageCaption", "MVModeQuality", "MVBrightness"]);
    retainChildren(`${root}/LiveSoundVolume`, ["OptionPageCaption", "BGMSlider", "SESlider"]);
    // Keep the authored controls and columns, closing the removed rows/sections.
    place(`${root}/LiveMode/HighFrequencyMode`, -50);
    place(`${root}/LiveMode/Grid`, -158);
    place(`${root}/LiveMode/Grid/HighFrequencyModeDescription`, 0);
    place(`${root}/LiveEffect`, -363);
    for (const name of ["DisplayFastSlow", "DisplayAllPerfectStatus"])
      place(`${root}/LiveEffect/${name}`, -50);
    place(`${root}/MV`, -540);
    place(`${root}/MV/MVBrightness`, -49, -156);
    place(`${root}/LiveSoundVolume`, -786);
    radio(598, draft.fps === 120 ? 0 : 1, index => update(old => ({ ...old, fps: index === 0 ? 120 : 60 })));
    boolean(676, !draft.options.simulatorSettings.hideFastSlow, value => native("hideFastSlow", !value));
    boolean(863, draft.combo, value => update(old => ({ ...old, combo: value })));
    // The editor selects its supplied MV rather than a server-side movie quality.
    const mvMode = source.components.get(602)!;
    components[601] = { mText: source.components.get(732)!.data.mText };
    components[originalRef(mvMode.data.radioButtonManager)] = { radioButtonNameList: ["word_on", "word_off"] };
    boolean(602, draft.mv, value => update(old => ({ ...old, mv: value })));
    number(657, draft.alpha, 30, 100, 10, value => update(old => ({ ...old, alpha: value })), value => `${value}%`);
    volume(825, draft.options.simulatorSettings.musicVolumePercent, value => native("musicVolumePercent", value), 0.01);
    volume(684, draft.options.noteSeVolumePercent, value => option("noteSeVolumePercent", value));
  } else if (page === 2) {
    // No special-skin selector is implemented. Keep the ordinary prefab's row origin.
    nodes[source.nodeAt("Contents/ScrollView/Contents/MovableContents/ROW3/IsFixecBG").id] = { active: false };
    const settings = draft.options.simulatorSettings.skin;
    const skin = (key: keyof typeof settings, value: number | boolean) => update(old => ({ ...old,
      options: { ...old.options, simulatorSettings: { ...old.options.simulatorSettings,
        skin: { ...old.options.simulatorSettings.skin, [key]: value } } } }));
    for (const [controllerId, key, rows] of [
      [288, "noteSkin", skinSelection.note], [302, "directionalFlick", skinSelection.directional],
    ] as const) {
      const controller = source.components.get(controllerId)!;
      const managerId = originalRef(controller.data.radioButtonManager);
      const manager = source.components.get(managerId)!;
      components[managerId] = { radioButtonNameList: rows.map(row => row.label), RawNameFlag: 1 };
      radios[managerId] = { index: rows.findIndex(row => row.setting === settings[key]),
        labelWidth: 160, labelHeight: 100, onChange: index => skin(key, rows[index]!.setting) };
      const next = source.prefab.nodes.find(item => item.transformId === originalRef(controller.data.nextContentsPos))!;
      const start = source.prefab.nodes.find(item => item.transformId === originalRef(manager.data.startPosTransform))!;
      const own = source.nodes.get(controller.node)!;
      const ownY = nodes[own.id]?.y ?? own.position.y;
      const nextY = ownY + start.position.y - (rows.length + 1) * manager.data.heightMargin;
      nodes[next.id] = { ...nodes[next.id], x: 0, y: nextY };
    }
    number(278, settings.fieldSkin, 0, 14, 1, value => skin("fieldSkin", value), value => String(value + 1));
    number(232, settings.tapEffect, 0, 4, 1, value => skin("tapEffect", value), value => String(value + 1));
    number(292, settings.judgeSE, 0, 3, 1, value => skin("judgeSE", value), value => String(value + 1));
    // OptionData.IsDirectionalFlickEffectNormal is true for stored value 0 (normal), not 1 (light).
    boolean(263, settings.directionalFlickEffect === 0, value => skin("directionalFlickEffect", value ? 0 : 1));
    buttons[313] = { action: () => native("skin", { ...settings, noteSkin: 0, fieldSkin: 0, tapEffect: 0,
      judgeSE: 0, directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false, special: { kind: "none" } }) };
    // Reverse 63f4fdf1: SetActiveUnownedObject targets these serialized references,
    // not guessed node names. Editor-provided ordinary skins have no account ownership gate.
    const fieldSkin = source.components.get(278)!;
    for (const field of ["textCover", "lockIcon", "exMissionCaption", "bandLogoLoader"]) {
      const id = originalRef(fieldSkin.data[field]);
      const node = source.nodes.get(id) ?? source.prefab.nodes.find(item => item.transformId === id)
        ?? source.nodes.get(source.components.get(id)?.node ?? -1);
      if (node) nodes[node.id] = { active: false };
    }
  }
  if (page === 3) {
    retainChildren("Contents/ScrollView/Contents", ["SystemVolumeRow"]);
    retainChildren("Contents/ScrollView/Contents/SystemVolumeRow", ["ROW1", "ROW2"]);
    volume(345, draft.options.simulatorSettings.systemBgmVolumePercent,
      value => native("systemBgmVolumePercent", value), 0.01);
    volume(477, draft.options.simulatorSettings.systemSeVolumePercent,
      value => native("systemSeVolumePercent", value));
  }
  const model = new OriginalPrefabModel(source.prefab, { components, nodes });
  // OptionRadioButtonBase.Init overrides the raw radio prefab before page-specific setters.
  // Apply it even to disabled controls; capability and presentation are separate.
  const pageLayouts = (radioLayout.pageOverrides as Record<string, Record<string, {
    labelWidth?: number; labelHeight?: number;
  }>>)[ORIGINAL_SETTINGS_PAGES[page]!];
  for (const controller of source.components.values()) {
    if (!model.isActive(controller.node)) continue;
    const manager = originalRef(controller.data.radioButtonManager);
    if (!manager) continue;
    const defaults = radioLayout.optionRadio;
    const size = controller.kind === "LiveCoreSettingsGraphicsMode" ? defaults.graphicsModeLabelSize : defaults.labelWidth;
    const pageLayout = pageLayouts?.[String(controller.id)];
    radios[manager] = { index: -1, ...radios[manager], labelWidth: size, labelHeight: size,
      fontSize: defaults.fontSize, maxLineCount: defaults.maxLineCount, labelOffset: defaults.labelOffset,
      // Base Init changes maxLineCount 0 -> 1, growing the label to its natural
      // size. Subsequent page setters replace only the dimensions they specify.
      labelNaturalSize: { width: pageLayout?.labelWidth === undefined, height: pageLayout?.labelHeight === undefined },
      ...pageLayout };
  }
  const bindings: OriginalViewBindings = { buttons, radios, sliders, checkboxes };
  return { model, bindings };
}
