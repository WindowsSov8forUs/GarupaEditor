import type {
  SimulatorModuleCleanupFailure,
  SimulatorModuleFailure,
} from "./contracts";

export function appendSimulatorCleanupFailures(
  primary: SimulatorModuleFailure,
  failures: readonly (SimulatorModuleCleanupFailure | null)[],
): SimulatorModuleFailure {
  const additions = failures.filter(
    (failure): failure is SimulatorModuleCleanupFailure => failure !== null,
  );
  if (additions.length === 0) return primary;
  const existing = primary.cleanupFailures ?? [];
  return Object.freeze({
    ...primary,
    cleanupFailures: Object.freeze([
      ...existing.map(freezeSimulatorCleanupFailure),
      ...additions.map(freezeSimulatorCleanupFailure),
    ]),
  });
}

export function simulatorCleanupFailureFromResult(
  identity: string,
  result: unknown,
): SimulatorModuleCleanupFailure | null {
  if (result === null || typeof result !== "object" || !("status" in result)) {
    return simulatorCleanupFailure(
      `simulator.cleanup.${identity}.invalid-result`,
      `The ${identity} cleanup did not return its typed terminal result; remaining owners were still released.`,
    );
  }
  const typed = result as Record<string, unknown>;
  if (typed.status === "ok" || typed.status === "accepted") return null;
  if (typeof typed.capability === "string" && typeof typed.boundary === "string") {
    return simulatorCleanupFailure(typed.capability, typed.boundary);
  }
  const failure = typed.failure;
  return failure !== null && typeof failure === "object" &&
    "capability" in failure && typeof failure.capability === "string" &&
    "boundary" in failure && typeof failure.boundary === "string"
    ? simulatorCleanupFailure(failure.capability, failure.boundary)
    : simulatorCleanupFailure(
        `simulator.cleanup.${identity}.failed`,
        `The ${identity} cleanup returned a non-success terminal result without a typed failure payload; remaining owners were still released.`,
      );
}

export function simulatorCleanupFailure(
  capability: string,
  boundary: string,
): SimulatorModuleCleanupFailure {
  return Object.freeze({ capability, boundary });
}

export function freezeSimulatorFailure(
  failure: SimulatorModuleFailure,
): SimulatorModuleFailure {
  return Object.freeze({
    ...failure,
    ...(failure.cleanupFailures === undefined
      ? {}
      : { cleanupFailures: Object.freeze(failure.cleanupFailures.map(freezeSimulatorCleanupFailure)) }),
  });
}

function freezeSimulatorCleanupFailure(
  failure: SimulatorModuleCleanupFailure,
): SimulatorModuleCleanupFailure {
  return Object.freeze({ capability: failure.capability, boundary: failure.boundary });
}
