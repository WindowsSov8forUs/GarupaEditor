import {
  createResourceRef,
  parseResourceId,
  resourceAccepted,
  resourceRejected,
  type ApplicationResourceDescriptor,
  type NetworkResourceDescriptor,
  type ResourceCatalogSnapshot,
  type ResourceDescriptor,
  type ResourceFileRecord,
  type ResourceRef,
  type ResourceResult,
  type ResourceSnapshotId,
  type WorkspaceMediaDescriptor,
} from "./contracts";
import type {
  ApplicationResourceBackend,
  BuiltinResourceInstallInput,
  OpenedResourceSnapshot,
  ResourceInstallFile,
  ResourceInstallInput,
  StoredResourceRecord,
  UserMediaImportInput,
  WorkspaceMediaImportInput,
} from "./backend";
import { observeResourceIntegrity } from "./sha256";

interface MemoryStoredResource {
  readonly record: StoredResourceRecord;
  readonly bytesByPath: ReadonlyMap<string, Uint8Array>;
}

interface MemorySnapshot {
  readonly view: OpenedResourceSnapshot;
  readonly bytesBySlot: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>;
  openCount: number;
}

export class MemoryApplicationResourceBackend implements ApplicationResourceBackend {
  private readonly records = new Map<string, MemoryStoredResource>();
  private readonly catalogs = new Map<string, ResourceCatalogSnapshot>();
  private readonly snapshots = new Map<string, MemorySnapshot>();
  private nextSnapshot = 1;

  async initialize(): Promise<ResourceResult<readonly StoredResourceRecord[]>> {
    return this.listRecords();
  }

  async listRecords(): Promise<ResourceResult<readonly StoredResourceRecord[]>> {
    return resourceAccepted(Object.freeze(
      Array.from(this.records.values(), (entry) => entry.record)
        .filter((record) => record.descriptor.origin !== "workspace"),
    ));
  }

  async readRecord(ref: ResourceRef): Promise<ResourceResult<StoredResourceRecord>> {
    const entry = this.records.get(ref.id);
    if (entry === undefined) {
      return unavailable("resources.memory.record-unavailable");
    }
    const verified = await verifyStored(entry);
    return verified.status === "rejected" ? verified : resourceAccepted(entry.record);
  }

  async installBuiltinResource(
    input: BuiltinResourceInstallInput,
  ): Promise<ResourceResult<StoredResourceRecord>> {
    if (input.descriptor.origin !== "builtin") {
      return invalid("resources.memory.install-non-builtin");
    }
    const prepared = await prepareStoredResource(
      Object.freeze({ ...input.descriptor, availability: "builtin-ready" as const }),
      input.files,
    );
    if (prepared.status === "rejected") return prepared;
    this.records.set(input.descriptor.ref.id, prepared.value);
    return resourceAccepted(prepared.value.record);
  }

  async installNetworkResource(
    input: ResourceInstallInput,
  ): Promise<ResourceResult<StoredResourceRecord>> {
    if (input.descriptor.origin !== "network") {
      return invalid("resources.memory.install-non-network");
    }
    const prepared = await prepareStoredResource(
      Object.freeze({ ...input.descriptor, availability: "installed" as const }),
      input.files,
    );
    if (prepared.status === "rejected") return prepared;
    this.records.set(input.descriptor.ref.id, prepared.value);
    return resourceAccepted(prepared.value.record);
  }

  async importWorkspaceMedia(
    input: WorkspaceMediaImportInput,
  ): Promise<ResourceResult<StoredResourceRecord>> {
    if (
      typeof input.fileName !== "string" || input.fileName.trim().length === 0 ||
      typeof input.mediaType !== "string" || input.mediaType.trim().length === 0 ||
      !(input.bytes instanceof Uint8Array) || input.bytes.byteLength <= 0 ||
      !validWorkspaceProvenance(input.provenance)
    ) {
      return invalid("resources.memory.invalid-workspace-media");
    }
    const integrity = await observeResourceIntegrity(input.bytes);
    if (integrity.status === "rejected") return integrity;
    const id = `workspace/current/chart-media/${input.purpose}/${integrity.value.sha256.toLowerCase()}`;
    const reference = createResourceRef(id);
    if (reference.status === "rejected") return reference;
    const descriptor: WorkspaceMediaDescriptor = Object.freeze({
      ref: reference.value,
      origin: "workspace" as const,
      kind: kindForUserPurpose(input.purpose),
      title: input.fileName.trim(),
      availability: "installed" as const,
      files: null,
      catalogObservedAt: null,
      purpose: input.purpose,
      fileName: input.fileName.trim(),
      provenance: freezeWorkspaceProvenance(input.provenance),
    });
    const prepared = await prepareStoredResource(descriptor, [Object.freeze({
      logicalPath: "workspace-media.bin",
      mediaType: input.mediaType.trim().toLowerCase(),
      bytes: Uint8Array.from(input.bytes),
    })]);
    if (prepared.status === "rejected") return prepared;
    this.records.set(reference.value.id, prepared.value);
    return resourceAccepted(prepared.value.record);
  }

  async reconcileWorkspaceMedia(refs: readonly ResourceRef[]): Promise<ResourceResult<void>> {
    const retained = new Set<string>();
    for (const ref of refs) {
      if (!ref.id.startsWith("workspace/current/chart-media/") || retained.has(ref.id)) {
        return invalid("resources.memory.invalid-workspace-reconcile-ref");
      }
      const stored = this.records.get(ref.id);
      if (stored === undefined || stored.record.descriptor.origin !== "workspace") {
        return unavailable("resources.memory.workspace-reconcile-record-unavailable");
      }
      const verified = await verifyStored(stored);
      if (verified.status === "rejected") return verified;
      retained.add(ref.id);
    }
    for (const [id, stored] of this.records) {
      if (stored.record.descriptor.origin === "workspace" && !retained.has(id)) this.records.delete(id);
    }
    return resourceAccepted(undefined);
  }

  async finalizeLegacyMediaMigration(
    migratedActiveRefs: readonly ResourceRef[],
  ) {
    const active = new Set<string>(migratedActiveRefs.map((ref) => ref.id));
    let migratedActiveCount = 0;
    let archivedUserCount = 0;
    let removedProviderMediaCount = 0;
    for (const [id, stored] of this.records) {
      const descriptor = stored.record.descriptor;
      if (descriptor.origin === "user") {
        if (active.has(id)) migratedActiveCount += 1;
        else archivedUserCount += 1;
        this.records.delete(id);
      } else if (descriptor.origin === "network" && descriptor.source.family.startsWith("media-")) {
        removedProviderMediaCount += 1;
        this.records.delete(id);
      }
    }
    return resourceAccepted(Object.freeze({
      completed: true,
      migratedActiveCount,
      archivedUserCount,
      removedProviderMediaCount,
      blockedCount: 0,
    }));
  }

  async loadCatalogSnapshot(
    provider: string,
  ): Promise<ResourceResult<ResourceCatalogSnapshot | null>> {
    return resourceAccepted(this.catalogs.get(provider) ?? null);
  }

  async commitCatalogSnapshot(
    snapshot: ResourceCatalogSnapshot,
  ): Promise<ResourceResult<void>> {
    if (snapshot.provider.trim().length === 0) return invalid("resources.memory.invalid-catalog");
    this.catalogs.set(snapshot.provider, freezeCatalog(snapshot));
    return resourceAccepted(undefined);
  }

  async createSnapshot(
    slots: Readonly<Record<string, ResourceRef>>,
  ): Promise<ResourceResult<OpenedResourceSnapshot>> {
    const snapshotId = `snapshot/memory-${this.nextSnapshot++}` as ResourceSnapshotId;
    const filesBySlot: Record<string, readonly ResourceFileRecord[]> = {};
    const revisions: Record<string, string> = {};
    const bytesBySlot = new Map<string, ReadonlyMap<string, Uint8Array>>();
    const copiedSlots: Record<string, ResourceRef> = {};
    for (const [slot, ref] of Object.entries(slots)) {
      if (slot.length === 0 || parseResourceId(ref?.id).status === "rejected") {
        return invalid("resources.memory.invalid-snapshot-slot");
      }
      copiedSlots[slot] = Object.freeze({ id: ref.id });
      const stored = this.records.get(ref.id);
      if (stored === undefined) return unavailable("resources.memory.snapshot-resource-unavailable");
      const verified = await verifyStored(stored);
      if (verified.status === "rejected") return verified;
      filesBySlot[slot] = stored.record.files;
      revisions[slot] = stored.record.revision;
      bytesBySlot.set(slot, new Map(Array.from(
        stored.bytesByPath,
        ([path, bytes]) => [path, Uint8Array.from(bytes)] as const,
      )));
    }
    const view: OpenedResourceSnapshot = Object.freeze({
      snapshotId,
      slots: Object.freeze(copiedSlots),
      revisions: Object.freeze(revisions),
      filesBySlot: Object.freeze(filesBySlot),
    });
    this.snapshots.set(snapshotId, {
      view,
      bytesBySlot,
      openCount: 0,
    });
    return resourceAccepted(view);
  }

  async openSnapshot(
    snapshotId: ResourceSnapshotId,
  ): Promise<ResourceResult<OpenedResourceSnapshot>> {
    const snapshot = this.snapshots.get(snapshotId);
    if (snapshot === undefined) return unavailable("resources.memory.snapshot-unavailable");
    snapshot.openCount += 1;
    return resourceAccepted(snapshot.view);
  }

  async readSnapshotFile(
    snapshotId: ResourceSnapshotId,
    slot: string,
    logicalPath: string,
  ): Promise<ResourceResult<Uint8Array>> {
    const snapshot = this.snapshots.get(snapshotId);
    if (snapshot === undefined || snapshot.openCount <= 0) {
      return resourceRejected(
        "resource-lease-closed",
        "resources.memory.snapshot-not-open",
        "Snapshot files are readable only while at least one main-program lease is open.",
      );
    }
    const bytes = snapshot.bytesBySlot.get(slot)?.get(logicalPath);
    return bytes === undefined
      ? unavailable("resources.memory.snapshot-file-unavailable")
      : resourceAccepted(Uint8Array.from(bytes));
  }

  async releaseSnapshot(
    snapshotId: ResourceSnapshotId,
  ): Promise<ResourceResult<void>> {
    const snapshot = this.snapshots.get(snapshotId);
    if (snapshot === undefined) return unavailable("resources.memory.snapshot-unavailable");
    if (snapshot.openCount <= 0) return resourceAccepted(undefined);
    snapshot.openCount -= 1;
    return resourceAccepted(undefined);
  }

  async verify(ref: ResourceRef): Promise<ResourceResult<ResourceDescriptor>> {
    const entry = this.records.get(ref.id);
    if (entry === undefined) return unavailable("resources.memory.verify-unavailable");
    const verified = await verifyStored(entry);
    return verified.status === "rejected"
      ? verified
      : resourceAccepted(entry.record.descriptor);
  }

  async remove(ref: ResourceRef): Promise<ResourceResult<void>> {
    this.records.delete(ref.id);
    return resourceAccepted(undefined);
  }

  async collectGarbage(): Promise<ResourceResult<void>> {
    for (const [snapshotId, snapshot] of this.snapshots) {
      if (snapshot.openCount === 0) this.snapshots.delete(snapshotId);
    }
    return resourceAccepted(undefined);
  }

  /** Test-only corruption hook; it is not part of the production backend contract. */
  corruptForTesting(ref: ResourceRef, logicalPath: string): boolean {
    const stored = this.records.get(ref.id);
    const original = stored?.bytesByPath.get(logicalPath);
    if (stored === undefined || original === undefined) return false;
    const corrupted = Uint8Array.from(original);
    corrupted[0] = corrupted[0]! ^ 0xff;
    const bytesByPath = new Map(stored.bytesByPath);
    bytesByPath.set(logicalPath, corrupted);
    this.records.set(ref.id, Object.freeze({ record: stored.record, bytesByPath }));
    return true;
  }
}

async function prepareStoredResource(
  descriptor: ApplicationResourceDescriptor,
  files: readonly ResourceInstallFile[],
): Promise<ResourceResult<MemoryStoredResource>> {
  if (!Array.isArray(files) || files.length === 0) return invalid("resources.memory.empty-package");
  const records: ResourceFileRecord[] = [];
  const bytesByPath = new Map<string, Uint8Array>();
  const foldedPaths = new Set<string>();
  for (const file of files) {
    const foldedPath = file.logicalPath.toLocaleLowerCase("en-US");
    if (
      !safeLogicalPath(file.logicalPath) || foldedPaths.has(foldedPath) ||
      typeof file.mediaType !== "string" || file.mediaType.trim().length === 0 ||
      !(file.bytes instanceof Uint8Array) || file.bytes.byteLength <= 0
    ) {
      return invalid("resources.memory.invalid-package-file");
    }
    foldedPaths.add(foldedPath);
    const owned = Uint8Array.from(file.bytes);
    const integrity = await observeResourceIntegrity(owned);
    if (integrity.status === "rejected") return integrity;
    records.push(Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType.trim().toLowerCase(),
      integrity: integrity.value,
    }));
    bytesByPath.set(file.logicalPath, owned);
  }
  const revisionIntegrity = await observeResourceIntegrity(new TextEncoder().encode(JSON.stringify([
    descriptor.ref.id,
    records.map((file) => [file.logicalPath, file.mediaType, file.integrity.byteLength, file.integrity.sha256]),
  ])));
  if (revisionIntegrity.status === "rejected") return revisionIntegrity;
  const record: StoredResourceRecord = Object.freeze({
    revision: `record/${revisionIntegrity.value.sha256}`,
    descriptor: Object.freeze({ ...descriptor, files: Object.freeze(records) }) as ApplicationResourceDescriptor,
    files: Object.freeze(records),
  });
  return resourceAccepted(Object.freeze({ record, bytesByPath }));
}

async function verifyStored(
  stored: MemoryStoredResource,
): Promise<ResourceResult<void>> {
  for (const file of stored.record.files) {
    const bytes = stored.bytesByPath.get(file.logicalPath);
    if (bytes === undefined) return integrityFailure("resources.memory.stored-file-missing");
    const observed = await observeResourceIntegrity(bytes);
    if (observed.status === "rejected") return observed;
    if (
      observed.value.byteLength !== file.integrity.byteLength ||
      observed.value.sha256 !== file.integrity.sha256
    ) {
      return integrityFailure("resources.memory.stored-file-tampered");
    }
  }
  return resourceAccepted(undefined);
}

function freezeCatalog(snapshot: ResourceCatalogSnapshot): ResourceCatalogSnapshot {
  return Object.freeze({
    ...snapshot,
    resources: Object.freeze(snapshot.resources.map((resource) => Object.freeze({
      ...resource,
      ref: Object.freeze({ ...resource.ref }),
      source: Object.freeze({ ...resource.source }),
      logicalPlacement: Object.freeze({ ...resource.logicalPlacement }),
      files: resource.files === null ? null : Object.freeze([...resource.files]),
    }) as NetworkResourceDescriptor)),
  });
}

function safeLogicalPath(value: string): boolean {
  if (
    typeof value !== "string" || value.length === 0 || value.includes("\\") ||
    value.startsWith("/") || value.normalize("NFC") !== value
  ) return false;
  const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  const parts = value.split("/");
  return parts.every((part) =>
    part.length > 0 && part !== "." && part !== ".." &&
    !part.endsWith(".") && !part.endsWith(" ") && !reserved.test(part));
}

function validWorkspaceProvenance(
  value: WorkspaceMediaImportInput["provenance"],
): boolean {
  if (value.kind === "user-upload") return true;
  return value.kind === "network" && value.sourceRef !== null && typeof value.sourceRef === "object" &&
    value.sourceRef.id.startsWith("bestdori/");
}

function freezeWorkspaceProvenance(
  value: WorkspaceMediaImportInput["provenance"],
): WorkspaceMediaImportInput["provenance"] {
  return value.kind === "user-upload"
    ? Object.freeze({ kind: "user-upload" as const })
    : Object.freeze({ kind: "network" as const, sourceRef: Object.freeze({ id: value.sourceRef.id }) });
}

function kindForUserPurpose(purpose: UserMediaImportInput["purpose"]): WorkspaceMediaDescriptor["kind"] {
  if (purpose === "bgm") return "audio";
  if (purpose === "mv") return "video";
  return "image";
}

function invalid<T>(capability: string): ResourceResult<T> {
  return resourceRejected(
    "invalid-resource-request",
    capability,
    "The memory resource backend rejected an invalid or ambiguous resource transaction.",
  );
}

function unavailable<T>(capability: string): ResourceResult<T> {
  return resourceRejected(
    "resource-unavailable",
    capability,
    "The requested resource is unavailable and no alias or fallback is consulted.",
  );
}

function integrityFailure<T>(capability: string): ResourceResult<T> {
  return resourceRejected(
    "resource-integrity",
    capability,
    "Stored resource bytes no longer match the integrity observed when their transaction was committed.",
  );
}
