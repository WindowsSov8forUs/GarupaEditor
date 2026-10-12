import App from "../App";
import { useEffect } from "react";
import { appLog } from "../logging/applicationLogger";
import { ApplicationResourceProvider } from "../resources/applicationResourceContext";
import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import { StartupReadinessContext, type StartupReadiness } from "./startupReadiness";

export default function PreparedApplication({ manager, readiness }: {
  manager: ApplicationResourceManager; readiness: StartupReadiness | null;
}) {
  useEffect(() => { appLog("info", "application.startup.tree-committed", {}); }, []);
  return <ApplicationResourceProvider manager={manager}>
    <StartupReadinessContext.Provider value={readiness}><App /></StartupReadinessContext.Provider>
  </ApplicationResourceProvider>;
}
