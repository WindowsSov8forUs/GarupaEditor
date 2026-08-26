import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  GLOBAL_TIMING_GROUP_ID,
  buildTimingGroupsFromSvEvents,
  ensureTimingGroups,
  flattenTimingGroups,
  type ChartTimingGroupMap,
  ChartBpmEvent,
  ChartMetadata,
  ChartNote,
  ChartSvEvent,
  EditorOptionSettings,
  ChartSettings,
  WindowPreset,
} from "../../chartCore";
import type { SlideChain } from "../editorHelpers";
import { applyHabahiroSlideWidths } from "../habahiroSlideWidth";
import { useApplicationResourceManager } from "../../resources/applicationResourceContext";
import { createResourceRef, type ResourceRef } from "../../resources/contracts";
import type { ChartMediaResources } from "../../resources/selections";
import { resolveSimulatorAllPerfectStatusDisplayMode } from "../simulator/preAdaptationContract";

const SESSION_SCHEMA_VERSION = 1;
const SETTINGS_SCHEMA_VERSION = 2;
const SESSION_AUTOSAVE_DELAY_MS = 1000;
type LoadedEditorChartCache = {
  chartJson: string;
  resourceRefs?: unknown;
  resourceRefsSchemaVersion?: number | null;
  coverDataUrl?: string | null;
  audioBase64?: string | null;
  audioMimeType?: string | null;
  audioFileName?: string | null;
  mvDataUrl?: string | null;
  mvFileName?: string | null;
};

type BestdoriPostTag = {
  type: string;
  data: string;
};

type ChartSnapshotV1 = {
  schemaVersion: number;
  savedAt: string;
  metadata: Partial<ChartMetadata>;
  settings: Partial<ChartSettings>;
  notes: Array<Partial<ChartNote>>;
  slideChains: Array<Partial<SlideChain>>;
  bpmEvents: Array<Partial<ChartBpmEvent>>;
  timingGroups?: ChartTimingGroupMap;
  svEvents?: Array<Partial<ChartSvEvent>>;
  audioFileName?: string;
  audioDurationSec?: number;
};

type SettingsSnapshotV1 = {
  schemaVersion: number;
  savedAt: string;
  appOptionSettings?: Partial<EditorOptionSettings>;
  windowPresetId?: string;
  playbackWindowPresetId?: string;
  playbackFps?: number;
  playbackMvMode?: boolean;
  playbackMvAlphaPercent?: number;
  playbackAllPerfectStatusDisplayMode?: boolean;
  uploadCommunityPostContent?: string;
  uploadCommunityPostTags?: BestdoriPostTag[];
  skinSelection?: Record<string, unknown>;
};

type ParsedDataUrl = {
  mimeType: string;
  base64Data: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


function parseDataUrl(dataUrl: string | null | undefined): ParsedDataUrl | null {
  if (typeof dataUrl !== "string" || dataUrl.trim() === "") {
    return null;
  }
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }
  const mimeType = (match[1] ?? "").trim().toLowerCase();
  const base64Data = (match[2] ?? "").trim();
  if (!mimeType || !base64Data) {
    return null;
  }
  return {
    mimeType,
    base64Data,
  };
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseChartMediaResources(value: unknown): ChartMediaResources | null {
  if (!isRecord(value)) return null;
  const parse = (item: unknown): ResourceRef | null | undefined => {
    if (item === null) return null;
    if (!isRecord(item)) return undefined;
    const reference = createResourceRef(item.id);
    return reference.status === "accepted" ? reference.value : undefined;
  };
  const bgm = parse(value.bgm);
  const cover = parse(value.cover);
  const mv = parse(value.mv);
  const stageBackdrop = parse(value.stageBackdrop);
  if (bgm === undefined || cover === undefined || mv === undefined || stageBackdrop === undefined) return null;
  return Object.freeze({ bgm, cover, mv, stageBackdrop });
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useEditorSessionCache(params: any) {
  const {
    metadata,
    settings,
    appOptionSettings,
    notes,
    slideChains,
    bpmEvents,
    timingGroups,
    audioFileName,
    audioDurationSec,
    chartMediaResources,
    setChartMediaResources,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
    playbackAllPerfectStatusDisplayMode,
    WINDOW_SIZE_PRESETS,
    normalizeMetadata,
    normalizeSettings,
    normalizeEditorOptionSettings,
    normalizeSkinSelection,
    normalizeNote,
    normalizeBpmEvent,
    normalizeSvEvent,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    normalizeTimingGroup,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    sortSvEvents,
    approxEq,
    createId,
    setMetadata,
    setSettings,
    setAppOptionSettings,
    setNotes,
    setSlideChains,
    setBpmEvents,
    setTimingGroups,
    setToolBpmValue,
    setAudioFileName,
    setAudioDurationSec,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    setPlaybackAllPerfectStatusDisplayMode,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    clearAllSelections,
    setStatusMessage,
  } = params;
  const resourceManager = useApplicationResourceManager();

  const [didRestoreAttemptFinish, setDidRestoreAttemptFinish] = useState(false);
  const lastSavedChartFingerprintRef = useRef<string | null>(null);
  const lastSavedSettingsFingerprintRef = useRef<string | null>(null);
  const migratedLegacyMediaRefsRef = useRef<readonly ResourceRef[]>(Object.freeze([]));
  const legacyMediaFinalizedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedChart, loadedSettingsJson] = await Promise.all([
          invoke<LoadedEditorChartCache | null>("load_editor_chart_cache"),
          invoke<string | null>("load_editor_settings_cache"),
        ]);
        if (cancelled) {
          return;
        }

        let restoredChart = false;
        let restoredSettings = false;
        let ignoredBaseBpmCount = 0;
        let ignoredEventZeroCount = 0;
        let restoredAppOptionSettings = normalizeEditorOptionSettings({});

        if (typeof loadedSettingsJson === "string" && loadedSettingsJson.trim().length > 0) {
          const parsedUnknown = JSON.parse(loadedSettingsJson) as unknown;
          if (!isRecord(parsedUnknown)) {
            throw new Error("settings cache JSON root must be an object");
          }
          const snapshot = parsedUnknown as Partial<SettingsSnapshotV1>;
          restoredAppOptionSettings = normalizeEditorOptionSettings(
            isRecord(snapshot.appOptionSettings)
              ? (snapshot.appOptionSettings as Partial<EditorOptionSettings>)
              : {},
          );
          const nextAppOptionSettings = restoredAppOptionSettings;
          setAppOptionSettings(nextAppOptionSettings);

          const rawWindowPresetId = normalizeOptionalText(snapshot.windowPresetId);
          const firstPresetId =
            Array.isArray(WINDOW_SIZE_PRESETS) && WINDOW_SIZE_PRESETS.length > 0
              ? WINDOW_SIZE_PRESETS[0]?.id
              : null;
          const resolvedWindowPresetId =
            rawWindowPresetId &&
            Array.isArray(WINDOW_SIZE_PRESETS) &&
            WINDOW_SIZE_PRESETS.some((item: WindowPreset) => item.id === rawWindowPresetId)
              ? rawWindowPresetId
              : firstPresetId;
          if (
            resolvedWindowPresetId &&
            Array.isArray(WINDOW_SIZE_PRESETS) &&
            WINDOW_SIZE_PRESETS.some((item: WindowPreset) => item.id === resolvedWindowPresetId)
          ) {
            setWindowPresetId(resolvedWindowPresetId);
            if (typeof applyWindowPresetById === "function") {
              void applyWindowPresetById(resolvedWindowPresetId, { silent: true });
            }
          }

          const rawPlaybackWindowPresetId = normalizeOptionalText(snapshot.playbackWindowPresetId);
          const resolvedPlaybackWindowPresetId =
            rawPlaybackWindowPresetId &&
            Array.isArray(WINDOW_SIZE_PRESETS) &&
            WINDOW_SIZE_PRESETS.some((item: WindowPreset) => item.id === rawPlaybackWindowPresetId)
              ? rawPlaybackWindowPresetId
              : null;
          if (resolvedPlaybackWindowPresetId) {
            setPlaybackWindowPresetId(resolvedPlaybackWindowPresetId);
          }

          const rawPlaybackFps = Number(snapshot.playbackFps);
          const resolvedPlaybackFps = rawPlaybackFps === 120 ? 120 : 60;
          setPlaybackFps(resolvedPlaybackFps);
          const resolvedPlaybackMvMode = snapshot.playbackMvMode === true;
          setPlaybackMvMode(resolvedPlaybackMvMode);
          const rawPlaybackMvAlphaPercent = Number(snapshot.playbackMvAlphaPercent);
          const resolvedPlaybackMvAlphaPercent =
            Number.isFinite(rawPlaybackMvAlphaPercent)
              ? Math.max(30, Math.min(100, Math.round(rawPlaybackMvAlphaPercent / 10) * 10))
              : 100;
          setPlaybackMvAlphaPercent(resolvedPlaybackMvAlphaPercent);
          const resolvedPlaybackAllPerfectStatusDisplayMode =
            resolveSimulatorAllPerfectStatusDisplayMode(snapshot.playbackAllPerfectStatusDisplayMode);
          setPlaybackAllPerfectStatusDisplayMode(resolvedPlaybackAllPerfectStatusDisplayMode);

          const nextUploadCommunityPostContent = normalizeOptionalText(snapshot.uploadCommunityPostContent) ?? "";
          setUploadCommunityPostContent(nextUploadCommunityPostContent);
          const nextUploadCommunityPostTags = (Array.isArray(snapshot.uploadCommunityPostTags)
            ? snapshot.uploadCommunityPostTags
            : [])
            .map((item) => {
              if (!isRecord(item)) {
                return null;
              }
              const type = normalizeOptionalText(item.type);
              const data = normalizeOptionalText(item.data);
              if (!type || !data) {
                return null;
              }
              return { type, data } as BestdoriPostTag;
            })
            .filter((item: BestdoriPostTag | null): item is BestdoriPostTag => item !== null);
          setUploadCommunityPostTags(nextUploadCommunityPostTags);

          const normalizedSkinSelection = isRecord(snapshot.skinSelection)
            ? normalizeSkinSelection(snapshot.skinSelection as Record<string, unknown>)
            : skinSelection;
          if (typeof applyBestdoriSkinSelection === "function" && normalizedSkinSelection) {
            void applyBestdoriSkinSelection(normalizedSkinSelection, true, false);
          }

          lastSavedSettingsFingerprintRef.current = JSON.stringify({
            schemaVersion: SETTINGS_SCHEMA_VERSION,
            appOptionSettings: nextAppOptionSettings,
            windowPresetId: resolvedWindowPresetId,
            playbackWindowPresetId: resolvedPlaybackWindowPresetId,
            playbackFps: resolvedPlaybackFps,
            playbackMvMode: resolvedPlaybackMvMode,
            playbackMvAlphaPercent: resolvedPlaybackMvAlphaPercent,
            playbackAllPerfectStatusDisplayMode: resolvedPlaybackAllPerfectStatusDisplayMode,
            uploadCommunityPostContent: nextUploadCommunityPostContent,
            uploadCommunityPostTags: nextUploadCommunityPostTags,
            skinSelection: normalizedSkinSelection,
          } as Omit<SettingsSnapshotV1, "savedAt">);
          restoredSettings = true;
        }

        if (loadedChart && typeof loadedChart.chartJson === "string") {
          const parsedUnknown = JSON.parse(loadedChart.chartJson) as unknown;
          if (!isRecord(parsedUnknown)) {
            throw new Error("chart cache JSON root must be an object");
          }
          const snapshot = parsedUnknown as Partial<ChartSnapshotV1>;
          const nextSettings = normalizeSettings(
            isRecord(snapshot.settings) ? (snapshot.settings as Partial<ChartSettings>) : {},
          );
          const nextBeatDivision = nextSettings.timeSignatureDenominator;

          const snapshotMetadata = isRecord(snapshot.metadata)
            ? (snapshot.metadata as Partial<ChartMetadata>)
            : {};
          const loadedCoverDataUrl = normalizeOptionalText(loadedChart.coverDataUrl);
          const loadedMvDataUrl = normalizeOptionalText(loadedChart.mvDataUrl);
          const loadedAudioBase64 = normalizeOptionalText(loadedChart.audioBase64);
          const loadedAudioMimeType = normalizeOptionalText(loadedChart.audioMimeType) ?? "audio/mpeg";
          const nextMetadataBase = normalizeMetadata(snapshotMetadata);

          const normalizedNotes = (Array.isArray(snapshot.notes) ? snapshot.notes : [])
            .map((item) => (isRecord(item) ? normalizeNote(item as Partial<ChartNote>, nextSettings) : null))
            .filter((item: ChartNote | null): item is ChartNote => item !== null);

          const seenNoteIds = new Set<string>();
          const dedupedNotes = normalizedNotes.map((note) => {
            const id = typeof note.id === "string" && note.id.length > 0 ? note.id : createId();
            if (seenNoteIds.has(id)) {
              return { ...note, id: createId() };
            }
            seenNoteIds.add(id);
            return note;
          });
          const nextNotes = sortNotes(dedupedNotes);
          const noteIdSet = new Set(nextNotes.map((note: ChartNote) => note.id));

          const rawChains = Array.isArray(snapshot.slideChains) ? snapshot.slideChains : [];
          const nextSlideChains = rawChains
            .map((item) => {
              if (!isRecord(item)) {
                return null;
              }
              const noteIds = Array.isArray(item.noteIds)
                ? item.noteIds.filter((id): id is string => typeof id === "string" && noteIdSet.has(id))
                : [];
              if (noteIds.length < 2) {
                return null;
              }
              const chainId =
                typeof item.id === "string" && item.id.trim().length > 0 ? item.id : `slide-${createId()}`;
              return {
                id: chainId,
                noteIds,
                timingGroup: normalizeTimingGroup(item.timingGroup, GLOBAL_TIMING_GROUP_ID),
              } as SlideChain;
            })
            .filter((item: SlideChain | null): item is SlideChain => item !== null);

          let resolvedBaseBpm = normalizeBaseBpmForWrite(nextMetadataBase.bpm, metadata.bpm) ?? metadata.bpm;
          const rawBpmEvents = Array.isArray(snapshot.bpmEvents) ? snapshot.bpmEvents : [];
          const normalizedBpmEvents: ChartBpmEvent[] = [];
          for (const rawItem of rawBpmEvents) {
            if (!isRecord(rawItem)) {
              continue;
            }
            const normalized = normalizeBpmEvent(
              rawItem as Partial<ChartBpmEvent>,
              nextBeatDivision,
              resolvedBaseBpm,
            );
            if (!normalized) {
              continue;
            }
            if (approxEq(normalized.beat, 0)) {
              const baseBpm = normalizeBaseBpmForWrite(normalized.bpm, resolvedBaseBpm);
              if (baseBpm === null) {
                ignoredBaseBpmCount += 1;
                continue;
              }
              resolvedBaseBpm = baseBpm;
              continue;
            }
            const eventBpm = normalizeEventBpmForWrite(normalized.bpm, resolvedBaseBpm);
            if (eventBpm === null) {
              ignoredEventZeroCount += 1;
              continue;
            }
            normalizedBpmEvents.push({
              ...normalized,
              bpm: eventBpm,
            });
          }
          const nextMetadata = normalizeMetadata({
            ...nextMetadataBase,
            bpm: resolvedBaseBpm,
          });
          const sortedNormalizedBpmEvents = sortBpmEvents(normalizedBpmEvents);
          if (isLastBeatOrderedBpmNegative(nextMetadata.bpm, sortedNormalizedBpmEvents)) {
            throw new Error("会话缓存末尾 BPM 为负数，已阻止恢复。");
          }

          const rawSvEvents = Array.isArray(snapshot.svEvents) ? snapshot.svEvents : [];
          const dedupedSvByGroupBeat = new Map<string, ChartSvEvent>();
          for (const rawItem of rawSvEvents) {
            if (!isRecord(rawItem)) {
              continue;
            }
            const normalized = normalizeSvEvent(
              {
                ...(rawItem as Partial<ChartSvEvent>),
                timingGroup: normalizeTimingGroup(rawItem.timingGroup, GLOBAL_TIMING_GROUP_ID),
              },
              nextBeatDivision,
              1,
            );
            if (!normalized) {
              continue;
            }
            const key = `${normalized.timingGroup}|${normalized.beat.toFixed(6)}`;
            dedupedSvByGroupBeat.set(key, normalized);
          }
          const sortedNormalizedSvEvents = sortSvEvents(Array.from(dedupedSvByGroupBeat.values()));
          const restoredTimingGroups = isRecord(snapshot.timingGroups)
            ? ensureTimingGroups(snapshot.timingGroups)
            : buildTimingGroupsFromSvEvents(sortedNormalizedSvEvents);

          setSettings(nextSettings);
          setMetadata(nextMetadata);
          const restoredNotes = restoredAppOptionSettings.habahiro
            ? applyHabahiroSlideWidths(nextNotes, nextSlideChains)
            : nextNotes;
          setNotes(restoredNotes);
          setSlideChains(nextSlideChains);
          setBpmEvents(sortedNormalizedBpmEvents);
          setTimingGroups(restoredTimingGroups);
          setToolBpmValue(nextMetadata.bpm);

          const restoredAudioDuration = Number(snapshot.audioDurationSec);
          const safeAudioDuration =
            Number.isFinite(restoredAudioDuration) && restoredAudioDuration > 0
              ? Number(restoredAudioDuration.toFixed(6))
              : 0;
          setAudioDurationSec(safeAudioDuration);

          const restoredAudioFileName =
            normalizeOptionalText(loadedChart.audioFileName) ?? normalizeOptionalText(snapshot.audioFileName) ?? "";
          setAudioFileName(restoredAudioFileName);

          let restoredMedia = parseChartMediaResources(loadedChart.resourceRefs);
          const loadedResourceSchema = Number(loadedChart.resourceRefsSchemaVersion);
          const hasLegacyMediaRef = restoredMedia !== null && (
            restoredMedia.bgm?.id.startsWith("user/") === true || restoredMedia.bgm?.id.startsWith("bestdori/") === true ||
            restoredMedia.cover?.id.startsWith("user/") === true || restoredMedia.cover?.id.startsWith("bestdori/") === true ||
            restoredMedia.mv?.id.startsWith("user/") === true || restoredMedia.mv?.id.startsWith("bestdori/") === true ||
            restoredMedia.stageBackdrop?.id.startsWith("user/") === true
          );
          if (restoredMedia !== null && (loadedResourceSchema !== 5 || hasLegacyMediaRef)) {
            const adopted = await resourceManager.adoptLegacyChartMedia(restoredMedia);
            if (adopted.status === "rejected") {
              throw new Error(`${adopted.failure.capability}: ${adopted.failure.boundary}`);
            }
            restoredMedia = adopted.value.media;
            migratedLegacyMediaRefsRef.current = adopted.value.migratedActiveRefs;
          }
          if (restoredMedia === null) {
            let bgm: ResourceRef | null = null;
            let cover: ResourceRef | null = null;
            let mv: ResourceRef | null = null;
            if (loadedAudioBase64) {
              const imported = await resourceManager.importWorkspaceMedia({
                purpose: "bgm",
                fileName: restoredAudioFileName || "legacy-audio.bin",
                mediaType: loadedAudioMimeType,
                bytes: decodeBase64ToBytes(loadedAudioBase64),
              });
              if (imported.status === "accepted") bgm = imported.value.ref;
            }
            const rawMetadata: Record<string, unknown> = isRecord(snapshot.metadata)
              ? snapshot.metadata as Record<string, unknown>
              : {};
            const restoredCoverParsed = parseDataUrl(
              loadedCoverDataUrl ?? normalizeOptionalText(rawMetadata.coverDataUrl),
            );
            if (restoredCoverParsed !== null) {
              const imported = await resourceManager.importWorkspaceMedia({
                purpose: "cover",
                fileName: "legacy-cover.bin",
                mediaType: restoredCoverParsed.mimeType,
                bytes: decodeBase64ToBytes(restoredCoverParsed.base64Data),
              });
              if (imported.status === "accepted") cover = imported.value.ref;
            }
            const restoredMvParsed = parseDataUrl(
              loadedMvDataUrl ?? normalizeOptionalText(rawMetadata.mvDataUrl),
            );
            if (restoredMvParsed !== null) {
              const imported = await resourceManager.importWorkspaceMedia({
                purpose: "mv",
                fileName: normalizeOptionalText(loadedChart.mvFileName) ?? "legacy-mv.bin",
                mediaType: restoredMvParsed.mimeType,
                bytes: decodeBase64ToBytes(restoredMvParsed.base64Data),
              });
              if (imported.status === "accepted") mv = imported.value.ref;
            }
            restoredMedia = Object.freeze({ bgm, cover, mv, stageBackdrop: null });
          }
          const reconciled = await resourceManager.reconcileCurrentChartMedia(restoredMedia);
          if (reconciled.status === "rejected") {
            throw new Error(`${reconciled.failure.capability}: ${reconciled.failure.boundary}`);
          }
          setChartMediaResources(restoredMedia);

          const restoredMetadataForChartCache = nextMetadata;
          lastSavedChartFingerprintRef.current = JSON.stringify({
            schemaVersion: SESSION_SCHEMA_VERSION,
            metadata: restoredMetadataForChartCache,
            settings: nextSettings,
            notes: nextNotes,
            slideChains: nextSlideChains,
            bpmEvents: sortedNormalizedBpmEvents,
            timingGroups: restoredTimingGroups,
            audioFileName: restoredAudioFileName,
            audioDurationSec: safeAudioDuration,
          } as Omit<ChartSnapshotV1, "savedAt">);
          restoredChart = true;
        }

        if (restoredChart) {
          clearAllSelections();
          const ignoredMessages = [
            ignoredBaseBpmCount > 0 ? `忽略 ${ignoredBaseBpmCount} 条非法基础 BPM（需 > 0）` : "",
            ignoredEventZeroCount > 0 ? `忽略 ${ignoredEventZeroCount} 条 BPM=0 事件` : "",
          ].filter((message) => message.length > 0);
          if (restoredSettings) {
            if (ignoredMessages.length > 0) {
              setStatusMessage(`已恢复谱面缓存与设置缓存，并${ignoredMessages.join("，")}。`);
            } else {
              setStatusMessage("已恢复谱面缓存与设置缓存。");
            }
          } else if (ignoredMessages.length > 0) {
            setStatusMessage(`已恢复谱面缓存，并${ignoredMessages.join("，")}。`);
          } else {
            setStatusMessage("已恢复谱面缓存。");
          }
        } else if (restoredSettings) {
          setStatusMessage("已恢复设置缓存。");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`会话缓存恢复失败：${message}`);
      } finally {
        if (!cancelled) {
          setDidRestoreAttemptFinish(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didRestoreAttemptFinish) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const metadataForChart = normalizeMetadata(metadata);
          const safeAudioDuration =
            Number.isFinite(audioDurationSec) && audioDurationSec > 0 ? Number(audioDurationSec.toFixed(6)) : 0;
          const chartCore: Omit<ChartSnapshotV1, "savedAt"> = {
            schemaVersion: SESSION_SCHEMA_VERSION,
            metadata: metadataForChart,
            settings,
            notes,
            slideChains,
            bpmEvents,
            timingGroups: ensureTimingGroups(timingGroups),
            audioFileName,
            audioDurationSec: safeAudioDuration,
          };
          if (lastSavedChartFingerprintRef.current === null) {
            const defaultMetadata = normalizeMetadata({});
            const defaultSettings = normalizeSettings({});
            const metadataIsDefault = JSON.stringify(metadataForChart) === JSON.stringify(defaultMetadata);
            const settingsIsDefault = JSON.stringify(settings) === JSON.stringify(defaultSettings);
            const hasAnyChartData = notes.length > 0 || slideChains.length > 0 || bpmEvents.length > 0 || flattenTimingGroups(timingGroups).length > 0;
            const hasAnyMediaData = Object.values(chartMediaResources).some((reference) => reference !== null)
              || (typeof audioFileName === "string" && audioFileName.trim().length > 0)
              || safeAudioDuration > 0;
            if (!hasAnyChartData && !hasAnyMediaData && metadataIsDefault && settingsIsDefault) return;
          }
          const fingerprint = JSON.stringify({ chartCore, chartMediaResources });
          if (lastSavedChartFingerprintRef.current === fingerprint) return;
          const chartJson = JSON.stringify({ ...chartCore, savedAt: new Date().toISOString() });
          await invoke("save_editor_chart_cache", {
            payload: {
              chartJson,
              resourceRefs: chartMediaResources,
              cover: null,
              audio: null,
              mv: null,
              coverCleared: true,
              audioCleared: true,
              mvCleared: true,
            },
          });
          const reconciled = await resourceManager.reconcileCurrentChartMedia(chartMediaResources);
          if (reconciled.status === "rejected") {
            throw new Error(`${reconciled.failure.capability}: ${reconciled.failure.boundary}`);
          }
          if (!legacyMediaFinalizedRef.current) {
            const finalized = await resourceManager.finalizeLegacyMediaMigration(
              migratedLegacyMediaRefsRef.current,
            );
            if (finalized.status === "rejected") {
              throw new Error(`${finalized.failure.capability}: ${finalized.failure.boundary}`);
            }
            legacyMediaFinalizedRef.current = true;
            migratedLegacyMediaRefsRef.current = Object.freeze([]);
            if (!finalized.value.completed) {
              setStatusMessage(`旧媒体迁移有 ${finalized.value.blockedCount} 项无法安全归档，已保留原记录。`);
            }
          }
          lastSavedChartFingerprintRef.current = fingerprint;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`谱面缓存保存失败：${message}`);
        }
      })();
    }, SESSION_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    audioDurationSec,
    audioFileName,
    bpmEvents,
    chartMediaResources,
    timingGroups,
    didRestoreAttemptFinish,
    metadata,
    notes,
    setStatusMessage,
    settings,
    slideChains,
  ]);

  useEffect(() => {
    if (!didRestoreAttemptFinish) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const normalizedUploadCommunityPostContent = normalizeOptionalText(uploadCommunityPostContent) ?? "";
          const normalizedUploadCommunityPostTags = (Array.isArray(uploadCommunityPostTags) ? uploadCommunityPostTags : [])
            .map((item) => {
              if (!isRecord(item)) {
                return null;
              }
              const type = normalizeOptionalText(item.type);
              const data = normalizeOptionalText(item.data);
              if (!type || !data) {
                return null;
              }
              return { type, data } as BestdoriPostTag;
            })
            .filter((item: BestdoriPostTag | null): item is BestdoriPostTag => item !== null);
          const normalizedSkinSelection = normalizeSkinSelection(skinSelection);

          const settingsCore: Omit<SettingsSnapshotV1, "savedAt"> = {
            schemaVersion: SETTINGS_SCHEMA_VERSION,
            appOptionSettings,
            windowPresetId,
            playbackWindowPresetId,
            playbackFps,
            playbackMvMode,
            playbackMvAlphaPercent,
            playbackAllPerfectStatusDisplayMode,
            uploadCommunityPostContent: normalizedUploadCommunityPostContent,
            uploadCommunityPostTags: normalizedUploadCommunityPostTags,
            skinSelection: normalizedSkinSelection,
          };

          const fingerprint = JSON.stringify(settingsCore);
          if (lastSavedSettingsFingerprintRef.current === fingerprint) {
            return;
          }

          const settingsJson = JSON.stringify({
            ...settingsCore,
            savedAt: new Date().toISOString(),
          });
          await invoke("save_editor_settings_cache", {
            settingsJson,
          });
          lastSavedSettingsFingerprintRef.current = fingerprint;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`设置缓存保存失败：${message}`);
        }
      })();
    }, SESSION_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    didRestoreAttemptFinish,
    appOptionSettings,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
    playbackAllPerfectStatusDisplayMode,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    normalizeSkinSelection,
    setStatusMessage,
  ]);
}

