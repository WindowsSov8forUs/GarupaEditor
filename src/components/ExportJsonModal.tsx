import { useEffect, useRef, useState } from "react";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import {
  fetchBestdoriCommunityPostTags,
  type BestdoriPostTag,
  type BestdoriPostTagSearchEntry,
} from "../services/bestdori/api";
import { SettingPrimaryTitle } from "./SettingPrimaryTitle";
import { StepperIcon } from "./StepperIcon";
import { TopTabs } from "./TopTabs";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition } from "./useModalTransition";
import { isMobileRuntime } from "../app/mobileRuntime";

type ExportModalTab = "chart-code" | "upload-server" | "upload" | "upload-test";

type ExportJsonModalProps = {
  open: boolean;
  jsonText: string;
  uploadCommunityPostContent: string;
  uploadCommunityPostTags: BestdoriPostTag[];
  onClose: () => void;
  onSaveAs: () => void;
  onExportBestdoriV2: () => void;
  onUploadCommunityPostContentChange: (value: string) => void;
  onUploadCommunityPostTagsChange: (value: BestdoriPostTag[]) => void;
  onApplyUploadCommunityChart: () => void;
  onApplyUploadNotGarupaServerChart: () => void;
  onApplyUploadTestServerChart: () => void;
};

export function ExportJsonModal({
  open,
  jsonText,
  uploadCommunityPostContent,
  uploadCommunityPostTags,
  onClose,
  onSaveAs,
  onExportBestdoriV2,
  onUploadCommunityPostContentChange,
  onUploadCommunityPostTagsChange,
  onApplyUploadCommunityChart,
  onApplyUploadNotGarupaServerChart,
  onApplyUploadTestServerChart,
}: ExportJsonModalProps) {
  const optionsTitleIcon = useApplicationResourceUrl("ui.icon.options-title");
  const { mounted, phase } = useModalTransition(open);
  const modalLayerStyle = useModalLayer(open, mounted);
  const [tab, setTab] = useState<ExportModalTab>("chart-code");
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const { mounted: tagPickerMounted, phase: tagPickerPhase } = useModalTransition(isTagPickerOpen);
  const tagPickerLayerStyle = useModalLayer(isTagPickerOpen, tagPickerMounted);
  const [tagPickerType, setTagPickerType] = useState("text");
  const [tagPickerKeyword, setTagPickerKeyword] = useState("");
  const [tagCandidates, setTagCandidates] = useState<BestdoriPostTagSearchEntry[]>([]);
  const [isTagCandidatesLoading, setIsTagCandidatesLoading] = useState(false);
  const [tagCandidatesError, setTagCandidatesError] = useState("");
  const tagSearchSeqRef = useRef(0);
  const mobileReadOnly = isMobileRuntime();

  const upsertTag = (nextTag: BestdoriPostTag) => {
    const normalizedType = nextTag.type.trim();
    const normalizedData = nextTag.data.trim();
    if (!normalizedType || !normalizedData) {
      return;
    }
    const exists = uploadCommunityPostTags.some(
      (tag) => tag.type === normalizedType && tag.data === normalizedData,
    );
    if (exists) {
      return;
    }
    onUploadCommunityPostTagsChange([...uploadCommunityPostTags, { type: normalizedType, data: normalizedData }]);
  };

  const removeTagAt = (index: number) => {
    if (index < 0 || index >= uploadCommunityPostTags.length) {
      return;
    }
    onUploadCommunityPostTagsChange(uploadCommunityPostTags.filter((_, currentIndex) => currentIndex !== index));
  };

  useEffect(() => {
    if (open) {
      setTab("chart-code");
      setIsTagPickerOpen(false);
      setTagPickerType("text");
      setTagPickerKeyword("");
      setTagCandidates([]);
      setTagCandidatesError("");
      setIsTagCandidatesLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (mobileReadOnly && tab !== "chart-code") {
      setTab("chart-code");
    }
  }, [mobileReadOnly, tab]);

  useEffect(() => {
    if (!open || !isTagPickerOpen) {
      return;
    }
    const currentSeq = tagSearchSeqRef.current + 1;
    tagSearchSeqRef.current = currentSeq;
    setIsTagCandidatesLoading(true);
    setTagCandidatesError("");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchBestdoriCommunityPostTags(
            tagPickerType.trim() || "text",
            tagPickerKeyword,
            true,
          );
          if (tagSearchSeqRef.current !== currentSeq) {
            return;
          }
          setTagCandidates(Array.isArray(result.tags) ? result.tags : []);
          setTagCandidatesError("");
        } catch (error) {
          if (tagSearchSeqRef.current !== currentSeq) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setTagCandidates([]);
          setTagCandidatesError(message);
        } finally {
          if (tagSearchSeqRef.current === currentSeq) {
            setIsTagCandidatesLoading(false);
          }
        }
      })();
    }, 160);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, isTagPickerOpen, tagPickerType, tagPickerKeyword]);

  if (!mounted) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";
  const uploadSettings = (
    <>
      <div className="export-json-field">
        <span className="setting-title-strip">描述文本</span>
        <textarea
          className="export-json-textarea"
          value={uploadCommunityPostContent}
          onChange={(event) => onUploadCommunityPostContentChange(event.currentTarget.value)}
          readOnly={false}
          spellCheck={false}
        />
      </div>
      <p className="import-json-upload-note">
        上传时会使用当前谱面与谱面信息（标题、艺术家、谱师、等级），并上传音频与封面资源。
      </p>
      <div className="setting-block">
        <span className="setting-title-strip">标签</span>
        <div className="upload-tag-current-row">
          {uploadCommunityPostTags.map((tag, index) => (
            <div key={`${tag.type}:${tag.data}:${index}`} className="upload-tag-chip">
              <span className="upload-tag-chip-label">
                <span className="upload-tag-hash">#</span>
                <span className="upload-tag-chip-data">{tag.data}</span>
              </span>
              <button
                type="button"
                className="upload-tag-chip-remove"
                onClick={() => removeTagAt(index)}
                title="删除标签"
                aria-label="删除标签"
              >
                <span className="upload-tag-remove-icon" aria-hidden="true">
                  <StepperIcon type="close" />
                </span>
              </button>
            </div>
          ))}
          <button type="button" className="upload-tag-add-button" onClick={() => setIsTagPickerOpen(true)}>
            <span className="upload-tag-add-icon" aria-hidden="true">
              <StepperIcon type="plus" />
            </span>
            <span className="btn-content">添加</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`modal-mask modal-transition-mask ${transitionClassName}`} style={modalLayerStyle}>
      <section
        className={`modal-card export-json-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">导出谱面</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
        </header>

        <div className="modal-body">
          <TopTabs
            className="export-json-tabs"
            ariaLabel="导出谱面分组"
            tabs={[
              { key: "chart-code", label: "导出谱面代码" },
              { key: "upload-server", label: "上传至服务器" },
              { key: "upload", label: "上传社区谱面" },
              { key: "upload-test", label: "上传测试服" },
            ]}
            activeKey={tab}
            onChange={(key) => setTab(key as ExportModalTab)}
          />

          {tab === "chart-code" && (
            <div className="export-json-page-shell">
              <div className="export-json-field">
                <textarea
                  className="export-json-textarea"
                  value={jsonText}
                  readOnly
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {tab === "upload-server" && (
            <div className="export-json-page-shell">
              <SettingPrimaryTitle text="上传至 NotGarupa 服务器" />
              {uploadSettings}
            </div>
          )}

          {tab === "upload" && (
            <div className="export-json-page-shell">
              <SettingPrimaryTitle text="上传 Bestdori 社区谱面" />
              {uploadSettings}
            </div>
          )}

          {tab === "upload-test" && (
            <div className="export-json-page-shell">
              <SettingPrimaryTitle text="上传到测试服" />
            </div>
          )}

          {tab === "chart-code" && (
            <div className="modal-actions is-centered app-settings-display-actions export-json-actions">
              <button type="button" className="app-settings-apply-button" onClick={onSaveAs}>
                <span className="btn-content">另存为 .json</span>
              </button>
              <button type="button" className="app-settings-apply-button" onClick={onExportBestdoriV2}>
                <span className="btn-content">导出为 Bestdori V2</span>
              </button>
              <button type="button" className="app-settings-back-button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </button>
            </div>
          )}

          {tab === "upload" && (
            <div className="modal-actions is-centered app-settings-display-actions export-json-actions">
              <button type="button" className="app-settings-apply-button" onClick={onApplyUploadCommunityChart}>
                <span className="btn-content">上传</span>
              </button>
              <button type="button" className="app-settings-back-button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </button>
            </div>
          )}

          {tab === "upload-server" && (
            <div className="modal-actions is-centered app-settings-display-actions export-json-actions">
              <button type="button" className="app-settings-apply-button" onClick={onApplyUploadNotGarupaServerChart}>
                <span className="btn-content">上传</span>
              </button>
              <button type="button" className="app-settings-back-button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </button>
            </div>
          )}

          {tab === "upload-test" && (
            <div className="modal-actions is-centered app-settings-display-actions export-json-actions">
              <button type="button" className="app-settings-apply-button" onClick={onApplyUploadTestServerChart}>
                <span className="btn-content">上传</span>
              </button>
              <button type="button" className="app-settings-back-button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </button>
            </div>
          )}
        </div>
      </section>
      {tagPickerMounted && (
        <div
          className={`modal-mask modal-transition-mask ${tagPickerPhase === "enter" ? "is-enter" : "is-exit"}`}
          style={tagPickerLayerStyle}
        >
          <section
            className={`modal-card export-tag-picker-modal modal-transition-card ${tagPickerPhase === "enter" ? "is-enter" : "is-exit"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header modal-titleline-header">
              <div className="modal-titleline-main">
                <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
                <div className="modal-titleline-content">
                  <h3 className="modal-titleline-text">添加标签</h3>
                  <span className="modal-titleline-rule" />
                </div>
              </div>
            </header>
            <div className="modal-body">
              <div className="export-tag-picker-body">
                <div className="setting-block">
                  <span className="setting-title-strip">类型</span>
                  <select
                    className="value-input metadata-left-input export-tag-picker-select"
                    value={tagPickerType}
                    onChange={(event) => setTagPickerType(event.currentTarget.value)}
                  >
                    <option value="text">自定义</option>
                  </select>
                </div>
                <div className="setting-block">
                  <span className="setting-title-strip">文本</span>
                  <input
                    type="text"
                    className="value-input metadata-left-input"
                    value={tagPickerKeyword}
                    onChange={(event) => setTagPickerKeyword(event.currentTarget.value)}
                    placeholder="输入关键字搜索标签"
                  />
                </div>
                <div className="setting-block">
                  <span className="setting-title-strip">标签备选</span>
                  <div className="export-tag-candidate-list">
                    {isTagCandidatesLoading && (
                      <p className="export-tag-candidate-tip">正在搜索…</p>
                    )}
                    {!isTagCandidatesLoading && tagCandidatesError && (
                      <p className="export-tag-candidate-tip export-tag-candidate-tip-error">{tagCandidatesError}</p>
                    )}
                    {!isTagCandidatesLoading && !tagCandidatesError && tagCandidates.length <= 0 && (
                      <p className="export-tag-candidate-tip">暂无匹配标签</p>
                    )}
                    {!isTagCandidatesLoading && !tagCandidatesError && tagCandidates.map((candidate, index) => (
                      <button
                        type="button"
                        key={`${candidate.type}:${candidate.data}:${index}`}
                        className="export-tag-candidate-button"
                        onClick={() => {
                          upsertTag({ type: candidate.type, data: candidate.data });
                          setIsTagPickerOpen(false);
                        }}
                      >
                        <span className="export-tag-candidate-data">
                          <span className="export-tag-candidate-hash">#</span>
                          <span>{candidate.data}</span>
                        </span>
                        <span className="export-tag-candidate-count"> ({Math.max(0, Math.trunc(Number(candidate.count) || 0))})</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-actions is-centered">
                <button type="button" className="app-settings-back-button" onClick={() => setIsTagPickerOpen(false)}>
                  <span className="btn-content">关闭</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
