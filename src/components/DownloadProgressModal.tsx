import { useEffect } from "react";
import { originalLoading } from "./originalLoadingState";
type DownloadProgressModalProps = { visible: boolean; blocking: boolean; percent: number; message: string; logs: string[] };
/** Compatibility entry for existing operation owners; only transport displays byte progress. */
export function DownloadProgressModal({ visible, blocking }: DownloadProgressModalProps) {
  useEffect(() => { if (visible) return originalLoading.hold("network", {}).release; }, [visible]);
  return visible && blocking ? <div className="download-progress-lock-mask" aria-hidden="true" /> : null;
}
