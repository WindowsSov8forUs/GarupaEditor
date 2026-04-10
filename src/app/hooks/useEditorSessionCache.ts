import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type {
  ChartBpmEvent,
  ChartMetadata,
  ChartNote,
  EditorOptionSettings,
  ChartSettings,
  WindowPreset,
} from "../../chartCore";
import type { SlideChain } from "../editorHelpers";

const SESSION_SCHEMA_VERSION = 1;
const SESSION_AUTOSAVE_DELAY_MS = 1000;
const CLEARED_RESOURCE_SIGNATURE = "__cleared__";

type SessionResourcePayload = {
  base64Data: string;
  mimeType?: string | null;
  fileName?: string | null;
};

type LoadedEditorSessionCache = {
  sessionJson: string;
  coverDataUrl?: string | null;
  audioBase64?: string | null;
  audioMimeType?: string | null;
  audioFileName?: string | null;
};

type SessionSnapshotV1 = {
  schemaVersion: number;
  savedAt: string;
  metadata: Partial<ChartMetadata>;
  settings: Partial<ChartSettings>;
  appOptionSettings?: Partial<EditorOptionSettings>;
  notes: Array<Partial<ChartNote>>;
  slideChains: Array<Partial<SlideChain>>;
  bpmEvents: Array<Partial<ChartBpmEvent>>;
  audioFileName?: string;
  audioDurationSec?: number;
  windowPresetId?: string;
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
    audioFileName,
    audioDurationSec,
    audioObjectUrl,
    windowPresetId,
    WINDOW_SIZE_PRESETS,
    normalizeMetadata,
    normalizeSettings,
    normalizeEditorOptionSettings,
    normalizeNote,
    normalizeBpmEvent,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    approxEq,
    createId,
    setMetadata,
    setSettings,
    setAppOptionSettings,
    setNotes,
    setSlideChains,
    setBpmEvents,
    setToolBpmValue,
    setAudioFileName,
    setAudioDurationSec,
    setAudioObjectUrl,
    setWindowPresetId,
    applyWindowPresetById,
    clearAllSelections,
    setStatusMessage,
  } = params;

  const [didRestoreAttemptFinish, setDidRestoreAttemptFinish] = useState(false);
  const [, setIsAudioCacheReady] = useState(true);
  const audioResourceRef = useRef<CachedAudioResource | null>(null);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastSavedCoverSignatureRef = useRef<string>(CLEARED_RESOURCE_SIGNATURE);
  const lastSavedAudioSignatureRef = useRef<string>(CLEARED_RESOURCE_SIGNATURE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await invoke<LoadedEditorSessionCache | null>("load_editor_session_cache");
        if (cancelled || !loaded || typeof loaded.sessionJson !== "string") {
          return;
        }

        const parsedUnknown = JSON.parse(loaded.sessionJson) as unknown;
        if (!isRecord(parsedUnknown)) {
          throw new Error("session JSON root must be an object");
        }
        const snapshot = parsedUnknown as Partial<SessionSnapshotV1>;

        const nextSettings = normalizeSettings(
          isRecord(snapshot.settings) ? (snapshot.settings as Partial<ChartSettings>) : {},
        );
        const nextAppOptionSettings = normalizeEditorOptionSettings(
          isRecord(snapshot.appOptionSettings)
            ? (snapshot.appOptionSettings as Partial<EditorOptionSettings>)
            : {},
        );
        const nextBeatDivision = nextSettings.timeSignatureDenominator;

        const snapshotMetadata = isRecord(snapshot.metadata)
          ? (snapshot.metadata as Partial<ChartMetadata>)
          : {};
        const loadedCoverDataUrl = normalizeOptionalText(loaded.coverDataUrl);
        const nextMetadataBase = normalizeMetadata({
          ...snapshotMetadata,
          coverDataUrl: loadedCoverDataUrl ?? snapshotMetadata.coverDataUrl ?? null,
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
            } as SlideChain;
          })
          .filter((item: SlideChain | null): item is SlideChain => item !== null);

        let resolvedBaseBpm = normalizeBaseBpmForWrite(nextMetadataBase.bpm, metadata.bpm) ?? metadata.bpm;
        let ignoredBaseBpmCount = 0;
        let ignoredEventZeroCount = 0;
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

        setSettings(nextSettings);
        setAppOptionSettings(nextAppOptionSettings);
        setMetadata(nextMetadata);
        setNotes(nextNotes);
        setSlideChains(nextSlideChains);
        setBpmEvents(sortedNormalizedBpmEvents);
        setToolBpmValue(nextMetadata.bpm);

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

        const restoredAudioDuration = Number(snapshot.audioDurationSec);
        setAudioDurationSec(
          Number.isFinite(restoredAudioDuration) && restoredAudioDuration > 0
            ? restoredAudioDuration
            : 0,
        );

        const restoredAudioFileName =
          normalizeOptionalText(loaded.audioFileName) ?? normalizeOptionalText(snapshot.audioFileName) ?? "";
        setAudioFileName(restoredAudioFileName);

        const loadedAudioBase64 = normalizeOptionalText(loaded.audioBase64);
        let restoredAudioSignature = CLEARED_RESOURCE_SIGNATURE;
        if (loadedAudioBase64) {
          const audioMimeType = normalizeOptionalText(loaded.audioMimeType) ?? "audio/mpeg";
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
        lastSavedCoverSignatureRef.current = restoredCoverParsed
          ? buildResourceSignature(restoredCoverParsed.base64Data, restoredCoverParsed.mimeType)
          : CLEARED_RESOURCE_SIGNATURE;
        lastSavedAudioSignatureRef.current = restoredAudioSignature;

        const restoredMetadataForCache = restoredCoverParsed
          ? { ...nextMetadata, coverDataUrl: null }
          : nextMetadata;
        lastSavedFingerprintRef.current = JSON.stringify({
          schemaVersion: SESSION_SCHEMA_VERSION,
          metadata: restoredMetadataForCache,
          settings: nextSettings,
          appOptionSettings: nextAppOptionSettings,
          notes: nextNotes,
          slideChains: nextSlideChains,
          bpmEvents: sortedNormalizedBpmEvents,
          audioFileName: restoredAudioFileName,
          audioDurationSec:
            Number.isFinite(restoredAudioDuration) && restoredAudioDuration > 0
              ? Number(restoredAudioDuration.toFixed(6))
              : 0,
          windowPresetId: resolvedWindowPresetId,
        } as Omit<SessionSnapshotV1, "savedAt">);

        clearAllSelections();
        const ignoredMessages = [
          ignoredBaseBpmCount > 0 ? `忽略 ${ignoredBaseBpmCount} 条非法基础 BPM（需 > 0）` : "",
          ignoredEventZeroCount > 0 ? `忽略 ${ignoredEventZeroCount} 条 BPM=0 事件` : "",
        ].filter((message) => message.length > 0);
        if (ignoredMessages.length > 0) {
          setStatusMessage(`已恢复上次关闭前的编辑缓存，并${ignoredMessages.join("，")}。`);
        } else {
          setStatusMessage("已恢复上次关闭前的编辑缓存。");
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
      setIsAudioCacheReady(true);
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
      setIsAudioCacheReady(true);
      return;
    }

    let cancelled = false;
    setIsAudioCacheReady(false);

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
      } finally {
        if (!cancelled) {
          setIsAudioCacheReady(true);
        }
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
          const metadataForSession = parsedCover ? { ...metadata, coverDataUrl: null } : metadata;
          const safeAudioDuration =
            Number.isFinite(audioDurationSec) && audioDurationSec > 0 ? Number(audioDurationSec.toFixed(6)) : 0;

          const sessionCore: Omit<SessionSnapshotV1, "savedAt"> = {
            schemaVersion: SESSION_SCHEMA_VERSION,
            metadata: metadataForSession,
            settings,
            appOptionSettings,
            notes,
            slideChains,
            bpmEvents,
            audioFileName,
            audioDurationSec: safeAudioDuration,
            windowPresetId,
          };

          // Guard against clobbering an existing cache with pristine defaults
          // when restore did not establish an initial fingerprint.
          if (lastSavedFingerprintRef.current === null) {
            const defaultMetadata = normalizeMetadata({});
            const defaultSettings = normalizeSettings({});
            const defaultAppOptionSettings = normalizeEditorOptionSettings({});
            const metadataIsDefault = JSON.stringify(metadataForSession) === JSON.stringify(defaultMetadata);
            const settingsIsDefault = JSON.stringify(settings) === JSON.stringify(defaultSettings);
            const appOptionSettingsIsDefault =
              JSON.stringify(appOptionSettings) === JSON.stringify(defaultAppOptionSettings);
            const hasAnyChartData = notes.length > 0 || slideChains.length > 0 || bpmEvents.length > 0;
            const hasAnyMediaData =
              (typeof audioObjectUrl === "string" && audioObjectUrl.length > 0)
              || (typeof audioFileName === "string" && audioFileName.trim().length > 0)
              || safeAudioDuration > 0
              || (typeof metadata.coverDataUrl === "string" && metadata.coverDataUrl.trim().length > 0);
            if (!hasAnyChartData && !hasAnyMediaData && metadataIsDefault && settingsIsDefault && appOptionSettingsIsDefault) {
              return;
            }
          }

          const fingerprint = JSON.stringify(sessionCore);
          const isCoreUnchanged = lastSavedFingerprintRef.current === fingerprint;

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

          if (isCoreUnchanged && !shouldWriteCover && !shouldClearCover && !shouldWriteAudio && !shouldClearAudio) {
            return;
          }

          const sessionJson = JSON.stringify({
            ...sessionCore,
            savedAt: new Date().toISOString(),
          });

          const coverPayload: SessionResourcePayload | null = parsedCover
            ? {
                base64Data: parsedCover.base64Data,
                mimeType: parsedCover.mimeType,
              }
            : null;

          await invoke("save_editor_session_cache", {
            sessionJson,
            cover: shouldWriteCover ? coverPayload : null,
            audio: shouldWriteAudio ? audioPayload : null,
            coverCleared: shouldClearCover,
            audioCleared: shouldClearAudio,
          });

          lastSavedFingerprintRef.current = fingerprint;
          if (shouldWriteCover || shouldClearCover) {
            lastSavedCoverSignatureRef.current = coverSignature;
          }
          if (shouldWriteAudio || shouldClearAudio) {
            lastSavedAudioSignatureRef.current = audioSignature;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`会话缓存保存失败：${message}`);
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
    didRestoreAttemptFinish,
    metadata,
    notes,
    setStatusMessage,
    settings,
    appOptionSettings,
    slideChains,
    windowPresetId,
  ]);
}

