import type {
  MovieContainer,
  MovieDecodedResourceMetadata,
  MovieOperationResult,
  MoviePreparedResource,
  MovieResourceProfile,
} from "./movieContracts";

export function movieAccepted<T>(value: T): MovieOperationResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

export function movieRejected<T = never>(
  status: Exclude<MovieOperationResult<T>["status"], "accepted">,
  capability: string,
  boundary: string,
): MovieOperationResult<T> {
  return Object.freeze({
    status,
    failure: Object.freeze({ capability, boundary }),
  }) as MovieOperationResult<T>;
}

export function inspectMovieContainer(
  bytes: Uint8Array,
): MovieOperationResult<MovieContainer> {
  if (!(bytes instanceof Uint8Array) ||
    Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
    bytes.byteLength < 16) {
    return movieRejected(
      "movie-resource-decode",
      "movie.validation.invalid-byte-input",
      "MV Live accepts one non-empty direct Uint8Array containing a complete strict MP4 or WebM video resource.",
    );
  }
  if (isStrictMp4(bytes)) return movieAccepted("mp4");
  if (isStrictWebm(bytes)) return movieAccepted("webm");
  return movieRejected(
    "movie-resource-decode",
    "movie.validation.unsupported-or-malformed-container",
    "MV Live bytes must be a bounded MP4 with ftyp/moov/mdat and a video sample entry, or a WebM EBML document with one supported browser video track; MIME and codec are never caller supplied.",
  );
}

export function validateMovieDecodedMetadata(
  value: unknown,
  container: MovieContainer,
): MovieOperationResult<MovieDecodedResourceMetadata> {
  if (value === null || typeof value !== "object") return invalidMetadata();
  const metadata = value as MovieDecodedResourceMetadata;
  const mime = container === "mp4" ? "video/mp4" : "video/webm";
  if (metadata.container !== container || metadata.mime !== mime ||
    typeof metadata.durationSeconds !== "number" ||
    !Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 ||
    !Number.isSafeInteger(metadata.width) || metadata.width <= 0 ||
    !Number.isSafeInteger(metadata.height) || metadata.height <= 0) {
    return invalidMetadata();
  }
  return movieAccepted(Object.freeze({
    container,
    mime,
    durationSeconds: metadata.durationSeconds,
    width: metadata.width,
    height: metadata.height,
  }));
}

export function validateMoviePreparedResource(
  value: unknown,
  container: MovieContainer,
): MovieOperationResult<MoviePreparedResource> {
  if (value === null || typeof value !== "object" ||
    typeof (value as MoviePreparedResource).release !== "function") {
    return movieRejected(
      "movie-resource-decode",
      "movie.validation.invalid-prepared-resource",
      "Movie preflight must return one explicit releasable decoded resource; a URL, network source or implicit browser cache is not accepted.",
    );
  }
  const prepared = value as MoviePreparedResource;
  const metadata = validateMovieDecodedMetadata(prepared.metadata, container);
  if (metadata.status !== "accepted") return metadata;
  return movieAccepted(prepared);
}

export function validateMovieResourceProfile(
  value: unknown,
): MovieOperationResult<MovieResourceProfile> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalidProfile();
  const profile = value as MovieResourceProfile;
  const keys = Object.keys(profile).sort().join(",");
  if (keys !== [
    "byteLength", "container", "durationSeconds", "fit", "height", "identity",
    "logicalId", "loop", "mime", "musicStartDelayMilliseconds", "muted", "role",
    "sha256", "signal", "width",
  ].sort().join(",") ||
    profile.role !== "mv-live" || typeof profile.logicalId !== "string" || profile.logicalId.length === 0 ||
    !Number.isSafeInteger(profile.byteLength) || profile.byteLength <= 0 ||
    !/^[0-9A-F]{64}$/.test(profile.sha256) ||
    (profile.container !== "mp4" && profile.container !== "webm") ||
    profile.mime !== (profile.container === "mp4" ? "video/mp4" : "video/webm") ||
    !Number.isFinite(profile.durationSeconds) || profile.durationSeconds <= 0 ||
    !Number.isSafeInteger(profile.width) || profile.width <= 0 ||
    !Number.isSafeInteger(profile.height) || profile.height <= 0 ||
    !Number.isInteger(profile.musicStartDelayMilliseconds) ||
    profile.musicStartDelayMilliseconds < -0x80000000 ||
    profile.musicStartDelayMilliseconds > 0x7fffffff ||
    profile.fit !== "contain-center-no-crop" || profile.muted !== true || profile.loop !== false ||
    profile.identity !== "session-explicit" || profile.signal !== "host-supplied-portable") {
    return invalidProfile();
  }
  return movieAccepted(Object.freeze({ ...profile }));
}

function isStrictMp4(bytes: Uint8Array): boolean {
  const kinds: string[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    let size = readU32(bytes, offset);
    const kind = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.byteLength) return false;
      const high = readU32(bytes, offset + 8);
      const low = readU32(bytes, offset + 12);
      if (high !== 0) return false;
      size = low;
      header = 16;
    } else if (size === 0) {
      size = bytes.byteLength - offset;
    }
    if (!/^[\x20-\x7E]{4}$/.test(kind) || size < header || offset + size > bytes.byteLength) return false;
    kinds.push(kind);
    offset += size;
  }
  if (offset !== bytes.byteLength || kinds[0] !== "ftyp" ||
    !kinds.includes("moov") || !kinds.includes("mdat") ||
    kinds.indexOf("moov") > kinds.indexOf("mdat")) return false;
  const majorBrand = ascii(bytes, 8, 4);
  if (!["isom", "iso2", "mp41", "mp42", "M4V ", "avc1"].includes(majorBrand)) return false;
  const text = latin1(bytes);
  return ["avc1", "hvc1", "hev1", "vp09", "av01"].some((marker) => text.includes(marker));
}

function isStrictWebm(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return false;
  const prefix = latin1(bytes.subarray(0, Math.min(bytes.byteLength, 256))).toLowerCase();
  if (!prefix.includes("webm")) return false;
  const text = latin1(bytes);
  return ["V_VP8", "V_VP9", "V_AV1"].some((codec) => text.includes(codec)) &&
    indexOfBytes(bytes, [0x1f, 0x43, 0xb6, 0x75]) >= 0;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function latin1(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 4096) {
    value += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 4096, bytes.byteLength)));
  }
  return value;
}
function indexOfBytes(bytes: Uint8Array, target: readonly number[]): number {
  outer: for (let index = 0; index <= bytes.byteLength - target.length; index += 1) {
    for (let offset = 0; offset < target.length; offset += 1) {
      if (bytes[index + offset] !== target[offset]) continue outer;
    }
    return index;
  }
  return -1;
}
function invalidMetadata(): MovieOperationResult<never> {
  return movieRejected(
    "movie-resource-decode",
    "movie.validation.invalid-decoded-metadata",
    "Browser movie metadata must match the sniffed container and expose finite positive duration and integral positive video dimensions.",
  );
}
function invalidProfile(): MovieOperationResult<never> {
  return movieRejected(
    "evidence-required",
    "movie.validation.invalid-profile",
    "Movie backend preparation requires one exact immutable simulator-derived profile with no caller codec, MIME, duration, dimensions or identity fields.",
  );
}
