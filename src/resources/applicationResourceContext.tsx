import { createContext, useContext, type ReactNode } from "react";
import type { ApplicationResourceManager } from "./applicationResourceManager";
import type { ApplicationResourceSlot } from "./selections";

// Startup error presentation must also work before the resource store initializes.
const BuiltinPresentationUrls = createContext<ReadonlyMap<ApplicationResourceSlot, string> | null>(null);
export function BuiltinResourcePresentationProvider({ urls, children }: {
  urls: ReadonlyMap<ApplicationResourceSlot, string>; children: ReactNode;
}) { return <BuiltinPresentationUrls.Provider value={urls}>{children}</BuiltinPresentationUrls.Provider>; }

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
  const manager = useContext(ApplicationResourceContext);
  const builtinUrls = useContext(BuiltinPresentationUrls);
  if (manager === null) {
    const url = builtinUrls?.get(slot);
    if (url) return url;
    throw new Error(`Builtin presentation resource unavailable: ${slot}`);
  }
  const resolved = manager.resolveBuiltinSlotUrl(slot);
  if (resolved.status === "rejected") {
    throw new Error(`${resolved.failure.capability}: ${resolved.failure.boundary}`);
  }
  return resolved.value;
}
