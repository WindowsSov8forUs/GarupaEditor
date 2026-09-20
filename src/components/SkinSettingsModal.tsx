import { OriginalButton, OriginalDialogFrame, OriginalDialogHeader } from "./OriginalUi";
import { type BestdoriCatalogKind, type SkinSelection } from "../skinLoader";
import { SettingPrimaryTitle } from "./SettingPrimaryTitle";
import { StepperIcon } from "./StepperIcon";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition } from "./useModalTransition";

type SkinSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  pendingSkinSelection: SkinSelection;
  catalogStatus: string;
  rhythmTypeTitle: string;
  onRhythmTypeChange: (value: string) => void;
  onDirectionalTypeChange: (value: string) => void;
  onRhythmSeTypeChange: (value: string) => void;
  onDirectionalSeTypeChange: (value: string) => void;
  onBgTypeChange: (value: string) => void;
  onFieldTypeChange: (value: string) => void;
  onJudgeTypeChange: (value: string) => void;
  rhythmSkinTypes: readonly string[];
  directionalSkinTypes: readonly string[];
  rhythmSeSkinTypes: readonly string[];
  directionalSeSkinTypes: readonly string[];
  bgSkinTypes: readonly string[];
  fieldSkinTypes: readonly string[];
  judgeSkinTypes: readonly string[];
  rhythmCatalogKind: BestdoriCatalogKind;
  formatTypeLabel: (kind: BestdoriCatalogKind | null, type: string) => string;
  isSkinApplying: boolean;
  onApplySkinSelection: () => void;
};

type TypeStepperProps = {
  title: string;
  titleWidth?: "full" | "fit";
  value: string;
  index: number;
  types: readonly string[];
  catalogKind: BestdoriCatalogKind | null;
  onChange: (value: string) => void;
  formatTypeLabel: (kind: BestdoriCatalogKind | null, type: string) => string;
};

function resolveTypeIndex(currentType: string, options: readonly string[]): number {
  if (options.length === 0) {
    return 0;
  }

  const directIndex = options.indexOf(currentType);
  if (directIndex >= 0) {
    return directIndex;
  }

  return 0;
}

function TypeStepper({
  title,
  titleWidth = "full",
  value,
  index,
  types,
  catalogKind,
  onChange,
  formatTypeLabel,
}: TypeStepperProps) {
  const titleClassName = titleWidth === "fit"
    ? "setting-title-strip setting-title-strip--fit"
    : "setting-title-strip";

  return (
    <div className="setting-block">
      <span className={titleClassName}>{title}</span>
      <div className="inline-stepper">
        <button
          type="button"
          className="stepper-btn"
          disabled={index <= 0}
          onClick={() => {
            const nextType = types[index - 1];
            if (nextType) {
              onChange(nextType);
            }
          }}
        >
          <StepperIcon type="left" />
        </button>
        <input
          type="text"
          className="stepper-input"
          value={formatTypeLabel(catalogKind, value)}
          readOnly
          tabIndex={-1}
        />
        <button
          type="button"
          className="stepper-btn"
          disabled={index >= types.length - 1}
          onClick={() => {
            const nextType = types[index + 1];
            if (nextType) {
              onChange(nextType);
            }
          }}
        >
          <StepperIcon type="right" />
        </button>
      </div>
    </div>
  );
}

export function SkinSettingsModal({
  open,
  onClose,
  pendingSkinSelection,
  catalogStatus,
  rhythmTypeTitle,
  rhythmCatalogKind,
  onRhythmTypeChange,
  onDirectionalTypeChange,
  onRhythmSeTypeChange,
  onDirectionalSeTypeChange,
  onBgTypeChange,
  onFieldTypeChange,
  onJudgeTypeChange,
  rhythmSkinTypes,
  directionalSkinTypes,
  rhythmSeSkinTypes,
  directionalSeSkinTypes,
  bgSkinTypes,
  fieldSkinTypes,
  judgeSkinTypes,
  formatTypeLabel,
  isSkinApplying,
  onApplySkinSelection,
}: SkinSettingsModalProps) {
  const { mounted, phase, transitionStyle, transitionRef } = useModalTransition(open);
  const modalLayerStyle = useModalLayer(open, mounted);

  if (!mounted) {
    return null;
  }

  const rhythmIndex = resolveTypeIndex(pendingSkinSelection.rhythmType, rhythmSkinTypes);
  const directionalIndex = resolveTypeIndex(pendingSkinSelection.directionalType, directionalSkinTypes);
  const rhythmSeIndex = resolveTypeIndex(pendingSkinSelection.rhythmSeType, rhythmSeSkinTypes);
  const directionalSeIndex = resolveTypeIndex(pendingSkinSelection.directionalSeType, directionalSeSkinTypes);
  const bgIndex = resolveTypeIndex(pendingSkinSelection.bgType, bgSkinTypes);
  const fieldIndex = resolveTypeIndex(pendingSkinSelection.fieldType, fieldSkinTypes);
  const judgeIndex = resolveTypeIndex(pendingSkinSelection.judgeType, judgeSkinTypes);

  const rhythmValue = rhythmSkinTypes[rhythmIndex] ?? pendingSkinSelection.rhythmType;
  const directionalValue = directionalSkinTypes[directionalIndex] ?? pendingSkinSelection.directionalType;
  const rhythmSeValue = rhythmSeSkinTypes[rhythmSeIndex] ?? pendingSkinSelection.rhythmSeType;
  const directionalSeValue = directionalSeSkinTypes[directionalSeIndex] ?? pendingSkinSelection.directionalSeType;
  const bgValue = bgSkinTypes[bgIndex] ?? pendingSkinSelection.bgType;
  const fieldValue = fieldSkinTypes[fieldIndex] ?? pendingSkinSelection.fieldType;
  const judgeValue = judgeSkinTypes[judgeIndex] ?? pendingSkinSelection.judgeType;
  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} ref={transitionRef} style={{ ...modalLayerStyle, ...transitionStyle }}>
      <OriginalDialogFrame
        className={`modal-card skin-settings-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <OriginalDialogHeader>皮肤设置</OriginalDialogHeader>

        <div className="modal-body">
          <p className="metadata-upload-source-empty" role="status">{catalogStatus}</p>
          <div className="skin-settings-page-shell">
            <div className="app-settings-group-list">
              <section className="app-settings-group">
                <SettingPrimaryTitle text="谱面样式" />
                <div className="app-settings-group-grid">
                  <TypeStepper
                    title={rhythmTypeTitle}
                    value={rhythmValue}
                    index={rhythmIndex}
                    types={rhythmSkinTypes}
                    catalogKind={rhythmCatalogKind}
                    onChange={onRhythmTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                  <TypeStepper
                    title="方向滑键样式"
                    value={directionalValue}
                    index={directionalIndex}
                    types={directionalSkinTypes}
                    catalogKind="directional"
                    onChange={onDirectionalTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                </div>
              </section>

              <section className="app-settings-group">
                <SettingPrimaryTitle text="音效样式" />
                <div className="app-settings-group-grid">
                  <TypeStepper
                    title="节奏图示SE"
                    value={rhythmSeValue}
                    index={rhythmSeIndex}
                    types={rhythmSeSkinTypes}
                    catalogKind="rhythmSe"
                    onChange={onRhythmSeTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                  <TypeStepper
                    title="方向滑键SE"
                    value={directionalSeValue}
                    index={directionalSeIndex}
                    types={directionalSeSkinTypes}
                    catalogKind="directionalSe"
                    onChange={onDirectionalSeTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                </div>
              </section>

              <section className="app-settings-group">
                <SettingPrimaryTitle text="演出样式" />
                <div className="app-settings-group-grid app-settings-group-grid-triple">
                  <TypeStepper
                    title="轨道样式"
                    value={fieldValue}
                    index={fieldIndex}
                    types={fieldSkinTypes}
                    catalogKind="field"
                    onChange={onFieldTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                  <TypeStepper
                    title="背景"
                    value={bgValue}
                    index={bgIndex}
                    types={bgSkinTypes}
                    catalogKind="bg"
                    onChange={onBgTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                  <TypeStepper
                    title="判定样式"
                    value={judgeValue}
                    index={judgeIndex}
                    types={judgeSkinTypes}
                    catalogKind={null}
                    onChange={onJudgeTypeChange}
                    formatTypeLabel={formatTypeLabel}
                  />
                </div>
              </section>
            </div>
          </div>

          <div className="modal-actions is-centered">
            <OriginalButton tone="pink" type="button" className="app-settings-apply-button" onClick={onApplySkinSelection} disabled={isSkinApplying}>
              <span className="btn-content">保存</span>
            </OriginalButton>
            <OriginalButton tone="gray" type="button" className="app-settings-back-button" onClick={onClose} disabled={isSkinApplying}>
              <span className="btn-content">关闭</span>
            </OriginalButton>
          </div>
        </div>
      </OriginalDialogFrame>
    </div>
  );
}
