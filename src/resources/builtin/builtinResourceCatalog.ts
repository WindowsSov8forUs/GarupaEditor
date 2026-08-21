import applyActionUrl from "../../assets/icons/apply-action.svg";
import backArrowUrl from "../../assets/icons/back-arrow.svg";
import clearActionUrl from "../../assets/icons/clear-action.svg";
import copyActionUrl from "../../assets/icons/copy-action.svg";
import displayUrl from "../../assets/icons/display.svg";
import editUrl from "../../assets/icons/edit.svg";
import imageExportUrl from "../../assets/icons/image-export.svg";
import jsonExportUrl from "../../assets/icons/json-export.svg";
import jsonImportUrl from "../../assets/icons/json-import.svg";
import mirrorActionUrl from "../../assets/icons/mirror-action.svg";
import optionsTitleUrl from "../../assets/icons/options-title.svg";
import pasteActionUrl from "../../assets/icons/paste-action.svg";
import previewUrl from "../../assets/icons/preview.svg";
import settingsUrl from "../../assets/icons/settings.svg";
import simulatorPauseUrl from "../../assets/icons/simulator-pause.svg";
import simulatorPlayUrl from "../../assets/icons/simulator-play.svg";
import skinUrl from "../../assets/icons/skin.svg";
import undoActionUrl from "../../assets/icons/undo-action.svg";
import chartUiPrimaryFontUrl from "../../assets/fonts/TTShinGoM.ttf";
import chartUiFallbackFontUrl from "../../assets/fonts/GB18030.ttf";
import defaultCoverUrl from "../../assets/default-cover.png";
import applicationBackgroundUrl from "../../assets/live.png";
import manifestJson from "./builtinResourceManifest.json";
import type { ApplicationResourceManager } from "../applicationResourceManager";
import {
  resourceAccepted,
  resourceRejected,
  type ObservedIntegrity,
  type ResourceRef,
  type ResourceResult,
} from "../contracts";
import type { ApplicationResourceSlot } from "../selections";

interface BuiltinManifestEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

interface BuiltinDefinition {
  readonly slot: ApplicationResourceSlot;
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly kind: "image" | "font";
  readonly mediaType: string;
  readonly url: string;
}

const DEFINITIONS: readonly BuiltinDefinition[] = Object.freeze([
  icon("ui.icon.apply-action", "builtin/ui/icon/apply-action", "icons/apply-action.svg", "Apply", applyActionUrl),
  icon("ui.icon.back-arrow", "builtin/ui/icon/back-arrow", "icons/back-arrow.svg", "Back", backArrowUrl),
  icon("ui.icon.clear-action", "builtin/ui/icon/clear-action", "icons/clear-action.svg", "Clear", clearActionUrl),
  icon("ui.icon.copy-action", "builtin/ui/icon/copy-action", "icons/copy-action.svg", "Copy", copyActionUrl),
  icon("ui.icon.display", "builtin/ui/icon/display", "icons/display.svg", "Display", displayUrl),
  icon("ui.icon.edit", "builtin/ui/icon/edit", "icons/edit.svg", "Edit", editUrl),
  icon("ui.icon.image-export", "builtin/ui/icon/image-export", "icons/image-export.svg", "Image export", imageExportUrl),
  icon("ui.icon.json-export", "builtin/ui/icon/json-export", "icons/json-export.svg", "JSON export", jsonExportUrl),
  icon("ui.icon.json-import", "builtin/ui/icon/json-import", "icons/json-import.svg", "JSON import", jsonImportUrl),
  icon("ui.icon.mirror-action", "builtin/ui/icon/mirror-action", "icons/mirror-action.svg", "Mirror", mirrorActionUrl),
  icon("ui.icon.options-title", "builtin/ui/icon/options-title", "icons/options-title.svg", "Options title", optionsTitleUrl),
  icon("ui.icon.paste-action", "builtin/ui/icon/paste-action", "icons/paste-action.svg", "Paste", pasteActionUrl),
  icon("ui.icon.preview", "builtin/ui/icon/preview", "icons/preview.svg", "Preview", previewUrl),
  icon("ui.icon.settings", "builtin/ui/icon/settings", "icons/settings.svg", "Settings", settingsUrl),
  icon("ui.icon.simulator-pause", "builtin/ui/icon/simulator-pause", "icons/simulator-pause.svg", "Simulator pause", simulatorPauseUrl),
  icon("ui.icon.simulator-play", "builtin/ui/icon/simulator-play", "icons/simulator-play.svg", "Simulator play", simulatorPlayUrl),
  icon("ui.icon.skin", "builtin/ui/icon/skin", "icons/skin.svg", "Skin", skinUrl),
  icon("ui.icon.undo-action", "builtin/ui/icon/undo-action", "icons/undo-action.svg", "Undo", undoActionUrl),
  Object.freeze({
    slot: "ui.font.chart-ui-primary",
    id: "builtin/ui/font/chart-ui-primary",
    path: "fonts/TTShinGoM.ttf",
    title: "Chart UI primary font",
    kind: "font",
    mediaType: "font/ttf",
    url: chartUiPrimaryFontUrl,
  }),
  Object.freeze({
    slot: "ui.font.chart-ui-fallback",
    id: "builtin/ui/font/chart-ui-fallback",
    path: "fonts/GB18030.ttf",
    title: "Chart UI fallback font",
    kind: "font",
    mediaType: "font/ttf",
    url: chartUiFallbackFontUrl,
  }),
  Object.freeze({
    slot: "ui.default-cover",
    id: "builtin/ui/default-cover",
    path: "default-cover.png",
    title: "Default cover",
    kind: "image",
    mediaType: "image/png",
    url: defaultCoverUrl,
  }),
  Object.freeze({
    slot: "ui.application-background",
    id: "builtin/ui/application-background",
    path: "live.png",
    title: "Application background",
    kind: "image",
    mediaType: "image/png",
    url: applicationBackgroundUrl,
  }),
]);

const MANIFEST = new Map(
  (manifestJson.entries as readonly BuiltinManifestEntry[]).map((entry) => [entry.path, entry]),
);

export async function registerApplicationBuiltinResources(
  manager: ApplicationResourceManager,
): Promise<ResourceResult<void>> {
  const selection: Partial<Record<ApplicationResourceSlot, ResourceRef>> = {};
  for (const definition of DEFINITIONS) {
    const manifest = MANIFEST.get(definition.path);
    if (manifest === undefined) {
      return resourceRejected(
        "resource-integrity",
        "resources.builtin.manifest-entry-missing",
        `Builtin resource manifest does not contain ${definition.path}.`,
      );
    }
    const registered = await manager.registerBuiltin({
      id: definition.id,
      kind: definition.kind,
      title: definition.title,
      sourceUrl: definition.url,
      files: [Object.freeze({
        logicalPath: definition.path,
        mediaType: definition.mediaType,
        integrity: manifestIntegrity(manifest),
        loadBytes: () => fetchBuiltinBytes(definition.url),
      })],
    });
    if (registered.status === "rejected") return registered;
    selection[definition.slot] = registered.value.ref;
  }
  const selected = manager.replaceSelection(selection);
  return selected.status === "rejected" ? selected : resourceAccepted(undefined);
}

export function listApplicationBuiltinResourceSlots(): readonly ApplicationResourceSlot[] {
  return Object.freeze(DEFINITIONS.map(({ slot }) => slot));
}

export function listBuiltinDefinitionsForTesting(): readonly Readonly<{
  slot: ApplicationResourceSlot;
  id: string;
  path: string;
}>[] {
  return Object.freeze(DEFINITIONS.map(({ slot, id, path }) => Object.freeze({ slot, id, path })));
}

function icon(
  slot: ApplicationResourceSlot,
  id: string,
  path: string,
  title: string,
  url: string,
): BuiltinDefinition {
  return Object.freeze({ slot, id, path, title, kind: "image", mediaType: "image/svg+xml", url });
}

function manifestIntegrity(entry: BuiltinManifestEntry): ObservedIntegrity {
  return Object.freeze({ byteLength: entry.byteLength, sha256: entry.sha256 });
}

async function fetchBuiltinBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`builtin resource fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("builtin resource fetch returned empty bytes");
  return bytes;
}
