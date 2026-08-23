import type {
  ParticleDecodedResourceMetadata,
  ParticleOperationResult,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
} from "../particleContracts";
import { particleAccepted, particleRejected } from "../particleValidation";
import { sha256UpperHex } from "./sha256";

export interface LocalParticleResource {
  readonly logicalAssetId: string;
  readonly bytes: Uint8Array;
}

export class ImmutableLocalParticleResourceProvider implements ParticleResourceProvider {
  private readonly resources: ReadonlyMap<string, Uint8Array>;

  private constructor(resources: ReadonlyMap<string, Uint8Array>) {
    this.resources = resources;
  }

  static create(
    resources: readonly LocalParticleResource[],
  ): ParticleOperationResult<ImmutableLocalParticleResourceProvider> {
    if (!Array.isArray(resources) || resources.length === 0) {
      return reject("particle.resources.empty-local-provider", "A local particle provider requires a non-empty explicit inventory.");
    }
    const copied = new Map<string, Uint8Array>();
    for (const resource of resources) {
      if (resource === null || typeof resource !== "object" || typeof resource.logicalAssetId !== "string" ||
        resource.logicalAssetId.length === 0 || copied.has(resource.logicalAssetId) ||
        !(resource.bytes instanceof Uint8Array) || resource.bytes.byteLength === 0) {
        return reject("particle.resources.invalid-local-resource", "Every local particle resource requires one unique ID and non-empty copied bytes.");
      }
      copied.set(resource.logicalAssetId, Uint8Array.from(resource.bytes));
    }
    return particleAccepted(new ImmutableLocalParticleResourceProvider(copied));
  }

  async read(logicalAssetId: string): Promise<ParticleOperationResult<Uint8Array>> {
    const bytes = this.resources.get(logicalAssetId);
    return bytes === undefined
      ? particleRejected(
          "particle-resource-unavailable",
          "particle.resources.missing-local-resource",
          "Unknown particle resources never resolve through URLs, aliases or generated defaults.",
        )
      : particleAccepted(Uint8Array.from(bytes));
  }
}

export class PortableParticleResourcePreflightAdapter implements ParticleResourcePreflightAdapter {
  async sha256(bytes: Uint8Array): Promise<ParticleOperationResult<string>> {
    return !(bytes instanceof Uint8Array) || bytes.byteLength === 0
      ? reject("particle.resources.invalid-hash-input", "SHA-256 accepts only non-empty particle bytes.")
      : particleAccepted(sha256UpperHex(bytes));
  }

  async inspectPng(bytes: Uint8Array): Promise<ParticleOperationResult<ParticleDecodedResourceMetadata>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24) {
      return decodeReject("particle.resources.invalid-png-header", "PNG resources require a complete signature and IHDR.");
    }
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (signature.some((value, index) => bytes[index] !== value) || readUint32(bytes, 8) !== 13 ||
      bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
      return decodeReject("particle.resources.invalid-png-header", "The first PNG chunk must be the exact 13-byte IHDR.");
    }
    const width = readUint32(bytes, 16);
    const height = readUint32(bytes, 20);
    return width === 0 || height === 0
      ? decodeReject("particle.resources.invalid-png-dimensions", "PNG dimensions must both be positive.")
      : particleAccepted(Object.freeze({ width, height }));
  }
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
  return particleRejected("integrity-failure", capability, boundary);
}

function decodeReject(capability: string, boundary: string) {
  return particleRejected("particle-resource-decode", capability, boundary);
}
