import { sha256UpperHex } from "../../../backends/resources/sha256";
import type { CurrentSkinPortablePackEntry } from "./currentSkinTestManifest";
import type { SelectedSkinResourceIdentity } from "./skinResourceSelector";
import type { SharedStaticResourceStore } from "./sharedStaticResourceStore";
import { rejected, type SimulatorAssemblyResult } from "../../../assembly/result";

export interface PreparedSkinPortableFile {
  readonly id: string;
  readonly mime: "image/png" | "audio/mpeg";
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PreparedSkinPortablePack {
  readonly logicalResource: string;
  readonly role: CurrentSkinPortablePackEntry["role"];
  readonly profile: Readonly<Record<string, unknown>>;
  readonly files: readonly PreparedSkinPortableFile[];
}

export async function prepareSelectedSkinPortablePacks(
  selected: readonly SelectedSkinResourceIdentity[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<readonly PreparedSkinPortablePack[]>> {
  const prepared: PreparedSkinPortablePack[] = [];
  for (const resource of selected) {
    if (resource.profile === null) return rejected(
      "resource-integrity",
      "simulator.skin.pack-profile-missing",
      "Every selected Skin resource requires one exact current portable-pack identity before the shared store is read.",
    );
    const read = await store.read(resource.resourceKey);
    if (read.status === "rejected") {
      return rejected(
        "resource-unavailable",
        "simulator.skin.pack-unavailable",
        "The exact simulator-selected Skin portable pack is unavailable; aliases, URLs and component fallback are forbidden.",
      );
    }
    if (read.value.byteLength !== resource.profile.byteLength ||
      sha256UpperHex(read.value) !== resource.profile.sha256) {
      return rejected(
        "resource-integrity",
        "simulator.skin.pack-integrity",
        "The whole Skin portable pack must match its current byte length and SHA-256 before JSON or embedded files are decoded.",
      );
    }
    const parsed = parsePack(read.value, resource.profile);
    if (parsed.status === "rejected") return parsed;
    prepared.push(parsed.value);
  }
  return accepted(Object.freeze(prepared));
}

function parsePack(
  bytes: Uint8Array,
  expected: CurrentSkinPortablePackEntry,
): SimulatorAssemblyResult<PreparedSkinPortablePack> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    return invalid("simulator.skin.pack-json", `Hash-validated Skin portable packs must be valid UTF-8 JSON: ${error instanceof Error ? error.message : "unknown decoder failure"}.`);
  }
  if (!record(value) || Object.keys(value).sort().join(",") !==
    "files,logicalResource,particle,portableAudio,role,schemaVersion,sourceUnityFs,unity" ||
    value.schemaVersion !== 1 || value.logicalResource !== expected.logicalResource ||
    value.role !== expected.role || !record(value.sourceUnityFs) ||
    Object.keys(value.sourceUnityFs).sort().join(",") !== "bytes,sha256" ||
    !Array.isArray(value.files) || value.files.length !== expected.fileCount ||
    !record(value.unity) || (value.particle !== null && !record(value.particle)) ||
    !Array.isArray(value.portableAudio)) {
    return invalid("simulator.skin.pack-shape", "Skin portable-pack root identity, role, source, profile and file count must remain exact.");
  }
  const files: PreparedSkinPortableFile[] = [];
  const ids = new Set<string>();
  for (const item of value.files) {
    if (!record(item) || typeof item.id !== "string" || item.id.length === 0 ||
      ids.has(item.id) || (item.mime !== "image/png" && item.mime !== "audio/mpeg") ||
      !Number.isSafeInteger(item.bytes) || (item.bytes as number) <= 0 ||
      typeof item.sha256 !== "string" || !/^[0-9A-F]{64}$/.test(item.sha256) ||
      typeof item.dataBase64 !== "string") {
      return invalid("simulator.skin.pack-file-shape", "Every embedded Skin file requires one unique ID, supported MIME, exact bytes/SHA and base64 payload.");
    }
    const png = item.mime === "image/png";
    const keys = Object.keys(item).sort().join(",");
    if ((png && keys !== "bytes,dataBase64,height,id,mime,sha256,width") ||
      (!png && keys !== "bytes,dataBase64,id,mime,sha256") ||
      (png && (!Number.isSafeInteger(item.width) || (item.width as number) <= 0 ||
        !Number.isSafeInteger(item.height) || (item.height as number) <= 0))) {
      return invalid("simulator.skin.pack-file-metadata", "PNG dimensions and MP3 metadata shape cannot be inferred or repaired.");
    }
    let decoded: Uint8Array;
    try {
      const binary = atob(item.dataBase64);
      decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      return invalid("simulator.skin.pack-base64", "Embedded Skin file base64 must decode without repair.");
    }
    if (decoded.byteLength !== item.bytes || sha256UpperHex(decoded) !== item.sha256) {
      return invalid("simulator.skin.pack-file-integrity", "Every embedded Skin file must match its pack-declared bytes and SHA-256.");
    }
    ids.add(item.id);
    files.push(Object.freeze({
      id: item.id,
      mime: item.mime,
      bytes: decoded,
      sha256: item.sha256,
      width: png ? item.width as number : null,
      height: png ? item.height as number : null,
    }));
  }
  return accepted(Object.freeze({
    logicalResource: expected.logicalResource,
    role: expected.role,
    profile: deepFreeze({
      sourceUnityFs: value.sourceUnityFs,
      unity: value.unity,
      particle: value.particle,
      portableAudio: value.portableAudio,
    }),
    files: Object.freeze(files),
  }));
}

function deepFreeze(value: unknown): any {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (record(value)) return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, deepFreeze(item)]),
  ));
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid<T>(capability: string, boundary: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, boundary);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
