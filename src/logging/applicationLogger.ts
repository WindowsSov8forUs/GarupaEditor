import { installDiagnosticSink } from "./diagnosticEvents";
import { invoke, isTauri } from "@tauri-apps/api/core";

type Level = "info" | "warn" | "error";
type Entry = { time: string; level: Level; event: string; session: string; window: string; context: unknown };
const session = crypto.randomUUID();
const route = typeof location === "undefined" ? "" : location.hash;
const windowRole = route.startsWith("#simulator") ? "simulator" : route.startsWith("#static") ? "static-render" : "editor";
const queue: Entry[] = [];
const originalWarn = console.warn.bind(console);
let timer: ReturnType<typeof setTimeout> | undefined, flushing: Promise<void> | undefined;
let dropped = 0, failureReported = false, installed = false, sequence = 0;
const recent = new Map<string, number>();
const savedAt = new Map<string, number>();

function cleanText(text: string): string {
  return text.replace(/\b(?:https?|blob|data):[^\s<>"']+/gi, value => {
    if (!/^https?:/i.test(value)) return "[binary-url]";
    try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "[url]"; }
  }).replace(/("(?:password|passwd|authorization|cookie|token|secret|sessionid)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"')
    .replace(/((?:password|passwd|authorization|cookie|token|secret|sessionid)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 1800);
}
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[nested]";
  if (value instanceof Error) return { name: value.name, message: cleanText(value.message), stack: cleanText(value.stack ?? "") };
  if (typeof value === "string") return cleanText(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(item => sanitize(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [key,
    /password|passwd|cookie|authorization|token|secret|base64|chartJson|notes|slideChains|content|payload|body|username|email/i.test(key)
      ? "[redacted]" : sanitize(item, depth + 1)]));
  return String(value);
}
export function appLog(level: Level, event: string, context: unknown = {}): void {
  try {
    if (!isTauri()) return;
    const entry: Entry = { time: new Date().toISOString(), level, event: event.slice(0, 120), session, window: windowRole, context: sanitize(context) };
    if (JSON.stringify(entry).length > 7000) entry.context = { truncated: true, summary: cleanText(JSON.stringify(entry.context)) };
    // Bound repeat warnings/errors and the queue so failures cannot create frame stalls.
    if (level !== "info") {
      const key = JSON.stringify([level, event, entry.context]);
      const last = recent.get(key) ?? 0;
      if (Date.now() - last < 5000) { dropped++; return; }
      if (recent.size >= 128) recent.clear();
      recent.set(key, Date.now());
    }
    if (queue.length >= 256) { queue.shift(); dropped++; }
    queue.push(entry);
    if (level === "error" || queue.length >= 32) void flushLogs();
    else if (timer === undefined) timer = setTimeout(() => { timer = undefined; void flushLogs(); }, 500);
  } catch { /* Logging must never change application behavior. */ }
}
export function flushLogs(): Promise<void> {
  if (flushing) return flushing;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  flushing = (async () => {
    while (queue.length) {
      const batch = queue.splice(0, 32);
      if (dropped) {
        batch.push({ time: new Date().toISOString(), level: "warn", event: "logger.suppressed", session, window: windowRole, context: { count: dropped } });
        dropped = 0;
      }
      try { await invoke("application_log_batch", { entries: batch }); failureReported = false; }
      catch (error) {
        dropped += batch.length;
        if (!failureReported) { originalWarn("文件日志写入失败", error); failureReported = true; }
        break;
      }
    }
  })().finally(() => { flushing = undefined; });
  return flushing;
}
export function startOperation(event: string, context: Record<string, unknown> = {}) {
  const operation = `${session}:${++sequence}`, start = performance.now();
  appLog("info", `${event}.start`, { ...context, operation });
  let ended = false;
  return (error?: unknown, details: Record<string, unknown> = {}) => {
    if (ended) return; ended = true;
    appLog(error === undefined ? "info" : "error", `${event}.${error === undefined ? "complete" : "failed"}`,
      { ...context, ...details, operation, durationMs: Math.round(performance.now() - start), ...(error === undefined ? {} : { error }) });
  };
}
export function initializeLogging(): void {
  if (installed) return; installed = true;
  installDiagnosticSink(appLog);
  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { original(...args); appLog(level, `console.${level}`, { arguments: args }); };
  }
  window.addEventListener("error", event => appLog("error", "window.error", { error: event.error ?? event.message, file: event.filename, line: event.lineno }));
  window.addEventListener("unhandledrejection", event => appLog("error", "window.unhandledrejection", { error: event.reason }));
  window.addEventListener("pagehide", () => { appLog("info", "window.pagehide"); void flushLogs(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) void flushLogs(); });
  appLog("info", "window.start", { platform: navigator.platform });
}

// Intentionally never record command arguments/results wholesale: they may
// contain credentials, chart contents, uploaded media or account responses.
export async function loggedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const quiet = /resource_(read_record|read_snapshot_file|open_snapshot|release_snapshot|append_workspace_media_chunk|read_skin_thumbnail|list_records)|save_editor_.*_cache/.test(command);
  const auth = /login|logout|get_me|post_json|post_multipart/.test(command);
  const context: Record<string, unknown> = { command };
  for (const key of ["slot", "logicalPath", "snapshotId", "provider"]) if (typeof args?.[key] === "string") context[key] = args[key];
  if (!auth) for (const key of ["url", "endpoint"]) if (typeof args?.[key] === "string") context[key] = args[key];
  const start = performance.now();
  const finish = quiet ? null : startOperation("native.command", context);
  try {
    const result = await invoke<T>(command, args);
    finish?.(undefined, { cancelled: result === null });
    if (command.startsWith("save_editor_") && Date.now() - (savedAt.get(command) ?? 0) >= 30000) {
      savedAt.set(command, Date.now()); appLog("info", "editor.autosave.complete", { command, durationMs: Math.round(performance.now() - start) });
    }
    if (quiet && performance.now() - start > 2000) appLog("warn", "native.command.slow", { ...context, durationMs: Math.round(performance.now() - start) });
    return result;
  } catch (error) {
    // Missing records are normal cache misses; their semantic consumer logs failure if needed.
    if (command !== "resource_read_record") {
      const detail = auth ? "Account operation failed; response omitted" : error;
      if (finish) finish(detail); else appLog("error", "native.command.failed", { ...context, error: detail });
    }
    throw error;
  }
}
