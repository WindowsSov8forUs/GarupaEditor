import type {
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "./contracts";
import { totalRevalidationFailure } from "./capabilities";

export async function launchSimulatorModule(
  request: SimulatorModuleLaunchRequest,
): Promise<SimulatorModuleLaunchResult> {
  void request;
  return totalRevalidationFailure();
}
