export interface SimulatorOk<T> {
  readonly status: "ok";
  readonly value: T;
}

export interface SimulatorIntegrityFailure {
  readonly status: "integrity-failure";
  readonly capability: string;
  readonly boundary: string;
}

export type SimulatorResult<T> = SimulatorOk<T> | SimulatorIntegrityFailure;

export function ok<T>(value: T): SimulatorOk<T> {
  return Object.freeze({ status: "ok", value });
}

export function integrityFailure(
  capability: string,
  boundary: string,
): SimulatorIntegrityFailure {
  return Object.freeze({ status: "integrity-failure", capability, boundary });
}
