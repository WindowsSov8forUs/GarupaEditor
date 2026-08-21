import type { ApplicationResourceManager } from "../../resources/applicationResourceManager";
import { simulatorBuiltinResourceRef } from "../../resources/builtin/simulatorBuiltinResourceCatalog";
import { createResourceRef, type ResourceRef } from "../../resources/contracts";
import {
  simulatorResourceRejected,
  type SimulatorResourceCapability,
  type SimulatorResourceLease,
  type SimulatorResourceRequirement,
  type SimulatorResourceResult,
} from "../../simulator/platform/resourceContracts";
import { ApplicationSimulatorResourceCapability } from "./ApplicationSimulatorResourceCapability";

export function createSimulatorResourceCapability(
  manager: ApplicationResourceManager,
  server = "jp",
): SimulatorResourceCapability {
  return Object.freeze({
    async acquire(requirements: readonly SimulatorResourceRequirement[]): Promise<SimulatorResourceResult<SimulatorResourceLease>> {
      const bindings: Record<string, ResourceRef> = {};
      for (const requirement of requirements) {
        if (bindings[requirement.logicalResource] !== undefined) continue;
        const builtin = simulatorBuiltinResourceRef(requirement.logicalResource);
        if (builtin.status === "accepted") {
          bindings[requirement.logicalResource] = builtin.value;
          continue;
        }
        if (!requirement.logicalResource.startsWith("ingameskin/") && !requirement.logicalResource.startsWith("sound/")) {
          return simulatorResourceRejected<SimulatorResourceLease>(
            "resource-unavailable",
            "simulator.resources.application-logical-source-unmapped",
            `Main-program resource policy has no explicit source binding for ${requirement.logicalResource}.`,
          );
        }
        const network = createResourceRef(`bestdori/${server}/${requirement.logicalResource}`);
        if (network.status === "rejected") {
          return simulatorResourceRejected<SimulatorResourceLease>(network.failure.code, network.failure.capability, network.failure.boundary);
        }
        bindings[requirement.logicalResource] = network.value;
      }
      return new ApplicationSimulatorResourceCapability(manager, Object.freeze(bindings)).acquire(requirements);
    },
  });
}
