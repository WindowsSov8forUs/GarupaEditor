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
  validateResourceLogicalPlacement,
  resourceRejected,
  type ApplicationResourceDescriptor,
  type BuiltinResourceDescriptor,
  type NetworkResourceDescriptor,
  type ObservedIntegrity,
  type ResourceCatalogSnapshot,
  type ResourceConsumerLease,
  type ResourceDescriptor,
  type ResourceFileRecord,
  type ResourceLeaseFile,
  type ResourceLeaseId,
  type ResourceLogicalPlacement,
  type ResourceRef,
  type ResourceResult,
  type ResourceSnapshotId,
  type ResourceSnapshotReceipt,
  type UserMediaPurpose,
  type WorkspaceMediaProvenance,
} from "./contracts";
import {
  APPLICATION_RESOURCE_SLOTS,
  createEmptyApplicationResourceSelection,
  replaceApplicationResourceSelection,
  type ApplicationResourceSelection,
  type ApplicationResourceSlot,
  type ChartMediaResources,
} from "./selections";
import { observeResourceIntegrity } from "./sha256";

export interface BuiltinResourceRegistrationFile {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly integrity?: ObservedIntegrity;
  readonly bytes?: Uint8Array;
  readonly loadBytes?: () => Promise<Uint8Array>;
}

export interface BuiltinResourceRegistration {
  readonly id: string;
  readonly kind: BuiltinResourceDescriptor["kind"];
  readonly title: string;
  readonly sourceUrl: string;
  readonly logicalPlacement?: ResourceLogicalPlacement;
  readonly files: readonly BuiltinResourceRegistrationFile[];
}

interface RegisteredBuiltinResource {
  readonly descriptor: BuiltinResourceDescriptor;
  readonly filesByPath: ReadonlyMap<string, ManagedBuiltinFile>;
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

export interface AdoptedLegacyChartMedia {
  readonly media: ChartMediaResources;
  readonly migratedActiveRefs: readonly ResourceRef[];
}

export class ApplicationResourceManager {
  private readonly builtins = new Map<string, RegisteredBuiltinResource>();
  private readonly installed = new Map<string, StoredResourceRecord>();
  private readonly providers = new Map<string, ResourceCatalogProvider>();
  private readonly activeCatalogs = new Map<string, ResourceCatalogSnapshot>();
  private readonly registeredNetwork = new Map<string, NetworkResourceDescriptor>();
  private selection: ApplicationResourceSelection = createEmptyApplicationResourceSelection();
  private builtinDocumentLease: ResourceConsumerLease | null = null;
  private readonly builtinDocumentUrls = new Map<ApplicationResourceSlot, string>();
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
    const placement = validateResourceLogicalPlacement(
      input.logicalPlacement ?? builtinPlacementFor(reference.value.id),
    );
    if (placement.status === "rejected") return placement;
    const descriptor: BuiltinResourceDescriptor = Object.freeze({
      ref: reference.value,
      origin: "builtin" as const,
      kind: input.kind,
      title: input.title.trim(),
      availability: "builtin-ready" as const,
      files: prepared.value.records,
      catalogObservedAt: null,
      sourceUrl: input.sourceUrl,
      logicalPlacement: placement.value,
    });
    const installFiles: ResourceInstallFile[] = [];
    for (const record of prepared.value.records) {
      const owner = prepared.value.filesByPath.get(record.logicalPath);
      if (owner === undefined) return integrityFailure("resources.manager.builtin-file-missing");
      const loaded = await owner.read();
      if (loaded.status === "rejected") return loaded;
      installFiles.push(Object.freeze({
        logicalPath: record.logicalPath,
        mediaType: record.mediaType,
        bytes: loaded.value,
      }));
    }
    const committed = await this.backend.installBuiltinResource(Object.freeze({
      descriptor,
      files: Object.freeze(installFiles),
    }));
    if (committed.status === "rejected") return committed;
    this.installed.set(reference.value.id, committed.value);
    this.builtins.set(reference.value.id, Object.freeze({
      descriptor: committed.value.descriptor as BuiltinResourceDescriptor,
      filesByPath: prepared.value.filesByPath,
    }));
    return resourceAccepted(committed.value.descriptor);
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

  resolveBuiltinSlotUrl(slot: ApplicationResourceSlot): ResourceResult<string> {
    const url = this.builtinDocumentUrls.get(slot);
    return url === undefined
      ? invalid("resources.manager.builtin-slot-lease-not-prepared")
      : resourceAccepted(url);
  }

  async prepareBuiltinDocumentLease(
    slots: readonly ApplicationResourceSlot[],
  ): Promise<ResourceResult<void>> {
    if (this.builtinDocumentLease !== null || slots.length === 0) {
      return invalid("resources.manager.invalid-builtin-document-lease-state");
    }
    const bindings: Record<string, ResourceRef> = {};
    for (const slot of slots) {
      const ref = this.selection[slot];
      if (ref === null || !this.builtins.has(ref.id) || bindings[slot] !== undefined) {
        return invalid("resources.manager.invalid-builtin-document-slot");
      }
      bindings[slot] = ref;
    }
    const receipt = await this.createSnapshotFromRefs(Object.freeze(bindings));
    if (receipt.status === "rejected") return receipt;
    const lease = await this.acquireSnapshot(receipt.value.snapshotId);
    if (lease.status === "rejected") return lease;
    try {
      for (const slot of slots) {
        const files = lease.value.listFiles(slot);
        if (files.length !== 1) throw new Error("resources.manager.builtin-document-file-count");
        this.builtinDocumentUrls.set(slot, await lease.value.openObjectUrl(slot, files[0]!.logicalPath));
      }
    } catch (error) {
      await lease.value.release();
      this.builtinDocumentUrls.clear();
      return resourceRejected(
        "resource-integrity",
        "resources.manager.builtin-document-lease-failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    this.builtinDocumentLease = lease.value;
    return resourceAccepted(undefined);
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
    if (descriptor.source.family.startsWith("media-")) {
      return resourceRejected(
        "invalid-resource-request",
        "resources.manager.chart-media-requires-workspace",
        "Chart media must be materialized in the recoverable current-session workspace rather than installed as a global provider record.",
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

  async importWorkspaceMedia(
    input: ImportUserMediaRequest & { readonly provenance?: WorkspaceMediaProvenance },
  ): Promise<ResourceResult<ResourceDescriptor>> {
    const validated = validateChartMediaImport(input);
    if (validated.status === "rejected") return validated;
    const provenance = input.provenance ?? Object.freeze({ kind: "user-upload" as const });
    if (provenance.kind === "network" && !provenance.sourceRef.id.startsWith("bestdori/")) {
      return invalid("resources.manager.invalid-workspace-network-provenance");
    }
    const imported = await this.backend.importWorkspaceMedia({ ...validated.value, provenance });
    return imported.status === "rejected"
      ? imported
      : resourceAccepted(imported.value.descriptor);
  }

  async materializeNetworkMediaInWorkspace(
    descriptor: NetworkResourceDescriptor,
    purpose: UserMediaPurpose,
  ): Promise<ResourceResult<ResourceDescriptor>> {
    if (
      descriptor.origin !== "network" || descriptor.source.family !== `media-${purpose}` ||
      !descriptor.ref.id.startsWith(`${descriptor.source.provider}/`)
    ) return invalid("resources.manager.invalid-workspace-network-media");
    const provider = this.providers.get(descriptor.source.provider);
    if (provider === undefined) return invalid("resources.manager.network-provider-missing");
    const installed = await provider.install(descriptor);
    if (installed.status === "rejected") return installed;
    if (installed.value.files.length !== 1) {
      return invalid("resources.manager.workspace-network-media-file-count");
    }
    const file = installed.value.files[0]!;
    return this.importWorkspaceMedia({
      purpose,
      fileName: file.logicalPath,
      mediaType: file.mediaType,
      bytes: file.bytes,
      provenance: Object.freeze({ kind: "network" as const, sourceRef: descriptor.ref }),
    });
  }

  async reconcileCurrentChartMedia(media: ChartMediaResources): Promise<ResourceResult<void>> {
    const refs: ResourceRef[] = [];
    const seen = new Set<string>();
    for (const ref of Object.values(media)) {
      if (ref === null || !ref.id.startsWith("workspace/")) continue;
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      refs.push(ref);
    }
    return this.backend.reconcileWorkspaceMedia(Object.freeze(refs));
  }

  async adoptLegacyChartMedia(
    media: ChartMediaResources,
  ): Promise<ResourceResult<AdoptedLegacyChartMedia>> {
    const migratedActiveRefs: ResourceRef[] = [];
    const output: Record<keyof ChartMediaResources, ResourceRef | null> = {
      bgm: null,
      cover: null,
      mv: null,
      stageBackdrop: null,
    };
    const purposes: Readonly<Record<keyof ChartMediaResources, UserMediaPurpose>> = Object.freeze({
      bgm: "bgm",
      cover: "cover",
      mv: "mv",
      stageBackdrop: "stage-backdrop",
    });
    for (const key of Object.keys(output) as Array<keyof ChartMediaResources>) {
      const ref = media[key];
      if (ref === null || ref.id.startsWith("workspace/") || ref.id.startsWith("builtin/")) {
        output[key] = ref;
        continue;
      }
      if (
        key === "stageBackdrop" && ref.id.startsWith("bestdori/") &&
        ref.id.includes("/ingameskin/bgskin/")
      ) {
        output[key] = ref;
        continue;
      }
      if (!ref.id.startsWith("user/media/") && !ref.id.startsWith("bestdori/")) {
        return invalid("resources.manager.legacy-chart-media-scope");
      }
      const purpose = purposes[key];
      let record = await this.backend.readRecord(ref);
      if (record.status === "rejected" && ref.id.startsWith("bestdori/")) {
        let descriptor = this.findNetworkDescriptor(ref.id);
        if (descriptor === null) {
          const refreshed = await this.refreshCatalog("bestdori");
          if (refreshed.status === "rejected") return refreshed;
          descriptor = this.findNetworkDescriptor(ref.id);
        }
        if (descriptor === null) {
          return resourceRejected(
            "resource-unavailable",
            "resources.manager.legacy-network-media-unavailable",
            "Legacy chart media has neither committed bytes nor one current provider descriptor; it cannot be aliased or defaulted.",
          );
        }
        const materialized = await this.materializeNetworkMediaInWorkspace(descriptor, purpose);
        if (materialized.status === "rejected") return materialized;
        output[key] = materialized.value.ref;
        migratedActiveRefs.push(ref);
        continue;
      }
      if (record.status === "rejected") return record;
      if (record.value.files.length !== 1) return invalid("resources.manager.legacy-chart-media-file-count");
      const receipt = await this.createSnapshotFromRefs({ "legacy-chart-media": ref });
      if (receipt.status === "rejected") return receipt;
      const lease = await this.acquireSnapshot(receipt.value.snapshotId);
      if (lease.status === "rejected") return lease;
      try {
        const file = lease.value.listFiles("legacy-chart-media")[0]!;
        const bytes = await lease.value.readBytes("legacy-chart-media", file.logicalPath);
        const imported = await this.importWorkspaceMedia({
          purpose,
          fileName: record.value.descriptor.origin === "user"
            ? record.value.descriptor.fileName
            : file.logicalPath,
          mediaType: file.mediaType,
          bytes,
          provenance: ref.id.startsWith("bestdori/")
            ? Object.freeze({ kind: "network" as const, sourceRef: ref })
            : Object.freeze({ kind: "user-upload" as const }),
        });
        if (imported.status === "rejected") return imported;
        output[key] = imported.value.ref;
        migratedActiveRefs.push(ref);
      } finally {
        await lease.value.release();
      }
    }
    return resourceAccepted(Object.freeze({
      media: Object.freeze(output) as ChartMediaResources,
      migratedActiveRefs: Object.freeze(migratedActiveRefs),
    }));
  }

  finalizeLegacyMediaMigration(migratedActiveRefs: readonly ResourceRef[]) {
    return this.backend.finalizeLegacyMediaMigration(migratedActiveRefs);
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
    return this.createSnapshotFromRefs(Object.freeze(slots));
  }

  async createSnapshotFromRefs(
    bindings: Readonly<Record<string, ResourceRef>>,
  ): Promise<ResourceResult<ResourceSnapshotReceipt>> {
    const entries = Object.entries(bindings);
    if (entries.length === 0) return invalid("resources.manager.empty-explicit-snapshot-request");
    const slots: Record<string, ResourceRef> = {};
    for (const [slot, ref] of entries) {
      if (!safeSemanticSlot(slot) || slots[slot] !== undefined || createResourceRef(ref?.id).status === "rejected") {
        return invalid("resources.manager.invalid-explicit-snapshot-binding");
      }
      const available = await this.ensureAvailable(ref);
      if (available.status === "rejected") return available;
      slots[slot] = ref;
    }
    const created = await this.backend.createSnapshot(Object.freeze(slots));
    return created.status === "rejected" ? created : resourceAccepted(Object.freeze({
      snapshotId: created.value.snapshotId,
      slots: created.value.slots,
      revisions: created.value.revisions,
      filesBySlot: created.value.filesBySlot,
    }));
  }

  async acquireSnapshot(
    snapshotId: ResourceSnapshotId,
  ): Promise<ResourceResult<ResourceConsumerLease>> {
    const opened = await this.backend.openSnapshot(snapshotId);
    if (opened.status === "rejected") return opened;
    return resourceAccepted(new ManagedResourceConsumerLease(
      opened.value.snapshotId,
      opened.value.slots,
      opened.value.revisions,
      opened.value.filesBySlot,
      this.backend,
      this.objectUrls,
    ));
  }

  async verify(ref: ResourceRef): Promise<ResourceResult<ResourceDescriptor>> {
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
    readonly revisions: Readonly<Record<string, string>>,
    private readonly filesBySlot: Readonly<Record<string, readonly ResourceFileRecord[]>>,
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
  files: readonly BuiltinResourceRegistrationFile[],
): Promise<ResourceResult<{
  readonly records: readonly ResourceFileRecord[];
  readonly filesByPath: ReadonlyMap<string, ManagedBuiltinFile>;
}>> {
  const records: ResourceFileRecord[] = [];
  const filesByPath = new Map<string, ManagedBuiltinFile>();
  for (const file of files) {
    if (
      typeof file.logicalPath !== "string" || file.logicalPath.length === 0 ||
      file.logicalPath.includes("\\") || file.logicalPath.split("/").some((part) => part.length === 0 || part === "." || part === "..") ||
      filesByPath.has(file.logicalPath) || typeof file.mediaType !== "string" || file.mediaType.trim().length === 0 ||
      (file.bytes === undefined && (file.integrity === undefined || file.loadBytes === undefined))
    ) {
      return invalid("resources.manager.invalid-builtin-file");
    }
    let integrity = file.integrity;
    if (file.bytes !== undefined) {
      const observed = await observeResourceIntegrity(file.bytes);
      if (observed.status === "rejected") return observed;
      if (integrity !== undefined && (
        integrity.byteLength !== observed.value.byteLength || integrity.sha256 !== observed.value.sha256
      )) return integrityFailure("resources.manager.builtin-registration-integrity");
      integrity = observed.value;
    }
    if (integrity === undefined) return invalid("resources.manager.builtin-integrity-missing");
    const record = Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType.trim().toLowerCase(),
      integrity,
    });
    records.push(record);
    filesByPath.set(file.logicalPath, new ManagedBuiltinFile(
      record,
      file.bytes === undefined ? null : Uint8Array.from(file.bytes),
      file.loadBytes ?? null,
    ));
  }
  return records.length === 0
    ? invalid("resources.manager.empty-builtin-files")
    : resourceAccepted(Object.freeze({ records: Object.freeze(records), filesByPath }));
}

class ManagedBuiltinFile {
  private bytes: Uint8Array | null;
  private pending: Promise<ResourceResult<Uint8Array>> | null = null;

  constructor(
    private readonly record: ResourceFileRecord,
    initialBytes: Uint8Array | null,
    private readonly loadBytes: (() => Promise<Uint8Array>) | null,
  ) {
    this.bytes = initialBytes;
  }

  async read(): Promise<ResourceResult<Uint8Array>> {
    if (this.bytes !== null) return resourceAccepted(Uint8Array.from(this.bytes));
    if (this.loadBytes === null) return integrityFailure("resources.manager.builtin-loader-missing");
    this.pending ??= this.loadAndVerify();
    const loaded = await this.pending;
    if (loaded.status === "accepted") this.bytes = Uint8Array.from(loaded.value);
    else this.pending = null;
    return loaded.status === "rejected" ? loaded : resourceAccepted(Uint8Array.from(loaded.value));
  }

  private async loadAndVerify(): Promise<ResourceResult<Uint8Array>> {
    let bytes: Uint8Array;
    try {
      bytes = await this.loadBytes!();
    } catch {
      return resourceRejected(
        "resource-unavailable",
        "resources.manager.builtin-load-failed",
        "The selected builtin resource could not be read from the application payload.",
      );
    }
    const observed = await observeResourceIntegrity(bytes);
    if (observed.status === "rejected") return observed;
    return observed.value.byteLength === this.record.integrity.byteLength &&
      observed.value.sha256 === this.record.integrity.sha256
      ? resourceAccepted(Uint8Array.from(bytes))
      : integrityFailure("resources.manager.builtin-load-integrity");
  }
}

function validateChartMediaImport(
  input: ImportUserMediaRequest,
): ResourceResult<ImportUserMediaRequest> {
  const expectedMediaPrefix = input.purpose === "bgm"
    ? "audio/"
    : input.purpose === "mv"
      ? "video/"
      : "image/";
  if (
    !(["bgm", "cover", "mv", "stage-backdrop"] as readonly string[]).includes(input.purpose) ||
    typeof input.fileName !== "string" || input.fileName.trim().length === 0 ||
    typeof input.mediaType !== "string" || !input.mediaType.toLowerCase().startsWith(expectedMediaPrefix) ||
    !(input.bytes instanceof Uint8Array) || input.bytes.byteLength <= 0 ||
    !hasCompatibleUserMediaMagic(input.purpose, input.mediaType, input.bytes)
  ) return invalid("resources.manager.invalid-user-media-bytes");
  return resourceAccepted(Object.freeze({
    purpose: input.purpose,
    fileName: input.fileName,
    mediaType: input.mediaType,
    bytes: Uint8Array.from(input.bytes),
  }));
}

function hasCompatibleUserMediaMagic(
  purpose: UserMediaPurpose,
  mediaType: string,
  bytes: Uint8Array,
): boolean {
  const type = mediaType.toLowerCase();
  if (purpose === "cover" || purpose === "stage-backdrop") {
    if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    if (type === "image/jpeg" || type === "image/jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
    if (type === "image/webp") return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
    if (type === "image/gif") return ascii(bytes, 0, "GIF8");
    return false;
  }
  if (purpose === "bgm") {
    if (type === "audio/mpeg" || type === "audio/mp3") return ascii(bytes, 0, "ID3") || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    if (type === "audio/wav" || type === "audio/x-wav") return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE");
    if (type === "audio/ogg") return ascii(bytes, 0, "OggS");
    return false;
  }
  if (type === "video/mp4") return bytes.length >= 12 && ascii(bytes, 4, "ftyp");
  if (type === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
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

function builtinPlacementFor(resourceId: string): ResourceLogicalPlacement {
  const tail = resourceId.slice("builtin/".length);
  return Object.freeze({
    provider: "application",
    server: null,
    canonicalPath: tail.startsWith("game/") ? tail : `application/${tail}`,
    identityClass: "application-builtin" as const,
  });
}

function safeSemanticSlot(value: string): boolean {
  return value.length > 0 && value.length <= 512 && /^[A-Za-z0-9._:/-]+$/.test(value) && !value.includes("//");
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
