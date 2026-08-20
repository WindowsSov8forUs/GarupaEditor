import {
  convertGarupaChartJsonToBestdoriV2,
  type GarupaChartJson,
} from "../../chart";
import type { ChartMetadata } from "../../chartCore";
import {
  SONOLUS_TEST_SERVER_ROOT,
  bestdoriGetMe,
  buildBestdoriCommunityChartPostPayload,
  buildBestdoriUploadedFileUrl,
  createBestdoriCommunityChartPost,
  fetchBestdoriFileUploadStatus,
  prepareBestdoriFileUpload,
  NOTGARUPA_SERVER_ROOT,
  uploadNotGarupaLevel,
  uploadSonolusLevel,
  type BestdoriPostContentSegment,
  type BestdoriPostTag,
  uploadBestdoriFile,
} from "./api";

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
  garupaChartJson: GarupaChartJson;
  metadata: ChartMetadata;
  audioFileBytes: Uint8Array;
  audioFileName: string;
  audioMimeType: string;
  coverFileBytes: Uint8Array;
  coverFileName: string;
  coverMimeType: string;
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

function hasSvItems(garupaChartJson: GarupaChartJson): boolean {
  if (!Array.isArray(garupaChartJson)) {
    return false;
  }
  return garupaChartJson.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const type = (item as { type?: unknown }).type;
    return type === "SV";
  });
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
  const garupaChartJson = params.garupaChartJson;
  const svDropped = hasSvItems(garupaChartJson);

  params.onStage?.("converting-chart");
  const bestdoriV2ChartJson = convertGarupaChartJsonToBestdoriV2(garupaChartJson);
  if (!Array.isArray(bestdoriV2ChartJson) || bestdoriV2ChartJson.length <= 0) {
    throw new Error("converted bestdori chart is empty");
  }

  const titleFileStem = sanitizeFileNameSegment(title ?? "chart") || "chart";
  if (!(params.audioFileBytes instanceof Uint8Array) || params.audioFileBytes.byteLength === 0) {
    throw new Error("社区谱面上传需要歌曲音频，请先在谱面信息中上传音频。");
  }
  if (!(params.coverFileBytes instanceof Uint8Array) || params.coverFileBytes.byteLength === 0) {
    throw new Error("社区谱面上传需要歌曲封面，请先在谱面信息中上传封面。");
  }
  params.onStage?.("resolving-audio");
  params.onStage?.("uploading-audio");
  const audioUrl = (await uploadBestdoriFileFlow({
    fileName: trimNonEmptyStringOrNull(params.audioFileName) ?? `${titleFileStem}.mp3`,
    fileData: params.audioFileBytes,
    mimeType: params.audioMimeType,
  })).fileUrl;
  params.onStage?.("resolving-cover");
  params.onStage?.("uploading-cover");
  const coverUrl = (await uploadBestdoriFileFlow({
    fileName: trimNonEmptyStringOrNull(params.coverFileName) ?? `${titleFileStem}.png`,
    fileData: params.coverFileBytes,
    mimeType: params.coverMimeType,
  })).fileUrl;

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
    chart: bestdoriV2ChartJson,
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
const NOTGARUPA_LEVEL_URL_ROOT = `${NOTGARUPA_SERVER_ROOT}/sonolus/levels`;

export type UploadSonolusLevelFlowStage = "converting-chart" | "resolving-audio" | "resolving-cover" | "uploading";

export interface UploadSonolusLevelFlowParams {
  garupaChartJson: GarupaChartJson;
  metadata: ChartMetadata;
  audioFileBytes: Uint8Array;
  audioFileName: string;
  audioMimeType: string;
  description?: string | null;
  tags?: BestdoriPostTag[] | null;
  difficulty?: number;
  lifetime?: number;
  hidden?: boolean;
  onStage?: (stage: UploadSonolusLevelFlowStage) => void;
}

export interface UploadSonolusLevelFlowResult {
  uid: string;
  levelUrl: string;
  chartUrl: string;
  svDropped: boolean;
}

function buildSonolusLevelUrl(uid: string): string {
  return `${SONOLUS_LEVEL_URL_ROOT}/${uid}`;
}

function buildSonolusChartUrl(uid: string): string {
  return `${SONOLUS_LEVEL_URL_ROOT}/${uid}/bdv2.json`;
}

export type UploadNotGarupaLevelFlowStage = "converting-chart" | "resolving-audio" | "resolving-cover" | "uploading";

export interface UploadNotGarupaLevelFlowParams {
  garupaChartJson: GarupaChartJson;
  metadata: ChartMetadata;
  audioFileBytes: Uint8Array;
  audioFileName: string;
  audioMimeType: string;
  coverFileBytes: Uint8Array;
  coverFileName: string;
  coverMimeType: string;
  description?: string | null;
  tags?: BestdoriPostTag[] | null;
  difficulty?: number;
  lifetime?: number;
  hidden?: boolean;
  onStage?: (stage: UploadNotGarupaLevelFlowStage) => void;
}

export interface UploadNotGarupaLevelFlowResult {
  uid: string;
  levelUrl: string;
  chartUrl: string;
}

function buildNotGarupaLevelUrl(uid: string): string {
  return `${NOTGARUPA_LEVEL_URL_ROOT}/${uid}`;
}

function buildNotGarupaChartUrl(uid: string): string {
  return `${NOTGARUPA_LEVEL_URL_ROOT}/${uid}/chart.json`;
}

export async function uploadSonolusLevelFlow(
  params: UploadSonolusLevelFlowParams,
): Promise<UploadSonolusLevelFlowResult> {
  const metadata = params.metadata;
  const garupaChartJson = params.garupaChartJson;
  const svDropped = hasSvItems(garupaChartJson);

  params.onStage?.("converting-chart");
  const bestdoriV2ChartJson = convertGarupaChartJsonToBestdoriV2(garupaChartJson);
  if (!Array.isArray(bestdoriV2ChartJson) || bestdoriV2ChartJson.length <= 0) {
    throw new Error("converted bestdori chart is empty");
  }
  const bestdoriV2ChartJsonText = JSON.stringify(bestdoriV2ChartJson);

  const title = trimNonEmptyStringOrNull(metadata.title) ?? "GarupaEditor Chart";
  if (!(params.audioFileBytes instanceof Uint8Array) || params.audioFileBytes.byteLength === 0) {
    throw new Error("sonolus upload requires audio resource bytes");
  }
  params.onStage?.("resolving-audio");
  params.onStage?.("uploading");
  const uid = await uploadSonolusLevel({
    title,
    chart: bestdoriV2ChartJsonText,
    bgmFileName: params.audioFileName,
    bgmFileBytes: params.audioFileBytes,
    bgmMimeType: params.audioMimeType,
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

export async function uploadNotGarupaLevelFlow(
  params: UploadNotGarupaLevelFlowParams,
): Promise<UploadNotGarupaLevelFlowResult> {
  const metadata = params.metadata;
  const garupaChartJson = params.garupaChartJson;

  params.onStage?.("converting-chart");
  if (!Array.isArray(garupaChartJson) || garupaChartJson.length <= 0) {
    throw new Error("garupa chart is empty");
  }
  const garupaChartJsonText = JSON.stringify(garupaChartJson);

  const title = trimNonEmptyStringOrNull(metadata.title) ?? "GarupaEditor Chart";
  const artists = trimNonEmptyStringOrNull(metadata.artist) ?? "Unknown Artist";
  const author = trimNonEmptyStringOrNull(metadata.charter) ?? "GarupaEditor";
  if (!(params.audioFileBytes instanceof Uint8Array) || params.audioFileBytes.byteLength === 0) {
    throw new Error("上传至 NotGarupa 服务器需要歌曲音频资源。");
  }
  if (!(params.coverFileBytes instanceof Uint8Array) || params.coverFileBytes.byteLength === 0) {
    throw new Error("上传至 NotGarupa 服务器需要歌曲封面资源。");
  }
  params.onStage?.("resolving-audio");
  params.onStage?.("resolving-cover");
  const tags = Array.isArray(params.tags)
    ? params.tags
      .map((tag) => trimNonEmptyStringOrNull(tag?.data))
      .filter((tag): tag is string => Boolean(tag))
    : [];

  params.onStage?.("uploading");
  const uid = await uploadNotGarupaLevel({
    title,
    chart: garupaChartJsonText,
    chartFileName: "chart.json",
    bgmFileName: params.audioFileName,
    bgmFileBytes: params.audioFileBytes,
    bgmMimeType: params.audioMimeType,
    coverFileName: params.coverFileName,
    coverFileBytes: params.coverFileBytes,
    coverMimeType: params.coverMimeType,
    artists,
    author,
    description: trimNonEmptyStringOrNull(params.description) ?? "",
    tags,
    difficulty: params.difficulty,
    lifetime: params.lifetime,
    hidden: params.hidden,
  });

  return {
    uid,
    levelUrl: buildNotGarupaLevelUrl(uid),
    chartUrl: buildNotGarupaChartUrl(uid),
  };
}
