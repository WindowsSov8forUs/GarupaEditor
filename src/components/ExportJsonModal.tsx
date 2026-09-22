import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { useEffect, useRef, useState } from "react";
import {
  fetchBestdoriCommunityPostTags,
  type BestdoriPostTag,
  type BestdoriPostTagSearchEntry,
} from "../services/bestdori/api";
import { OriginalFormTitle, OriginalFormSubtitle, OriginalFormNote, OriginalFormInput, OriginalFormButton as OriginalButton } from "./OriginalFormParts";
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
  const [tab, setTab] = useState<ExportModalTab>("chart-code");
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
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


  const uploadSettings = (
    <>
      <div className="export-json-field">
        <OriginalFormSubtitle text="描述文本" />
        <OriginalFormInput multiline
          aria-label="上传描述"
          value={uploadCommunityPostContent}
          onChange={(event) => onUploadCommunityPostContentChange(event.currentTarget.value)}
          readOnly={false}
          spellCheck={false}
        />
      </div>
      <OriginalFormNote text="上传时会使用当前谱面与谱面信息（标题、艺术家、谱师、等级），并上传音频与封面资源。" />
      <div className="setting-block">
        <OriginalFormSubtitle text="标签" />
        <div className="upload-tag-current-row">
          {uploadCommunityPostTags.map((tag, index) => (
            <div key={`${tag.type}:${tag.data}:${index}`} className="upload-tag-chip">
              <OriginalFormInput readOnly aria-label="已选标签" title={tag.data} value={`#${tag.data}`} />
              <OriginalButton
                size="small"
                onClick={() => removeTagAt(index)}
                title="删除标签"
                aria-label="删除标签"
              >
                删除
              </OriginalButton>
            </div>
          ))}
          <OriginalButton size="small" onClick={() => setIsTagPickerOpen(true)}>添加</OriginalButton>
        </div>
      </div>
    </>
  );

  return (
    <>
    <OriginalTransferDialog open={open} title="导出谱面" onClose={onClose}
      tabs={[
              { key: "chart-code", label: "导出谱面代码" },
              { key: "upload-server", label: "上传至服务器" },
              { key: "upload", label: "上传社区谱面" },
              { key: "upload-test", label: "上传测试服" },
            ]}
      selected={tab} onSelect={key => setTab(key as ExportModalTab)}>
        <div className="transfer-body">
          {tab === "chart-code" && (
            <div className="transfer-page">
              <OriginalFormTitle text="谱面代码" />
              <div className="export-json-field">
                <OriginalFormInput multiline
                  aria-label="导出的谱面 JSON 代码"
                  value={jsonText}
                  readOnly
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {tab === "upload-server" && (
            <div className="transfer-page">
              <OriginalFormTitle text="上传至 NotGarupa 服务器" followedBySubtitle />
              {uploadSettings}
            </div>
          )}

          {tab === "upload" && (
            <div className="transfer-page">
              <OriginalFormTitle text="上传 Bestdori 社区谱面" followedBySubtitle />
              {uploadSettings}
            </div>
          )}

          {tab === "upload-test" && (
            <div className="transfer-page">
              <OriginalFormTitle text="上传到测试服" />
            </div>
          )}

          {tab === "chart-code" && (
            <div className="transfer-actions">
              <OriginalButton tone="pink" type="button" onClick={onSaveAs}>
                <span className="btn-content">另存为 .json</span>
              </OriginalButton>
              <OriginalButton tone="pink" type="button" onClick={onExportBestdoriV2}>
                <span className="btn-content">导出为 Bestdori V2</span>
              </OriginalButton>
              <OriginalButton tone="gray" type="button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </OriginalButton>
            </div>
          )}

          {tab === "upload" && (
            <div className="transfer-actions">
              <OriginalButton tone="pink" type="button" onClick={onApplyUploadCommunityChart}>
                <span className="btn-content">上传</span>
              </OriginalButton>
              <OriginalButton tone="gray" type="button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </OriginalButton>
            </div>
          )}

          {tab === "upload-server" && (
            <div className="transfer-actions">
              <OriginalButton tone="pink" type="button" onClick={onApplyUploadNotGarupaServerChart}>
                <span className="btn-content">上传</span>
              </OriginalButton>
              <OriginalButton tone="gray" type="button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </OriginalButton>
            </div>
          )}

          {tab === "upload-test" && (
            <div className="transfer-actions">
              <OriginalButton tone="pink" type="button" onClick={onApplyUploadTestServerChart}>
                <span className="btn-content">上传</span>
              </OriginalButton>
              <OriginalButton tone="gray" type="button" onClick={onClose}>
                <span className="btn-content">关闭</span>
              </OriginalButton>
            </div>
          )}
        </div>
    </OriginalTransferDialog>
      <OriginalTransferDialog open={open && isTagPickerOpen} title="添加标签" onClose={() => setIsTagPickerOpen(false)}>
            <div className="transfer-body">
              <div className="export-tag-picker-body">
                <div className="setting-block">
                  <OriginalFormSubtitle text="类型" />
                  <OriginalFormInput aria-label="标签类型" value="自定义" readOnly />
                </div>
                <div className="setting-block">
                  <OriginalFormSubtitle text="文本" />
                  <OriginalFormInput
                    type="text"
                    aria-label="搜索标签"
                    value={tagPickerKeyword}
                    onChange={(event) => setTagPickerKeyword(event.currentTarget.value)}
                    placeholder="输入关键字搜索标签"
                  />
                </div>
                <div className="setting-block">
                  <OriginalFormSubtitle text="标签备选" />
                  <div className="export-tag-candidate-list">
                    {isTagCandidatesLoading && (
                      <OriginalFormNote text="正在搜索…" />
                    )}
                    {!isTagCandidatesLoading && tagCandidatesError && (
                      <OriginalFormNote text={tagCandidatesError} />
                    )}
                    {!isTagCandidatesLoading && !tagCandidatesError && tagCandidates.length <= 0 && (
                      <OriginalFormNote text="暂无匹配标签" />
                    )}
                    {!isTagCandidatesLoading && !tagCandidatesError && tagCandidates.map((candidate, index) => (
                      <OriginalButton
                        key={`${candidate.type}:${candidate.data}:${index}`}
                        className="original-tag-candidate"
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
                      </OriginalButton>
                    ))}
                  </div>
                </div>
              </div>
              <div className="transfer-actions">
                <OriginalButton tone="gray" type="button" onClick={() => setIsTagPickerOpen(false)}>
                  <span className="btn-content">关闭</span>
                </OriginalButton>
              </div>
            </div>
      </OriginalTransferDialog>
    </>
  );
}
