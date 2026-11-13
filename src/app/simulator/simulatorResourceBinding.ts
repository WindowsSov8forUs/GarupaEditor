import { originalSkinResourceRef } from "../../resources/originalSkinResourceRef";
import { simulatorBuiltinResourceRef } from "../../resources/builtin/simulatorBuiltinResourceCatalog";
import type { ResourceRef } from "../../resources/contracts";

/** Snapshot slot that carries one Simulator logical resource from the main program to the Simulator. */
export function simulatorResourceSlot(logicalResource: string): string {
  return `simulator.resource:${logicalResource}`;
}

/**
 * The main program's source for one Simulator logical resource: the builtin copy when one is registered, otherwise
 * the original Skin or sound package on the server its catalog row names. Other logical families have no source.
 */
export function simulatorResourceRef(logicalResource: string): ResourceRef {
  const builtin = simulatorBuiltinResourceRef(logicalResource);
  if (builtin.status === "accepted") return builtin.value;
  if (!logicalResource.startsWith("ingameskin/") && !logicalResource.startsWith("sound/")) {
    throw new Error(`simulator.resources.application-logical-source-unmapped: ${logicalResource}`);
  }
  const network = originalSkinResourceRef(logicalResource);
  if (network.status === "rejected") throw new Error(`${network.failure.capability}: ${network.failure.boundary}`);
  return network.value;
}
