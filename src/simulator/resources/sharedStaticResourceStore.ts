export interface SharedStaticResourceFailure {
  readonly code: "resource-unavailable" | "resource-store-fault";
  readonly capability: string;
  readonly boundary: string;
}

export type SharedStaticResourceResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: SharedStaticResourceFailure };

export interface SharedStaticResourceStore {
  read(resourceKey: string): Promise<SharedStaticResourceResult<Uint8Array>>;
}

export interface SharedStaticResourceEntry {
  readonly resourceKey: string;
  readonly bytes: Uint8Array;
}

export class ImmutableSharedStaticResourceStore implements SharedStaticResourceStore {
  private constructor(private readonly bytesByKey: ReadonlyMap<string, Uint8Array>) {}

  static create(
    entries: readonly SharedStaticResourceEntry[],
  ): SharedStaticResourceResult<ImmutableSharedStaticResourceStore> {
    if (!Array.isArray(entries)) {
      return rejected(
        "simulator.resources.store.invalid-inventory",
        "The shared static resource inventory must be one explicit array.",
      );
    }
    const bytesByKey = new Map<string, Uint8Array>();
    for (const entry of entries) {
      if (
        entry === null || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== "bytes,resourceKey" ||
        typeof entry.resourceKey !== "string" || entry.resourceKey.length === 0 ||
        bytesByKey.has(entry.resourceKey) || !(entry.bytes instanceof Uint8Array) ||
        entry.bytes.byteLength === 0
      ) {
        return rejected(
          "simulator.resources.store.invalid-or-duplicate-entry",
          "Every shared static resource requires one unique non-empty key and copied non-empty bytes.",
        );
      }
      bytesByKey.set(entry.resourceKey, Uint8Array.from(entry.bytes));
    }
    return accepted(new ImmutableSharedStaticResourceStore(bytesByKey));
  }

  async read(resourceKey: string): Promise<SharedStaticResourceResult<Uint8Array>> {
    if (typeof resourceKey !== "string" || resourceKey.length === 0) {
      return rejected(
        "simulator.resources.store.invalid-read-key",
        "Shared static resource reads require one exact non-empty simulator-selected key.",
      );
    }
    const bytes = this.bytesByKey.get(resourceKey);
    return bytes === undefined
      ? rejected(
          "simulator.resources.store.resource-unavailable",
          "The exact simulator-selected static resource is unavailable; aliases, URLs and fallback are not consulted.",
        )
      : accepted(Uint8Array.from(bytes));
  }
}

export function sharedStaticResourceAccepted<T>(
  value: T,
): SharedStaticResourceResult<T> {
  return accepted(value);
}

export function sharedStaticResourceRejected<T>(
  code: SharedStaticResourceFailure["code"],
  capability: string,
  boundary: string,
): SharedStaticResourceResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}

function accepted<T>(value: T): SharedStaticResourceResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

function rejected<T>(
  capability: string,
  boundary: string,
): SharedStaticResourceResult<T> {
  return sharedStaticResourceRejected(
    capability.endsWith("resource-unavailable")
      ? "resource-unavailable"
      : "resource-store-fault",
    capability,
    boundary,
  );
}
