export type ResourceOrigin = "builtin" | "network" | "workspace" | "user";

export type ResourceKind =
  | "image"
  | "audio"
  | "video"
  | "font"
  | "json"
  | "package";

export type ResourceAvailability =
  | "builtin-ready"
  | "installed"
  | "remote-only"
  | "update-available"
  | "offline-cached"
  | "corrupted"
  | "unavailable";

export type ResourceCatalogFreshness = "fresh" | "not-modified" | "offline-cached" | "unavailable";

export type UserMediaPurpose = "bgm" | "cover" | "mv" | "stage-backdrop";

export type ResourcePlacementIdentityClass =
  | "application-builtin"
  | "provider-package"
  | "provider-media"
  | "user-media";

export interface ResourceLogicalPlacement {
  readonly provider: string;
  readonly server: string | null;
  readonly canonicalPath: string;
  readonly identityClass: ResourcePlacementIdentityClass;
}

declare const resourceIdBrand: unique symbol;
declare const resourceSnapshotIdBrand: unique symbol;
declare const resourceLeaseIdBrand: unique symbol;

export type ResourceId = string & { readonly [resourceIdBrand]: true };
export type ResourceSnapshotId = string & { readonly [resourceSnapshotIdBrand]: true };
export type ResourceLeaseId = string & { readonly [resourceLeaseIdBrand]: true };

export interface ResourceRef {
  readonly id: ResourceId;
}

export interface ObservedIntegrity {
  readonly byteLength: number;
  readonly sha256: string;
}

export interface ResourceFileRecord {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly integrity: ObservedIntegrity;
}

export interface ResourceDescriptor {
  readonly ref: ResourceRef;
  readonly origin: ResourceOrigin;
  readonly kind: ResourceKind;
  readonly title: string;
  readonly availability: ResourceAvailability;
  readonly files: readonly ResourceFileRecord[] | null;
  readonly catalogObservedAt: string | null;
}

export interface GlobalResourceDescriptor extends ResourceDescriptor {
  readonly logicalPlacement: ResourceLogicalPlacement;
}

export interface NetworkResourceSource {
  readonly provider: string;
  readonly server: string;
  readonly family: string;
  readonly nativeId: string;
  readonly manifestUrl: string | null;
  readonly assetBaseUrl: string;
}

export interface NetworkResourceDescriptor extends GlobalResourceDescriptor {
  readonly origin: "network";
  readonly source: NetworkResourceSource;
}

export interface BuiltinResourceDescriptor extends GlobalResourceDescriptor {
  readonly origin: "builtin";
  readonly sourceUrl: string;
}

export interface WorkspaceMediaUserUploadProvenance {
  readonly kind: "user-upload";
}

export interface WorkspaceMediaNetworkProvenance {
  readonly kind: "network";
  readonly sourceRef: ResourceRef;
}

export type WorkspaceMediaProvenance =
  | WorkspaceMediaUserUploadProvenance
  | WorkspaceMediaNetworkProvenance;

export interface WorkspaceMediaDescriptor extends ResourceDescriptor {
  readonly origin: "workspace";
  readonly purpose: UserMediaPurpose;
  readonly fileName: string;
  readonly provenance: WorkspaceMediaProvenance;
}

/** Migration-only legacy descriptor. New production imports must create WorkspaceMediaDescriptor. */
export interface UserResourceDescriptor extends GlobalResourceDescriptor {
  readonly origin: "user";
  readonly purpose: UserMediaPurpose;
  readonly fileName: string;
}

export type ApplicationResourceDescriptor =
  | BuiltinResourceDescriptor
  | NetworkResourceDescriptor
  | WorkspaceMediaDescriptor
  | UserResourceDescriptor;

export interface ResourceCatalogSnapshot {
  readonly provider: string;
  readonly freshness: ResourceCatalogFreshness;
  readonly observedAt: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly bodySha256: string | null;
  readonly resources: readonly NetworkResourceDescriptor[];
}

export interface ResourceSnapshotReceipt {
  readonly snapshotId: ResourceSnapshotId;
  readonly slots: Readonly<Record<string, ResourceRef>>;
  readonly revisions: Readonly<Record<string, string>>;
  readonly filesBySlot: Readonly<Record<string, readonly ResourceFileRecord[]>>;
}

export interface ResourceLeaseFile {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly integrity: ObservedIntegrity;
}

export interface ResourceConsumerLease {
  readonly leaseId: ResourceLeaseId;
  readonly snapshotId: ResourceSnapshotId;
  readonly slots: Readonly<Record<string, ResourceRef>>;
  readonly revisions: Readonly<Record<string, string>>;
  listFiles(slot: string): readonly ResourceLeaseFile[];
  readBytes(slot: string, logicalPath: string): Promise<Uint8Array>;
  openObjectUrl(slot: string, logicalPath: string): Promise<string>;
  release(): Promise<void>;
}

export type ResourceFailureCode =
  | "invalid-resource-id"
  | "invalid-resource-request"
  | "catalog-unavailable"
  | "resource-unavailable"
  | "resource-not-installed"
  | "resource-integrity"
  | "resource-transaction-failed"
  | "resource-platform-unavailable"
  | "resource-lease-closed";

export interface ResourceFailure {
  readonly code: ResourceFailureCode;
  readonly capability: string;
  readonly boundary: string;
}

export type ResourceResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: ResourceFailure };

const RESOURCE_ID_PATTERN = /^(?:builtin|bestdori|workspace|user)\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const SNAPSHOT_ID_PATTERN = /^snapshot\/[A-Za-z0-9_-]+$/;
const LEASE_ID_PATTERN = /^lease\/[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[0-9A-F]{64}$/;

export function parseResourceId(value: unknown): ResourceResult<ResourceId> {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value) || value.includes("//")) {
    return rejected(
      "invalid-resource-id",
      "resources.contract.invalid-resource-id",
      "Resource IDs require one source-owned canonical identity and cannot contain empty path segments.",
    );
  }
  return accepted(value as ResourceId);
}

export function parseResourceSnapshotId(value: unknown): ResourceResult<ResourceSnapshotId> {
  return typeof value === "string" && SNAPSHOT_ID_PATTERN.test(value)
    ? accepted(value as ResourceSnapshotId)
    : rejected(
        "invalid-resource-request",
        "resources.contract.invalid-snapshot-id",
        "Resource snapshots require one opaque main-program-owned identity.",
      );
}

export function parseResourceLeaseId(value: unknown): ResourceResult<ResourceLeaseId> {
  return typeof value === "string" && LEASE_ID_PATTERN.test(value)
    ? accepted(value as ResourceLeaseId)
    : rejected(
        "invalid-resource-request",
        "resources.contract.invalid-lease-id",
        "Resource leases require one opaque main-program-owned identity.",
      );
}

export function createResourceRef(value: unknown): ResourceResult<ResourceRef> {
  const parsed = parseResourceId(value);
  return parsed.status === "rejected"
    ? parsed
    : accepted(Object.freeze({ id: parsed.value }));
}

export function validateResourceLogicalPlacement(value: unknown): ResourceResult<ResourceLogicalPlacement> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "canonicalPath,identityClass,provider,server"
  ) {
    return rejected(
      "invalid-resource-request",
      "resources.contract.invalid-logical-placement-shape",
      "Logical placement requires only provider, server, canonicalPath and identityClass.",
    );
  }
  const candidate = value as Partial<ResourceLogicalPlacement>;
  const classes: readonly ResourcePlacementIdentityClass[] = [
    "application-builtin", "provider-package", "provider-media", "user-media",
  ];
  if (
    typeof candidate.provider !== "string" || !safePlacementSegment(candidate.provider) ||
    !(candidate.server === null || (typeof candidate.server === "string" && safePlacementSegment(candidate.server))) ||
    typeof candidate.canonicalPath !== "string" || !safeCanonicalPath(candidate.canonicalPath) ||
    !classes.includes(candidate.identityClass as ResourcePlacementIdentityClass)
  ) {
    return rejected(
      "invalid-resource-request",
      "resources.contract.invalid-logical-placement-value",
      "Logical placement requires safe canonical product namespace segments and one known identity class.",
    );
  }
  return accepted(Object.freeze({
    provider: candidate.provider,
    server: candidate.server,
    canonicalPath: candidate.canonicalPath,
    identityClass: candidate.identityClass as ResourcePlacementIdentityClass,
  }));
}

export function validateObservedIntegrity(value: unknown): ResourceResult<ObservedIntegrity> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "byteLength,sha256"
  ) {
    return rejected(
      "invalid-resource-request",
      "resources.contract.invalid-integrity-shape",
      "Observed integrity must contain only byteLength and SHA-256.",
    );
  }
  const candidate = value as { byteLength?: unknown; sha256?: unknown };
  if (
    !Number.isSafeInteger(candidate.byteLength) || (candidate.byteLength as number) <= 0 ||
    typeof candidate.sha256 !== "string" || !SHA256_PATTERN.test(candidate.sha256)
  ) {
    return rejected(
      "invalid-resource-request",
      "resources.contract.invalid-integrity-value",
      "Observed integrity requires one positive safe byte length and uppercase SHA-256 digest.",
    );
  }
  return accepted(Object.freeze({
    byteLength: candidate.byteLength as number,
    sha256: candidate.sha256,
  }));
}

export function resourceAccepted<T>(value: T): ResourceResult<T> {
  return accepted(value);
}

export function resourceRejected<T>(
  code: ResourceFailureCode,
  capability: string,
  boundary: string,
): ResourceResult<T> {
  return rejected(code, capability, boundary);
}

function accepted<T>(value: T): ResourceResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

function safePlacementSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function safeCanonicalPath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || value.normalize("NFC") !== value) return false;
  const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  for (const part of value.split("/")) {
    if (!safePlacementSegment(part) || reserved.test(part) || part.endsWith(".") || part.endsWith(" ")) return false;
  }
  return true;
}

function rejected<T>(
  code: ResourceFailureCode,
  capability: string,
  boundary: string,
): ResourceResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}
