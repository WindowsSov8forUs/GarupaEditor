import type {
  ApplicationResourceBackend,
  ResourceCatalogProvider,
  ResourceInstallFile,
  ResourceObjectUrlFactory,
  StoredResourceRecord,
} from "./backend";
import {
  createResourceRef,
  resourceAccepted,
  resourceRejected,
  type ApplicationResourceDescriptor,
  type BuiltinResourceDescriptor,
  type NetworkResourceDescriptor,
  type ResourceCatalogSnapshot,
  type ResourceConsumerLease,
  type ResourceDescriptor,
  type ResourceFileRecord,
  type ResourceLeaseFile,
  type ResourceLeaseId,
  type ResourceRef,
  type ResourceResult,
  type ResourceSnapshotId,
  type ResourceSnapshotReceipt,
  type UserMediaPurpose,
} from "./contracts";
import {
  APPLICATION_RESOURCE_SLOTS,
  createEmptyApplicationResourceSelection,
  replaceApplicationResourceSelection,
  type ApplicationResourceSelection,
  type ApplicationResourceSlot,
} from "./selections";
import { observeResourceIntegrity } from "./sha256";

export interface BuiltinResourceRegistration {
  readonly id: string;
  readonly kind: BuiltinResourceDescriptor["kind"];
  readonly title: string;
  readonly sourceUrl: string;
  readonly files: readonly ResourceInstallFile[];
}

export interface ResourceListQuery {
  readonly origin?: ApplicationResourceDescriptor["origin"];
  readonly kind?: ApplicationResourceDescriptor["kind"];
  readonly provider?: string;
  readonly family?: string;
}

export interface ImportUserMediaRequest {
  readonly purpose: UserMediaPurpose;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export class ApplicationResourceManager {
  private readonly builtins = new Map<string, {
    readonly descriptor: BuiltinResourceDescriptor;
    readonly bytesByPath: ReadonlyMap<string, Uint8Array>;
  }>();
  private readonly installed = new Map<string, StoredResourceRecord>();
  private readonly providers = new Map<string, ResourceCatalogProvider>();
  private readonly activeCatalogs = new Map<string, ResourceCatalogSnapshot>();
  private readonly registeredNetwork = new Map<string, NetworkResourceDescriptor>();
  private selection: ApplicationResourceSelection = createEmptyApplicationResourceSelection();
  private initialized = false;

  constructor(
    private readonly backend: ApplicationResourceBackend,
    private readonly objectUrls: ResourceObjectUrlFactory,
  ) {}

  async initialize(): Promise<ResourceResult<void>> {
    if (this.initialized) return resourceAccepted(undefined);
    const initialized = await this.backend.initialize();
    if (initialized.status === "rejected") return initialized;
    this.installed.clear();
    for (const record of initialized.value) this.installed.set(record.descriptor.ref.id, record);
    this.initialized = true;
    return resourceAccepted(undefined);
  }

  registerCatalogProvider(provider: ResourceCatalogProvider): ResourceResult<void> {
    if (
      provider === null || typeof provider !== "object" ||
      typeof provider.provider !== "string" || provider.provider.trim().length === 0 ||
      typeof provider.refresh !== "function" || typeof provider.install !== "function" ||
      this.providers.has(provider.provider)
    ) {
      return invalid("resources.manager.invalid-or-duplicate-provider");
    }
    this.providers.set(provider.provider, provider);
    return resourceAccepted(undefined);
  }

  async registerBuiltin(
    input: BuiltinResourceRegistration,
  ): Promise<ResourceResult<ResourceDescriptor>> {
    const reference = createResourceRef(input.id);
    if (reference.status === "rejected") return reference;
    if (!reference.value.id.startsWith("builtin/") || this.builtins.has(reference.value.id)) {
      return invalid("resources.manager.invalid-or-duplicate-builtin");
    }
    if (
      typeof input.title !== "string" || input.title.trim().length === 0 ||
      typeof input.sourceUrl !== "string" || input.sourceUrl.length === 0 ||
      !Array.isArray(input.files) || input.files.length === 0
    ) {
      return invalid("resources.manager.invalid-builtin-shape");
    }
    const prepared = await prepareFiles(input.files);
    if (prepared.status === "rejected") return prepared;
    const descriptor: BuiltinResourceDescriptor = Object.freeze({
      ref: reference.value,
      origin: "builtin" as const,
      kind: input.kind,
      title: input.title.trim(),
      availability: "builtin-ready" as const,
      files: prepared.value.records,
      catalogObservedAt: null,
      sourceUrl: input.sourceUrl,
    });
    this.builtins.set(reference.value.id, Object.freeze({
      descriptor,
      bytesByPath: prepared.value.bytesByPath,
    }));
    return resourceAccepted(descriptor);
  }

  registerNetworkResource(
    descriptor: NetworkResourceDescriptor,
  ): ResourceResult<void> {
    if (
      descriptor.origin !== "network" ||
      !descriptor.ref.id.startsWith(`${descriptor.source.provider}/`) ||
      !this.providers.has(descriptor.source.provider)
    ) {
      return invalid("resources.manager.invalid-network-registration");
    }
    this.registeredNetwork.set(descriptor.ref.id, descriptor);
    return resourceAccepted(undefined);
  }

  getSelection(): ApplicationResourceSelection {
    return this.selection;
  }

  replaceSelection(
    changes: Readonly<Partial<Record<ApplicationResourceSlot, ResourceRef | null>>>,
  ): ResourceResult<ApplicationResourceSelection> {
    for (const [slot, ref] of Object.entries(changes)) {
      if (!(APPLICATION_RESOURCE_SLOTS as readonly string[]).includes(slot)) {
        return invalid("resources.manager.unknown-selection-slot");
      }
      if (ref !== null && ref !== undefined && createResourceRef(ref.id).status === "rejected") {
        return invalid("resources.manager.invalid-selection-ref");
      }
    }
    this.selection = replaceApplicationResourceSelection(this.selection, changes);
    return resourceAccepted(this.selection);
  }

  async refreshCatalog(providerId: string): Promise<ResourceResult<ResourceCatalogSnapshot>> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) return invalid("resources.manager.unknown-catalog-provider");
    const cached = await this.backend.loadCatalogSnapshot(providerId);
    if (cached.status === "rejected") return cached;
    const refreshed = await provider.refresh(cached.value);
    if (refreshed.status === "accepted") {
      const committed = await this.backend.commitCatalogSnapshot(refreshed.value);
      if (committed.status === "rejected") return committed;
      this.activeCatalogs.set(providerId, refreshed.value);
      return refreshed;
    }
    if (cached.value === null) return refreshed;
    const offline = freezeCatalog({
      ...cached.value,
      freshness: "offline-cached",
      resources: cached.value.resources.map((resource) => Object.freeze({
        ...resource,
        availability: this.installed.has(resource.ref.id) ? "offline-cached" as const : "unavailable" as const,
      })),
    });
    this.activeCatalogs.set(providerId, offline);
    return resourceAccepted(offline);
  }

  async listResources(query: ResourceListQuery = {}): Promise<ResourceResult<readonly ApplicationResourceDescriptor[]>> {
    const listed = await this.backend.listRecords();
    if (listed.status === "rejected") return listed;
    this.installed.clear();
    for (const record of listed.value) this.installed.set(record.descriptor.ref.id, record);
    const merged = new Map<string, ApplicationResourceDescriptor>();
    for (const builtin of this.builtins.values()) merged.set(builtin.descriptor.ref.id, builtin.descriptor);
    for (const catalog of this.activeCatalogs.values()) {
      for (const descriptor of catalog.resources) merged.set(descriptor.ref.id, descriptor);
    }
    for (const descriptor of this.registeredNetwork.values()) merged.set(descriptor.ref.id, descriptor);
    for (const record of this.installed.values()) merged.set(record.descriptor.ref.id, record.descriptor);
    const resources = Array.from(merged.values()).filter((descriptor) => {
      if (query.origin !== undefined && descriptor.origin !== query.origin) return false;
      if (query.kind !== undefined && descriptor.kind !== query.kind) return false;
      if (query.provider !== undefined && (descriptor.origin !== "network" || descriptor.source.provider !== query.provider)) {
        return false;
      }
      if (query.family !== undefined && (descriptor.origin !== "network" || descriptor.source.family !== query.family)) {
        return false;
      }
      return true;
    });
    resources.sort((a, b) => a.title.localeCompare(b.title) || a.ref.id.localeCompare(b.ref.id));
    return resourceAccepted(Object.freeze(resources));
  }

  async ensureAvailable(
    ref: ResourceRef,
    options: { readonly refresh?: boolean } = {},
  ): Promise<ResourceResult<ResourceDescriptor>> {
    const builtin = this.builtins.get(ref.id);
    if (builtin !== undefined) return resourceAccepted(builtin.descriptor);
    if (options.refresh !== true) {
      const existing = await this.backend.readRecord(ref);
      if (existing.status === "accepted") {
        this.installed.set(ref.id, existing.value);
        return resourceAccepted(existing.value.descriptor);
      }
    }
    const descriptor = this.findNetworkDescriptor(ref.id);
    if (descriptor === null) {
      return resourceRejected(
        "resource-unavailable",
        "resources.manager.resource-not-catalogued",
        "The main program has no builtin, installed or current catalog identity for the selected resource.",
      );
    }
    const provider = this.providers.get(descriptor.source.provider);
    if (provider === undefined) return invalid("resources.manager.network-provider-missing");
    const installed = await provider.install(descriptor);
    if (installed.status === "rejected") return installed;
    const committed = await this.backend.installNetworkResource(installed.value);
    if (committed.status === "rejected") return committed;
    this.installed.set(ref.id, committed.value);
    return resourceAccepted(committed.value.descriptor);
  }

  async importUserMedia(
    input: ImportUserMediaRequest,
  ): Promise<ResourceResult<ResourceDescriptor>> {
    if (
      !(["bgm", "cover", "mv", "stage-backdrop"] as readonly string[]).includes(input.purpose) ||
      !(input.bytes instanceof Uint8Array) || input.bytes.byteLength <= 0
    ) {
      return invalid("resources.manager.invalid-user-media-bytes");
    }
    const imported = await this.backend.importUserMedia({
      purpose: input.purpose,
      fileName: input.fileName,
      mediaType: input.mediaType,
      bytes: Uint8Array.from(input.bytes),
    });
    if (imported.status === "rejected") return imported;
    this.installed.set(imported.value.descriptor.ref.id, imported.value);
    return resourceAccepted(imported.value.descriptor);
  }

  async createSnapshot(
    requiredSlots: readonly ApplicationResourceSlot[],
  ): Promise<ResourceResult<ResourceSnapshotReceipt>> {
    if (requiredSlots.length === 0) {
      return invalid("resources.manager.empty-snapshot-request");
    }
    const slots: Record<string, ResourceRef> = {};
    const seen = new Set<string>();
    for (const slot of requiredSlots) {
      if (seen.has(slot) || !(APPLICATION_RESOURCE_SLOTS as readonly string[]).includes(slot)) {
        return invalid("resources.manager.invalid-or-duplicate-snapshot-slot");
      }
      seen.add(slot);
      const ref = this.selection[slot];
      if (ref === null) {
        return resourceRejected(
          "resource-unavailable",
          "resources.manager.unselected-required-slot",
          `The main program has not selected required resource slot ${slot}.`,
        );
      }
      const available = await this.ensureAvailable(ref);
      if (available.status === "rejected") return available;
      slots[slot] = ref;
    }
    const created = await this.backend.createSnapshot(Object.freeze(slots));
    return created.status === "rejected"
      ? created
      : resourceAccepted(Object.freeze({
          snapshotId: created.value.snapshotId,
          slots: created.value.slots,
        }));
  }

  async acquireSnapshot(
    snapshotId: ResourceSnapshotId,
  ): Promise<ResourceResult<ResourceConsumerLease>> {
    const opened = await this.backend.openSnapshot(snapshotId);
    if (opened.status === "rejected") return opened;
    const filesBySlot: Record<string, readonly ResourceFileRecord[]> = {
      ...opened.value.filesBySlot,
    };
    for (const [slot, ref] of Object.entries(opened.value.slots)) {
      const builtin = this.builtins.get(ref.id);
      if (builtin !== undefined) filesBySlot[slot] = builtin.descriptor.files ?? Object.freeze([]);
    }
    return resourceAccepted(new ManagedResourceConsumerLease(
      opened.value.snapshotId,
      opened.value.slots,
      Object.freeze(filesBySlot),
      this.builtins,
      this.backend,
      this.objectUrls,
    ));
  }

  async verify(ref: ResourceRef): Promise<ResourceResult<ResourceDescriptor>> {
    const builtin = this.builtins.get(ref.id);
    if (builtin !== undefined) {
      for (const file of builtin.descriptor.files ?? []) {
        const bytes = builtin.bytesByPath.get(file.logicalPath);
        if (bytes === undefined) return integrityFailure("resources.manager.builtin-file-missing");
        const observed = await observeResourceIntegrity(bytes);
        if (observed.status === "rejected") return observed;
        if (observed.value.byteLength !== file.integrity.byteLength || observed.value.sha256 !== file.integrity.sha256) {
          return integrityFailure("resources.manager.builtin-file-tampered");
        }
      }
      return resourceAccepted(builtin.descriptor);
    }
    return this.backend.verify(ref);
  }

  async remove(ref: ResourceRef): Promise<ResourceResult<void>> {
    if (this.builtins.has(ref.id)) return invalid("resources.manager.cannot-remove-builtin");
    const removed = await this.backend.remove(ref);
    if (removed.status === "accepted") this.installed.delete(ref.id);
    return removed;
  }

  collectGarbage(): Promise<ResourceResult<void>> {
    return this.backend.collectGarbage();
  }

  private findNetworkDescriptor(id: string): NetworkResourceDescriptor | null {
    const registered = this.registeredNetwork.get(id);
    if (registered !== undefined) return registered;
    for (const catalog of this.activeCatalogs.values()) {
      const descriptor = catalog.resources.find((candidate) => candidate.ref.id === id);
      if (descriptor !== undefined) return descriptor;
    }
    return null;
  }
}

class ManagedResourceConsumerLease implements ResourceConsumerLease {
  readonly leaseId: ResourceLeaseId;
  private released = false;
  private readonly urls = new Map<string, string>();

  constructor(
    readonly snapshotId: ResourceSnapshotId,
    readonly slots: Readonly<Record<string, ResourceRef>>,
    private readonly filesBySlot: Readonly<Record<string, readonly ResourceFileRecord[]>>,
    private readonly builtins: ReadonlyMap<string, {
      readonly descriptor: BuiltinResourceDescriptor;
      readonly bytesByPath: ReadonlyMap<string, Uint8Array>;
    }>,
    private readonly backend: ApplicationResourceBackend,
    private readonly objectUrls: ResourceObjectUrlFactory,
  ) {
    this.leaseId = `lease/${snapshotId.slice("snapshot/".length)}-${nextLeaseIdentity++}` as ResourceLeaseId;
  }

  listFiles(slot: string): readonly ResourceLeaseFile[] {
    if (this.released) return Object.freeze([]);
    return this.filesBySlot[slot] ?? Object.freeze([]);
  }

  async readBytes(slot: string, logicalPath: string): Promise<Uint8Array> {
    this.assertOpen();
    const ref = this.slots[slot];
    if (ref === undefined) throw new Error(`resource slot is not leased: ${slot}`);
    const builtin = this.builtins.get(ref.id);
    if (builtin !== undefined) {
      const bytes = builtin.bytesByPath.get(logicalPath);
      if (bytes === undefined) throw new Error(`builtin resource file is not leased: ${slot}/${logicalPath}`);
      return Uint8Array.from(bytes);
    }
    const read = await this.backend.readSnapshotFile(this.snapshotId, slot, logicalPath);
    if (read.status === "rejected") throw new Error(`${read.failure.capability}: ${read.failure.boundary}`);
    return Uint8Array.from(read.value);
  }

  async openObjectUrl(slot: string, logicalPath: string): Promise<string> {
    this.assertOpen();
    const key = `${slot}\u0000${logicalPath}`;
    const existing = this.urls.get(key);
    if (existing !== undefined) return existing;
    const file = this.listFiles(slot).find((candidate) => candidate.logicalPath === logicalPath);
    if (file === undefined) throw new Error(`resource file metadata is not leased: ${slot}/${logicalPath}`);
    const bytes = await this.readBytes(slot, logicalPath);
    const url = this.objectUrls.create(bytes, file.mediaType);
    this.urls.set(key, url);
    return url;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    for (const url of this.urls.values()) this.objectUrls.revoke(url);
    this.urls.clear();
    const released = await this.backend.releaseSnapshot(this.snapshotId);
    if (released.status === "rejected") {
      throw new Error(`${released.failure.capability}: ${released.failure.boundary}`);
    }
  }

  private assertOpen(): void {
    if (this.released) throw new Error("resource lease is closed");
  }
}

let nextLeaseIdentity = 1;

async function prepareFiles(
  files: readonly ResourceInstallFile[],
): Promise<ResourceResult<{
  readonly records: readonly ResourceFileRecord[];
  readonly bytesByPath: ReadonlyMap<string, Uint8Array>;
}>> {
  const records: ResourceFileRecord[] = [];
  const bytesByPath = new Map<string, Uint8Array>();
  for (const file of files) {
    if (
      typeof file.logicalPath !== "string" || file.logicalPath.length === 0 ||
      file.logicalPath.includes("\\") || file.logicalPath.split("/").some((part) => part.length === 0 || part === "." || part === "..") ||
      bytesByPath.has(file.logicalPath) || typeof file.mediaType !== "string" || file.mediaType.trim().length === 0 ||
      !(file.bytes instanceof Uint8Array) || file.bytes.byteLength <= 0
    ) {
      return invalid("resources.manager.invalid-builtin-file");
    }
    const bytes = Uint8Array.from(file.bytes);
    const integrity = await observeResourceIntegrity(bytes);
    if (integrity.status === "rejected") return integrity;
    records.push(Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType.trim().toLowerCase(),
      integrity: integrity.value,
    }));
    bytesByPath.set(file.logicalPath, bytes);
  }
  return records.length === 0
    ? invalid("resources.manager.empty-builtin-files")
    : resourceAccepted(Object.freeze({ records: Object.freeze(records), bytesByPath }));
}

function freezeCatalog(snapshot: ResourceCatalogSnapshot): ResourceCatalogSnapshot {
  return Object.freeze({
    ...snapshot,
    resources: Object.freeze(snapshot.resources.map((resource) => Object.freeze({
      ...resource,
      ref: Object.freeze({ ...resource.ref }),
      source: Object.freeze({ ...resource.source }),
      files: resource.files === null ? null : Object.freeze([...resource.files]),
    }) as NetworkResourceDescriptor)),
  });
}

function invalid<T>(capability: string): ResourceResult<T> {
  return resourceRejected(
    "invalid-resource-request",
    capability,
    "The application resource manager rejected an invalid or ambiguous main-program resource operation.",
  );
}

function integrityFailure<T>(capability: string): ResourceResult<T> {
  return resourceRejected(
    "resource-integrity",
    capability,
    "Resource bytes no longer match the integrity observed by the main program.",
  );
}
