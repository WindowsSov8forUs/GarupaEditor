import { ApplicationResourceManager } from "./applicationResourceManager";
import { BrowserResourceObjectUrlFactory } from "./browserObjectUrlFactory";
import {
  listApplicationBuiltinResourceSlots,
  registerApplicationBuiltinResources,
} from "./builtin/builtinResourceCatalog";
import {
  resourceAccepted,
  type ResourceResult,
} from "./contracts";
import { MemoryApplicationResourceBackend } from "./memoryResourceBackend";
import { BestdoriApplicationResourceProvider } from "./providers/bestdoriCatalogProvider";
import { TauriApplicationResourceBackend } from "./providers/tauriResourceBackend";
import { registerSimulatorBuiltinResources } from "./builtin/simulatorBuiltinResourceCatalog";

let bootstrapPromise: Promise<ResourceResult<ApplicationResourceManager>> | null = null;

export function bootstrapApplicationResources(
  onLoadingReady?: (manager: ApplicationResourceManager) => Promise<void>,
): Promise<ResourceResult<ApplicationResourceManager>> {
  bootstrapPromise ??= bootstrap(onLoadingReady);
  return bootstrapPromise;
}

async function bootstrap(onLoadingReady?: (manager: ApplicationResourceManager) => Promise<void>): Promise<ResourceResult<ApplicationResourceManager>> {
  const backend = isTauriRuntime()
    ? new TauriApplicationResourceBackend()
    : new MemoryApplicationResourceBackend();
  const manager = new ApplicationResourceManager(
    backend,
    new BrowserResourceObjectUrlFactory(),
  );
  const provider = manager.registerCatalogProvider(new BestdoriApplicationResourceProvider());
  if (provider.status === "rejected") return provider;
  const builtins = await registerApplicationBuiltinResources(manager);
  if (builtins.status === "rejected") return builtins;
  const builtinUrls = manager.prepareBuiltinDocumentUrls(listApplicationBuiltinResourceSlots());
  if (builtinUrls.status === "rejected") return builtinUrls;
  installBuiltinDocumentResources(manager);
  // Fixed loading assets use build URLs and need no persistent resource store.
  // Show that screen before restoring the store in this new WebView.
  await onLoadingReady?.(manager);
  const initialized = await manager.initialize();
  if (initialized.status === "rejected") return initialized;
  const simulatorBuiltins = await registerSimulatorBuiltinResources(manager);
  if (simulatorBuiltins.status === "rejected") return simulatorBuiltins;

  void manager.refreshCatalog("bestdori");
  return resourceAccepted(manager);
}

function installBuiltinDocumentResources(manager: ApplicationResourceManager): void {
  if (typeof document === "undefined") return;
  const primary = manager.resolveBuiltinSlotUrl("ui.font.chart-ui-primary");
  const fallback = manager.resolveBuiltinSlotUrl("ui.font.chart-ui-fallback");
  const background = manager.resolveBuiltinSlotUrl("ui.application-background");
  if (typeof FontFace === "function" && document.fonts !== undefined) {
    if (primary.status === "accepted") {
      document.fonts.add(new FontFace("TTShinGoM", `url(${JSON.stringify(primary.value)})`, {
        weight: "400",
        style: "normal",
        display: "swap",
      }));
    }
    if (fallback.status === "accepted") {
      document.fonts.add(new FontFace("GB18030", `url(${JSON.stringify(fallback.value)})`, {
        weight: "400",
        style: "normal",
        display: "swap",
      }));
      document.fonts.add(new FontFace("ChartUI", `url(${JSON.stringify(fallback.value)})`, {
        weight: "400",
        style: "normal",
        display: "swap",
      }));
    }
  }
  if (background.status === "accepted") {
    document.documentElement.style.setProperty(
      "--app-resource-background-image",
      `url(${JSON.stringify(background.value)})`,
    );
  }
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const candidate = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return "__TAURI__" in candidate || "__TAURI_INTERNALS__" in candidate || window.location.protocol === "tauri:";
}
