import { invoke } from "@tauri-apps/api/core";

export type RuntimePlatform = "desktop" | "android" | "ios";

const MOBILE_ROUTE_PAYLOAD_PREFIX = "garupa-editor:mobile-route-payload:";

export type ShareFileParams = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

export type PreparedShareFile = {
  path: string;
  fileName: string;
  mimeType: string;
};

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof navigator === "undefined") {
    return "desktop";
  }
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) {
    return "android";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "ios";
  }
  return "desktop";
}

export function isMobileRuntime(): boolean {
  return getRuntimePlatform() !== "desktop";
}

export function isDesktopRuntime(): boolean {
  return getRuntimePlatform() === "desktop";
}

function buildMobileRoutePayloadKey(requestId: string): string {
  return `${MOBILE_ROUTE_PAYLOAD_PREFIX}${requestId}`;
}

export function writeMobileRoutePayload<T>(requestId: string, payload: T): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.sessionStorage.setItem(
      buildMobileRoutePayloadKey(requestId),
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}

export function readMobileRoutePayload<T>(requestId: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(buildMobileRoutePayloadKey(requestId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeMobileRoutePayload(requestId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(buildMobileRoutePayloadKey(requestId));
  } catch {
    // ignore storage cleanup failures
  }
}

export async function shareFile(params: ShareFileParams): Promise<PreparedShareFile> {
  return invoke<PreparedShareFile>("share_file", { params });
}

export function setMobileSimulatorImmersive(enabled: boolean): void {
  if (getRuntimePlatform() !== "android") return;
  const bridge = (window as unknown as {
    readonly GarupaSimulatorHost?: { setImmersive(value: boolean): void };
  }).GarupaSimulatorHost;
  if (bridge === undefined || typeof bridge.setImmersive !== "function") {
    throw new Error("Android Simulator immersive host bridge is unavailable.");
  }
  bridge.setImmersive(enabled);
}

export function navigateBackToEditor(): void {
  if (typeof window === "undefined") return;
  if (getRuntimePlatform() === "android") setMobileSimulatorImmersive(false);
  window.location.replace(`${window.location.pathname}${window.location.search}`);
}
