import type { ResourceConsumerLease } from "../../resources/contracts";
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
import { simulatorResourceSlot } from "./simulatorResourceBinding";

/**
 * Simulator resources from the launch snapshot the main program prepared. Every required logical resource must
 * already be bound in it; nothing is resolved, downloaded or substituted here. The launch owner owns the snapshot
 * lease, so the leases handed to sessions are views that only stop reading when released.
 */
export class SnapshotSimulatorResourceCapability implements SimulatorResourceCapability {
  constructor(private readonly snapshot: ResourceConsumerLease) {}

  async acquire(
    requirements: readonly SimulatorResourceRequirement[],
  ): Promise<SimulatorResourceResult<SimulatorResourceLease>> {
    const validated = validateSimulatorResourceRequirements(requirements);
    if (validated.status === "rejected") return validated;
    const slotsByLogicalResource = new Map<string, string>();
    for (const requirement of validated.value) {
      const slot = simulatorResourceSlot(requirement.logicalResource);
      if (this.snapshot.slots[slot] === undefined) {
        return simulatorResourceRejected(
          "resource-unavailable",
          "simulator.resources.snapshot-binding-missing",
          `The launch snapshot does not bind required logical resource ${requirement.logicalResource}; the main program prepares every Simulator resource before launch.`,
        );
      }
      slotsByLogicalResource.set(requirement.logicalResource, slot);
      if (requirement.requiredFiles === null) continue;
      const files = new Set(this.snapshot.listFiles(slot).map((file) => file.logicalPath));
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
    return simulatorResourceAccepted(new SnapshotSimulatorResourceLease(this.snapshot, slotsByLogicalResource));
  }
}

class SnapshotSimulatorResourceLease implements SimulatorResourceLease {
  private released = false;

  constructor(
    private readonly snapshot: ResourceConsumerLease,
    private readonly slotsByLogicalResource: ReadonlyMap<string, string>,
  ) {}

  listFiles(logicalResource: string): readonly SimulatorResourceFile[] {
    if (this.released) return Object.freeze([]);
    const slot = this.slotsByLogicalResource.get(logicalResource);
    if (slot === undefined) return Object.freeze([]);
    return Object.freeze(this.snapshot.listFiles(slot).map((file) => Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType,
      byteLength: file.integrity.byteLength,
      sha256: file.integrity.sha256,
    })));
  }

  revision(logicalResource: string): string | null {
    if (this.released) return null;
    const slot = this.slotsByLogicalResource.get(logicalResource);
    return slot === undefined ? null : this.snapshot.revisions[slot] ?? null;
  }

  async readBytes(logicalResource: string, logicalPath: string): Promise<Uint8Array> {
    if (this.released) throw new Error("Simulator snapshot resource view is closed");
    const slot = this.slotsByLogicalResource.get(logicalResource);
    if (slot === undefined) throw new Error(`Simulator logical resource is not leased: ${logicalResource}`);
    return this.snapshot.readBytes(slot, logicalPath);
  }

  async release(): Promise<void> {
    this.released = true;
  }
}
