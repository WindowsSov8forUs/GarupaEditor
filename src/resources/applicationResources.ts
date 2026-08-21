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

let bootstrapPromise: Promise<ResourceResult<ApplicationResourceManager>> | null = null;

export function bootstrapApplicationResources(): Promise<ResourceResult<ApplicationResourceManager>> {
  bootstrapPromise ??= bootstrap();
  return bootstrapPromise;
}

async function bootstrap(): Promise<ResourceResult<ApplicationResourceManager>> {
  const backend = isTauriRuntime()
    ? new TauriApplicationResourceBackend()
    : new MemoryApplicationResourceBackend();
  const manager = new ApplicationResourceManager(
    backend,
    new BrowserResourceObjectUrlFactory(),
  );
  const initialized = await manager.initialize();
  if (initialized.status === "rejected") return initialized;
  const provider = manager.registerCatalogProvider(new BestdoriApplicationResourceProvider());
  if (provider.status === "rejected") return provider;
  const builtins = await registerApplicationBuiltinResources(manager);
  if (builtins.status === "rejected") return builtins;
  const builtinLease = await manager.prepareBuiltinDocumentLease(listApplicationBuiltinResourceSlots());
  if (builtinLease.status === "rejected") return builtinLease;
  installBuiltinDocumentResources(manager);
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
      document.fonts.add(new FontFace("ChartUI", `url(${JSON.stringify(primary.value)})`, {
        weight: "400",
        style: "normal",
        display: "swap",
        unicodeRange: "U+0000-00FF,U+0100-024F,U+0250-02AF,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2460-24FF,U+2500-257F,U+25A0-25FF,U+3000-303F,U+3040-309F,U+30A0-30FF,U+31F0-31FF,U+FF61-FF9F",
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
        unicodeRange: "U+2E80-2EFF,U+2F00-2FDF,U+31C0-31EF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+2F800-2FA1F",
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
