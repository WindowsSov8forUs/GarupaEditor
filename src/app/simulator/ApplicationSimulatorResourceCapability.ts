import type { ApplicationResourceManager } from "../../resources/applicationResourceManager";
import type {
  ResourceConsumerLease,
  ResourceRef,
  ResourceResult,
} from "../../resources/contracts";
import {
  simulatorResourceAccepted,
  simulatorResourceRejected,
  validateSimulatorResourceRequirements,
  type SimulatorResourceCapability,
  type SimulatorResourceFile,
  type SimulatorResourceLease,
  type SimulatorResourceRequirement,
  type SimulatorResourceResult,
} from "../../simulator/platform/resourceContracts";

export class ApplicationSimulatorResourceCapability implements SimulatorResourceCapability {
  constructor(
    private readonly manager: ApplicationResourceManager,
    private readonly refsByLogicalResource: Readonly<Record<string, ResourceRef>>,
  ) {}

  async acquire(
    requirements: readonly SimulatorResourceRequirement[],
  ): Promise<SimulatorResourceResult<SimulatorResourceLease>> {
    const validated = validateSimulatorResourceRequirements(requirements);
    if (validated.status === "rejected") return validated;
    const uniqueResources: string[] = [];
    const seen = new Set<string>();
    for (const requirement of validated.value) {
      if (!seen.has(requirement.logicalResource)) {
        seen.add(requirement.logicalResource);
        uniqueResources.push(requirement.logicalResource);
      }
    }
    const bindings: Record<string, ResourceRef> = {};
    const slotsByLogicalResource = new Map<string, string>();
    for (let index = 0; index < uniqueResources.length; index += 1) {
      const logicalResource = uniqueResources[index]!;
      const ref = this.refsByLogicalResource[logicalResource];
      if (ref === undefined) {
        return simulatorResourceRejected(
          "resource-unavailable",
          "simulator.resources.application-binding-missing",
          `The main program did not bind required logical resource ${logicalResource}; no provider, default or alias is inferred by the consumer adapter.`,
        );
      }
      const slot = `simulator.resource.${index}`;
      bindings[slot] = ref;
      slotsByLogicalResource.set(logicalResource, slot);
    }
    const receipt = await this.manager.createSnapshotFromRefs(Object.freeze(bindings));
    if (receipt.status === "rejected") return fromApplicationFailure(receipt);
    const acquired = await this.manager.acquireSnapshot(receipt.value.snapshotId);
    if (acquired.status === "rejected") return fromApplicationFailure(acquired);
    const required = validateLeaseFiles(validated.value, slotsByLogicalResource, acquired.value);
    if (required.status === "rejected") {
      await acquired.value.release();
      return required;
    }
    return simulatorResourceAccepted(new ApplicationSimulatorResourceLease(
      acquired.value,
      slotsByLogicalResource,
    ));
  }
}

class ApplicationSimulatorResourceLease implements SimulatorResourceLease {
  private released = false;

  constructor(
    private readonly lease: ResourceConsumerLease,
    private readonly slotsByLogicalResource: ReadonlyMap<string, string>,
  ) {}

  listFiles(logicalResource: string): readonly SimulatorResourceFile[] {
    if (this.released) return Object.freeze([]);
    const slot = this.slotsByLogicalResource.get(logicalResource);
    if (slot === undefined) return Object.freeze([]);
    return Object.freeze(this.lease.listFiles(slot).map((file) => Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType,
      byteLength: file.integrity.byteLength,
    })));
  }

  async readBytes(logicalResource: string, logicalPath: string): Promise<Uint8Array> {
    if (this.released) throw new Error("Simulator application resource lease is closed");
    const slot = this.slotsByLogicalResource.get(logicalResource);
    if (slot === undefined) throw new Error(`Simulator logical resource is not leased: ${logicalResource}`);
    return this.lease.readBytes(slot, logicalPath);
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.lease.release();
  }
}

function validateLeaseFiles(
  requirements: readonly SimulatorResourceRequirement[],
  slots: ReadonlyMap<string, string>,
  lease: ResourceConsumerLease,
): SimulatorResourceResult<void> {
  for (const requirement of requirements) {
    if (requirement.requiredFiles === null) continue;
    const slot = slots.get(requirement.logicalResource);
    if (slot === undefined) {
      return simulatorResourceRejected(
        "resource-unavailable",
        "simulator.resources.application-slot-missing",
        "The acquired application snapshot omitted one required logical resource slot.",
      );
    }
    const files = new Set(lease.listFiles(slot).map((file) => file.logicalPath));
    for (const required of requirement.requiredFiles) {
      if (!files.has(required)) {
        return simulatorResourceRejected(
          "resource-unavailable",
          "simulator.resources.application-required-file-missing",
          `Logical resource ${requirement.logicalResource} does not contain exact required file ${required}; aliases and nearest-name matching are forbidden.`,
        );
      }
    }
  }
  return simulatorResourceAccepted(undefined);
}

function fromApplicationFailure<T>(failure: Extract<ResourceResult<unknown>, { status: "rejected" }>): SimulatorResourceResult<T> {
  return simulatorResourceRejected(
    failure.failure.code,
    failure.failure.capability,
    failure.failure.boundary,
  );
}
