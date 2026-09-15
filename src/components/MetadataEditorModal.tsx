import {
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DIFFICULTY_OPTIONS,
  clamp,
  normalizeDifficultyLevel,
  toFinite,
  type ChartMetadata,
} from "../chartCore";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import { SettingPrimaryTitle } from "./SettingPrimaryTitle";
import { StepperIcon } from "./StepperIcon";
import { TopTabs } from "./TopTabs";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition } from "./useModalTransition";

type MetadataEditorModalProps = {
  open: boolean;
  metadata: ChartMetadata;
  mediaSources: {
    cover: string | null;
    audio: string | null;
    mv: string | null;
    stageBackdrop: string | null;
  };
  mediaError: string | null;
  setMetadata: Dispatch<SetStateAction<ChartMetadata>>;
  onClose: () => void;
  onCoverUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAudioUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onMvUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onStageBackdropUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

type MetadataEditorTab = "info" | "files";

function normalizeLevel(value: unknown, fallback: number): number {
  return Math.max(1, Math.round(toFinite(value, fallback)));
}

function normalizeSource(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function formatSourceLabel(source: string): string {
  return normalizeSource(source).length > 0 ? "已由资源管理器加载" : "";
}

export function MetadataEditorModal({
  open,
  metadata,
  mediaSources,
  mediaError,
  setMetadata,
  onClose,
  onCoverUpload,
  onAudioUpload,
  onMvUpload,
  onStageBackdropUpload,
}: MetadataEditorModalProps) {
  const optionsTitleIcon = useApplicationResourceUrl("ui.icon.options-title");
  const { mounted, phase } = useModalTransition(open);
  const modalLayerStyle = useModalLayer(open, mounted);
  const [tab, setTab] = useState<MetadataEditorTab>("info");
  const [levelInput, setLevelInput] = useState(metadata.difficultyLevel);
  const [offsetInput, setOffsetInput] = useState(String(metadata.offsetMs));
  const [mvOffsetInput, setMvOffsetInput] = useState(String(metadata.mvOffsetMs));
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const mvInputRef = useRef<HTMLInputElement | null>(null);
  const stageBackdropInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLevelInput(metadata.difficultyLevel);
  }, [metadata.difficultyLevel, open]);

  useEffect(() => {
    setOffsetInput(String(metadata.offsetMs));
  }, [metadata.offsetMs, open]);

  useEffect(() => {
    setMvOffsetInput(String(metadata.mvOffsetMs));
  }, [metadata.mvOffsetMs, open]);

  useEffect(() => {
    if (open) {
      setTab("info");
    }
  }, [open]);

  const difficultyIndex = useMemo(() => {
    const index = DIFFICULTY_OPTIONS.indexOf(metadata.difficulty);
    return index >= 0 ? index : 0;
  }, [metadata.difficulty]);

  const commitLevelInput = (rawValue?: string) => {
    const fallbackLevel = normalizeLevel(metadata.difficultyLevel, 1);
    const normalizedLevel = normalizeDifficultyLevel(rawValue ?? levelInput);
    const level = normalizeLevel(normalizedLevel, fallbackLevel);
    const next = String(level);
    setMetadata((current) => ({ ...current, difficultyLevel: next }));
    setLevelInput(next);
  };

  const handleLevelInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const commitOffsetInput = () => {
    const nextValue = offsetInput.trim() === ""
      ? 0
      : Math.round(clamp(toFinite(offsetInput, metadata.offsetMs), -5000, 5000));
    setMetadata((current) => ({ ...current, offsetMs: nextValue }));
    setOffsetInput(String(nextValue));
  };

  const commitMvOffsetInput = () => {
    const nextValue = mvOffsetInput.trim() === ""
      ? 0
      : Math.round(clamp(toFinite(mvOffsetInput, metadata.mvOffsetMs), -5000, 5000));
    setMetadata((current) => ({ ...current, mvOffsetMs: nextValue }));
    setMvOffsetInput(String(nextValue));
  };

  const handleCoverInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCoverUpload(event);
  };

  const handleAudioInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAudioUpload(event);
  };

  const handleMvInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onMvUpload(event);
  };

  const handleStageBackdropInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onStageBackdropUpload(event);
  };

  if (!mounted) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";
  const coverSource = normalizeSource(mediaSources.cover);
  const audioSource = normalizeSource(mediaSources.audio);
  const mvSource = normalizeSource(mediaSources.mv);
  const stageBackdropSource = normalizeSource(mediaSources.stageBackdrop);

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} style={modalLayerStyle}>
      <section
        className={`modal-card metadata-editor-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">谱面信息</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
        </header>

        <div className="modal-body">
          <TopTabs
            className="metadata-editor-tabs"
            ariaLabel="谱面信息分组"
            tabs={[
              { key: "info", label: "信息编辑" },
              { key: "files", label: "文件上传" },
            ]}
            activeKey={tab}
            onChange={(key) => setTab(key as MetadataEditorTab)}
          />

          {tab === "info" && (
            <div className="metadata-editor-page-shell">
              <div className="metadata-editor-grid">
                <div className="metadata-editor-row metadata-editor-row-three">
                  <div className="setting-block">
                    <span className="setting-title-strip">曲名</span>
                    <input
                      className="value-input metadata-left-input"
                      value={metadata.title}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMetadata((current) => ({ ...current, title: value }));
                      }}
                    />
                  </div>

                  <div className="setting-block">
                    <span className="setting-title-strip">艺术家</span>
                    <input
                      className="value-input metadata-left-input"
                      value={metadata.artist}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMetadata((current) => ({ ...current, artist: value }));
                      }}
                    />
                  </div>

                  <div className="setting-block">
                    <span className="setting-title-strip">谱师</span>
                    <input
                      className="value-input metadata-left-input"
                      value={metadata.charter}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMetadata((current) => ({ ...current, charter: value }));
                      }}
                    />
                  </div>
                </div>

                <div className="metadata-editor-row metadata-editor-row-two">
                  <div className="setting-block">
                    <span className="setting-title-strip">难度</span>
                    <div className="inline-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        disabled={difficultyIndex <= 0}
                        onClick={() => {
                          const nextDifficulty = DIFFICULTY_OPTIONS[Math.max(0, difficultyIndex - 1)];
                          if (!nextDifficulty) {
                            return;
                          }
                          setMetadata((current) => ({ ...current, difficulty: nextDifficulty }));
                        }}
                      >
                        <StepperIcon type="minus" />
                      </button>
                      <input
                        type="text"
                        className="stepper-input"
                        value={metadata.difficulty}
                        readOnly
                        tabIndex={-1}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        disabled={difficultyIndex >= DIFFICULTY_OPTIONS.length - 1}
                        onClick={() => {
                          const nextDifficulty = DIFFICULTY_OPTIONS[Math.min(DIFFICULTY_OPTIONS.length - 1, difficultyIndex + 1)];
                          if (!nextDifficulty) {
                            return;
                          }
                          setMetadata((current) => ({ ...current, difficulty: nextDifficulty }));
                        }}
                      >
                        <StepperIcon type="plus" />
                      </button>
                    </div>
                  </div>

                  <div className="setting-block">
                    <span className="setting-title-strip">等级</span>
                    <div className="inline-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => {
                          const currentLevel = normalizeLevel(levelInput, normalizeLevel(metadata.difficultyLevel, 1));
                          const nextLevel = Math.max(1, currentLevel - 1);
                          const next = String(nextLevel);
                          setLevelInput(next);
                          setMetadata((current) => ({ ...current, difficultyLevel: next }));
                        }}
                      >
                        <StepperIcon type="minus" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="stepper-input"
                        value={levelInput}
                        onChange={(event) => {
                          setLevelInput(event.currentTarget.value);
                        }}
                        onBlur={() => {
                          commitLevelInput();
                        }}
                        onKeyDown={handleLevelInputKeyDown}
                      />
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => {
                          const currentLevel = normalizeLevel(levelInput, normalizeLevel(metadata.difficultyLevel, 1));
                          const nextLevel = currentLevel + 1;
                          const next = String(nextLevel);
                          setLevelInput(next);
                          setMetadata((current) => ({ ...current, difficultyLevel: next }));
                        }}
                      >
                        <StepperIcon type="plus" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="metadata-editor-row metadata-editor-row-two">
                  <div className="setting-block">
                    <span className="setting-title-strip">谱面Offset (ms)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="value-input"
                      value={offsetInput}
                      onChange={(event) => {
                        setOffsetInput(event.currentTarget.value);
                      }}
                      onBlur={() => {
                        commitOffsetInput();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </div>

                  <div className="setting-block">
                    <span className="setting-title-strip">MV Offset (ms)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="value-input"
                      value={mvOffsetInput}
                      onChange={(event) => {
                        setMvOffsetInput(event.currentTarget.value);
                      }}
                      onBlur={() => {
                        commitMvOffsetInput();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "files" && (
            <div className="metadata-editor-page-shell">
              <section className="metadata-upload-group">
                <SettingPrimaryTitle text="封面" />
                <div className="metadata-upload-block">
                  <div className="metadata-upload-preview">
                    {coverSource.length > 0
                      ? <img src={coverSource} alt="封面预览" className="metadata-upload-preview-media metadata-upload-preview-image" />
                      : null}
                  </div>
                  <div className="metadata-upload-source-line">
                    {coverSource.length > 0
                      ? (
                        <a
                          href={coverSource}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="metadata-upload-source-link"
                          title={coverSource}
                        >
                          {formatSourceLabel(coverSource)}
                        </a>
                      )
                      : <span className="metadata-upload-source-empty">文件未上传</span>}
                  </div>
                  <button
                    type="button"
                    className="metadata-file-trigger metadata-upload-action-button"
                    onClick={() => {
                      coverInputRef.current?.click();
                    }}
                  >
                    <span className="btn-content">上传文件</span>
                  </button>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="metadata-file-hidden"
                    onChange={handleCoverInputChange}
                  />
                </div>
              </section>

              <section className="metadata-upload-group">
                <SettingPrimaryTitle text="音频" />
                <div className="metadata-upload-block">
                  <div className="metadata-upload-preview">
                    {audioSource.length > 0
                      ? (
                        <audio
                          controls
                          preload="metadata"
                          src={audioSource}
                          className="metadata-upload-preview-media metadata-upload-preview-audio"
                        />
                      )
                      : null}
                  </div>
                  <div className="metadata-upload-source-line">
                    {audioSource.length > 0
                      ? (
                        <a
                          href={audioSource}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="metadata-upload-source-link"
                          title={audioSource}
                        >
                          {formatSourceLabel(audioSource)}
                        </a>
                      )
                      : <span className="metadata-upload-source-empty">文件未上传</span>}
                  </div>
                  <button
                    type="button"
                    className="metadata-file-trigger metadata-upload-action-button"
                    onClick={() => {
                      audioInputRef.current?.click();
                    }}
                  >
                    <span className="btn-content">上传文件</span>
                  </button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="metadata-file-hidden"
                    onChange={handleAudioInputChange}
                  />
                </div>
              </section>

              <section className="metadata-upload-group">
                <SettingPrimaryTitle text="MV" />
                <div className="metadata-upload-block">
                  <div className="metadata-upload-preview">
                    {mvSource.length > 0
                      ? (
                        <video
                          controls
                          preload="metadata"
                          src={mvSource}
                          className="metadata-upload-preview-media metadata-upload-preview-video"
                        />
                      )
                      : null}
                  </div>
                  <div className="metadata-upload-source-line">
                    {mvSource.length > 0
                      ? (
                        <a
                          href={mvSource}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="metadata-upload-source-link"
                          title={mvSource}
                        >
                          {formatSourceLabel(mvSource)}
                        </a>
                      )
                      : <span className="metadata-upload-source-empty">文件未上传</span>}
                  </div>
                  <button
                    type="button"
                    className="metadata-file-trigger metadata-upload-action-button"
                    onClick={() => {
                      mvInputRef.current?.click();
                    }}
                  >
                    <span className="btn-content">上传文件</span>
                  </button>
                  <input
                    ref={mvInputRef}
                    type="file"
                    accept="video/*"
                    className="metadata-file-hidden"
                    onChange={handleMvInputChange}
                  />
                </div>
              </section>

              <section className="metadata-upload-group">
                <SettingPrimaryTitle text="舞台背景" />
                <div className="metadata-upload-block">
                  <div className="metadata-upload-preview">
                    {stageBackdropSource.length > 0
                      ? <img src={stageBackdropSource} alt="舞台背景预览" className="metadata-upload-preview-media metadata-upload-preview-image" />
                      : null}
                  </div>
                  <div className="metadata-upload-source-line">
                    {stageBackdropSource.length > 0
                      ? <span className="metadata-upload-source-link">{formatSourceLabel(stageBackdropSource)}</span>
                      : <span className="metadata-upload-source-empty">文件未上传</span>}
                  </div>
                  <button
                    type="button"
                    className="metadata-file-trigger metadata-upload-action-button"
                    onClick={() => stageBackdropInputRef.current?.click()}
                  >
                    <span className="btn-content">上传文件</span>
                  </button>
                  <input
                    ref={stageBackdropInputRef}
                    type="file"
                    accept="image/*"
                    className="metadata-file-hidden"
                    onChange={handleStageBackdropInputChange}
                  />
                </div>
              </section>
              {mediaError ? <p className="metadata-upload-source-empty" role="alert">{mediaError}</p> : null}
            </div>
          )}

          <div className="modal-actions is-centered metadata-editor-actions">
            <button type="button" className="app-settings-back-button" onClick={onClose}>
              <span className="btn-content">关闭</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

