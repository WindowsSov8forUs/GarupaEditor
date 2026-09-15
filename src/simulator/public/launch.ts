import type {
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "./contracts";
import { launchInstalledSimulatorModule } from "../runtime/moduleEntryBinding";

export async function launchSimulatorModule(
  request: SimulatorModuleLaunchRequest,
): Promise<SimulatorModuleLaunchResult> {
  return launchInstalledSimulatorModule(request);
}
