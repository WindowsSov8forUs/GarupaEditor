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
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { StepperIcon } from "./StepperIcon";
import { useModalTransition } from "./useModalTransition";

type MetadataEditorModalProps = {
  open: boolean;
  metadata: ChartMetadata;
  setMetadata: Dispatch<SetStateAction<ChartMetadata>>;
  audioObjectUrl: string | null;
  onClose: () => void;
  onCoverUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAudioUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

function normalizeLevel(value: unknown, fallback: number): number {
  return Math.max(1, Math.round(toFinite(value, fallback)));
}

export function MetadataEditorModal({
  open,
  metadata,
  setMetadata,
  audioObjectUrl,
  onClose,
  onCoverUpload,
  onAudioUpload,
}: MetadataEditorModalProps) {
  const { mounted, phase } = useModalTransition(open);
  const [levelInput, setLevelInput] = useState(metadata.difficultyLevel);
  const [coverFileLabel, setCoverFileLabel] = useState("");
  const [audioFileLabel, setAudioFileLabel] = useState("");
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLevelInput(metadata.difficultyLevel);
  }, [metadata.difficultyLevel, open]);

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

  const handleCoverInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileName = event.currentTarget.files?.[0]?.name ?? "";
    setCoverFileLabel(fileName);
    onCoverUpload(event);
  };

  const handleAudioInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileName = event.currentTarget.files?.[0]?.name ?? "";
    setAudioFileLabel(fileName);
    onAudioUpload(event);
  };

  if (!mounted) {
    return null;
  }

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
              <h3 className="modal-titleline-text">谱面信息</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <span className="btn-content">×</span>
          </button>
        </header>

        <div className="modal-body">
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

            <div className="metadata-editor-row metadata-editor-row-three">
              <div className="setting-block">
                <span className="setting-title-strip">封面</span>
                <div className="metadata-file-row">
                  <button
                    type="button"
                    className="metadata-file-trigger"
                    onClick={() => {
                      coverInputRef.current?.click();
                    }}
                  >
                    <span className="btn-content">选择文件</span>
                  </button>
                  <div className="metadata-file-name" title={coverFileLabel || "未选择文件"}>
                    {coverFileLabel || "未选择文件"}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="metadata-file-hidden"
                    onChange={handleCoverInputChange}
                  />
                </div>
              </div>

              <div className="setting-block">
                <span className="setting-title-strip">音频</span>
                <div className="metadata-file-row">
                  <button
                    type="button"
                    className="metadata-file-trigger"
                    onClick={() => {
                      audioInputRef.current?.click();
                    }}
                  >
                    <span className="btn-content">选择文件</span>
                  </button>
                  <div className="metadata-file-name" title={audioFileLabel || "未选择文件"}>
                    {audioFileLabel || "未选择文件"}
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="metadata-file-hidden"
                    onChange={handleAudioInputChange}
                  />
                </div>
              </div>

              <div className="setting-block">
                <span className="setting-title-strip">Offset (ms)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="value-input"
                  value={metadata.offsetMs}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMetadata((current) => ({
                      ...current,
                      offsetMs: Math.round(clamp(toFinite(value, current.offsetMs), -5000, 5000)),
                    }));
                  }}
                />
              </div>
            </div>
          </div>

          {audioObjectUrl && (
            <audio controls src={audioObjectUrl} className="audio-preview">
              <track kind="captions" />
            </audio>
          )}
        </div>
      </section>
    </div>
  );
}

