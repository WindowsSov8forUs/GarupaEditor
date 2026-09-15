import type {
  LaunchSimulatorModule,
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "../public/contracts";
import { rejected, type SimulatorAssemblyResult } from "../assembly/result";

let installedLauncher: LaunchSimulatorModule | null = null;

export function installSimulatorModuleLauncher(
  launcher: LaunchSimulatorModule,
): SimulatorAssemblyResult<void> {
  if (installedLauncher !== null) {
    return rejected(
      "launch-failed",
      "simulator.entry.launcher-already-installed",
      "The neutral simulator platform installs one autonomous launcher exactly once and cannot replace a running module composition root.",
    );
  }
  if (typeof launcher !== "function") {
    return rejected(
      "platform-unavailable",
      "simulator.entry.invalid-launcher",
      "The simulator platform binding requires one internal autonomous launch function.",
    );
  }
  installedLauncher = launcher;
  return Object.freeze({ status: "accepted" as const, value: undefined });
}

export function uninstallSimulatorModuleLauncher(
  launcher: LaunchSimulatorModule,
): SimulatorAssemblyResult<void> {
  if (installedLauncher !== launcher) {
    return rejected(
      "launch-failed",
      "simulator.entry.launcher-release-identity-mismatch",
      "Only the exact installed autonomous launcher may release its closed platform binding; foreign or repeated release is rejected.",
    );
  }
  installedLauncher = null;
  return Object.freeze({ status: "accepted" as const, value: undefined });
}

export async function launchInstalledSimulatorModule(
  request: SimulatorModuleLaunchRequest,
): Promise<SimulatorModuleLaunchResult> {
  const launcher = installedLauncher;
  if (launcher === null) {
    return Object.freeze({
      status: "rejected" as const,
      failure: Object.freeze({
        code: "platform-unavailable" as const,
        capability: "simulator.entry.platform-not-installed",
        boundary: "The autonomous simulator platform and application-owned resource capability must be installed before the main entry transfers chart/config ownership.",
      }),
    });
  }
  return launcher(request);
}
