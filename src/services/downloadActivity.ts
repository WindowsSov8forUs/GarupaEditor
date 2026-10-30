/** Actual transport activity, independent of page preparation and cache reads. */
/** background: progress for an indicator its caller holds; it never opens the download screen. */
export type Transfer = { received: number; total: number | null; background?: boolean };
type Snapshot = { active: boolean; progress: number | undefined; single: number | undefined };
const transfers = new Map<object | string, Transfer>();
const preparations = new Set<{ downloading: boolean }>();
const listeners = new Set<() => void>();
let snapshot: Snapshot = { active: false, progress: undefined, single: undefined };
function publish() {
  const all = [...transfers.values()], values = all.filter(value => !value.background);
  if (values.length) for (const preparation of preparations) preparation.downloading = true;
  const total = values.reduce((sum, value) => sum + (value.total ?? 0), 0);
  // The full-screen Loading belongs to occasions that ask for it (a preparation or held screen);
  // a transfer outside such an occasion only reports progress.
  const active = [...preparations].some(value => value.downloading);
  const latest = all[all.length - 1];
  snapshot = { active, progress: values.length && values.every(value => value.total !== null) && total > 0
    ? Math.min(1, values.reduce((sum, value) => sum + value.received, 0) / total)
    : values.length ? undefined : active ? snapshot.progress : undefined,
    single: latest?.total ? Math.min(1, latest.received / latest.total) : undefined };
  listeners.forEach(listener => listener());
}
export const downloadActivity = {
  /** A transport opens the screen; the enclosing preparation closes it, including retry gaps. */
  prepare() {
    const preparation = { downloading: transfers.size > 0 };
    preparations.add(preparation); publish();
    return () => { if (preparations.delete(preparation)) publish(); };
  },
  /** ScreenLayerLoading held without a transfer: live start shows it even when nothing is downloaded. */
  holdScreen() {
    const preparation = { downloading: true };
    preparations.add(preparation); publish();
    return () => { if (preparations.delete(preparation)) publish(); };
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => snapshot,
  begin(options: { background?: boolean } = {}) {
    const key = {}; let ended = false;
    const background = options.background === true;
    transfers.set(key, { received: 0, total: null, background }); publish();
    return {
      progress(received: number, total: number | null) {
        if (ended) return;
        transfers.set(key, { received, total, background }); publish();
      },
      finish() { if (ended) return; ended = true; transfers.delete(key); publish(); },
    };
  },
  native(entries: Record<string, Transfer>) {
    for (const key of transfers.keys()) if (typeof key === "string") transfers.delete(key);
    for (const [key, value] of Object.entries(entries)) transfers.set(key, value);
    publish();
  },
};

let connected: Promise<void> | undefined;
export function connectNativeDownloads(): Promise<void> {
  return connected ??= (async () => {
    const { isTauri, invoke } = await import("@tauri-apps/api/core");
    if (!isTauri()) return;
    const { listen } = await import("@tauri-apps/api/event");
    let revision = -1;
    const accept = (value: { revision: number; transfers: Record<string, Transfer> }) => {
      if (value.revision <= revision) return;
      revision = value.revision; downloadActivity.native(value.transfers);
    };
    const unlisten = await listen<{ revision: number; transfers: Record<string, Transfer> }>("application-downloads", event => accept(event.payload));
    try { accept(await invoke("download_snapshot")); }
    catch (error) { unlisten(); throw error; }
  })().catch(error => { connected = undefined; throw error; });
}
