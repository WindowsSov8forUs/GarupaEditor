import { memo, type CSSProperties } from "react";
import { formatDuration, getDifficultyStyle, type ChartMetadata } from "../chartCore";
import editIcon from "../assets/icons/edit.svg";
import { OverflowScrollText } from "./OverflowScrollText";

type ChartInfoPanelProps = {
  metadata: ChartMetadata;
  coverImageSrc: string;
  audioDurationSec: number;
  noteCount: number;
  onOpenMetadataEditor: () => void;
  onCoverImageError: () => void;
};

export const ChartInfoPanel = memo(function ChartInfoPanel({
  metadata,
  coverImageSrc,
  audioDurationSec,
  noteCount,
  onOpenMetadataEditor,
  onCoverImageError,
}: ChartInfoPanelProps) {
  return (
    <section className="chart-info-panel">
      <div className="chart-info-body">
        <div className="cover-column">
          <div className="cover-frame">
            <img src={coverImageSrc} alt="cover" onError={onCoverImageError} />
          </div>
          <span
            className="difficulty-badge"
            style={
              {
                "--diff-fill": getDifficultyStyle(metadata.difficulty).fill,
                "--diff-stroke": getDifficultyStyle(metadata.difficulty).stroke,
              } as CSSProperties
            }
          >
            {metadata.difficulty}
          </span>
        </div>

        <div className="chart-main">
          <div className="chart-title-row">
            <h3>
              <OverflowScrollText text={metadata.title || "Untitled"} className="chart-title-text" />
            </h3>
            <button
              type="button"
              className="icon-button chart-info-edit-button"
              title="编辑谱面信息"
              aria-label="编辑谱面信息"
              onClick={onOpenMetadataEditor}
            >
              <img src={editIcon} alt="" aria-hidden="true" />
            </button>
          </div>

          <p className="chart-level-row">
            <span className="level-prefix">Lv.</span>
            <span className="level-value">{metadata.difficultyLevel}</span>
          </p>

          <div className="chart-info-block chart-info-block-meta">
            <div className="chart-info-cell">
              <span className="chart-info-chip">艺术家</span>
              <OverflowScrollText text={metadata.artist} className="chart-info-value" />
            </div>
            <div className="chart-info-cell">
              <span className="chart-info-chip">谱师</span>
              <OverflowScrollText text={metadata.charter} className="chart-info-value" />
            </div>
          </div>

          <div className="chart-info-block chart-info-block-stats">
            <div className="chart-info-cell">
              <span className="chart-info-chip">BPM</span>
              <OverflowScrollText text={metadata.bpm.toFixed(2)} className="chart-info-value" />
            </div>
            <div className="chart-info-cell">
              <span className="chart-info-chip">时长</span>
              <OverflowScrollText text={formatDuration(audioDurationSec)} className="chart-info-value" />
            </div>
            <div className="chart-info-cell">
              <span className="chart-info-chip">音符总数</span>
              <OverflowScrollText text={String(noteCount)} className="chart-info-value" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

ChartInfoPanel.displayName = "ChartInfoPanel";
