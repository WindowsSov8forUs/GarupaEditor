import type {
  ParticleDecodedResourceMetadata,
  ParticleOperationResult,
  ParticleResourcePreflightAdapter,
} from "../particleContracts";
import { particleAccepted, particleRejected } from "../particleValidation";
import { sha256UpperHexAsync } from "./sha256";

export class PortableParticleResourcePreflightAdapter implements ParticleResourcePreflightAdapter {
  async sha256(bytes: Uint8Array): Promise<ParticleOperationResult<string>> {
    return !(bytes instanceof Uint8Array) || bytes.byteLength === 0
      ? reject("particle.resources.invalid-hash-input", "SHA-256 accepts only non-empty particle bytes.")
      : particleAccepted(await sha256UpperHexAsync(bytes));
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
