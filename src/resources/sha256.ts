import {
  resourceAccepted,
  resourceRejected,
  type ObservedIntegrity,
  type ResourceResult,
} from "./contracts";

export async function observeResourceIntegrity(
  bytes: Uint8Array,
): Promise<ResourceResult<ObservedIntegrity>> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    return resourceRejected(
      "resource-integrity",
      "resources.integrity.empty-bytes",
      "Resource integrity can only be observed from non-empty owned bytes.",
    );
  }
  if (typeof crypto !== "object" || crypto === null || crypto.subtle == null) {
    return resourceRejected(
      "resource-platform-unavailable",
      "resources.integrity.webcrypto-unavailable",
      "SHA-256 observation requires WebCrypto and never substitutes a weaker digest.",
    );
  }
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    return resourceAccepted(Object.freeze({
      byteLength: bytes.byteLength,
      sha256: Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0")).join("").toUpperCase(),
    }));
  } catch {
    return resourceRejected(
      "resource-platform-unavailable",
      "resources.integrity.sha256-failed",
      "WebCrypto failed to derive observed SHA-256 for the exact resource bytes.",
    );
  }
}
