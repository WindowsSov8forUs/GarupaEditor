import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { OriginalFormSubtitle, OriginalFormInput, OriginalFormButton } from "./OriginalFormParts";

/** The code editor's height (design px): taller than the window's page, which scrolls. */
const EDITOR_HEIGHT = 420;

/**
 * 谱面代码编辑: the chart's code (Garupa JSON) in a tall editor on a scrolling page, and a Bestdori V2 JSON file to load
 * into it (converted). 应用 replaces the chart with the code.
 */
export function ChartCodeEditModal({ open, text, onTextChange, onImportBestdoriV2, onApply, onClose }: {
  open: boolean;
  text: string;
  onTextChange(text: string): void;
  /** Chooses a Bestdori V2 JSON file; its chart, converted, replaces the editor's text. */
  onImportBestdoriV2(): void;
  onApply(): void;
  onClose(): void;
}) {
  return <OriginalTransferDialog open={open} title="谱面代码编辑" onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page chart-code-edit-page">
        <OriginalFormSubtitle text="编辑代码" />
        <div className="chart-code-edit-field">
          <OriginalFormInput multiline fillHeight={EDITOR_HEIGHT} aria-label="谱面代码" value={text}
            onChange={event => onTextChange(event.currentTarget.value)} spellCheck={false} />
        </div>
        <OriginalFormSubtitle text="导入 Bestdori V2" />
        <div>
          <OriginalFormButton onClick={onImportBestdoriV2}>导入 JSON</OriginalFormButton>
        </div>
      </div>
      <div className="transfer-actions">
        <OriginalFormButton tone="gray" onClick={onClose}>关闭</OriginalFormButton>
        <OriginalFormButton tone="pink" onClick={onApply}>应用</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>;
}
