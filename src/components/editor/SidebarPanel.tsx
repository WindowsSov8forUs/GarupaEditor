import {
  memo,
  useCallback,
  useMemo,
  type CSSProperties,
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
const PALETTE_TOOL_TYPES = [
  "single",
  "flick",
  "skill",
  "slide",
  "directional_flick_left",
  "directional_flick_right",
] as const;

type SidebarPanelProps = {
  metadata: ChartMetadata;
  coverImageSrc: string;
  audioDurationSec: number;
  visibleNoteCount: number;
  openMetadataEditor: () => void;
  isCoverLoadFailed: boolean;
  setIsCoverLoadFailed: (value: boolean) => void;
  isSkinReady: boolean;
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
  onSelectCopyTool: () => void;
  onSelectPasteTool: () => void;
  hasCopiedChartPayload: boolean;
  onTogglePlayTool: () => void;
  isPlayToolSelected: boolean;
  isPlaybackPlaying: boolean;
  playbackNowLabel: string;
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
  undoLastNote: () => void;
  redoLastNote: () => void;
  clearAllNotes: () => void;
  notesLength: number;
  canUndoLastOperation: boolean;
  canRedoLastOperation: boolean;
  undoActionIcon: string;
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
  isToolArmed,
  tool,
  applyToolFromPalette,
  getSpriteLayers,
  getSpriteAspectRatio,
  renderSpriteStack,
  onSelectBpmTool,
  onSelectCopyTool,
  onSelectPasteTool,
  hasCopiedChartPayload,
  onTogglePlayTool,
  isPlayToolSelected,
  isPlaybackPlaying,
  playbackNowLabel,
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
  undoLastNote,
  redoLastNote,
  clearAllNotes,
  notesLength,
  canUndoLastOperation,
  canRedoLastOperation,
  undoActionIcon,
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
  const hasSettingsContent =
    showBeatSetting ||
    showBpmSetting ||
    showLaneSetting ||
    showWidthSetting ||
    showDirectionSetting ||
    showSlideSegmentSetting ||
    canDeleteSelection;
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
  const handlePaletteToolMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, nextType: NoteType) => {
      event.preventDefault();
      selectPaletteTool(nextType);
    },
    [selectPaletteTool],
  );
  const handlePaletteToolClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, nextType: NoteType) => {
      if (event.detail !== 0) {
        return;
      }
      selectPaletteTool(nextType);
    },
    [selectPaletteTool],
  );
  const selectBpmTool = useCallback(() => {
    if (isToolArmed && tool === "bpm") {
      return;
    }
    onSelectBpmTool();
  }, [isToolArmed, onSelectBpmTool, tool]);
  const handleBpmToolMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      selectBpmTool();
    },
    [selectBpmTool],
  );
  const handleBpmToolClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0) {
        return;
      }
      selectBpmTool();
    },
    [selectBpmTool],
  );
  const selectCopyTool = useCallback(() => {
    if (isToolArmed && tool === "copy") {
      return;
    }
    onSelectCopyTool();
  }, [isToolArmed, onSelectCopyTool, tool]);
  const handleCopyToolMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      selectCopyTool();
    },
    [selectCopyTool],
  );
  const handleCopyToolClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0) {
        return;
      }
      selectCopyTool();
    },
    [selectCopyTool],
  );
  const selectPasteTool = useCallback(() => {
    if (isToolArmed && tool === "paste") {
      return;
    }
    onSelectPasteTool();
  }, [isToolArmed, onSelectPasteTool, tool]);
  const handlePasteToolMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      selectPasteTool();
    },
    [selectPasteTool],
  );
  const handlePasteToolClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0) {
        return;
      }
      selectPasteTool();
    },
    [selectPasteTool],
  );
  const handleCoverImageError = useCallback(() => {
    if (!isCoverLoadFailed) {
      setIsCoverLoadFailed(true);
    }
  }, [isCoverLoadFailed, setIsCoverLoadFailed]);

  const handlePlayToolMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onTogglePlayTool();
    },
    [onTogglePlayTool],
  );
  const handlePlayToolClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0) {
        return;
      }
      onTogglePlayTool();
    },
    [onTogglePlayTool],
  );

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
                      onMouseDown={(event) => handlePaletteToolMouseDown(event, item.type)}
                      onClick={(event) => handlePaletteToolClick(event, item.type)}
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
                  onMouseDown={handleBpmToolMouseDown}
                  onClick={handleBpmToolClick}
                  title="BPM"
                >
                  <span className="tool-icon-core">
                    <span className="bpm-text">BPM</span>
                  </span>
                </button>
              </div>
              <div className="tool-grid copy-paste-tool-row">
                <button
                  type="button"
                  className={`tool-icon-button copy-paste-tool-button ${isToolArmed && tool === "copy" ? "active" : ""}`}
                  onMouseDown={handleCopyToolMouseDown}
                  onClick={handleCopyToolClick}
                  title="复制框选内容"
                >
                  <span className="tool-icon-core">
                    <span className="tool-label-text">复制</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`tool-icon-button copy-paste-tool-button ${isToolArmed && tool === "paste" ? "active" : ""}`}
                  onMouseDown={handlePasteToolMouseDown}
                  onClick={handlePasteToolClick}
                  title={hasCopiedChartPayload ? "粘贴复制内容" : "粘贴（暂无复制内容）"}
                >
                  <span className="tool-icon-core">
                    <span className="tool-label-text">粘贴</span>
                  </span>
                </button>
              </div>
              <div className="tool-grid play-tool-row">
                <button
                  type="button"
                  className={`tool-icon-button play-tool-button ${isPlayToolSelected ? "active" : ""}`}
                  onMouseDown={handlePlayToolMouseDown}
                  onClick={handlePlayToolClick}
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
            <button
              type="button"
              className="tool-action-icon undo-action"
              title="撤销"
              onClick={undoLastNote}
              disabled={!canUndoLastOperation}
            >
              <img src={undoActionIcon} alt="" className="tool-action-glyph" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tool-action-icon redo-action"
              title="重做"
              onClick={redoLastNote}
              disabled={!canRedoLastOperation}
            >
              <img src={undoActionIcon} alt="" className="tool-action-glyph" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tool-action-icon clear-action"
              title="清空"
              onClick={clearAllNotes}
              disabled={notesLength === 0}
            >
              <img src={clearActionIcon} alt="" className="tool-action-glyph" aria-hidden="true" />
            </button>
          </div>
        </section>

        {isPlayToolSelected && (
          <section className="selected-note-panel playback-settings-panel">
            <div className="selected-note-grid playback-settings-grid">
              <div className="setting-block playback-speed-block">
                <span className="setting-title-strip">速度</span>
                <div className="inline-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackSpeedDown}
                    onClick={() => stepPlaybackSpeed(-1)}
                  >
                    <StepperIcon type="minus" />
                  </button>
                  <input type="text" className="stepper-input" value={playbackSpeedLabel} readOnly tabIndex={-1} />
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackSpeedUp}
                    onClick={() => stepPlaybackSpeed(1)}
                  >
                    <StepperIcon type="plus" />
                  </button>
                </div>
              </div>
              <div className="setting-block playback-volume-block">
                <span className="setting-title-strip">音量</span>
                <div className="inline-stepper inline-stepper-extended">
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackVolumeDown}
                    onClick={() => stepPlaybackVolume(-2)}
                    title="步退 10%"
                  >
                    <StepperIcon type="left" />
                  </button>
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackVolumeDown}
                    onClick={() => stepPlaybackVolume(-1)}
                  >
                    <StepperIcon type="minus" />
                  </button>
                  <input type="text" className="stepper-input" value={playbackVolumeLabel} readOnly tabIndex={-1} />
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackVolumeUp}
                    onClick={() => stepPlaybackVolume(1)}
                  >
                    <StepperIcon type="plus" />
                  </button>
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={!canStepPlaybackVolumeUp}
                    onClick={() => stepPlaybackVolume(2)}
                    title="步进 10%"
                  >
                    <StepperIcon type="right" />
                  </button>
                </div>
              </div>
              <div className="setting-block playback-position-block">
                <span className="setting-title-strip">位置</span>
                <div className="playback-position-row">
                  <div className="inline-stepper inline-stepper-extended">
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepPlaybackPositionDown}
                      onClick={() => stepPlaybackPosition(-10)}
                      title="步退 10%"
                    >
                      <StepperIcon type="left" />
                    </button>
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepPlaybackPositionDown}
                      onClick={() => stepPlaybackPosition(-1)}
                    >
                      <StepperIcon type="minus" />
                    </button>
                    <input type="text" className="stepper-input" value={playbackPositionLabel} readOnly tabIndex={-1} />
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepPlaybackPositionUp}
                      onClick={() => stepPlaybackPosition(1)}
                    >
                      <StepperIcon type="plus" />
                    </button>
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepPlaybackPositionUp}
                      onClick={() => stepPlaybackPosition(10)}
                      title="步进 10%"
                    >
                      <StepperIcon type="right" />
                    </button>
                  </div>
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
              </div>
            </div>
          </section>
        )}

        {!hideSettingsPanel && hasSettingsContent && <section className="selected-note-panel">
          <div className="selected-note-grid">
            {showBeatSetting && (
              <div className="setting-block">
                <span className="setting-title-strip">Beat 值</span>
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </div>
            )}

            {showBpmSetting && (
              <div className="setting-block">
                <span className="setting-title-strip">BPM 值</span>
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </div>
            )}

            {showLaneSetting && (
              <div className="setting-block">
                <span className="setting-title-strip">轨道</span>
                <div className="inline-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={isLaneSettingLocked}
                    onClick={() => stepActiveLane(-1)}
                  >
                    <StepperIcon type="minus" />
                  </button>
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={isLaneSettingLocked}
                    onClick={() => stepActiveLane(1)}
                  >
                    <StepperIcon type="plus" />
                  </button>
                </div>
              </div>
            )}

            {showWidthSetting && (
              <div className="setting-block">
                <span className="setting-title-strip">宽度</span>
                <div className="inline-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => stepActiveWidth(-1)}
                  >
                    <StepperIcon type="minus" />
                  </button>
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => stepActiveWidth(1)}
                  >
                    <StepperIcon type="plus" />
                  </button>
                </div>
              </div>
            )}

            {showDirectionSetting && (
              <div className="setting-block">
                <span className="setting-title-strip">方向</span>
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
              </div>
            )}

            {showSlideSegmentSetting && (
              <>
                <div className="setting-block">
                  <span className="setting-title-strip">形状</span>
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
                </div>

                <div className="setting-block">
                  <span className="setting-title-strip">类型</span>
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
                </div>

                <div className="setting-block">
                  <span className="setting-title-strip">精度</span>
                  <div className="inline-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepSlidePrecisionDown}
                      onClick={() => stepSlidePrecision(-1)}
                    >
                      <StepperIcon type="minus" />
                    </button>
                    <input
                      type="text"
                      className="stepper-input"
                      value={slidePrecision}
                      readOnly
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={!canStepSlidePrecisionUp}
                      onClick={() => stepSlidePrecision(1)}
                    >
                      <StepperIcon type="plus" />
                    </button>
                  </div>
                </div>

                <div className="setting-block">
                  <span className="setting-title-strip">分度</span>
                  <div className="inline-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={isSlideDivisionDisabled || !canStepSlideDivisionDown}
                      onClick={() => stepSlideDivision(-1)}
                    >
                      <StepperIcon type="minus" />
                    </button>
                    <input
                      type="text"
                      className={`stepper-input ${isSlideDivisionDisabled ? "is-disabled" : ""}`}
                      value={slideDivision}
                      readOnly
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={isSlideDivisionDisabled || !canStepSlideDivisionUp}
                      onClick={() => stepSlideDivision(1)}
                    >
                      <StepperIcon type="plus" />
                    </button>
                  </div>
                </div>

                <div className="setting-block">
                  <span className="setting-title-strip">震动</span>
                  <div className="inline-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => stepSlideVibration(-0.1)}
                    >
                      <StepperIcon type="minus" />
                    </button>
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
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => stepSlideVibration(0.1)}
                    >
                      <StepperIcon type="plus" />
                    </button>
                  </div>
                </div>
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



