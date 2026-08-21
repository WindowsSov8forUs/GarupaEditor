import { invoke } from "@tauri-apps/api/core";
import type {
  ApplicationResourceBackend,
  BuiltinResourceInstallInput,
  OpenedResourceSnapshot,
  ResourceInstallInput,
  StoredResourceRecord,
  UserMediaImportInput,
} from "../backend";
import {
  resourceAccepted,
  resourceRejected,
  type ResourceCatalogSnapshot,
  type ResourceDescriptor,
  type ResourceRef,
  type ResourceResult,
  type ResourceSnapshotId,
} from "../contracts";

interface TauriOpenedSnapshot {
  readonly snapshotId: string;
  readonly slots: Readonly<Record<string, ResourceRef>>;
  readonly revisions: Readonly<Record<string, string>>;
  readonly filesBySlot: OpenedResourceSnapshot["filesBySlot"];
}

export class TauriApplicationResourceBackend implements ApplicationResourceBackend {
  async initialize(): Promise<ResourceResult<readonly StoredResourceRecord[]>> {
    return invokeResult("resource_initialize");
  }

  async listRecords(): Promise<ResourceResult<readonly StoredResourceRecord[]>> {
    return invokeResult("resource_list_records");
  }

  async readRecord(ref: ResourceRef): Promise<ResourceResult<StoredResourceRecord>> {
    return invokeResult("resource_read_record", { reference: ref });
  }

  async installBuiltinResource(input: BuiltinResourceInstallInput): Promise<ResourceResult<StoredResourceRecord>> {
    return invokeResult("resource_install_builtin_package", {
      input: {
        descriptor: input.descriptor,
        files: input.files.map((file) => ({
          logicalPath: file.logicalPath,
          mediaType: file.mediaType,
          base64Data: encodeBase64(file.bytes),
        })),
      },
    });
  }

  async installNetworkResource(input: ResourceInstallInput): Promise<ResourceResult<StoredResourceRecord>> {
    return invokeResult("resource_install_network_package", {
      input: {
        descriptor: input.descriptor,
        files: input.files.map((file) => ({
          logicalPath: file.logicalPath,
          mediaType: file.mediaType,
          base64Data: encodeBase64(file.bytes),
        })),
      },
    });
  }

  async importUserMedia(input: UserMediaImportInput): Promise<ResourceResult<StoredResourceRecord>> {
    const begun = await invokeResult<string>("resource_begin_user_media_import", {
      input: {
        purpose: input.purpose,
        fileName: input.fileName,
        mediaType: input.mediaType,
      },
    });
    if (begun.status === "rejected") return begun;
    const transactionId = begun.value;
    try {
      const chunkSize = 512 * 1024;
      for (let offset = 0; offset < input.bytes.byteLength; offset += chunkSize) {
        const appended = await invokeResult<void>("resource_append_user_media_chunk", {
          transactionId,
          chunkBase64: encodeBase64(input.bytes.subarray(offset, Math.min(input.bytes.byteLength, offset + chunkSize))),
        });
        if (appended.status === "rejected") return appended;
      }
      return await invokeResult("resource_commit_user_media_import", { transactionId });
    } finally {
      await invokeResult<void>("resource_abort_user_media_import", { transactionId });
    }
  }

  async loadCatalogSnapshot(provider: string): Promise<ResourceResult<ResourceCatalogSnapshot | null>> {
    return invokeResult("resource_load_catalog_snapshot", { provider });
  }

  async commitCatalogSnapshot(snapshot: ResourceCatalogSnapshot): Promise<ResourceResult<void>> {
    return invokeResult("resource_commit_catalog_snapshot", {
      provider: snapshot.provider,
      snapshot,
    });
  }

  async createSnapshot(
    slots: Readonly<Record<string, ResourceRef>>,
  ): Promise<ResourceResult<OpenedResourceSnapshot>> {
    const result = await invokeResult<TauriOpenedSnapshot>("resource_create_snapshot", { slots });
    return mapSnapshot(result);
  }

  async openSnapshot(snapshotId: ResourceSnapshotId): Promise<ResourceResult<OpenedResourceSnapshot>> {
    const result = await invokeResult<TauriOpenedSnapshot>("resource_open_snapshot", { snapshotId });
    return mapSnapshot(result);
  }

  async readSnapshotFile(
    snapshotId: ResourceSnapshotId,
    slot: string,
    logicalPath: string,
  ): Promise<ResourceResult<Uint8Array>> {
    const result = await invokeResult<string>("resource_read_snapshot_file", {
      snapshotId,
      slot,
      logicalPath,
    });
    if (result.status === "rejected") return result;
    try {
      return resourceAccepted(decodeBase64(result.value));
    } catch {
      return resourceRejected(
        "resource-integrity",
        "resources.tauri.invalid-binary-response",
        "The Tauri resource backend returned malformed binary transport data.",
      );
    }
  }

  async releaseSnapshot(snapshotId: ResourceSnapshotId): Promise<ResourceResult<void>> {
    return invokeResult("resource_release_snapshot", { snapshotId });
  }

  async verify(ref: ResourceRef): Promise<ResourceResult<ResourceDescriptor>> {
    return invokeResult("resource_verify", { reference: ref });
  }

  async remove(ref: ResourceRef): Promise<ResourceResult<void>> {
    return invokeResult("resource_remove", { reference: ref });
  }

  async collectGarbage(): Promise<ResourceResult<void>> {
    return invokeResult("resource_collect_garbage");
  }
}

async function invokeResult<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<ResourceResult<T>> {
  try {
    return resourceAccepted(await invoke<T>(command, args));
  } catch (error) {
    return resourceRejected(
      "resource-platform-unavailable",
      `resources.tauri.${command.split("_").join("-")}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function mapSnapshot(
  result: ResourceResult<TauriOpenedSnapshot>,
): ResourceResult<OpenedResourceSnapshot> {
  return result.status === "rejected"
    ? result
    : resourceAccepted(Object.freeze({
        snapshotId: result.value.snapshotId as ResourceSnapshotId,
        slots: result.value.slots,
        revisions: result.value.revisions,
        filesBySlot: result.value.filesBySlot,
      }));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
