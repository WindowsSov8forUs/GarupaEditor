import { appLog } from "../logging/applicationLogger";

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
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let retryable: boolean | undefined;
    let delay = 1000 * 2 ** (attempt - 1);
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        retryable = RETRY_STATUS.has(response.status);
        const after = response.headers.get("Retry-After");
        if (after !== null) {
          const milliseconds = /^\d+$/.test(after.trim()) ? Number(after) * 1000 : Date.parse(after) - Date.now();
          if (Number.isFinite(milliseconds)) delay = Math.max(0, milliseconds);
        }
        await response.body?.cancel();
        throw new Error(`download http status ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      if (attempt > 1) appLog("info", "download.recovered", { url, attempt, attempts });
      return bytes;
    } catch (error) {
      retryable ??= error instanceof TypeError || (error instanceof DOMException
        && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name));
      if (!retryable || attempt === attempts || delay > 30_000) {
        appLog("error", "download.failed", { url, attempt, attempts, error });
        throw Object.assign(new Error(`${error instanceof Error ? error.message : String(error)} at ${endpoint}; attempts=${attempt}/${attempts}`), { cause: error });
      }
      appLog("warn", "download.retry", { url, attempt, attempts, delayMs: delay, error });
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error("unreachable download attempt");
}
