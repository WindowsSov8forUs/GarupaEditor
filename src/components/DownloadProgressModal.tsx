type DownloadProgressModalProps = {
  visible: boolean;
  blocking: boolean;
  percent: number;
  message: string;
  logs: string[];
};

export function DownloadProgressModal({
  visible,
  blocking,
  percent,
  message,
  logs,
}: DownloadProgressModalProps) {
  if (!visible) {
    return null;
  }

  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const renderedLog = (logs.length > 0 ? logs[logs.length - 1] : message) || "";

  return (
    <>
      {blocking && <div className="download-progress-lock-mask" aria-hidden="true" />}
      <aside className="download-progress-modal" aria-live="polite" role="status">
        <div className="download-progress-head">
          <span className="download-progress-title">加载中...</span>
          <span className="download-progress-percent">{clampedPercent}%</span>
        </div>
        <div className="download-progress-bar-track" aria-hidden="true">
          <div
            className="download-progress-bar-fill"
            style={{ width: `${clampedPercent}%` }}
          />
        </div>
        <div className="download-progress-events">
          <p className="download-progress-event-line">{renderedLog}</p>
        </div>
      </aside>
    </>
  );
}
