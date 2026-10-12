import { isTauri } from "@tauri-apps/api/core";
import { loggedInvoke as invoke } from "../logging/applicationLogger";

let cached: Promise<string | null> | undefined;
/** Title audio and editor hydration consume the same settings read. */
export function loadEditorSettingsCache() {
  return cached ??= (isTauri() ? invoke<string | null>("load_editor_settings_cache") : Promise.resolve(null))
    .catch(error => { cached = undefined; throw error; });
}
export async function saveEditorSettingsCache(settingsJson: string) {
  await invoke("save_editor_settings_cache", { settingsJson });
  cached = Promise.resolve(settingsJson);
}
