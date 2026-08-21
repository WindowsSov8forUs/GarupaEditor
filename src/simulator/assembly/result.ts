import type { SimulatorModuleFailure } from "../public/contracts";

export type SimulatorAssemblyResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export function assemblyAccepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

export function rejected<T>(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorAssemblyResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}
