import { useCallback, useEffect, useState } from "react";
import type { ApplicationResourceManager } from "./applicationResourceManager";
import type { ResourceConsumerLease } from "./contracts";
import type { ApplicationResourceSlot, ChartMediaResources } from "./selections";

export type ChartMediaPurpose = "bgm" | "cover" | "mv" | "stageBackdrop";

const SLOT_BY_PURPOSE: Readonly<Record<ChartMediaPurpose, ApplicationResourceSlot>> = Object.freeze({
  bgm: "chart-media.bgm",
  cover: "chart-media.cover",
  mv: "chart-media.mv",
  stageBackdrop: "chart-media.stage-backdrop",
});

interface ChartMediaLeaseState {
  readonly lease: ResourceConsumerLease | null;
  readonly paths: Readonly<Partial<Record<ChartMediaPurpose, string>>>;
  readonly urls: Readonly<Partial<Record<ChartMediaPurpose, string>>>;
  readonly mediaTypes: Readonly<Partial<Record<ChartMediaPurpose, string>>>;
  readonly error: string | null;
}

const EMPTY_STATE: ChartMediaLeaseState = Object.freeze({
  lease: null,
  paths: Object.freeze({}),
  urls: Object.freeze({}),
  mediaTypes: Object.freeze({}),
  error: null,
});

export function useChartMediaLease(
  manager: ApplicationResourceManager,
  media: ChartMediaResources,
) {
  const [state, setState] = useState<ChartMediaLeaseState>(EMPTY_STATE);

  useEffect(() => {
    let disposed = false;
    let owned: ResourceConsumerLease | null = null;
    void (async () => {
      const changes: Partial<Record<ApplicationResourceSlot, ChartMediaResources[keyof ChartMediaResources]>> = {
        "chart-media.bgm": media.bgm,
        "chart-media.cover": media.cover,
        "chart-media.mv": media.mv,
        "chart-media.stage-backdrop": media.stageBackdrop,
      };
      const selected = manager.replaceSelection(changes);
      if (selected.status === "rejected") throw new Error(`${selected.failure.capability}: ${selected.failure.boundary}`);
      const purposes = (Object.keys(SLOT_BY_PURPOSE) as ChartMediaPurpose[])
        .filter((purpose) => media[purpose] !== null);
      if (purposes.length === 0) {
        if (!disposed) setState(EMPTY_STATE);
        return;
      }
      const snapshot = await manager.createSnapshot(purposes.map((purpose) => SLOT_BY_PURPOSE[purpose]));
      if (snapshot.status === "rejected") throw new Error(`${snapshot.failure.capability}: ${snapshot.failure.boundary}`);
      const lease = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (lease.status === "rejected") throw new Error(`${lease.failure.capability}: ${lease.failure.boundary}`);
      owned = lease.value;
      const paths: Partial<Record<ChartMediaPurpose, string>> = {};
      const urls: Partial<Record<ChartMediaPurpose, string>> = {};
      const mediaTypes: Partial<Record<ChartMediaPurpose, string>> = {};
      for (const purpose of purposes) {
        const slot = SLOT_BY_PURPOSE[purpose];
        const files = owned.listFiles(slot);
        if (files.length !== 1) throw new Error(`chart media slot ${slot} requires exactly one file`);
        paths[purpose] = files[0]!.logicalPath;
        mediaTypes[purpose] = files[0]!.mediaType;
        urls[purpose] = await owned.openObjectUrl(slot, files[0]!.logicalPath);
      }
      if (disposed) {
        await owned.release();
        owned = null;
        return;
      }
      setState(Object.freeze({
        lease: owned,
        paths: Object.freeze(paths),
        urls: Object.freeze(urls),
        mediaTypes: Object.freeze(mediaTypes),
        error: null,
      }));
    })().catch((error) => {
      if (owned !== null) {
        void owned.release();
        owned = null;
      }
      if (!disposed) setState(Object.freeze({
        lease: null,
        paths: Object.freeze({}),
        urls: Object.freeze({}),
        mediaTypes: Object.freeze({}),
        error: error instanceof Error ? error.message : String(error),
      }));
    });
    return () => {
      disposed = true;
      if (owned !== null) void owned.release();
    };
  }, [manager, media]);

  const readBytes = useCallback(async (purpose: ChartMediaPurpose): Promise<Uint8Array | null> => {
    const path = state.paths[purpose];
    if (state.lease === null || path === undefined) return null;
    return state.lease.readBytes(SLOT_BY_PURPOSE[purpose], path);
  }, [state]);

  return Object.freeze({
    urls: state.urls,
    mediaTypes: state.mediaTypes,
    error: state.error,
    readBytes,
  });
}
