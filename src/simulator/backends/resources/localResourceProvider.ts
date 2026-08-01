import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../../engine/evidence";
import type {
  RenderDecodedResourceMetadata,
  RenderResourceAssetProfile,
  RenderResourcePreflightAdapter,
  SimulatorResourceProvider,
} from "../renderingContracts";
import { sha256UpperHex } from "./sha256";

export interface LocalRenderResource {
  readonly logicalAssetId: string;
  readonly bytes: Uint8Array;
}

export class ImmutableLocalRenderResourceProvider implements SimulatorResourceProvider {
  private readonly resources: ReadonlyMap<string, Uint8Array>;

  private constructor(resources: ReadonlyMap<string, Uint8Array>) {
    this.resources = resources;
  }

  static create(
    resources: readonly LocalRenderResource[],
  ): SimulatorResult<ImmutableLocalRenderResourceProvider> {
    if (!Array.isArray(resources) || resources.length === 0) {
      return reject(
        "render.resources.empty-local-provider",
        "A local provider requires a non-empty explicit resource inventory.",
      );
    }
    const copied = new Map<string, Uint8Array>();
    for (const resource of resources) {
      if (
        resource === null ||
        typeof resource !== "object" ||
        typeof resource.logicalAssetId !== "string" ||
        resource.logicalAssetId.length === 0 ||
        copied.has(resource.logicalAssetId) ||
        !(resource.bytes instanceof Uint8Array) ||
        resource.bytes.byteLength === 0
      ) {
        return reject(
          "render.resources.invalid-or-duplicate-local-resource",
          "Every local resource requires one unique logical ID and non-empty Uint8Array bytes.",
        );
      }
      copied.set(resource.logicalAssetId, Uint8Array.from(resource.bytes));
    }
    return ok(new ImmutableLocalRenderResourceProvider(copied));
  }

  async read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>> {
    const bytes = this.resources.get(logicalAssetId);
    return bytes === undefined
      ? reject(
          "render.resources.missing-local-resource",
          "The provider never resolves URLs or aliases for an unknown logical resource ID.",
        )
      : ok(Uint8Array.from(bytes));
  }
}

export class PortableRenderResourcePreflightAdapter implements RenderResourcePreflightAdapter {
  async sha256(bytes: Uint8Array): Promise<SimulatorResult<string>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return reject(
        "render.resources.invalid-hash-input",
        "SHA-256 accepts only non-empty local bytes.",
      );
    }
    return ok(sha256UpperHex(bytes));
  }

  async inspect(
    bytes: Uint8Array,
    mime: RenderResourceAssetProfile["mime"],
  ): Promise<SimulatorResult<RenderDecodedResourceMetadata | null>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return reject(
        "render.resources.invalid-inspection-input",
        "Resource inspection accepts only non-empty local bytes.",
      );
    }
    if (mime === "image/png") return inspectPng(bytes);
    if (mime === "font/ttf" || mime === "application/octet-stream") return ok(null);
    return reject(
      "render.resources.unsupported-mime",
      "Unknown MIME values cannot inherit a decoder default.",
    );
  }
}

function inspectPng(
  bytes: Uint8Array,
): SimulatorResult<RenderDecodedResourceMetadata> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 24 ||
    signature.some((value, index) => bytes[index] !== value) ||
    readUint32(bytes, 8) !== 13 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return reject(
      "render.resources.invalid-png-header",
      "PNG resources require the exact signature and a first 13-byte IHDR chunk.",
    );
  }
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  if (width <= 0 || height <= 0) {
    return reject(
      "render.resources.invalid-png-dimensions",
      "PNG IHDR width and height must both be positive.",
    );
  }
  return ok(Object.freeze({ width, height }));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  ) >>> 0;
}

function reject(capability: string, boundary: string) {
  return evidenceRequired(
    capability,
    ["RPR-D02", "RPR-D14", "RPR-D17", "PR01", "PR05", "PR35"],
    boundary,
  );
}
