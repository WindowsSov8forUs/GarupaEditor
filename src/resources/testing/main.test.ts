import { runBuiltinCatalogTests } from "./builtinCatalog.test";
import { runResourceContractTests } from "./contracts.test";
import { runDynamicCatalogTests } from "./dynamicCatalog.test";
import { runResourceManagerLifecycleTests } from "./managerLifecycle.test";

async function main(): Promise<void> {
  runResourceContractTests();
  await runBuiltinCatalogTests();
  await runDynamicCatalogTests();
  await runResourceManagerLifecycleTests();
  console.log("resource manager core: ok");
}

void main();
