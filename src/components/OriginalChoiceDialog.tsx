import type { ReactNode } from "react";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS, type OriginalOverrides } from "./originalPrefabModel";
import { CURRENT_PAUSE_SERIALIZED_GRAPHS } from "../simulator/backends/resources/currentPauseSerializedProfile";

const two = ORIGINAL_PREFABS.selectablecommondialog!;
const three = structuredClone(two);
const source = new OriginalPrefabModel(two);
const cancel = source.nodeAt("ButtonContainer/CancelButton");
const clonedNodes = two.nodes.filter(n => source.isWithin(n.id, cancel.id));
const clonedComponents = two.components.filter(c => clonedNodes.some(n => n.id === c.node));
const ids = new Set([...clonedNodes.flatMap(n => [n.id, n.transformId]), ...clonedComponents.map(c => c.id)]);
const remap = (v: any): any => Array.isArray(v) ? v.map(remap) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "m_PathID" && ids.has(x as number) ? Number(x) + 100 : remap(x)])) : v;
three.nodes.push(...clonedNodes.map(n => ({ ...n, id: n.id + 100, transformId: n.transformId + 100,
  parent: n.id === cancel.id ? n.parent : n.parent! + 100,
  name: n.id === cancel.id ? "CenterButton" : n.name, path: n.path.replace("CancelButton", "CenterButton") })));
three.components.push(...clonedComponents.map(c => ({ ...c, id: c.id + 100, node: c.node + 100, data: remap(c.data) })));

/** Original common-dialog geometry and button implementation, with caller-owned choices. */
export function OriginalChoiceDialog({ open, title, message = "", choices, onClose, busy = false, children }: {
  open: boolean; title: string; message?: string; choices: readonly { label: string; action(): void; tone?: "gray" | "pink" }[];
  onClose(): void; busy?: boolean; children?: ReactNode;
}) {
  const triple = choices.length === 3;
  const layout = triple ? CURRENT_PAUSE_SERIALIZED_GRAPHS.retryable : CURRENT_PAUSE_SERIALIZED_GRAPHS.selectable;
  const nodes: Record<number, any> = {
    3: { y: -layout.header.position[1] }, 1: { x: layout.title.position[0], y: -layout.title.position[1] },
    2: { y: -layout.content.position[1], active: !children },
  };
  const components: NonNullable<OriginalOverrides["components"]> extends Readonly<infer T> ? T : never = {
    30: { mWidth: layout.window.size[0], mHeight: layout.window.size[1] },
    31: { mWidth: layout.header.size[0], mHeight: layout.header.size[1] },
    33: { mText: title, mFontSize: layout.title.fontSize, mSpacingX: layout.title.spacingX },
    35: { mText: message, mWidth: layout.window.size[0] - 60, mHeight: 114, mFontSize: 24, mSpacingY: 6 },
  };
  const buttons: Record<number, any> = {};
  const rows = triple ? [[9,39,38,41,40],[109,139,138,141,140],[12,45,42,46,47]] : [[9,39,38,41,40],[12,45,42,46,47]];
  rows.forEach(([node, button, label, sprite, cover], i) => {
    const item = choices[i], profile = layout.buttons[i];
    nodes[node] = { x: profile.position[0], y: -profile.position[1] };
    const pink = item.tone === "pink";
    components[label] = { mText: item.label, mFontSize: 32, mWidth: profile.labelSize[0],
      mColor: pink ? {r:1,g:1,b:1,a:1} : {r:80/255,g:80/255,b:80/255,a:1} };
    components[sprite] = components[cover] = { mSpriteName: pink ? "button_pink" : "button_gray" };
    buttons[button] = { label: item.label, action: item.action, disabled: busy };
  });
  const model = new OriginalPrefabModel(triple ? three : two, { nodes, components });
  return <OriginalAuthoredDialog open={open} model={model} bindings={{buttons}} onClose={onClose} busy={busy}>
    {children && <div style={{position:"absolute",left:-280,top:-35,width:560,zIndex:11}}>{children}</div>}
  </OriginalAuthoredDialog>;
}
