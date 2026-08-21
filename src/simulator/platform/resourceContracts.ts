export interface SimulatorResourceRequirement {
  readonly semanticRole: string;
  readonly logicalResource: string;
  readonly requiredFiles: readonly string[] | null;
}

export interface SimulatorResourceFile {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface SimulatorResourceLease {
  listFiles(logicalResource: string): readonly SimulatorResourceFile[];
  readBytes(logicalResource: string, logicalPath: string): Promise<Uint8Array>;
  release(): Promise<void>;
}

export interface SimulatorResourceCapability {
  acquire(
    requirements: readonly SimulatorResourceRequirement[],
  ): Promise<SimulatorResourceResult<SimulatorResourceLease>>;
}

export interface SimulatorResourceFailure {
  readonly code:
    | "invalid-resource-id"
    | "invalid-resource-request"
    | "catalog-unavailable"
    | "resource-unavailable"
    | "resource-not-installed"
    | "resource-integrity"
    | "resource-transaction-failed"
    | "resource-platform-unavailable"
    | "resource-lease-closed";
  readonly capability: string;
  readonly boundary: string;
}

export type SimulatorResourceResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: SimulatorResourceFailure };

export function validateSimulatorResourceRequirements(
  value: readonly SimulatorResourceRequirement[],
): SimulatorResourceResult<readonly SimulatorResourceRequirement[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return simulatorResourceRejected(
      "invalid-resource-request",
      "simulator.resources.requirements.empty",
      "Simulator resource acquisition requires one non-empty complete requirement set.",
    );
  }
  const roles = new Set<string>();
  const resources = new Map<string, readonly string[] | null>();
  const output: SimulatorResourceRequirement[] = [];
  for (const requirement of value) {
    if (
      requirement === null || typeof requirement !== "object" || Array.isArray(requirement) ||
      Object.keys(requirement).sort().join(",") !== "logicalResource,requiredFiles,semanticRole" ||
      !safeIdentity(requirement.semanticRole) || !safeLogicalPath(requirement.logicalResource) ||
      roles.has(requirement.semanticRole)
    ) return invalidRequirements();
    roles.add(requirement.semanticRole);
    let requiredFiles: readonly string[] | null = null;
    if (requirement.requiredFiles !== null) {
      if (!Array.isArray(requirement.requiredFiles) || requirement.requiredFiles.length === 0) return invalidRequirements();
      const seen = new Set<string>();
      const files: string[] = [];
      for (const file of requirement.requiredFiles) {
        const key = typeof file === "string" ? file.toLocaleLowerCase("en-US") : "";
        if (!safeLogicalPath(file) || seen.has(key)) return invalidRequirements();
        seen.add(key);
        files.push(file);
      }
      requiredFiles = Object.freeze(files);
    }
    const existing = resources.get(requirement.logicalResource);
    if (existing !== undefined && !sameRequiredFiles(existing, requiredFiles)) return invalidRequirements();
    resources.set(requirement.logicalResource, requiredFiles);
    output.push(Object.freeze({
      semanticRole: requirement.semanticRole,
      logicalResource: requirement.logicalResource,
      requiredFiles,
    }));
  }
  return simulatorResourceAccepted(Object.freeze(output));
}

export function simulatorResourceAccepted<T>(value: T): SimulatorResourceResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

export function simulatorResourceRejected<T>(
  code: SimulatorResourceFailure["code"],
  capability: string,
  boundary: string,
): SimulatorResourceResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}

function invalidRequirements<T>(): SimulatorResourceResult<T> {
  return simulatorResourceRejected(
    "invalid-resource-request",
    "simulator.resources.requirements.invalid",
    "Resource requirements require exact shape, unique semantic roles, one safe logical resource and an optional non-empty unique exact file list; conflicting duplicate resources cannot be repaired.",
  );
}

function safeIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    /^[A-Za-z0-9._:/-]+$/.test(value) && !value.includes("//");
}

function safeLogicalPath(value: unknown): value is string {
  if (typeof value !== "string" || !safeIdentity(value) || value.startsWith("/") || value.normalize("NFC") !== value) return false;
  const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  return value.split("/").every((part) =>
    part !== "." && part !== ".." && !part.endsWith(".") && !part.endsWith(" ") && !reserved.test(part));
}

function sameRequiredFiles(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
