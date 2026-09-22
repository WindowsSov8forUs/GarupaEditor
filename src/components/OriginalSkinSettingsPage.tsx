import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef } from "./originalPrefabModel";
import { OriginalPrefabView, type OriginalViewBindings } from "./OriginalPrefabView";
import { OriginalPageViewport, type OriginalPageScrollState } from "./OriginalPageViewport";
import type { OriginalSkinPreviewResources } from "./useOriginalSkinPreviewResources";
import { OriginalSkinPreview } from "./OriginalSkinPreview";
import type { OriginalAnimatedSkinResources } from "./useOriginalAnimatedSkinResources";
import type { useOriginalSkinSound } from "./useOriginalSkinSound";
import type { OriginalPreviewParticlePack } from "../simulator/public/previewParticles";
import type { OriginalSettingsDraft } from "./originalSettingsPage";
import selection from "../data/originalSkinSelection.json";
import fieldSkinLogos from "../data/originalFieldSkinLogos.json";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import type { ApplicationResourceSlot } from "../resources/selections";

function FieldBandLogo({ bandId }: { bandId: number }) {
  const url = useApplicationResourceUrl(`ui.field-band-logo.${String(bandId).padStart(3, "0")}` as ApplicationResourceSlot);
  return <img className="original-prefab-texture" src={url} alt="" />;
}

const noteModel = new OriginalPrefabModel(ORIGINAL_PREFABS.ingamesettingnoteskin!);
const directionalModel = new OriginalPrefabModel(ORIGINAL_PREFABS.ingamesettingdirectionalflickskin!);
function SampleRow({ directional, images }: { directional: boolean; images?: readonly string[] }) {
  const model = directional ? directionalModel : noteModel;
  const controller = [...model.components.values()].find(item => item.kind ===
    (directional ? "InGameSettingDirectionalFlickSkin" : "InGameSettingNoteSkin"))!;
  const fields = directional ? ["leftFlickNoteTexture", "rightFlickNoteTexture"]
    : ["noteNormal", "noteSkill", "noteLong", "noteFlick"];
  const textures = Object.fromEntries(fields.map((key, index) => [originalRef(controller.data[key]),
    images?.[index] ? <img key={key} className="original-prefab-texture" src={images[index]} alt="" /> : null]));
  return <div className="original-prefab-origin" style={{ left: 278, top: 0 }}>
    <OriginalPrefabView model={model} bindings={{ textures }} />
  </div>;
}

export function OriginalSkinSettingsPage({ model, bindings, draft, resources, animated, effects, sound, onError, scrollState, specialRow, visible = true }: {
  model: OriginalPrefabModel; bindings: OriginalViewBindings; draft: OriginalSettingsDraft;
  resources: OriginalSkinPreviewResources; animated: OriginalAnimatedSkinResources | null;
  effects: OriginalPreviewParticlePack | null; sound: ReturnType<typeof useOriginalSkinSound>;
  onError?: (message: string) => void;
  scrollState?: OriginalPageScrollState;
  visible?: boolean;
  specialRow?: ReactNode;
}) {
  const [aspect, setAspect] = useState(() => Math.min(2, window.innerWidth / window.innerHeight));
  useEffect(() => {
    const resized = () => setAspect(Math.min(2, window.innerWidth / window.innerHeight));
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  const previewModel = useMemo(() => {
    const texture = model.components.get(272)!;
    // SkinPreview.Init: width = height; local X scale = min(screen aspect, 2).
    return new OriginalPrefabModel(model.prefab, {
      components: { ...model.overrides.components, [texture.id]: { ...texture.data, mWidth: texture.data.mHeight } },
      nodes: { ...model.overrides.nodes, [texture.node]: { ...model.overrides.nodes?.[texture.node], scaleX: aspect } },
    });
  }, [model, aspect]);
  useEffect(() => {
    if (!visible) sound.stop();
    return sound.stop;
  }, [visible, sound.stop]);
  const fieldLogo = fieldSkinLogos.rows.find(row => row.setting === draft.options.simulatorSettings.skin.fieldSkin);
  const fieldController = model.components.get(278)!;
  const fieldLogoLoader = model.components.get(originalRef(fieldController.data.bandLogoLoader))!;
  const fieldLogoTexture = originalRef(fieldLogoLoader.data.texture);
  const views = useMemo<OriginalViewBindings>(() => ({ ...bindings,
    buttons: { ...bindings.buttons,
      245: sound.ready ? { action: () => sound.play("tap") } : undefined,
      253: sound.ready ? { action: () => sound.play("flick") } : undefined,
    },
    radios: {
      ...bindings.radios,
      296: { ...bindings.radios![296]!, renderOption: index =>
        <SampleRow directional={false} images={resources?.note[selection.note[index]!.setting]} /> },
      239: { ...bindings.radios![239]!, renderOption: index =>
        <SampleRow directional images={resources?.directional[selection.directional[index]!.setting]} /> },
    },
    textures: { ...bindings.textures,
      [fieldLogoTexture]: fieldLogo ? <FieldBandLogo bandId={fieldLogo.bandId} /> : null,
      272: <OriginalSkinPreview resources={resources} animated={animated} effects={effects} speed={draft.options.rhythmNoteSpeed}
        noteSize={draft.options.rhythmNoteSizePercent} lineBrightness={draft.options.longLineBrightnessPercent} visible={visible} onError={onError} />,
    },
  }), [bindings, resources, animated, effects, fieldLogo, fieldLogoTexture, draft.options.rhythmNoteSpeed, draft.options.rhythmNoteSizePercent, draft.options.longLineBrightnessPercent, visible, onError, sound.ready, sound.play]);
  const specialOrigin = model.transform(model.nodeAt("Contents/ScrollView/Contents/startRowPosision").id);
  return <OriginalPageViewport model={previewModel} bindings={views} scrollState={scrollState}>
    <div className="original-prefab-origin" style={{ left: specialOrigin.x, top: -specialOrigin.y }}>{specialRow}</div>
  </OriginalPageViewport>;
}
