import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type {
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

const SESSION_SCHEMA_VERSION = 1;
const SESSION_AUTOSAVE_DELAY_MS = 1000;
const CLEARED_RESOURCE_SIGNATURE = "__cleared__";

type SessionResourcePayload = {
  base64Data: string;
  mimeType?: string | null;
  fileName?: string | null;
};

type LoadedEditorChartCache = {
  chartJson: string;
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
  uploadCommunityPostContent?: string;
  uploadCommunityPostTags?: BestdoriPostTag[];
  skinSelection?: Record<string, unknown>;
};

type ParsedDataUrl = {
  mimeType: string;
  base64Data: string;
};

type CachedAudioResource = {
  sourceUrl: string;
  base64Data: string;
  mimeType: string | null;
  fileName: string | null;
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

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildResourceSignature(
  base64Data: string,
  mimeType: string | null | undefined,
  fileName?: string | null,
): string {
  const safeMime = normalizeOptionalText(mimeType) ?? "-";
  const safeFileName = normalizeOptionalText(fileName) ?? "-";
  const head = base64Data.slice(0, 24);
  const tail = base64Data.slice(-24);
  return `${safeMime}|${safeFileName}|${base64Data.length}|${head}|${tail}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read blob failed"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("blob to data URL failed"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export function useEditorSessionCache(params: any) {
  const {
    metadata,
    settings,
    appOptionSettings,
    notes,
    slideChains,
    bpmEvents,
    svEvents,
    audioFileName,
    audioDurationSec,
    audioObjectUrl,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
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
    setSvEvents,
    setToolBpmValue,
    setAudioFileName,
    setAudioDurationSec,
    setAudioObjectUrl,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    clearAllSelections,
    setStatusMessage,
  } = params;

  const [didRestoreAttemptFinish, setDidRestoreAttemptFinish] = useState(false);
  const audioResourceRef = useRef<CachedAudioResource | null>(null);
  const lastSavedChartFingerprintRef = useRef<string | null>(null);
  const lastSavedSettingsFingerprintRef = useRef<string | null>(null);
  const lastSavedCoverSignatureRef = useRef<string>(CLEARED_RESOURCE_SIGNATURE);
  const lastSavedAudioSignatureRef = useRef<string>(CLEARED_RESOURCE_SIGNATURE);
  const lastSavedMvSignatureRef = useRef<string>(CLEARED_RESOURCE_SIGNATURE);

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
            schemaVersion: SESSION_SCHEMA_VERSION,
            appOptionSettings: nextAppOptionSettings,
            windowPresetId: resolvedWindowPresetId,
            playbackWindowPresetId: resolvedPlaybackWindowPresetId,
            playbackFps: resolvedPlaybackFps,
            playbackMvMode: resolvedPlaybackMvMode,
            playbackMvAlphaPercent: resolvedPlaybackMvAlphaPercent,
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
          const nextMetadataBase = normalizeMetadata({
            ...snapshotMetadata,
            coverDataUrl: loadedCoverDataUrl ?? snapshotMetadata.coverDataUrl ?? null,
            mvDataUrl: loadedMvDataUrl ?? snapshotMetadata.mvDataUrl ?? null,
          });

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
                timingGroup: normalizeTimingGroup(item.timingGroup, 0),
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
                timingGroup: normalizeTimingGroup(rawItem.timingGroup, 0),
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

          setSettings(nextSettings);
          setMetadata(nextMetadata);
          const restoredNotes = restoredAppOptionSettings.habahiro
            ? applyHabahiroSlideWidths(nextNotes, nextSlideChains)
            : nextNotes;
          setNotes(restoredNotes);
          setSlideChains(nextSlideChains);
          setBpmEvents(sortedNormalizedBpmEvents);
          setSvEvents(sortedNormalizedSvEvents);
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

          const loadedAudioBase64 = normalizeOptionalText(loadedChart.audioBase64);
          let restoredAudioSignature = CLEARED_RESOURCE_SIGNATURE;
          if (loadedAudioBase64) {
            const audioMimeType = normalizeOptionalText(loadedChart.audioMimeType) ?? "audio/mpeg";
            const audioBlob = new Blob([decodeBase64ToBytes(loadedAudioBase64)], { type: audioMimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioObjectUrl((current: string | null) => {
              if (current) {
                URL.revokeObjectURL(current);
              }
              return audioUrl;
            });
            audioResourceRef.current = {
              sourceUrl: audioUrl,
              base64Data: loadedAudioBase64,
              mimeType: audioMimeType,
              fileName: restoredAudioFileName || null,
            };
            restoredAudioSignature = buildResourceSignature(
              loadedAudioBase64,
              audioMimeType,
              restoredAudioFileName || null,
            );
          } else {
            setAudioObjectUrl((current: string | null) => {
              if (current) {
                URL.revokeObjectURL(current);
              }
              return null;
            });
            audioResourceRef.current = null;
          }

          const restoredCoverParsed = parseDataUrl(
            loadedCoverDataUrl ?? (snapshotMetadata.coverDataUrl as string | null | undefined),
          );
          const restoredMvParsed = parseDataUrl(
            loadedMvDataUrl ?? (snapshotMetadata.mvDataUrl as string | null | undefined),
          );
          lastSavedCoverSignatureRef.current = restoredCoverParsed
            ? buildResourceSignature(restoredCoverParsed.base64Data, restoredCoverParsed.mimeType)
            : CLEARED_RESOURCE_SIGNATURE;
          lastSavedAudioSignatureRef.current = restoredAudioSignature;
          lastSavedMvSignatureRef.current = restoredMvParsed
            ? buildResourceSignature(restoredMvParsed.base64Data, restoredMvParsed.mimeType, loadedChart.mvFileName)
            : CLEARED_RESOURCE_SIGNATURE;

          const restoredMetadataForChartCache = normalizeMetadata({
            ...nextMetadata,
            coverDataUrl: restoredCoverParsed ? null : nextMetadata.coverDataUrl,
            mvDataUrl: restoredMvParsed ? null : nextMetadata.mvDataUrl,
          });
          lastSavedChartFingerprintRef.current = JSON.stringify({
            schemaVersion: SESSION_SCHEMA_VERSION,
            metadata: restoredMetadataForChartCache,
            settings: nextSettings,
            notes: nextNotes,
            slideChains: nextSlideChains,
            bpmEvents: sortedNormalizedBpmEvents,
            svEvents: sortedNormalizedSvEvents,
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
    if (!audioObjectUrl) {
      audioResourceRef.current = null;
      return;
    }

    const existing = audioResourceRef.current;
    if (existing && existing.sourceUrl === audioObjectUrl) {
      const nextFileName = normalizeOptionalText(audioFileName);
      if (existing.fileName !== nextFileName) {
        audioResourceRef.current = {
          ...existing,
          fileName: nextFileName,
        };
      }
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(audioObjectUrl);
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) {
          throw new Error("audio data URL parse failed");
        }
        if (cancelled) {
          return;
        }
        audioResourceRef.current = {
          sourceUrl: audioObjectUrl,
          base64Data: parsed.base64Data,
          mimeType: parsed.mimeType,
          fileName: normalizeOptionalText(audioFileName),
        };
      } catch (error) {
        if (cancelled) {
          return;
        }
        audioResourceRef.current = null;
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`音频缓存处理失败：${message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioFileName, audioObjectUrl, setStatusMessage]);

  useEffect(() => {
    if (!didRestoreAttemptFinish) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const parsedCover = parseDataUrl(metadata.coverDataUrl);
          const parsedMv = parseDataUrl(metadata.mvDataUrl);
          const metadataForChart = normalizeMetadata({
            ...metadata,
            coverDataUrl: parsedCover ? null : metadata.coverDataUrl,
            mvDataUrl: parsedMv ? null : metadata.mvDataUrl,
          });
          const safeAudioDuration =
            Number.isFinite(audioDurationSec) && audioDurationSec > 0 ? Number(audioDurationSec.toFixed(6)) : 0;

          const chartCore: Omit<ChartSnapshotV1, "savedAt"> = {
            schemaVersion: SESSION_SCHEMA_VERSION,
            metadata: metadataForChart,
            settings,
            notes,
            slideChains,
            bpmEvents,
            svEvents,
            audioFileName,
            audioDurationSec: safeAudioDuration,
          };

          if (lastSavedChartFingerprintRef.current === null) {
            const defaultMetadata = normalizeMetadata({});
            const defaultSettings = normalizeSettings({});
            const metadataIsDefault = JSON.stringify(metadataForChart) === JSON.stringify(defaultMetadata);
            const settingsIsDefault = JSON.stringify(settings) === JSON.stringify(defaultSettings);
            const hasAnyChartData =
              notes.length > 0 ||
              slideChains.length > 0 ||
              bpmEvents.length > 0 ||
              svEvents.length > 0;
            const hasAnyMediaData =
              (typeof audioObjectUrl === "string" && audioObjectUrl.length > 0)
              || (typeof audioFileName === "string" && audioFileName.trim().length > 0)
              || safeAudioDuration > 0
              || (typeof metadata.coverDataUrl === "string" && metadata.coverDataUrl.trim().length > 0)
              || (typeof metadata.mvDataUrl === "string" && metadata.mvDataUrl.trim().length > 0);
            if (!hasAnyChartData && !hasAnyMediaData && metadataIsDefault && settingsIsDefault) {
              return;
            }
          }

          const fingerprint = JSON.stringify(chartCore);
          const isCoreUnchanged = lastSavedChartFingerprintRef.current === fingerprint;

          const coverSignature = parsedCover
            ? buildResourceSignature(parsedCover.base64Data, parsedCover.mimeType)
            : CLEARED_RESOURCE_SIGNATURE;
          const shouldWriteCover =
            parsedCover !== null && lastSavedCoverSignatureRef.current !== coverSignature;
          const shouldClearCover =
            parsedCover === null && lastSavedCoverSignatureRef.current !== CLEARED_RESOURCE_SIGNATURE;

          const audioResource = audioResourceRef.current;
          const isAudioPayloadPending = Boolean(audioObjectUrl && !audioResource);
          const audioPayload: SessionResourcePayload | null =
            isAudioPayloadPending
              ? null
              : audioObjectUrl && audioResource
                ? {
                    base64Data: audioResource.base64Data,
                    mimeType: audioResource.mimeType,
                    fileName: normalizeOptionalText(audioFileName) ?? audioResource.fileName,
                  }
                : null;
          const audioSignature = audioPayload
            ? buildResourceSignature(
                audioPayload.base64Data,
                audioPayload.mimeType ?? null,
                audioPayload.fileName ?? null,
              )
            : CLEARED_RESOURCE_SIGNATURE;
          const shouldWriteAudio =
            !isAudioPayloadPending &&
            audioPayload !== null &&
            lastSavedAudioSignatureRef.current !== audioSignature;
          const shouldClearAudio =
            !isAudioPayloadPending &&
            audioPayload === null &&
            lastSavedAudioSignatureRef.current !== CLEARED_RESOURCE_SIGNATURE;

          const mvPayload: SessionResourcePayload | null = parsedMv
            ? {
                base64Data: parsedMv.base64Data,
                mimeType: parsedMv.mimeType,
                fileName: null,
              }
            : null;
          const mvSignature = mvPayload
            ? buildResourceSignature(mvPayload.base64Data, mvPayload.mimeType ?? null, mvPayload.fileName ?? null)
            : CLEARED_RESOURCE_SIGNATURE;
          const shouldWriteMv = mvPayload !== null && lastSavedMvSignatureRef.current !== mvSignature;
          const shouldClearMv = mvPayload === null && lastSavedMvSignatureRef.current !== CLEARED_RESOURCE_SIGNATURE;

          if (
            isCoreUnchanged
            && !shouldWriteCover && !shouldClearCover
            && !shouldWriteAudio && !shouldClearAudio
            && !shouldWriteMv && !shouldClearMv
          ) {
            return;
          }

          const chartJson = JSON.stringify({
            ...chartCore,
            savedAt: new Date().toISOString(),
          });

          const coverPayload: SessionResourcePayload | null = parsedCover
            ? {
                base64Data: parsedCover.base64Data,
                mimeType: parsedCover.mimeType,
              }
            : null;

          await invoke("save_editor_chart_cache", {
            payload: {
              chartJson,
              cover: shouldWriteCover ? coverPayload : null,
              audio: shouldWriteAudio ? audioPayload : null,
              mv: shouldWriteMv ? mvPayload : null,
              coverCleared: shouldClearCover,
              audioCleared: shouldClearAudio,
              mvCleared: shouldClearMv,
            },
          });

          lastSavedChartFingerprintRef.current = fingerprint;
          if (shouldWriteCover || shouldClearCover) {
            lastSavedCoverSignatureRef.current = coverSignature;
          }
          if (shouldWriteAudio || shouldClearAudio) {
            lastSavedAudioSignatureRef.current = audioSignature;
          }
          if (shouldWriteMv || shouldClearMv) {
            lastSavedMvSignatureRef.current = mvSignature;
          }
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
    audioObjectUrl,
    bpmEvents,
    svEvents,
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
            schemaVersion: SESSION_SCHEMA_VERSION,
            appOptionSettings,
            windowPresetId,
            playbackWindowPresetId,
            playbackFps,
            playbackMvMode,
            playbackMvAlphaPercent,
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
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    normalizeSkinSelection,
    setStatusMessage,
  ]);
}

