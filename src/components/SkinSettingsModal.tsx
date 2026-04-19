import { type SkinSelection } from "../skinLoader";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { StepperIcon } from "./StepperIcon";
import { useModalTransition } from "./useModalTransition";

type SkinSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  pendingSkinSelection: SkinSelection;
  rhythmTypeTitle: string;
  onRhythmTypeChange: (value: string) => void;
  onDirectionalTypeChange: (value: string) => void;
  onRhythmSeTypeChange: (value: string) => void;
  onDirectionalSeTypeChange: (value: string) => void;
  onFieldTypeChange: (value: string) => void;
  rhythmSkinTypes: readonly string[];
  directionalSkinTypes: readonly string[];
  rhythmSeSkinTypes: readonly string[];
  directionalSeSkinTypes: readonly string[];
  fieldSkinTypes: readonly string[];
  formatTypeLabel: (type: string) => string;
  isSkinApplying: boolean;
  onApplySkinSelection: () => void;
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

export function SkinSettingsModal({
  open,
  onClose,
  pendingSkinSelection,
  rhythmTypeTitle,
  onRhythmTypeChange,
  onDirectionalTypeChange,
  onRhythmSeTypeChange,
  onDirectionalSeTypeChange,
  onFieldTypeChange,
  rhythmSkinTypes,
  directionalSkinTypes,
  rhythmSeSkinTypes,
  directionalSeSkinTypes,
  fieldSkinTypes,
  formatTypeLabel,
  isSkinApplying,
  onApplySkinSelection,
}: SkinSettingsModalProps) {
  const { mounted, phase } = useModalTransition(open);

  if (!mounted) {
    return null;
  }

  const rhythmIndex = resolveTypeIndex(pendingSkinSelection.rhythmType, rhythmSkinTypes);
  const directionalIndex = resolveTypeIndex(pendingSkinSelection.directionalType, directionalSkinTypes);
  const rhythmSeIndex = resolveTypeIndex(pendingSkinSelection.rhythmSeType, rhythmSeSkinTypes);
  const directionalSeIndex = resolveTypeIndex(pendingSkinSelection.directionalSeType, directionalSeSkinTypes);
  const fieldIndex = resolveTypeIndex(pendingSkinSelection.fieldType, fieldSkinTypes);

  const rhythmValue = rhythmSkinTypes[rhythmIndex] ?? pendingSkinSelection.rhythmType;
  const directionalValue = directionalSkinTypes[directionalIndex] ?? pendingSkinSelection.directionalType;
  const rhythmSeValue = rhythmSeSkinTypes[rhythmSeIndex] ?? pendingSkinSelection.rhythmSeType;
  const directionalSeValue = directionalSeSkinTypes[directionalSeIndex] ?? pendingSkinSelection.directionalSeType;
  const fieldValue = fieldSkinTypes[fieldIndex] ?? pendingSkinSelection.fieldType;
  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} onClick={onClose}>
      <section
        className={`modal-card modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">皮肤设置</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <span className="btn-content">×</span>
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-grid">
            <div className="setting-block">
              <span className="setting-title-strip">{rhythmTypeTitle}</span>
              <div className="inline-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={rhythmIndex <= 0}
                  onClick={() => {
                    const nextType = rhythmSkinTypes[rhythmIndex - 1];
                    if (nextType) {
                      onRhythmTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="left" />
                </button>
                <input
                  type="text"
                  className="stepper-input"
                  value={formatTypeLabel(rhythmValue)}
                  readOnly
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={rhythmIndex >= rhythmSkinTypes.length - 1}
                  onClick={() => {
                    const nextType = rhythmSkinTypes[rhythmIndex + 1];
                    if (nextType) {
                      onRhythmTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="right" />
                </button>
              </div>
            </div>

            <div className="setting-block">
              <span className="setting-title-strip">方向滑键样式</span>
              <div className="inline-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={directionalIndex <= 0}
                  onClick={() => {
                    const nextType = directionalSkinTypes[directionalIndex - 1];
                    if (nextType) {
                      onDirectionalTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="left" />
                </button>
                <input
                  type="text"
                  className="stepper-input"
                  value={formatTypeLabel(directionalValue)}
                  readOnly
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={directionalIndex >= directionalSkinTypes.length - 1}
                  onClick={() => {
                    const nextType = directionalSkinTypes[directionalIndex + 1];
                    if (nextType) {
                      onDirectionalTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="right" />
                </button>
              </div>
            </div>

            <div className="setting-block">
              <span className="setting-title-strip">节奏图示SE</span>
              <div className="inline-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={rhythmSeIndex <= 0}
                  onClick={() => {
                    const nextType = rhythmSeSkinTypes[rhythmSeIndex - 1];
                    if (nextType) {
                      onRhythmSeTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="left" />
                </button>
                <input
                  type="text"
                  className="stepper-input"
                  value={formatTypeLabel(rhythmSeValue)}
                  readOnly
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={rhythmSeIndex >= rhythmSeSkinTypes.length - 1}
                  onClick={() => {
                    const nextType = rhythmSeSkinTypes[rhythmSeIndex + 1];
                    if (nextType) {
                      onRhythmSeTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="right" />
                </button>
              </div>
            </div>

            <div className="setting-block">
              <span className="setting-title-strip">方向滑键SE</span>
              <div className="inline-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={directionalSeIndex <= 0}
                  onClick={() => {
                    const nextType = directionalSeSkinTypes[directionalSeIndex - 1];
                    if (nextType) {
                      onDirectionalSeTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="left" />
                </button>
                <input
                  type="text"
                  className="stepper-input"
                  value={formatTypeLabel(directionalSeValue)}
                  readOnly
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={directionalSeIndex >= directionalSeSkinTypes.length - 1}
                  onClick={() => {
                    const nextType = directionalSeSkinTypes[directionalSeIndex + 1];
                    if (nextType) {
                      onDirectionalSeTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="right" />
                </button>
              </div>
            </div>

            <div className="setting-block">
              <span className="setting-title-strip">轨道样式</span>
              <div className="inline-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={fieldIndex <= 0}
                  onClick={() => {
                    const nextType = fieldSkinTypes[fieldIndex - 1];
                    if (nextType) {
                      onFieldTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="left" />
                </button>
                <input
                  type="text"
                  className="stepper-input"
                  value={formatTypeLabel(fieldValue)}
                  readOnly
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="stepper-btn"
                  disabled={fieldIndex >= fieldSkinTypes.length - 1}
                  onClick={() => {
                    const nextType = fieldSkinTypes[fieldIndex + 1];
                    if (nextType) {
                      onFieldTypeChange(nextType);
                    }
                  }}
                >
                  <StepperIcon type="right" />
                </button>
              </div>
            </div>
          </div>

          <div className="modal-actions is-centered">
            <button type="button" onClick={onApplySkinSelection} disabled={isSkinApplying}>
              <span className="btn-content">保存</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

