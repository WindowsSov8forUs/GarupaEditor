import type { SimulatorMvPayload } from "../launchPayload";

export type MvImageResource = {
  kind: "image";
  src: string;
  width: number;
  height: number;
  offsetMs: number;
};

export type MvVideoResource = {
  kind: "video";
  src: string;
  video: HTMLVideoElement;
  width: number;
  height: number;
  offsetMs: number;
};

export type MvResource = MvImageResource | MvVideoResource;
type RawMvVideoResource = Omit<MvVideoResource, "offsetMs">;

function normalizeMvOffsetMs(input: unknown): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(Math.max(-5000, Math.min(5000, numeric)));
}

export function normalizeMvSource(input: string): string {
  const source = input.trim();
  if (!source) {
    return "";
  }
  if (
    source.startsWith("data:")
    || source.startsWith("blob:")
    || source.startsWith("file://")
    || /^https?:\/\//i.test(source)
  ) {
    return source;
  }
  if (/^[a-zA-Z]:[\\/]/.test(source)) {
    return `file:///${source.replace(/\\/g, "/")}`;
  }
  if (source.startsWith("/")) {
    return source;
  }
  return `/${source.replace(/^\/+/, "")}`;
}

async function loadImageSize(source: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, image.naturalWidth || 1),
      height: Math.max(1, image.naturalHeight || 1),
    });
    image.onerror = () => reject(new Error(`image load failed: ${source}`));
    image.src = source;
  });
}

async function loadVideoResource(source: string): Promise<RawMvVideoResource> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    video.src = source;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve({
        kind: "video",
        src: source,
        video,
        width: Math.max(1, video.videoWidth || 1),
        height: Math.max(1, video.videoHeight || 1),
      });
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`video load failed: ${source}`));
    };

    video.addEventListener("loadedmetadata", handleLoaded, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.load();
  });
}

export async function loadMvResourceFromPayload(payload: SimulatorMvPayload | null | undefined): Promise<MvResource | null> {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = normalizeMvSource(payload.src ?? "");
  if (!source) {
    return null;
  }

  const kind = payload.kind;
  const offsetMs = normalizeMvOffsetMs(payload.offsetMs);
  if (kind === "image") {
    const size = await loadImageSize(source);
    return {
      kind: "image",
      src: source,
      width: size.width,
      height: size.height,
      offsetMs,
    };
  }
  if (kind === "video") {
    const resource = await loadVideoResource(source);
    return {
      ...resource,
      offsetMs,
    };
  }
  return null;
}
