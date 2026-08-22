import type {
  ApplicationResourceDescriptor,
  BuiltinResourceDescriptor,
  NetworkResourceDescriptor,
  ResourceCatalogSnapshot,
  ResourceDescriptor,
  ResourceFileRecord,
  ResourceRef,
  ResourceResult,
  ResourceSnapshotId,
  ResourceSnapshotReceipt,
  UserMediaPurpose,
  WorkspaceMediaProvenance,
} from "./contracts";

export interface ResourceInstallFile {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface ResourceInstallInput {
  readonly descriptor: NetworkResourceDescriptor;
  readonly files: readonly ResourceInstallFile[];
}

export interface BuiltinResourceInstallInput {
  readonly descriptor: BuiltinResourceDescriptor;
  readonly files: readonly ResourceInstallFile[];
}

export interface UserMediaImportInput {
  readonly purpose: UserMediaPurpose;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface WorkspaceMediaImportInput extends UserMediaImportInput {
  readonly provenance: WorkspaceMediaProvenance;
}

export interface StoredResourceRecord {
  readonly revision: string;
  readonly descriptor: ApplicationResourceDescriptor;
  readonly files: readonly ResourceFileRecord[];
}

export interface OpenedResourceSnapshot extends ResourceSnapshotReceipt {
  readonly filesBySlot: Readonly<Record<string, readonly ResourceFileRecord[]>>;
}

export interface ApplicationResourceBackend {
  initialize(): Promise<ResourceResult<readonly StoredResourceRecord[]>>;
  listRecords(): Promise<ResourceResult<readonly StoredResourceRecord[]>>;
  readRecord(ref: ResourceRef): Promise<ResourceResult<StoredResourceRecord>>;
  installBuiltinResource(input: BuiltinResourceInstallInput): Promise<ResourceResult<StoredResourceRecord>>;
  installNetworkResource(input: ResourceInstallInput): Promise<ResourceResult<StoredResourceRecord>>;
  /** Migration-only legacy global user import. */
  importUserMedia(input: UserMediaImportInput): Promise<ResourceResult<StoredResourceRecord>>;
  importWorkspaceMedia(input: WorkspaceMediaImportInput): Promise<ResourceResult<StoredResourceRecord>>;
  reconcileWorkspaceMedia(refs: readonly ResourceRef[]): Promise<ResourceResult<void>>;
  loadCatalogSnapshot(provider: string): Promise<ResourceResult<ResourceCatalogSnapshot | null>>;
  commitCatalogSnapshot(snapshot: ResourceCatalogSnapshot): Promise<ResourceResult<void>>;
  createSnapshot(
    slots: Readonly<Record<string, ResourceRef>>,
  ): Promise<ResourceResult<OpenedResourceSnapshot>>;
  openSnapshot(snapshotId: ResourceSnapshotId): Promise<ResourceResult<OpenedResourceSnapshot>>;
  readSnapshotFile(
    snapshotId: ResourceSnapshotId,
    slot: string,
    logicalPath: string,
  ): Promise<ResourceResult<Uint8Array>>;
  releaseSnapshot(snapshotId: ResourceSnapshotId): Promise<ResourceResult<void>>;
  verify(ref: ResourceRef): Promise<ResourceResult<ResourceDescriptor>>;
  remove(ref: ResourceRef): Promise<ResourceResult<void>>;
  collectGarbage(): Promise<ResourceResult<void>>;
}

export interface ResourceCatalogProvider {
  readonly provider: string;
  refresh(
    previous: ResourceCatalogSnapshot | null,
  ): Promise<ResourceResult<ResourceCatalogSnapshot>>;
  install(
    descriptor: NetworkResourceDescriptor,
  ): Promise<ResourceResult<ResourceInstallInput>>;
}

export interface ResourceObjectUrlFactory {
  create(bytes: Uint8Array, mediaType: string): string;
  revoke(url: string): void;
}
