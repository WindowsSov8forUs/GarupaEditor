import { invoke } from "@tauri-apps/api/core";

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

export async function invokeTauriCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
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
