import type {
  SimulatorResourceFile,
  SimulatorResourceLease,
  SimulatorResourceResult,
} from "../platform/resourceContracts";
import {
  simulatorResourceAccepted,
  simulatorResourceRejected,
} from "../platform/resourceContracts";
import { sha256UpperHex } from "../backends/resources/sha256";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const REVISION_PATTERN = /^[A-Za-z0-9._:/-]{1,512}$/;

export class OriginalResourcePackageView {
  private constructor(
    readonly logicalResource: string,
    readonly revision: string,
    readonly files: readonly SimulatorResourceFile[],
    private readonly bytesByPath: ReadonlyMap<string, Uint8Array>,
    private readonly pathByBasename: ReadonlyMap<string, string>,
  ) {}

  static async open(
    lease: SimulatorResourceLease,
    logicalResource: string,
  ): Promise<SimulatorResourceResult<OriginalResourcePackageView>> {
    const revision = lease.revision?.(logicalResource) ?? null;
    if (revision === null || !REVISION_PATTERN.test(revision)) {
      return reject("snapshot-revision", `Logical resource ${logicalResource} has no valid application-snapshot revision.`);
    }
    const files = lease.listFiles(logicalResource);
    if (files.length === 0) return reject("empty", `Logical resource ${logicalResource} has no leased files.`);
    const bytesByPath = new Map<string, Uint8Array>();
    const pathByBasename = new Map<string, string>();
    const foldedPaths = new Set<string>();
    for (const file of files) {
      const pathKey = file.logicalPath.toLocaleLowerCase("en-US");
      const basenameKey = basename(file.logicalPath).toLocaleLowerCase("en-US");
      if (foldedPaths.has(pathKey) || pathByBasename.has(basenameKey) ||
        typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
        return reject("ambiguous-or-unbound-file", `Logical resource ${logicalResource} contains a duplicate path, ambiguous basename, or file without one application-snapshot SHA-256.`);
      }
      foldedPaths.add(pathKey);
      pathByBasename.set(basenameKey, file.logicalPath);
      let bytes: Uint8Array;
      try {
        bytes = await lease.readBytes(logicalResource, file.logicalPath);
      } catch (error) {
        return simulatorResourceRejected(
          "resource-platform-unavailable",
          "simulator.resources.source-package-read-threw",
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength !== file.byteLength ||
        sha256UpperHex(bytes) !== file.sha256) {
        return reject("invalid-file-bytes", `Logical resource ${logicalResource}/${file.logicalPath} did not preserve its application-snapshot byte length and SHA-256.`);
      }
      bytesByPath.set(file.logicalPath, Uint8Array.from(bytes));
    }
    return simulatorResourceAccepted(new OriginalResourcePackageView(
      logicalResource,
      revision,
      Object.freeze(files.map((file) => Object.freeze({ ...file }))),
      bytesByPath,
      pathByBasename,
    ));
  }

  findBasename(name: string): string | null {
    return this.pathByBasename.get(name.toLocaleLowerCase("en-US")) ?? null;
  }

  pathsWithSuffix(suffix: string): readonly string[] {
    const normalized = suffix.toLocaleLowerCase("en-US");
    return Object.freeze(this.files
      .map((file) => file.logicalPath)
      .filter((path) => path.toLocaleLowerCase("en-US").endsWith(normalized))
      .sort());
  }

  requireFile(pathOrBasename: string): SimulatorResourceResult<SimulatorResourceFile> {
    const direct = this.files.find((file) => file.logicalPath === pathOrBasename);
    const path = direct === undefined ? this.findBasename(pathOrBasename) : pathOrBasename;
    const file = direct ?? (path === null ? undefined : this.files.find((candidate) => candidate.logicalPath === path));
    return file === undefined
      ? reject("required-file-missing", `${this.logicalResource} is missing exact file ${pathOrBasename}.`)
      : simulatorResourceAccepted(file);
  }

  requireBytes(pathOrBasename: string): SimulatorResourceResult<Uint8Array> {
    const file = this.requireFile(pathOrBasename);
    if (file.status === "rejected") return file;
    const bytes = this.bytesByPath.get(file.value.logicalPath);
    return bytes === undefined
      ? reject("required-file-bytes-missing", `${this.logicalResource} lost validated bytes for ${file.value.logicalPath}.`)
      : simulatorResourceAccepted(Uint8Array.from(bytes));
  }

  requireSingleSuffix(suffix: string): SimulatorResourceResult<Uint8Array> {
    const paths = this.pathsWithSuffix(suffix);
    return paths.length !== 1
      ? reject("single-suffix", `${this.logicalResource} requires exactly one ${suffix} file.`)
      : this.requireBytes(paths[0]!);
  }

  requireJson(pathOrBasename: string): SimulatorResourceResult<unknown> {
    const bytes = this.requireBytes(pathOrBasename);
    if (bytes.status === "rejected") return bytes;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.value);
      return simulatorResourceAccepted(JSON.parse(text));
    } catch {
      return reject("invalid-json", `${this.logicalResource}/${pathOrBasename} must be strict UTF-8 JSON.`);
    }
  }

  inspectPng(pathOrBasename: string): SimulatorResourceResult<{
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
  }> {
    const read = this.requireBytes(pathOrBasename);
    if (read.status === "rejected") return read;
    const bytes = read.value;
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      bytes.byteLength < 24 || signature.some((value, index) => bytes[index] !== value) ||
      readU32(bytes, 8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
    ) return reject("invalid-png", `${this.logicalResource}/${pathOrBasename} has no strict PNG IHDR.`);
    const width = readU32(bytes, 16);
    const height = readU32(bytes, 20);
    return width <= 0 || height <= 0
      ? reject("invalid-png-size", `${this.logicalResource}/${pathOrBasename} has invalid PNG dimensions.`)
      : simulatorResourceAccepted(Object.freeze({ bytes, width, height }));
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  ) >>> 0;
}

function reject<T>(suffix: string, boundary: string): SimulatorResourceResult<T> {
  return simulatorResourceRejected(
    "resource-integrity",
    `simulator.resources.source-package-${suffix}`,
    boundary,
  );
}
