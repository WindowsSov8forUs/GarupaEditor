import { createContext, useContext, type ReactNode } from "react";
import type { ApplicationResourceManager } from "./applicationResourceManager";
import type { ApplicationResourceSlot } from "./selections";

const ApplicationResourceContext = createContext<ApplicationResourceManager | null>(null);

export function ApplicationResourceProvider(props: {
  readonly manager: ApplicationResourceManager;
  readonly children: ReactNode;
}) {
  return (
    <ApplicationResourceContext.Provider value={props.manager}>
      {props.children}
    </ApplicationResourceContext.Provider>
  );
}

export function useApplicationResourceManager(): ApplicationResourceManager {
  const manager = useContext(ApplicationResourceContext);
  if (manager === null) {
    throw new Error("ApplicationResourceProvider is not installed");
  }
  return manager;
}

export function useApplicationResourceUrl(slot: ApplicationResourceSlot): string {
  const manager = useApplicationResourceManager();
  const resolved = manager.resolveBuiltinSlotUrl(slot);
  if (resolved.status === "rejected") {
    throw new Error(`${resolved.failure.capability}: ${resolved.failure.boundary}`);
  }
  return resolved.value;
}
