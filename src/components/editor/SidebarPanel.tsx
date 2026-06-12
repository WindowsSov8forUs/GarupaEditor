import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  NOTE_SPECS,
  type ChartMetadata,
  type EditorTool,
  type NoteType,
} from "../../chartCore";
import type {
  LongLineCurveType,
  LongLineDivision,
  LongLinePrecision,
  LongLineShape,
} from "../../app/hooks/useLongLineEditorSettings";
import { type SkinNoteType } from "../../skinLoader";
import { ChartInfoPanel } from "../ChartInfoPanel";
import { StepperIcon } from "../StepperIcon";

type SpriteLayers = { base?: string; overlay?: string; overlayMode: "none" | "flick" | "directional" };
type ToolActionButtonConfig = {
  key: string;
  className: string;
  title: string;
  iconSrc: string;
  disabled?: boolean;
  clickAction?: () => void;
  pointerAction?: () => void;
};
type StepperActionButtonConfig = {
  icon: "left" | "right" | "minus" | "plus" | "leftDouble" | "rightDouble";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
};
type SettingBlockProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

const PALETTE_TOOL_TYPES = [
  "single",
  "flick",
  "skill",
  "slide",
  "directional_flick_left",
  "directional_flick_right",
] as const;

function SettingBlock({ title, children, className }: SettingBlockProps) {
  const blockClassName = className ? `setting-block ${className}` : "setting-block";
  return (
    <div className={blockClassName}>
      <span className="setting-title-strip">{title}</span>
      {children}
    </div>
  );
}

type SidebarPanelProps = {
  metadata: ChartMetadata;
  coverImageSrc: string;
  audioDurationSec: number;
  visibleNoteCount: number;
  openMetadataEditor: () => void;
  isCoverLoadFailed: boolean;
  setIsCoverLoadFailed: (value: boolean) => void;
  isSkinReady: boolean;
  isExGarupaEnabled: boolean;
  isToolArmed: boolean;
  tool: EditorTool;
  applyToolFromPalette: (nextType: NoteType) => void;
  getSpriteLayers: (
    type: NoteType,
    options?: {
      includeDirectionalOverlay?: boolean;
      includeFlickOverlay?: boolean;
      baseImageType?: SkinNoteType;
    },
  ) => SpriteLayers;
  getSpriteAspectRatio: (layers: SpriteLayers) => number;
  renderSpriteStack: (
    layers: SpriteLayers,
    label: string,
    className?: string,
    aspectRatio?: number,
  ) => ReactNode;
  onSelectBpmTool: () => void;
  onSelectSvTool: () => void;
  onSelectCopyTool: () => void;
  onSelectPasteTool: () => void;
  onTogglePlayTool: () => void;
  isPlayToolSelected: boolean;
  isPlaybackPlaying: boolean;
  getPlaybackNowLabel: () => string;
  playbackTotalLabel: string;
  playbackSpeedLabel: string;
  playbackVolumeLabel: string;
  playbackPositionLabel: string;
  isPlaybackFollowEnabled: boolean;
  setPlaybackFollowEnabled: (value: boolean) => void;
  canStepPlaybackSpeedDown: boolean;
  canStepPlaybackSpeedUp: boolean;
  canStepPlaybackVolumeDown: boolean;
  canStepPlaybackVolumeUp: boolean;
  canStepPlaybackPositionDown: boolean;
  canStepPlaybackPositionUp: boolean;
  stepPlaybackSpeed: (delta: number) => void;
  stepPlaybackVolume: (delta: number) => void;
  stepPlaybackPosition: (delta: number) => void;
  isTimingGroupPanelOpen: boolean;
  setIsTimingGroupPanelOpen: (value: boolean) => void;
  timingGroupIds: string[];
  selectedTimingGroupId: string;
  setSelectedTimingGroupId: (value: string) => void;
  isTimingGroupModeActive: boolean;
  setIsTimingGroupModeEnabled: (value: boolean) => void;
  createTimingGroup: () => void;
  renameTimingGroup: (sourceId: string, targetId: string) => void;
  deleteTimingGroup: (groupId: string) => void;
  showTimingGroupSetting: boolean;
  isTimingGroupSettingLocked: boolean;
  selectedObjectTimingGroupId: string;
  setSelectedObjectTimingGroupId: (value: string) => void;
  undoLastNote: () => void;
  redoLastNote: () => void;
  mirrorSelectedNotes: () => void;
  canMirrorSelection: boolean;
  clearAllNotes: () => void;
  notesLength: number;
  canUndoLastOperation: boolean;
  canRedoLastOperation: boolean;
  mirrorActionIcon: string;
  undoActionIcon: string;
  copyActionIcon: string;
  pasteActionIcon: string;
  clearActionIcon: string;
  applyActionIcon: string;
  showBeatSetting: boolean;
  isBeatSettingLocked: boolean;
  beatInputText: string;
  setBeatInputText: (value: string) => void;
  beatInputEditingRef: MutableRefObject<boolean>;
  commitBeatInput: () => void;
  showBpmSetting: boolean;
  bpmInputText: string;
  setBpmInputText: (value: string) => void;
  bpmInputEditingRef: MutableRefObject<boolean>;
  commitBpmInput: () => void;
  svInputText: string;
  setSvInputText: (value: string) => void;
  svInputEditingRef: MutableRefObject<boolean>;
  commitSvInput: () => void;
  showSvSetting: boolean;
  showLaneSetting: boolean;
  isLaneSettingLocked: boolean;
  stepActiveLane: (delta: number) => void;
  laneInputText: string;
  setLaneInputText: (value: string) => void;
  laneInputEditingRef: MutableRefObject<boolean>;
  commitLaneInput: () => void;
  showWidthSetting: boolean;
  stepActiveWidth: (delta: number) => void;
  widthInputText: string;
  setWidthInputText: (value: string) => void;
  widthInputEditingRef: MutableRefObject<boolean>;
  commitWidthInput: () => void;
  showDirectionSetting: boolean;
  activeDirectionalValue: "left" | "right" | null;
  setActiveDirectionalType: (value: "left" | "right") => void;
  hideSettingsPanel: boolean;
  showSlideSegmentSetting: boolean;
  slideShape: LongLineShape;
  slideCurveType: LongLineCurveType | null;
  slidePrecision: LongLinePrecision;
  slideDivision: LongLineDivision;
  slideVibration: number;
  slideVibrationInputText: string;
  setSlideVibrationInputText: (value: string) => void;
  slideVibrationInputEditingRef: MutableRefObject<boolean>;
  commitSlideVibrationInput: () => void;
  isSlideCurveTypeDisabled: boolean;
  isSlideDivisionDisabled: boolean;
  setSlideShape: (value: LongLineShape) => void;
  setSlideCurveType: (value: LongLineCurveType) => void;
  stepSlidePrecision: (delta: number) => void;
  stepSlideDivision: (delta: number) => void;
  stepSlideVibration: (delta: number) => void;
  canStepSlidePrecisionDown: boolean;
  canStepSlidePrecisionUp: boolean;
  canStepSlideDivisionDown: boolean;
  canStepSlideDivisionUp: boolean;
  canDeleteSelection: boolean;
  canApplyLongLineSettings: boolean;
  applyCurrentLongLineSettings: () => void;
  deleteCurrentSelection: () => void;
};

export const SidebarPanel = memo(function SidebarPanel({
  metadata,
  coverImageSrc,
  audioDurationSec,
  visibleNoteCount,
  openMetadataEditor,
  isCoverLoadFailed,
  setIsCoverLoadFailed,
  isSkinReady,
  isExGarupaEnabled,
  isToolArmed,
  tool,
  applyToolFromPalette,
  getSpriteLayers,
  getSpriteAspectRatio,
  renderSpriteStack,
  onSelectBpmTool,
  onSelectSvTool,
  onSelectCopyTool,
  onSelectPasteTool,
  onTogglePlayTool,
  isPlayToolSelected,
  isPlaybackPlaying,
  getPlaybackNowLabel,
  playbackTotalLabel,
  playbackSpeedLabel,
  playbackVolumeLabel,
  playbackPositionLabel,
  isPlaybackFollowEnabled,
  setPlaybackFollowEnabled,
  canStepPlaybackSpeedDown,
  canStepPlaybackSpeedUp,
  canStepPlaybackVolumeDown,
  canStepPlaybackVolumeUp,
  canStepPlaybackPositionDown,
  canStepPlaybackPositionUp,
  stepPlaybackSpeed,
  stepPlaybackVolume,
  stepPlaybackPosition,
  isTimingGroupPanelOpen,
  setIsTimingGroupPanelOpen,
  timingGroupIds,
  selectedTimingGroupId,
  setSelectedTimingGroupId,
  isTimingGroupModeActive,
  setIsTimingGroupModeEnabled,
  createTimingGroup,
  renameTimingGroup,
  deleteTimingGroup,
  showTimingGroupSetting,
  isTimingGroupSettingLocked,
  selectedObjectTimingGroupId,
  setSelectedObjectTimingGroupId,
  undoLastNote,
  redoLastNote,
  mirrorSelectedNotes,
  canMirrorSelection,
  clearAllNotes,
  notesLength,
  canUndoLastOperation,
  canRedoLastOperation,
  mirrorActionIcon,
  undoActionIcon,
  copyActionIcon,
  pasteActionIcon,
  clearActionIcon,
  applyActionIcon,
  showBeatSetting,
  isBeatSettingLocked,
  beatInputText,
  setBeatInputText,
  beatInputEditingRef,
  commitBeatInput,
  showBpmSetting,
  bpmInputText,
  setBpmInputText,
  bpmInputEditingRef,
  commitBpmInput,
  svInputText,
  setSvInputText,
  svInputEditingRef,
  commitSvInput,
  showSvSetting,
  showLaneSetting,
  isLaneSettingLocked,
  stepActiveLane,
  laneInputText,
  setLaneInputText,
  laneInputEditingRef,
  commitLaneInput,
  showWidthSetting,
  stepActiveWidth,
  widthInputText,
  setWidthInputText,
  widthInputEditingRef,
  commitWidthInput,
  showDirectionSetting,
  activeDirectionalValue,
  setActiveDirectionalType,
  hideSettingsPanel,
  showSlideSegmentSetting,
  slideShape,
  slideCurveType,
  slidePrecision,
  slideDivision,
  slideVibration,
  slideVibrationInputText,
  setSlideVibrationInputText,
  slideVibrationInputEditingRef,
  commitSlideVibrationInput,
  isSlideCurveTypeDisabled,
  isSlideDivisionDisabled,
  setSlideShape,
  setSlideCurveType,
  stepSlidePrecision,
  stepSlideDivision,
  stepSlideVibration,
  canStepSlidePrecisionDown,
  canStepSlidePrecisionUp,
  canStepSlideDivisionDown,
  canStepSlideDivisionUp,
  canDeleteSelection,
  canApplyLongLineSettings,
  applyCurrentLongLineSettings,
  deleteCurrentSelection,
}: SidebarPanelProps) {
  const [timingGroupRenameText, setTimingGroupRenameText] = useState(selectedTimingGroupId);
  const hasSettingsContent =
    showBeatSetting ||
    showBpmSetting ||
    showSvSetting ||
    showTimingGroupSetting ||
    showLaneSetting ||
    showWidthSetting ||
    showDirectionSetting ||
    showSlideSegmentSetting ||
    canDeleteSelection;
  useEffect(() => {
    setTimingGroupRenameText(selectedTimingGroupId);
  }, [selectedTimingGroupId]);
  const paletteToolSprites = useMemo(
    () =>
      isSkinReady
        ? PALETTE_TOOL_TYPES
            .map((type) => {
              const spec = NOTE_SPECS[type];
              const spriteLayers = getSpriteLayers(type, {
                includeDirectionalOverlay: false,
                includeFlickOverlay: false,
              });
              if (!spriteLayers.base) {
                return null;
              }
              const spriteAspectRatio = getSpriteAspectRatio(spriteLayers);
              return {
                type,
                label: spec.label,
                spriteAspectRatio,
                spriteNode: renderSpriteStack(
                  spriteLayers,
                  spec.label,
                  "note-sprite-stack mini",
                  spriteAspectRatio,
                ),
              };
            })
            .filter((item) => item !== null)
        : [],
    [getSpriteAspectRatio, getSpriteLayers, isSkinReady, renderSpriteStack],
  );
  const selectPaletteTool = useCallback(
    (nextType: NoteType) => {
      if (isToolArmed && tool === nextType) {
        return;
      }
      applyToolFromPalette(nextType);
    },
    [applyToolFromPalette, isToolArmed, tool],
  );
  const activateSpecialTool = useCallback(
    (nextTool: "bpm" | "sv" | "copy" | "paste", action: () => void) => {
      if (isToolArmed && tool === nextTool) {
        return;
      }
      action();
    },
    [isToolArmed, tool],
  );
  const activateBpmTool = useCallback(
    () => activateSpecialTool("bpm", onSelectBpmTool),
    [activateSpecialTool, onSelectBpmTool],
  );
  const activateSvTool = useCallback(
    () => activateSpecialTool("sv", onSelectSvTool),
    [activateSpecialTool, onSelectSvTool],
  );
  const activateCopyTool = useCallback(
    () => activateSpecialTool("copy", onSelectCopyTool),
    [activateSpecialTool, onSelectCopyTool],
  );
  const activatePasteTool = useCallback(
    () => activateSpecialTool("paste", onSelectPasteTool),
    [activateSpecialTool, onSelectPasteTool],
  );
  const handleActionMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, action: () => void) => {
      event.preventDefault();
      action();
    },
    [],
  );
  const handleActionClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, action: () => void) => {
      if (event.detail !== 0) {
        return;
      }
      action();
    },
    [],
  );
  const buildMouseActionHandlers = useCallback(
    (action: () => void) => ({
      onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => handleActionMouseDown(event, action),
      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => handleActionClick(event, action),
    }),
    [handleActionClick, handleActionMouseDown],
  );
  const [playbackNowLabel, setPlaybackNowLabel] = useState<string>(() => getPlaybackNowLabel());
  useEffect(() => {
    setPlaybackNowLabel(getPlaybackNowLabel());
  }, [getPlaybackNowLabel, isPlayToolSelected, isPlaybackPlaying]);
  useEffect(() => {
    if (!isPlayToolSelected) {
      return;
    }
    let timer = 0;
    const refresh = () => {
      setPlaybackNowLabel((previous) => {
        const next = getPlaybackNowLabel();
        return previous === next ? previous : next;
      });
      const intervalMs = isPlaybackPlaying ? 120 : 250;
      timer = window.setTimeout(refresh, intervalMs);
    };
    refresh();
    return () => {
      window.clearTimeout(timer);
    };
  }, [getPlaybackNowLabel, isPlayToolSelected, isPlaybackPlaying]);
  const handleEnterKeyBlur = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    event.currentTarget.blur();
  }, []);
  const renderStepperControl = useCallback(
    ({
      className = "inline-stepper",
      leadingActions,
      trailingActions,
      valueNode,
    }: {
      className?: string;
      leadingActions: StepperActionButtonConfig[];
      trailingActions: StepperActionButtonConfig[];
      valueNode: ReactNode;
    }) => {
      const renderActionButton = (action: StepperActionButtonConfig, key: string) => (
        <button
          key={key}
          type="button"
          className="stepper-btn"
          disabled={action.disabled}
          onClick={action.onClick}
          title={action.title}
        >
          <StepperIcon type={action.icon} />
        </button>
      );

      return (
        <div className={className}>
          {leadingActions.map((action, index) =>
            renderActionButton(action, `leading-${index}-${action.icon}`),
          )}
          {valueNode}
          {trailingActions.map((action, index) =>
            renderActionButton(action, `trailing-${index}-${action.icon}`),
          )}
        </div>
      );
    },
    [],
  );
  const actionButtons = useMemo<ToolActionButtonConfig[]>(
    () => [
      {
        key: "mirror",
        className: "tool-action-icon mirror-action",
        title: "镜像翻转（轴：lane 3）",
        iconSrc: mirrorActionIcon,
        disabled: !canMirrorSelection,
        clickAction: mirrorSelectedNotes,
      },
      {
        key: "undo",
        className: "tool-action-icon undo-action",
        title: "撤销",
        iconSrc: undoActionIcon,
        disabled: !canUndoLastOperation,
        clickAction: undoLastNote,
      },
      {
        key: "redo",
        className: "tool-action-icon redo-action",
        title: "重做",
        iconSrc: undoActionIcon,
        disabled: !canRedoLastOperation,
        clickAction: redoLastNote,
      },
      {
        key: "copy",
        className: `tool-action-icon copy-action ${isToolArmed && tool === "copy" ? "active" : ""}`,
        title: "复制",
        iconSrc: copyActionIcon,
        pointerAction: activateCopyTool,
      },
      {
        key: "paste",
        className: `tool-action-icon paste-action ${isToolArmed && tool === "paste" ? "active" : ""}`,
        title: "粘贴",
        iconSrc: pasteActionIcon,
        pointerAction: activatePasteTool,
      },
      {
        key: "clear",
        className: "tool-action-icon clear-action",
        title: "清空",
        iconSrc: clearActionIcon,
        disabled: notesLength === 0,
        clickAction: clearAllNotes,
      },
    ],
    [
      activateCopyTool,
      activatePasteTool,
      canMirrorSelection,
      canRedoLastOperation,
      canUndoLastOperation,
      clearActionIcon,
      clearAllNotes,
      copyActionIcon,
      isToolArmed,
      mirrorActionIcon,
      mirrorSelectedNotes,
      notesLength,
      pasteActionIcon,
      redoLastNote,
      tool,
      undoActionIcon,
      undoLastNote,
    ],
  );
  const handleCoverImageError = useCallback(() => {
    if (!isCoverLoadFailed) {
      setIsCoverLoadFailed(true);
    }
  }, [isCoverLoadFailed, setIsCoverLoadFailed]);

  return (
    <aside className="sidebar">
      <ChartInfoPanel
        metadata={metadata}
        coverImageSrc={coverImageSrc}
        audioDurationSec={audioDurationSec}
        noteCount={visibleNoteCount}
        onOpenMetadataEditor={openMetadataEditor}
        onCoverImageError={handleCoverImageError}
      />

      <div className="sidebar-scroll">
        <section className="note-tools-panel">
          {isSkinReady ? (
            <>
              <div className="tool-grid">
                {paletteToolSprites.map((item) => {
                  return (
                    <button
                      key={item.type}
                      type="button"
                      className={`tool-icon-button ${isToolArmed && tool === item.type ? "active" : ""}`}
                      {...buildMouseActionHandlers(() => selectPaletteTool(item.type))}
                      title={item.label}
                    >
                      <span className="tool-icon-core">
                        <span
                          className="mini-note has-sprite"
                          style={{ "--sprite-aspect-ratio": `${item.spriteAspectRatio}` } as CSSProperties}
                        >
                          {item.spriteNode}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="tool-grid bpm-tool-row">
                <button
                  type="button"
                  className={`tool-icon-button bpm-tool-button ${isToolArmed && tool === "bpm" ? "active" : ""}`}
                  {...buildMouseActionHandlers(activateBpmTool)}
                  title="BPM"
                >
                  <span className="tool-icon-core">
                    <span className="bpm-text">BPM</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`tool-icon-button bpm-tool-button ${isToolArmed && tool === "sv" ? "active" : ""}`}
                  disabled={!isExGarupaEnabled}
                  {...buildMouseActionHandlers(activateSvTool)}
                  title="SV"
                >
                  <span className="tool-icon-core">
                    <span className="bpm-text">SV</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`tool-icon-button bpm-tool-button ${isTimingGroupPanelOpen ? "active" : ""}`}
                  disabled={!isExGarupaEnabled}
                  {...buildMouseActionHandlers(() => setIsTimingGroupPanelOpen(!isTimingGroupPanelOpen))}
                  title="时间组"
                >
                  <span className="tool-icon-core">
                    <span className="bpm-text">TG</span>
                  </span>
                </button>
              </div>
              <div className="tool-grid play-tool-row">
                <button
                  type="button"
                  className={`tool-icon-button play-tool-button ${isPlayToolSelected ? "active" : ""}`}
                  {...buildMouseActionHandlers(onTogglePlayTool)}
                  title="播放工具"
                >
                  <span className="tool-icon-core play-tool-core">
                    <span className="play-tool-icon" aria-hidden="true">
                      {isPlaybackPlaying ? (
                        <svg viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24">
                          <polygon points="7,4 20,12 7,20" />
                        </svg>
                      )}
                    </span>
                    <span className="play-tool-text">
                      {playbackNowLabel}:{playbackTotalLabel}
                    </span>
                  </span>
                </button>
              </div>
            </>
          ) : (
            <p className="shortcut-hint">皮肤加载中，暂不渲染音符图示。</p>
          )}

          <div className="tool-action-rows">
            {actionButtons.map((button) => {
              const mouseHandlers = button.pointerAction
                ? buildMouseActionHandlers(button.pointerAction)
                : { onClick: button.clickAction };
              return (
                <button
                  key={button.key}
                  type="button"
                  className={button.className}
                  title={button.title}
                  disabled={button.disabled}
                  {...mouseHandlers}
                >
                  <img src={button.iconSrc} alt="" className="tool-action-glyph" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        {isTimingGroupPanelOpen && (
          <section className="selected-note-panel timing-group-panel">
            <div className="selected-note-grid timing-group-settings-grid">
              <SettingBlock title="TimingGroup">
                <select
                  className="value-input"
                  value={selectedTimingGroupId}
                  onChange={(event) => setSelectedTimingGroupId(event.currentTarget.value)}
                >
                  {timingGroupIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </SettingBlock>
              <SettingBlock title="Group ID">
                <input
                  type="text"
                  className="value-input"
                  value={timingGroupRenameText}
                  disabled={selectedTimingGroupId === "#Global"}
                  onChange={(event) => setTimingGroupRenameText(event.currentTarget.value)}
                  onBlur={() => {
                    const text = timingGroupRenameText.trim();
                    if (text && text !== selectedTimingGroupId) {
                      renameTimingGroup(selectedTimingGroupId, text);
                    } else {
                      setTimingGroupRenameText(selectedTimingGroupId);
                    }
                  }}
                  onKeyDown={handleEnterKeyBlur}
                />
              </SettingBlock>
              <div className="timing-group-panel-separator" />
              <SettingBlock title="TimingGroup 编辑模式" className="timing-group-mode-block">
                <label className={`ui-checkbox timing-group-mode-checkbox ${selectedTimingGroupId === "#Global" ? "is-disabled" : ""}`}>
                  <input
                    type="checkbox"
                    className="ui-checkbox-input"
                    checked={isTimingGroupModeActive}
                    disabled={selectedTimingGroupId === "#Global"}
                    onChange={(event) => setIsTimingGroupModeEnabled(event.currentTarget.checked)}
                  />
                  <span className="ui-checkbox-box" aria-hidden="true" />
                </label>
              </SettingBlock>
              <div className="selected-note-delete-row timing-group-action-row">
                <button type="button" className="timing-group-panel-button timing-group-create-button" onClick={createTimingGroup}>
                  <span className="btn-content">新建</span>
                </button>
                <button
                  type="button"
                  className="timing-group-panel-button"
                  disabled={selectedTimingGroupId === "#Global"}
                  onClick={() => deleteTimingGroup(selectedTimingGroupId)}
                >
                  <span className="btn-content">删除</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {isPlayToolSelected && (
          <section className="selected-note-panel playback-settings-panel">
            <div className="selected-note-grid playback-settings-grid">
              <SettingBlock title="速度" className="playback-speed-block">
                {renderStepperControl({
                  leadingActions: [
                    {
                      icon: "minus",
                      disabled: !canStepPlaybackSpeedDown,
                      onClick: () => stepPlaybackSpeed(-1),
                    },
                  ],
                  trailingActions: [
                    {
                      icon: "plus",
                      disabled: !canStepPlaybackSpeedUp,
                      onClick: () => stepPlaybackSpeed(1),
                    },
                  ],
                  valueNode: (
                    <input type="text" className="stepper-input" value={playbackSpeedLabel} readOnly tabIndex={-1} />
                  ),
                })}
              </SettingBlock>
              <SettingBlock title="音量" className="playback-volume-block">
                {renderStepperControl({
                  className: "inline-stepper inline-stepper-extended",
                  leadingActions: [
                    {
                      icon: "left",
                      disabled: !canStepPlaybackVolumeDown,
                      onClick: () => stepPlaybackVolume(-2),
                      title: "步退 10%",
                    },
                    {
                      icon: "minus",
                      disabled: !canStepPlaybackVolumeDown,
                      onClick: () => stepPlaybackVolume(-1),
                    },
                  ],
                  trailingActions: [
                    {
                      icon: "plus",
                      disabled: !canStepPlaybackVolumeUp,
                      onClick: () => stepPlaybackVolume(1),
                    },
                    {
                      icon: "right",
                      disabled: !canStepPlaybackVolumeUp,
                      onClick: () => stepPlaybackVolume(2),
                      title: "步进 10%",
                    },
                  ],
                  valueNode: (
                    <input type="text" className="stepper-input" value={playbackVolumeLabel} readOnly tabIndex={-1} />
                  ),
                })}
              </SettingBlock>
              <SettingBlock title="位置" className="playback-position-block">
                <div className="playback-position-row">
                  {renderStepperControl({
                    className: "inline-stepper inline-stepper-extended",
                    leadingActions: [
                      {
                        icon: "left",
                        disabled: !canStepPlaybackPositionDown,
                        onClick: () => stepPlaybackPosition(-10),
                        title: "步退 10%",
                      },
                      {
                        icon: "minus",
                        disabled: !canStepPlaybackPositionDown,
                        onClick: () => stepPlaybackPosition(-1),
                      },
                    ],
                    trailingActions: [
                      {
                        icon: "plus",
                        disabled: !canStepPlaybackPositionUp,
                        onClick: () => stepPlaybackPosition(1),
                      },
                      {
                        icon: "right",
                        disabled: !canStepPlaybackPositionUp,
                        onClick: () => stepPlaybackPosition(10),
                        title: "步进 10%",
                      },
                    ],
                    valueNode: (
                      <input type="text" className="stepper-input" value={playbackPositionLabel} readOnly tabIndex={-1} />
                    ),
                  })}
                  <label className="ui-checkbox">
                    <input
                      type="checkbox"
                      className="ui-checkbox-input"
                      checked={isPlaybackFollowEnabled}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setPlaybackFollowEnabled(checked);
                      }}
                    />
                    <span className="ui-checkbox-box" aria-hidden="true" />
                    <span className="ui-checkbox-text">跟随</span>
                  </label>
                </div>
              </SettingBlock>
            </div>
          </section>
        )}

        {!hideSettingsPanel && hasSettingsContent && <section className="selected-note-panel">
          <div className="selected-note-grid">
            {showBeatSetting && (
              <SettingBlock title="Beat 值">
                <input
                  type="text"
                  inputMode="decimal"
                  className={`value-input ${isBeatSettingLocked ? "is-disabled" : ""}`}
                  value={isBeatSettingLocked ? "" : beatInputText}
                  disabled={isBeatSettingLocked}
                  onChange={(event) => {
                    setBeatInputText(event.currentTarget.value);
                  }}
                  onFocus={() => {
                    beatInputEditingRef.current = true;
                  }}
                  onBlur={() => {
                    beatInputEditingRef.current = false;
                    commitBeatInput();
                  }}
                  onKeyDown={handleEnterKeyBlur}
                />
              </SettingBlock>
            )}

            {showBpmSetting && (
              <SettingBlock title="BPM 值">
                <input
                  type="text"
                  inputMode="decimal"
                  className="value-input"
                  value={bpmInputText}
                  onChange={(event) => {
                    setBpmInputText(event.currentTarget.value);
                  }}
                  onFocus={() => {
                    bpmInputEditingRef.current = true;
                  }}
                  onBlur={() => {
                    bpmInputEditingRef.current = false;
                    commitBpmInput();
                  }}
                  onKeyDown={handleEnterKeyBlur}
                />
              </SettingBlock>
            )}

            {showSvSetting && (
              <SettingBlock title="ScrollVelocity 值">
                <input
                  type="text"
                  inputMode="decimal"
                  className="value-input"
                  value={svInputText}
                  onChange={(event) => {
                    setSvInputText(event.currentTarget.value);
                  }}
                  onFocus={() => {
                    svInputEditingRef.current = true;
                  }}
                  onBlur={() => {
                    svInputEditingRef.current = false;
                    commitSvInput();
                  }}
                  onKeyDown={handleEnterKeyBlur}
                />
              </SettingBlock>
            )}

            {showTimingGroupSetting && (
              <SettingBlock title="timing group">
                <select
                  className={`value-input ${isTimingGroupSettingLocked ? "is-disabled" : ""}`}
                  value={selectedObjectTimingGroupId === "#Global" ? "-" : selectedObjectTimingGroupId}
                  disabled={isTimingGroupSettingLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSelectedObjectTimingGroupId(value === "-" ? "#Global" : value);
                  }}
                >
                  <option value="-">-</option>
                  {timingGroupIds
                    .filter((id) => id !== "#Global")
                    .map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                </select>
              </SettingBlock>
            )}

            {showLaneSetting && (
              <SettingBlock title="轨道">
                {renderStepperControl({
                  leadingActions: [
                    {
                      icon: "minus",
                      disabled: isLaneSettingLocked,
                      onClick: () => stepActiveLane(-1),
                    },
                  ],
                  trailingActions: [
                    {
                      icon: "plus",
                      disabled: isLaneSettingLocked,
                      onClick: () => stepActiveLane(1),
                    },
                  ],
                  valueNode: (
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`stepper-input ${isLaneSettingLocked ? "is-disabled" : ""}`}
                      value={isLaneSettingLocked ? "" : laneInputText}
                      disabled={isLaneSettingLocked}
                      onChange={(event) => {
                        setLaneInputText(event.currentTarget.value);
                      }}
                      onFocus={() => {
                        laneInputEditingRef.current = true;
                      }}
                      onBlur={() => {
                        laneInputEditingRef.current = false;
                        commitLaneInput();
                      }}
                      onKeyDown={handleEnterKeyBlur}
                    />
                  ),
                })}
              </SettingBlock>
            )}

            {showWidthSetting && (
              <SettingBlock title="宽度">
                {renderStepperControl({
                  leadingActions: [
                    {
                      icon: "minus",
                      onClick: () => stepActiveWidth(-1),
                    },
                  ],
                  trailingActions: [
                    {
                      icon: "plus",
                      onClick: () => stepActiveWidth(1),
                    },
                  ],
                  valueNode: (
                    <input
                      type="text"
                      inputMode="numeric"
                      className="stepper-input"
                      value={widthInputText}
                      onChange={(event) => {
                        setWidthInputText(event.currentTarget.value);
                      }}
                      onFocus={() => {
                        widthInputEditingRef.current = true;
                      }}
                      onBlur={() => {
                        widthInputEditingRef.current = false;
                        commitWidthInput();
                      }}
                      onKeyDown={handleEnterKeyBlur}
                    />
                  ),
                })}
              </SettingBlock>
            )}

            {showDirectionSetting && (
              <SettingBlock title="方向">
                <div className="binary-choice-group">
                  <button
                    type="button"
                    className={`binary-choice ${activeDirectionalValue === "left" ? "active" : ""}`}
                    onClick={() => setActiveDirectionalType("left")}
                    aria-pressed={activeDirectionalValue === "left"}
                  >
                    <span className="choice-dot" />
                    <span className="btn-content">左</span>
                  </button>
                  <button
                    type="button"
                    className={`binary-choice ${activeDirectionalValue === "right" ? "active" : ""}`}
                    onClick={() => setActiveDirectionalType("right")}
                    aria-pressed={activeDirectionalValue === "right"}
                  >
                    <span className="choice-dot" />
                    <span className="btn-content">右</span>
                  </button>
                </div>
              </SettingBlock>
            )}

            {showSlideSegmentSetting && (
              <>
                <SettingBlock title="形状">
                  <select
                    className="value-input"
                    value={slideShape}
                    onChange={(event) => {
                      setSlideShape(event.currentTarget.value as LongLineShape);
                    }}
                  >
                    <option value="line">直线</option>
                    <option value="sine">正弦</option>
                    <option value="quad">二次</option>
                    <option value="cubic">三次</option>
                    <option value="quart">四次</option>
                    <option value="quint">五次</option>
                    <option value="expo">指数</option>
                    <option value="semicircle">半圆</option>
                    <option value="back">回弹</option>
                    <option value="elastic">弹性</option>
                    <option value="bounce">弹跳</option>
                  </select>
                </SettingBlock>

                <SettingBlock title="类型">
                  {(() => {
                    const curveTypeValue = isSlideCurveTypeDisabled
                      ? ""
                      : (slideCurveType === "in" || slideCurveType === "out" || slideCurveType === "in_out" || slideCurveType === "out_in"
                          ? slideCurveType
                          : "in");
                    return (
                  <select
                    className={`value-input ${isSlideCurveTypeDisabled ? "is-disabled" : ""}`}
                    value={curveTypeValue}
                    disabled={isSlideCurveTypeDisabled}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === "in" || value === "out" || value === "in_out" || value === "out_in") {
                        setSlideCurveType(value);
                      }
                    }}
                  >
                    {isSlideCurveTypeDisabled && <option value="" />}
                    <option value="in">入</option>
                    <option value="out">出</option>
                    <option value="in_out">入-出</option>
                    <option value="out_in">出-入</option>
                  </select>
                    );
                  })()}
                </SettingBlock>

                <SettingBlock title="精度">
                  {renderStepperControl({
                    leadingActions: [
                      {
                        icon: "minus",
                        disabled: !canStepSlidePrecisionDown,
                        onClick: () => stepSlidePrecision(-1),
                      },
                    ],
                    trailingActions: [
                      {
                        icon: "plus",
                        disabled: !canStepSlidePrecisionUp,
                        onClick: () => stepSlidePrecision(1),
                      },
                    ],
                    valueNode: (
                      <input
                        type="text"
                        className="stepper-input"
                        value={slidePrecision}
                        readOnly
                        tabIndex={-1}
                      />
                    ),
                  })}
                </SettingBlock>

                <SettingBlock title="分度">
                  {renderStepperControl({
                    leadingActions: [
                      {
                        icon: "minus",
                        disabled: isSlideDivisionDisabled || !canStepSlideDivisionDown,
                        onClick: () => stepSlideDivision(-1),
                      },
                    ],
                    trailingActions: [
                      {
                        icon: "plus",
                        disabled: isSlideDivisionDisabled || !canStepSlideDivisionUp,
                        onClick: () => stepSlideDivision(1),
                      },
                    ],
                    valueNode: (
                      <input
                        type="text"
                        className={`stepper-input ${isSlideDivisionDisabled ? "is-disabled" : ""}`}
                        value={slideDivision}
                        readOnly
                        tabIndex={-1}
                      />
                    ),
                  })}
                </SettingBlock>

                <SettingBlock title="震动">
                  {renderStepperControl({
                    leadingActions: [
                      {
                        icon: "minus",
                        onClick: () => stepSlideVibration(-0.1),
                      },
                    ],
                    trailingActions: [
                      {
                        icon: "plus",
                        onClick: () => stepSlideVibration(0.1),
                      },
                    ],
                    valueNode: (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="stepper-input"
                        value={slideVibrationInputText}
                        title={`当前震动值: ${slideVibration}`}
                        onChange={(event) => {
                          setSlideVibrationInputText(event.currentTarget.value);
                        }}
                        onFocus={() => {
                          slideVibrationInputEditingRef.current = true;
                        }}
                        onBlur={() => {
                          slideVibrationInputEditingRef.current = false;
                          commitSlideVibrationInput();
                        }}
                        onKeyDown={handleEnterKeyBlur}
                      />
                    ),
                  })}
                </SettingBlock>
              </>
            )}
          </div>

          {canDeleteSelection && (
            <div className="selected-note-delete-row">
              {canApplyLongLineSettings && (
                <button
                  type="button"
                  className="apply-icon-button"
                  title="应用当前设置"
                  onClick={applyCurrentLongLineSettings}
                >
                  <img src={applyActionIcon} alt="" className="tool-action-glyph" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="delete-icon-button"
                title="删除选中对象"
                onClick={deleteCurrentSelection}
              >
                <span className="btn-content">✕</span>
              </button>
            </div>
          )}
        </section>}
      </div>
    </aside>
  );
});

SidebarPanel.displayName = "SidebarPanel";



