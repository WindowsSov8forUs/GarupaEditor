import { loggedInvoke as invoke } from "../../logging/applicationLogger";
import { DownloadFailure } from "../downloadError";

export function isTauriRuntimeEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if ("__TAURI_INTERNALS__" in tauriWindow || "__TAURI__" in tauriWindow) {
    return true;
  }
  if (typeof window.location?.protocol === "string" && window.location.protocol === "tauri:") {
    return true;
  }
  if (typeof navigator !== "undefined" && /\btauri\b/i.test(navigator.userAgent ?? "")) {
    return true;
  }
  return false;
}

/** Network commands that can report their transfer as background (progress only, never the download screen). */
const BACKGROUND_CAPABLE = new Set(["bestdori_fetch_json", "bestdori_fetch_json_conditional", "bestdori_fetch_binary", "official_music_request"]);
let backgroundDepth = 0;
/**
 * Runs work whose transfers are background revalidation: while it runs, the network commands above are sent as
 * background transfers. A user-initiated download that overlaps the window is reported the same way.
 */
export async function inBackgroundNetwork<T>(action: () => Promise<T>): Promise<T> {
  backgroundDepth += 1;
  try { return await action(); }
  finally { backgroundDepth -= 1; }
}

export async function invokeTauriCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const effective = backgroundDepth > 0 && BACKGROUND_CAPABLE.has(command) ? { ...args, background: true } : args;
  try {
    return await invoke<T>(command, effective);
  } catch (error) {
    if ((command === "bestdori_fetch_json" || command === "bestdori_fetch_binary" || command === "bestdori_fetch_binary_background")
      && error !== null && typeof error === "object" && "message" in error && typeof error.message === "string") {
      if ("userMessage" in error && typeof error.userMessage === "string") {
        throw new DownloadFailure(error.message, error.userMessage);
      }
      throw new Error(error.message);
    }
    throw error;
  }
}

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}
