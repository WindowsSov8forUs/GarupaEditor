import { appLog } from "../logging/applicationLogger";
import { DownloadFailure } from "./downloadError";

import { downloadActivity } from "./downloadActivity";

const ATTEMPTS = 3;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Browser GET transport. Read the complete body inside the attempt so a broken
 * stream is retried too. Parsing and resource validation belong to the caller. */
export async function downloadBytes(url: string): Promise<ArrayBuffer> {
  const remote = /^https?:\/\//i.test(url);
  const endpoint = remote ? (() => {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  })() : "local resource";
  const attempts = remote ? ATTEMPTS : 1;
  const external = remote && (typeof location === "undefined" || new URL(url).origin !== location.origin);
  const activity = external ? downloadActivity.begin() : undefined;
  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      activity?.progress(0, null);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      let retryable: boolean | undefined;
      let delay = 1000 * 2 ** (attempt - 1);
      let status: number | undefined;
      try {
        const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          status = response.status;
          retryable = RETRY_STATUS.has(response.status);
          const after = response.headers.get("Retry-After");
          if (after !== null) {
            const milliseconds = /^\d+$/.test(after.trim()) ? Number(after) * 1000 : Date.parse(after) - Date.now();
            if (Number.isFinite(milliseconds)) delay = Math.max(0, milliseconds);
          }
          await response.body?.cancel();
          throw new Error(`download http status ${response.status}`);
        }
        const bytes = await readDownloadBody(response, activity);
        if (attempt > 1) appLog("info", "download.recovered", { url, attempt, attempts });
        return bytes;
      } catch (error) {
        retryable ??= error instanceof TypeError || (error instanceof DOMException
          && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name));
        if (!retryable || attempt === attempts || delay > 30_000) {
          appLog("error", "download.failed", { url, attempt, attempts, error });
          const summary = status !== undefined ? `资源服务器返回 HTTP ${status}`
            : controller.signal.aborted ? "网络连接或读取超时" : "资源请求失败或传输中断";
          throw Object.assign(new DownloadFailure(
            `${error instanceof Error ? error.message : String(error)} at ${endpoint}; attempts=${attempt}/${attempts}`,
            `${summary}（已尝试 ${attempt} 次）${delay > 30_000 ? "，服务器要求稍后重试" : ""}`,
          ), { cause: error });
        }
        appLog("warn", "download.retry", { url, attempt, attempts, delayMs: delay, error });
      } finally {
        clearTimeout(timer);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error("unreachable download attempt");
  } finally { activity?.finish(); }
}

export async function readDownloadBody(response: Response, activity?: ReturnType<typeof downloadActivity.begin>): Promise<ArrayBuffer> {
  const length = Number(response.headers.get("Content-Length"));
  const encoding = response.headers.get("Content-Encoding");
  // Browsers expose decoded bytes; an encoded Content-Length is not their denominator.
  const total = (!encoding || encoding === "identity") && Number.isFinite(length) && length > 0 ? length : null;
  activity?.progress(0, total);
  if (!response.body || !activity) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value); received += chunk.value.byteLength;
      activity.progress(received, total);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return joined.buffer;
}
