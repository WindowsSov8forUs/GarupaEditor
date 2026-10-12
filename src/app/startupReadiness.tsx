import { createContext, useContext, useEffect } from "react";

export type StartupPart = "session" | "editor-audio" | "editor" | "sound" | "home-image" | "home-page" | "background";
export interface StartupReadiness {
  report(part: StartupPart, ready: boolean, error?: string | null): void;
}
export const StartupReadinessContext = createContext<StartupReadiness | null>(null);
export const useIsStartingApplication = () => useContext(StartupReadinessContext) !== null;

/** Only the initial mounted application participates; later edits remain ordinary operations. */
export function useStartupReadiness(part: StartupPart, ready: boolean, error?: string | null) {
  const owner = useContext(StartupReadinessContext);
  useEffect(() => { owner?.report(part, ready, error); }, [owner, part, ready, error]);
}
