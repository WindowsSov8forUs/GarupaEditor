import { runResourceContractTests } from "./contracts.test";
import { runResourceManagerLifecycleTests } from "./managerLifecycle.test";

async function main(): Promise<void> {
  runResourceContractTests();
  await runResourceManagerLifecycleTests();
  console.log("resource manager core: ok");
}

void main();
