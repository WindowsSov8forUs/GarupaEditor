import { useMemo } from "react";
import { OriginalPrefabModel, originalRef, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import profile from "../data/originalMusicFilterProfile.json";

// The music filter's extension radios (StarUIRadioButtonManager 121): original check-circle radios with labels,
// laid out by the manager's columnCount / widthMargin / heightMargin from its start position.
const source = new OriginalPrefabModel(profile.content as unknown as OriginalPrefab);
const MANAGER_ID = 121;
const manager = source.components.get(MANAGER_ID)!;
const rootId = manager.node;
const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, rootId))
  .map(node => node.id === rootId ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const prefab: OriginalPrefab = { resource: source.prefab.resource, nodes,
  components: source.prefab.components.filter(component => nodes.some(node => node.id === component.node)) };
const local = new OriginalPrefabModel(prefab);
const startNode = nodes.find(node => node.transformId === originalRef(manager.data.startPosTransform))!;
const start = local.transform(startNode.id);
/** Authored spacing of this radio group, in design px. */
export const ORIGINAL_RADIO_WIDTH_MARGIN = manager.data.widthMargin as number;
export const ORIGINAL_RADIO_HEIGHT_MARGIN = manager.data.heightMargin as number;
/**
 * Vertical distance from the section heading's centre (ExtensionBase) to the centre of the first radio row in the
 * original filter dialog, in design px.
 */
export const ORIGINAL_RADIO_HEADING_TO_FIRST_ROW = source.transform(source.nodeAt("ExtensionComponent/ExtensionBase").id).y
  - source.transform(startNode.id).y;
/** Left edge of an option's check circle relative to its layout position, in design px. */
const CHECK_LEFT = 24;

/**
 * Original radio group with caller labels: `columns` per row, `widthMargin` apart (design px). The box is
 * columns × widthMargin wide and rows × heightMargin tall, with the first check circle at its left edge.
 */
export function OriginalRadioOptions({ options, value, onChange, columns, widthMargin = ORIGINAL_RADIO_WIDTH_MARGIN,
  ariaLabel, disabled = false }: {
  options: readonly string[]; value: number; onChange(index: number): void; columns: number; widthMargin?: number;
  ariaLabel: string; disabled?: boolean;
}) {
  const model = useMemo(() => new OriginalPrefabModel(prefab, { components: {
    [MANAGER_ID]: { radioButtonNameList: options, RawNameFlag: 1, columnCount: columns, widthMargin },
  } }), [options, columns, widthMargin]);
  const rows = Math.ceil(options.length / columns);
  return <div aria-label={ariaLabel} style={{ position: "relative", flex: "0 0 auto",
    width: columns * widthMargin, height: rows * ORIGINAL_RADIO_HEIGHT_MARGIN }}>
    <div className="original-prefab-origin" style={{ left: CHECK_LEFT - start.x, top: ORIGINAL_RADIO_HEIGHT_MARGIN / 2 + start.y }}>
      <OriginalPrefabView model={model} bindings={{ radios: { [MANAGER_ID]: {
        index: value, disabled, onChange: index => { if (index !== value) onChange(index); },
        fontSize: 20, labelWidth: widthMargin - 50, labelHeight: 50, labelSpacingX: 1, labelOffset: { x: -8, y: -3 }, maxLineCount: 1,
      } } }} />
    </div>
  </div>;
}
