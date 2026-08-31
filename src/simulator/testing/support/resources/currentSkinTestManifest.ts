import rawManifest from "./currentSkinTestManifest.json";

export type CurrentSkinResourceRole =
  | "notes"
  | "directional-note"
  | "field"
  | "tap-effect"
  | "directional-effect"
  | "special-background"
  | "tap-se"
  | "judge";

export interface CurrentSkinPortablePackEntry {
  readonly logicalResource: string;
  readonly role: CurrentSkinResourceRole;
  readonly byteLength: number;
  readonly sha256: string;
  readonly fileCount: number;
}

export const CURRENT_SKIN_PORTABLE_PACK_IDENTITY =
  "skin-current-10.1.4-static-portable-v1" as const;

export const CURRENT_SKIN_PORTABLE_PACKS: readonly CurrentSkinPortablePackEntry[] = parseManifest(rawManifest);

const PACK_BY_LOGICAL_RESOURCE = new Map(
  CURRENT_SKIN_PORTABLE_PACKS.map((entry) => [entry.logicalResource, entry]),
);

export function getCurrentSkinPortablePack(
  logicalResource: string,
): CurrentSkinPortablePackEntry | null {
  return PACK_BY_LOGICAL_RESOURCE.get(logicalResource) ?? null;
}

function parseManifest(value: unknown): readonly CurrentSkinPortablePackEntry[] {
  if (!record(value) || Object.keys(value).sort().join(",") !==
    "networkAllowed,packIdentity,packs,schemaVersion" ||
    value.schemaVersion !== 1 ||
    value.packIdentity !== CURRENT_SKIN_PORTABLE_PACK_IDENTITY ||
    value.networkAllowed !== false || !Array.isArray(value.packs) ||
    value.packs.length !== 130) {
    throw new Error("invalid current Skin portable-pack manifest root");
  }
  const rows: CurrentSkinPortablePackEntry[] = [];
  let previous = "";
  for (const item of value.packs) {
    if (!record(item) || Object.keys(item).sort().join(",") !==
      "byteLength,fileCount,logicalResource,role,sha256" ||
      typeof item.logicalResource !== "string" || item.logicalResource.length === 0 ||
      item.logicalResource <= previous || !isRole(item.role) ||
      !Number.isSafeInteger(item.byteLength) || (item.byteLength as number) <= 0 ||
      typeof item.sha256 !== "string" || !/^[0-9A-F]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.fileCount) || (item.fileCount as number) < 0) {
      throw new Error("invalid or unsorted current Skin portable-pack row");
    }
    previous = item.logicalResource;
    rows.push(Object.freeze({
      logicalResource: item.logicalResource,
      role: item.role,
      byteLength: item.byteLength as number,
      sha256: item.sha256,
      fileCount: item.fileCount as number,
    }));
  }
  const counts = new Map<CurrentSkinResourceRole, number>();
  for (const row of rows) counts.set(row.role, (counts.get(row.role) ?? 0) + 1);
  const expected: Readonly<Record<CurrentSkinResourceRole, number>> = {
    "notes": 23,
    "directional-note": 6,
    "field": 33,
    "tap-effect": 15,
    "directional-effect": 12,
    "special-background": 20,
    "tap-se": 16,
    "judge": 5,
  };
  if (Object.entries(expected).some(([role, count]) =>
    counts.get(role as CurrentSkinResourceRole) !== count)) {
    throw new Error("current Skin portable-pack role inventory mismatch");
  }
  return Object.freeze(rows);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRole(value: unknown): value is CurrentSkinResourceRole {
  return value === "notes" || value === "directional-note" || value === "field" ||
    value === "tap-effect" || value === "directional-effect" ||
    value === "special-background" || value === "tap-se" || value === "judge";
}
