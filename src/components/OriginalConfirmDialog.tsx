import source from "../data/originalConfirmDialog.json";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { ORIGINAL_PREFABS, OriginalPrefabModel, originalRef } from "./originalPrefabModel";

type Wording = keyof typeof source.wording;
const prefab = ORIGINAL_PREFABS.confirmcommondialog!;

/** Single-button ConfirmCommonDialog at size Small: adjustDialogSize resizes the window and lifts the
 * button container, DialogHeader refits the strip and title, InitConfirmDialog narrows the contents. */
function smallConfirmModel(title: Wording, message: Wording): { model: OriginalPrefabModel; button: number } {
  const base = new OriginalPrefabModel(prefab);
  const components = [...base.components.values()];
  const header = components.find(item => item.kind === "DialogHeader")!.data;
  const frame = base.components.get(originalRef(header.baseSprite))!;
  const strip = base.components.get(originalRef(header.headerImageSprite))!;
  const label = base.components.get(originalRef(header.textLabel))!;
  const contents = components.find(item => item.kind === "UILabel" && base.nodes.get(item.node)?.name === "ContentsLabel")!;
  const container = [...base.nodes.values()].find(node => node.name === "ButtonContainer")!;
  const button = components.find(item => item.kind === "StarUIButton")!;
  const size = source.sizes.small, rule = source.header;
  const [width, height] = size.window as [number, number];
  const stripWidth = width - rule.widthInset;
  return { button: button.id, model: new OriginalPrefabModel(prefab, {
    components: {
      [frame.id]: { mWidth: width, mHeight: height },
      [strip.id]: { mWidth: stripWidth },
      [label.id]: { mText: source.wording[title].cn, mFontSize: rule.fontSize, mSpacingX: rule.spacingX },
      [contents.id]: { mText: source.wording[message].cn, mWidth: size.contentsWidth },
    },
    nodes: {
      [strip.node]: { x: 0, y: height / 2 - rule.topCenterInset },
      [label.node]: { x: -stripWidth / 2 + rule.labelInset, y: rule.labelY },
      [container.id]: { x: 0, y: size.buttonContainerY },
    },
  }) };
}

const resourceLoadError = smallConfirmModel("word_error", "dialog_resourceLoadError_message");

/** The resource-read failure notice (dialog_resourceLoadError_message), confirmed with OK. */
export function ResourceLoadErrorDialog({ open, onConfirm }: { open: boolean; onConfirm(): void }) {
  return <OriginalAuthoredDialog open={open} model={resourceLoadError.model} onClose={onConfirm}
    bindings={{ buttons: { [resourceLoadError.button]: { action: onConfirm } } }} />;
}
