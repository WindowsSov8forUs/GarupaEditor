import type {
  MovieOperationResult,
  MovieResourcePreflightAdapter,
  PreparedSessionMovieResource,
} from "../backends/movieContracts";
import {
  inspectMovieContainer,
  validateMoviePreparedResource,
} from "../backends/movieValidation";
import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorPresentationMvPackage } from "../public/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "./result";

export async function deriveSessionMvResource(
  source: SimulatorPresentationMvPackage,
  preflight: MovieResourcePreflightAdapter,
): Promise<SimulatorAssemblyResult<PreparedSessionMovieResource>> {
  if (source === null || typeof source !== "object" ||
    !(source.bytes instanceof Uint8Array) ||
    Object.getPrototypeOf(source.bytes) !== Uint8Array.prototype ||
    source.bytes.byteLength === 0 ||
    !Number.isInteger(source.musicStartDelayMilliseconds) ||
    source.musicStartDelayMilliseconds < -0x80000000 ||
    source.musicStartDelayMilliseconds > 0x7fffffff ||
    preflight === null || typeof preflight !== "object" ||
    typeof preflight.sha256 !== "function" || typeof preflight.prepare !== "function") {
    return rejected(
      "integrity-failure",
      "simulator.mv-live.invalid-derivation-input",
      "MV derivation requires the recipe-owned byte copy, one signed Int32 delay and one explicit local browser preflight adapter.",
    );
  }
  const bytes = Uint8Array.from(source.bytes);
  const container = inspectMovieContainer(bytes);
  if (container.status !== "accepted") return fromMovie(container);
  let hashed;
  try {
    hashed = await preflight.sha256(bytes);
  } catch {
    return rejected(
      "launch-failed",
      "simulator.mv-live.sha256-threw",
      "Movie SHA-256 derivation threw before graphics mount, scheduler start or domain mutation.",
    );
  }
  if (hashed.status !== "accepted") return fromMovie(hashed);
  const expectedHash = sha256UpperHex(bytes);
  if (hashed.value !== expectedHash) {
    return rejected(
      "resource-integrity",
      "simulator.mv-live.sha256-mismatch",
      "Movie preflight SHA-256 must equal the simulator-owned byte digest before browser decode.",
    );
  }
  let prepared;
  try {
    prepared = await preflight.prepare(bytes, container.value);
  } catch {
    return rejected(
      "launch-failed",
      "simulator.mv-live.preflight-threw",
      "Movie browser preflight threw before backend, scene, mount, scheduler or engine ownership transfer.",
    );
  }
  if (prepared.status !== "accepted") return fromMovie(prepared);
  const validated = validateMoviePreparedResource(prepared.value, container.value);
  if (validated.status !== "accepted") {
    releaseQuietly(prepared.value);
    return fromMovie(validated);
  }
  const metadata = validated.value.metadata;
  const mime = container.value === "mp4" ? "video/mp4" as const : "video/webm" as const;
  return accepted(Object.freeze({
    profile: Object.freeze({
      role: "mv-live" as const,
      logicalId: `mv-live/session/${expectedHash}`,
      byteLength: bytes.byteLength,
      sha256: expectedHash,
      container: container.value,
      mime,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
      musicStartDelayMilliseconds: source.musicStartDelayMilliseconds,
      fit: "contain-center-no-crop" as const,
      muted: true as const,
      loop: false as const,
      identity: "session-explicit" as const,
      signal: "host-supplied-portable" as const,
    }),
    bytes,
    prepared: validated.value,
  }));
}

function releaseQuietly(value: { release?(): void }): void {
  try { value.release?.(); } catch { /* caller receives the primary validation failure */ }
}

function fromMovie<T>(result: Exclude<MovieOperationResult<T>, { status: "accepted" }>): SimulatorAssemblyResult<never> {
  const code = result.status === "movie-resource-integrity"
    ? "resource-integrity"
    : result.status === "movie-resource-decode"
      ? "resource-decode"
      : result.status === "movie-platform-unavailable"
        ? "platform-unavailable"
        : result.status === "integrity-failure"
          ? "integrity-failure"
          : "launch-failed";
  return rejected(code, result.failure.capability, result.failure.boundary);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
