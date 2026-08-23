import type {
  MovieContainer,
  MovieOperationResult,
  MoviePreparedResource,
  MovieResourcePreflightAdapter,
} from "../movieContracts";
import {
  movieAccepted,
  movieRejected,
  validateMovieDecodedMetadata,
} from "../movieValidation";
import { sha256UpperHex } from "../resources/sha256";

export class BrowserMovieResourcePreflightAdapter
  implements MovieResourcePreflightAdapter {
  private activeResourceCount = 0;

  async sha256(bytes: Uint8Array): Promise<MovieOperationResult<string>> {
    if (!(bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
      bytes.byteLength === 0) {
      return movieRejected(
        "integrity-failure",
        "movie.preflight.invalid-hash-input",
        "Browser movie SHA-256 accepts only one non-empty simulator-owned direct Uint8Array.",
      );
    }
    return movieAccepted(sha256UpperHex(bytes));
  }

  async prepare(
    bytes: Uint8Array,
    container: MovieContainer,
  ): Promise<MovieOperationResult<MoviePreparedResource>> {
    if (!(bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
      bytes.byteLength === 0 || (container !== "mp4" && container !== "webm")) {
      return movieRejected(
        "movie-resource-decode",
        "movie.preflight.invalid-input",
        "Browser movie preparation requires simulator-owned bytes and the already sniffed MP4 or WebM container.",
      );
    }
    if (typeof document !== "object" || typeof document.createElement !== "function" ||
      typeof URL !== "function" && typeof URL !== "object" ||
      typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function" ||
      typeof Blob !== "function") {
      return movieRejected(
        "movie-platform-unavailable",
        "movie.preflight.browser-media-unavailable",
        "Portable MV Live requires local Blob URLs and HTMLVideoElement; no fetch, ambient URL or static-stage fallback exists.",
      );
    }
    const mime = container === "mp4" ? "video/mp4" as const : "video/webm" as const;
    const video = document.createElement("video");
    if (!(video instanceof HTMLVideoElement) || video.canPlayType(mime) === "") {
      return movieRejected(
        "movie-platform-unavailable",
        "movie.preflight.container-not-playable",
        "The current browser must positively advertise the sniffed MP4 or WebM MIME before a Blob URL is created.",
      );
    }
    const ownedBytes = Uint8Array.from(bytes);
    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(new Blob([ownedBytes], { type: mime }));
    } catch {
      return movieRejected(
        "movie-platform-unavailable",
        "movie.preflight.blob-url-creation-failed",
        "Local movie Blob creation failure has no network, file path or stage fallback.",
      );
    }
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = false;
    video.autoplay = false;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = objectUrl;

    let released = false;
    this.activeResourceCount += 1;
    const release = (): void => {
      if (released) return;
      released = true;
      this.activeResourceCount -= 1;
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    try {
      await waitForMovieMetadataAndFrame(video);
      const checked = validateMovieDecodedMetadata({
        container,
        mime,
        durationSeconds: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      }, container);
      if (checked.status !== "accepted") {
        release();
        return checked;
      }
      return movieAccepted(Object.freeze({
        metadata: checked.value,
        resource: video,
        release,
      }));
    } catch {
      try { release(); } catch { /* decode failure remains primary */ }
      return movieRejected(
        "movie-resource-decode",
        "movie.preflight.decode-failed",
        "Browser video metadata or first-frame decode failed with no alternate codec, network source, static frame or stage fallback.",
      );
    }
  }

  snapshot(): { readonly activeResourceCount: number } {
    return Object.freeze({ activeResourceCount: this.activeResourceCount });
  }
}

function waitForMovieMetadataAndFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Number.isFinite(video.duration) && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !Number.isFinite(video.duration) || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("movie decode error"));
    };
    const cleanup = (): void => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("abort", onError);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.addEventListener("abort", onError);
    video.load();
    onReady();
  });
}
