import { convertCurrentChartJsonToBestdoriV2 } from "../../chartFormatConverter";
import type { ChartMetadata } from "../../chartCore";
import {
  BESTDORI_COMMON_TAP_SKILL_FILE_NAME,
  SONOLUS_TEST_SERVER_ROOT,
  bestdoriGetMe,
  buildBestdoriCommunityChartPostPayload,
  buildBestdoriUploadedFileUrl,
  createBestdoriCommunityChartPost,
  ensureCommonSoundAsset,
  fetchBestdoriFileUploadStatus,
  prepareBestdoriFileUpload,
  readBgSkinBinaryFileAsDataUrl,
  readCommonSoundBinaryFileAsDataUrl,
  readFieldSkinBinaryFileAsDataUrl,
  readJudgeSkinBinaryFileAsDataUrl,
  readSkinBinaryFileAsDataUrl,
  readSoundBinaryFileAsDataUrl,
  uploadSonolusLevel,
  type BestdoriPostContentSegment,
  type BestdoriPostTag,
  uploadBestdoriFile,
} from "./api";

type DataUrlReader = (path: string, fileName: string) => Promise<string>;

export function normalizeLowercaseFileMap(fileMap: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(fileMap)) {
    normalized[name.toLowerCase()] = value;
  }
  return normalized;
}

async function loadPreparedBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
  reader: DataUrlReader,
): Promise<Record<string, string>> {
  const entries = Object.entries(fileMap);
  const loaded = await Promise.all(
    entries.map(async ([name, path]) => {
      const dataUrl = await reader(path, name);
      return [name.toLowerCase(), dataUrl] as const;
    }),
  );
  return Object.fromEntries(loaded);
}

export async function loadPreparedSkinBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
): Promise<Record<string, string>> {
  return loadPreparedBinaryFilesAsDataUrlMap(fileMap, readSkinBinaryFileAsDataUrl);
}

export async function loadPreparedSoundBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
): Promise<Record<string, string>> {
  return loadPreparedBinaryFilesAsDataUrlMap(fileMap, readSoundBinaryFileAsDataUrl);
}

export async function loadPreparedFieldSkinBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
): Promise<Record<string, string>> {
  return loadPreparedBinaryFilesAsDataUrlMap(fileMap, readFieldSkinBinaryFileAsDataUrl);
}

export async function loadPreparedBgSkinBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
): Promise<Record<string, string>> {
  return loadPreparedBinaryFilesAsDataUrlMap(fileMap, readBgSkinBinaryFileAsDataUrl);
}

export async function loadPreparedJudgeSkinBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
): Promise<Record<string, string>> {
  return loadPreparedBinaryFilesAsDataUrlMap(fileMap, readJudgeSkinBinaryFileAsDataUrl);
}

export async function ensureCommonTapSkillSeDataUrl(options?: { operationId?: string }): Promise<string> {
  const path = await ensureCommonSoundAsset(options?.operationId);
  return readCommonSoundBinaryFileAsDataUrl(path, BESTDORI_COMMON_TAP_SKILL_FILE_NAME);
}

export interface UploadBestdoriFileFlowParams {
  fileName: string;
  fileData: Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  maxStatusChecks?: number;
  statusCheckIntervalMs?: number;
}

export interface UploadBestdoriFileFlowResult {
  fileHash: string;
  fileUrl: string;
  reused: boolean;
}

function normalizeBestdoriUploadFlowFileName(fileName: string): string {
  const normalized = fileName.trim();
  if (!normalized) {
    throw new Error("bestdori upload fileName cannot be empty");
  }
  return normalized;
}

function normalizeBestdoriStatusChecks(value: number | undefined): number {
  const normalized = Math.trunc(Number(value ?? 5));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error("bestdori upload maxStatusChecks must be >= 1");
  }
  return normalized;
}

function normalizeBestdoriStatusIntervalMs(value: number | undefined): number {
  const normalized = Math.trunc(Number(value ?? 200));
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("bestdori upload statusCheckIntervalMs must be >= 0");
  }
  return normalized;
}

function normalizeBestdoriUploadCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBestdoriUploadHash(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

async function normalizeBestdoriUploadFlowFileData(value: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (value instanceof Uint8Array) {
    if (value.length <= 0) {
      throw new Error("bestdori upload fileData cannot be empty");
    }
    return value;
  }
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (bytes.length <= 0) {
      throw new Error("bestdori upload fileData cannot be empty");
    }
    return bytes;
  }
  const bytes = new Uint8Array(value);
  if (bytes.length <= 0) {
    throw new Error("bestdori upload fileData cannot be empty");
  }
  return bytes;
}

async function sha1Hex(content: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto is unavailable, cannot compute SHA-1 hash for bestdori upload");
  }
  const digest = await crypto.subtle.digest("SHA-1", content);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function uploadBestdoriFileFlow(
  params: UploadBestdoriFileFlowParams,
): Promise<UploadBestdoriFileFlowResult> {
  const fileName = normalizeBestdoriUploadFlowFileName(params.fileName);
  const fileData = await normalizeBestdoriUploadFlowFileData(params.fileData);
  const maxStatusChecks = normalizeBestdoriStatusChecks(params.maxStatusChecks);
  const statusCheckIntervalMs = normalizeBestdoriStatusIntervalMs(params.statusCheckIntervalMs);
  const fileHash = await sha1Hex(fileData);
  const fileSize = fileData.byteLength;

  const prepareResult = await prepareBestdoriFileUpload(fileHash, fileSize, { ver: 3 });
  const prepareCode = normalizeBestdoriUploadCode(prepareResult.code);
  if (prepareResult.result === false) {
    if (prepareCode === "ALREADY_UPLOADED") {
      return {
        fileHash,
        fileUrl: buildBestdoriUploadedFileUrl(fileHash),
        reused: true,
      };
    }
    throw new Error(`bestdori upload prepare failed: ${prepareCode ?? "unknown error"}`);
  }

  const uploadResult = await uploadBestdoriFile(fileName, fileData, {
    fieldName: "file",
    mimeType: params.mimeType,
  });
  if (uploadResult.result === false) {
    const uploadCode = normalizeBestdoriUploadCode(uploadResult.code);
    throw new Error(`bestdori upload file failed: ${uploadCode ?? "unknown error"}`);
  }

  const uploadedHash = normalizeBestdoriUploadHash(uploadResult.hash) ?? fileHash;
  for (let check = 0; check < maxStatusChecks; check += 1) {
    const statusResult = await fetchBestdoriFileUploadStatus(uploadedHash);
    if (statusResult.result === false) {
      const statusCode = normalizeBestdoriUploadCode(statusResult.code);
      throw new Error(`bestdori upload status failed: ${statusCode ?? "unknown error"}`);
    }
    if (normalizeBestdoriUploadCode(statusResult.status) === "available") {
      return {
        fileHash: uploadedHash,
        fileUrl: buildBestdoriUploadedFileUrl(uploadedHash),
        reused: false,
      };
    }
    if (check + 1 < maxStatusChecks) {
      await sleep(statusCheckIntervalMs);
    }
  }
  throw new Error(`bestdori upload timeout after ${maxStatusChecks} status checks`);
}

const BESTDORI_POST_URL_ROOT = "https://bestdori.com/community/charts";
const BESTDORI_UPLOAD_FILE_URL_RE = /^https?:\/\/(?:www\.)?bestdori\.com\/api\/upload\/file\/([0-9a-f]{40})$/i;
const BESTDORI_DIFFICULTY_TO_DIFF: Readonly<Record<ChartMetadata["difficulty"], number>> = {
  EASY: 0,
  NORMAL: 1,
  HARD: 2,
  EXPERT: 3,
  SPECIAL: 4,
};

export type PublishBestdoriCommunityChartStage =
  | "checking-login"
  | "converting-chart"
  | "resolving-audio"
  | "uploading-audio"
  | "resolving-cover"
  | "uploading-cover"
  | "posting";

export interface PublishBestdoriCommunityChartFlowParams {
  chartJson: unknown;
  metadata: ChartMetadata;
  audioSourceUrl?: string | null;
  audioFileName?: string | null;
  coverSourceUrl?: string | null;
  coverFileName?: string | null;
  contentText?: string | null;
  tags?: BestdoriPostTag[] | null;
  onStage?: (stage: PublishBestdoriCommunityChartStage) => void;
}

export interface PublishBestdoriCommunityChartFlowResult {
  postId: number;
  postUrl: string;
  svDropped: boolean;
  audioUrl: string | null;
  coverUrl: string | null;
}

function trimNonEmptyStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveIntegerOrNull(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = Math.trunc(numeric);
  return normalized >= 1 ? normalized : null;
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveFileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split("/").filter((item) => item.length > 0).pop();
    if (tail) {
      const decoded = decodeURIComponent(tail);
      const normalized = sanitizeFileNameSegment(decoded);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  } catch {
    // ignore and use fallback
  }
  return fallback;
}

function normalizeBestdoriUploadedFileUrlOrNull(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const matched = BESTDORI_UPLOAD_FILE_URL_RE.exec(url);
  if (!matched) {
    return null;
  }
  return buildBestdoriUploadedFileUrl(matched[1]);
}

function inferMimeTypeByExtension(fileName: string, fallbackMimeType: string): string {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (normalized.endsWith(".wav")) {
    return "audio/wav";
  }
  if (normalized.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  return fallbackMimeType;
}

function extractMimeTypeFromDataUrl(url: string): string | null {
  const matched = /^data:([^;,]+)[;,]/i.exec(url);
  if (!matched) {
    return null;
  }
  const mimeType = matched[1]?.trim().toLowerCase() ?? "";
  return mimeType.length > 0 ? mimeType : null;
}

function hasSvItems(chartJson: unknown): boolean {
  if (!Array.isArray(chartJson)) {
    return false;
  }
  return chartJson.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const type = (item as { type?: unknown }).type;
    return type === "SV";
  });
}

async function resolvePostSongFileUrl(
  sourceUrl: string | null,
  preferredFileName: string | null,
  fallbackFileName: string,
  fallbackMimeType: string,
  onUploadStage?: () => void,
): Promise<string | null> {
  if (!sourceUrl) {
    return null;
  }

  const reused = normalizeBestdoriUploadedFileUrlOrNull(sourceUrl);
  if (reused) {
    return reused;
  }

  const sourceFile = await resolveUploadSourceFile(
    sourceUrl,
    preferredFileName,
    fallbackFileName,
    fallbackMimeType,
  );

  onUploadStage?.();

  const uploaded = await uploadBestdoriFileFlow({
    fileName: sourceFile.fileName,
    fileData: sourceFile.fileBytes,
    mimeType: sourceFile.mimeType,
  });
  return uploaded.fileUrl;
}

function buildPostUrl(postId: number): string {
  return `${BESTDORI_POST_URL_ROOT}/${postId}`;
}

export async function publishBestdoriCommunityChartFlow(
  params: PublishBestdoriCommunityChartFlowParams,
): Promise<PublishBestdoriCommunityChartFlowResult> {
  params.onStage?.("checking-login");
  const me = await bestdoriGetMe();
  if (!me.result) {
    throw new Error("bestdori account is not logged in");
  }

  const metadata = params.metadata;
  const diff = BESTDORI_DIFFICULTY_TO_DIFF[metadata.difficulty] ?? 0;
  const level = normalizePositiveIntegerOrNull(metadata.difficultyLevel) ?? 1;
  const title = trimNonEmptyStringOrNull(metadata.title) ?? "Untitled Chart";
  const artists = trimNonEmptyStringOrNull(metadata.artist) ?? "Unknown Artist";
  const chartSource = params.chartJson;
  const svDropped = hasSvItems(chartSource);

  params.onStage?.("converting-chart");
  const bestdoriChart = convertCurrentChartJsonToBestdoriV2(chartSource);
  if (!Array.isArray(bestdoriChart) || bestdoriChart.length <= 0) {
    throw new Error("converted bestdori chart is empty");
  }

  const titleFileStem = sanitizeFileNameSegment(title ?? "chart") || "chart";
  const normalizedAudioSource = trimNonEmptyStringOrNull(params.audioSourceUrl) ?? trimNonEmptyStringOrNull(metadata.bgmDataUrl);
  const normalizedCoverSource = trimNonEmptyStringOrNull(params.coverSourceUrl) ?? trimNonEmptyStringOrNull(metadata.coverDataUrl);
  if (!normalizedAudioSource) {
    throw new Error("社区谱面上传需要歌曲音频，请先在谱面信息中上传音频。");
  }
  if (!normalizedCoverSource) {
    throw new Error("社区谱面上传需要歌曲封面，请先在谱面信息中上传封面。");
  }
  const audioFallbackName = `${titleFileStem}.mp3`;
  const coverFallbackName = `${titleFileStem}.png`;

  params.onStage?.("resolving-audio");
  const audioUrl = await resolvePostSongFileUrl(
    normalizedAudioSource,
    trimNonEmptyStringOrNull(params.audioFileName),
    audioFallbackName,
    "audio/mpeg",
    () => params.onStage?.("uploading-audio"),
  );
  if (!audioUrl) {
    throw new Error("社区谱面上传需要有效歌曲音频地址。");
  }

  params.onStage?.("resolving-cover");
  const coverUrl = await resolvePostSongFileUrl(
    normalizedCoverSource,
    trimNonEmptyStringOrNull(params.coverFileName),
    coverFallbackName,
    "image/png",
    () => params.onStage?.("uploading-cover"),
  );
  if (!coverUrl) {
    throw new Error("社区谱面上传需要有效歌曲封面地址。");
  }

  const song = {
    type: "custom" as const,
    audio: audioUrl,
    cover: coverUrl,
  };
  const contentText = trimNonEmptyStringOrNull(params.contentText) ?? "Uploaded with GarupaEditor";
  const content: BestdoriPostContentSegment[] = [
    {
      type: "text",
      data: contentText,
    },
  ];
  const normalizedTags = Array.isArray(params.tags) ? params.tags.filter((tag) => {
    const type = trimNonEmptyStringOrNull(tag?.type);
    const data = trimNonEmptyStringOrNull(tag?.data);
    return Boolean(type && data);
  }) : [];
  const postInput = {
    title,
    artists,
    diff,
    level,
    chart: bestdoriChart,
    content,
    song,
    tags: normalizedTags,
    categoryName: "SELF_POST" as const,
    categoryId: "chart" as const,
  };
  const requestPayload = buildBestdoriCommunityChartPostPayload(postInput);
  const requestPayloadText = JSON.stringify(requestPayload, null, 2);

  params.onStage?.("posting");
  let response;
  try {
    response = await createBestdoriCommunityChartPost(postInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`bestdori post request failed: ${message}\npayload:\n${requestPayloadText}`);
  }

  if (response.result === false) {
    throw new Error(
      `bestdori post failed: ${normalizeBestdoriUploadCode(response.code) ?? "unknown error"}\n`
      + `payload:\n${requestPayloadText}`,
    );
  }

  const postId = Math.trunc(Number(response.id));
  if (!Number.isFinite(postId) || postId < 1) {
    throw new Error("bestdori post failed: invalid post id");
  }

  return {
    postId,
    postUrl: buildPostUrl(postId),
    svDropped,
    audioUrl,
    coverUrl,
  };
}

const SONOLUS_LEVEL_URL_ROOT = `${SONOLUS_TEST_SERVER_ROOT}/sonolus/levels`;

export type UploadSonolusLevelFlowStage = "converting-chart" | "resolving-audio" | "uploading";

export interface UploadSonolusLevelFlowParams {
  chartJson: unknown;
  metadata: ChartMetadata;
  audioSourceUrl?: string | null;
  audioFileName?: string | null;
  difficulty?: number;
  lifetime?: number;
  hidden?: boolean;
  onStage?: (stage: UploadSonolusLevelFlowStage) => void;
}

export interface UploadSonolusLevelFlowResult {
  uid: number;
  levelUrl: string;
  chartUrl: string;
  svDropped: boolean;
}

function buildSonolusLevelUrl(uid: number): string {
  return `${SONOLUS_LEVEL_URL_ROOT}/${uid}`;
}

function buildSonolusChartUrl(uid: number): string {
  return `${SONOLUS_LEVEL_URL_ROOT}/${uid}/bdv2.json`;
}

interface ResolvedUploadSourceFile {
  fileName: string;
  fileBytes: Uint8Array;
  mimeType: string;
}

async function resolveUploadSourceFile(
  sourceUrl: string,
  preferredFileName: string | null,
  fallbackFileName: string,
  fallbackMimeType: string,
): Promise<ResolvedUploadSourceFile> {
  const response = await fetch(sourceUrl, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`source fetch failed: ${response.status}`);
  }
  const blob = await response.blob();
  const fileBytes = new Uint8Array(await blob.arrayBuffer());
  if (fileBytes.length <= 0) {
    throw new Error("source blob is empty");
  }
  const fallbackNameNormalized = sanitizeFileNameSegment(fallbackFileName) || fallbackFileName;
  const sourceTailName = resolveFileNameFromUrl(sourceUrl, fallbackNameNormalized);
  const fileName = sanitizeFileNameSegment(preferredFileName ?? "") || sourceTailName;
  const mimeTypeFromDataUrl = sourceUrl.startsWith("data:") ? extractMimeTypeFromDataUrl(sourceUrl) : null;
  const mimeType = (mimeTypeFromDataUrl ?? blob.type) || inferMimeTypeByExtension(fileName, fallbackMimeType);
  return {
    fileName,
    fileBytes,
    mimeType,
  };
}

export async function uploadSonolusLevelFlow(
  params: UploadSonolusLevelFlowParams,
): Promise<UploadSonolusLevelFlowResult> {
  const metadata = params.metadata;
  const chartSource = params.chartJson;
  const svDropped = hasSvItems(chartSource);

  params.onStage?.("converting-chart");
  const bestdoriChart = convertCurrentChartJsonToBestdoriV2(chartSource);
  if (!Array.isArray(bestdoriChart) || bestdoriChart.length <= 0) {
    throw new Error("converted bestdori chart is empty");
  }
  const chartJsonText = JSON.stringify(bestdoriChart);

  const title = trimNonEmptyStringOrNull(metadata.title) ?? "GarupaEditor Chart";
  const titleFileStem = sanitizeFileNameSegment(title) || "chart";
  const normalizedAudioSource = trimNonEmptyStringOrNull(params.audioSourceUrl) ?? trimNonEmptyStringOrNull(metadata.bgmDataUrl);
  if (!normalizedAudioSource) {
    throw new Error("sonolus upload requires audio source");
  }
  params.onStage?.("resolving-audio");
  const audioSourceFile = await resolveUploadSourceFile(
    normalizedAudioSource,
    trimNonEmptyStringOrNull(params.audioFileName),
    `${titleFileStem}.mp3`,
    "audio/mpeg",
  );

  params.onStage?.("uploading");
  const uid = await uploadSonolusLevel({
    title,
    chart: chartJsonText,
    bgmFileName: audioSourceFile.fileName,
    bgmFileBytes: audioSourceFile.fileBytes,
    bgmMimeType: audioSourceFile.mimeType,
    difficulty: params.difficulty,
    lifetime: params.lifetime,
    hidden: params.hidden,
  });

  return {
    uid,
    levelUrl: buildSonolusLevelUrl(uid),
    chartUrl: buildSonolusChartUrl(uid),
    svDropped,
  };
}

export { BESTDORI_COMMON_TAP_SKILL_FILE_NAME };
