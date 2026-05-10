import judgeRipFilesMapJson from "../../data/judge-rip-files-map.json";
import defaultCoverImage from "../../assets/default-cover.png";
import {
  blobToDataUrl,
  decodeBase64ToArrayBuffer,
  invokeTauriCommand,
  isTauriRuntimeEnvironment,
} from "./transport";

export const BESTDORI_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/noteskin";
export const BESTDORI_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/ingameskin/noteskin";
export const BESTDORI_TAPSE_ASSET_ROOT = "https://bestdori.com/assets/jp/sound/tapseskin";
export const BESTDORI_TAPSE_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/sound/tapseskin";
export const BESTDORI_COMMON_SOUND_ROOT = "https://bestdori.com/assets/jp/sound/common_rip";
export const BESTDORI_FIELD_SKIN_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/fieldskin";
export const BESTDORI_FIELD_SKIN_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/ingameskin/fieldskin";
export const BESTDORI_BG_SKIN_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/bgskin";
export const BESTDORI_BG_SKIN_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/ingameskin/bgskin";
export const BESTDORI_JUDGE_SKIN_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/judgeskin";
export const BESTDORI_COMMON_TAP_SKILL_FILE_NAME = "SE_RHYTHM_TAP_SKILL.mp3";

const HABAHIRO_RIP_NAME = "habahiro";
const HABAHIRO_SAMPLE_RIP_NAME = "habahiro_sample";

const JUDGE_SKIN_FILES_BY_RIP = judgeRipFilesMapJson as Record<string, string[]>;

export interface PreparedBestdoriSkinAssets {
  packageFiles: Record<string, string>;
  samplePackageFiles: Record<string, string>;
}

export interface PreparedBestdoriTapseskinAssets {
  packageFiles: Record<string, string>;
}

export interface PreparedBestdoriFieldSkinAssets {
  packageFiles: Record<string, string>;
}

export interface PreparedBestdoriBgSkinAssets {
  packageFiles: Record<string, string>;
  previewPackageFiles?: Record<string, string> | null;
}

export interface PreparedBestdoriJudgeSkinAssets {
  packageFiles: Record<string, string>;
}

export interface JudgeSkinFileEntry {
  atlasFile: string;
  assetFile: string;
  bundleFile: string;
}

export interface BestdoriUserTitle {
  id: number;
  type: string;
  server: number;
}

export interface BestdoriUserMeResponse {
  result: boolean;
  username?: string | null;
  nickname?: string | null;
  titles: BestdoriUserTitle[];
  email?: string | null;
  messageCount?: number | null;
}

interface PreparedBestdoriPackage {
  packageFiles: Record<string, string>;
}

interface PrepareBestdoriPackageParams {
  namespace: string;
  packageKey: string;
  assetBaseUrl: string;
  manifestUrl?: string | null;
  fallbackFilenames?: string[] | null;
  taskId?: string | null;
}

interface ReadBestdoriFileParams {
  namespace: string;
  path: string;
}

export type BestdoriOfficialChartDifficulty = "easy" | "normal" | "hard" | "expert" | "special";
export type BestdoriSongDifficultyIndex = "0" | "1" | "2" | "3" | "4";
export type BestdoriPerServerValue<T> = [T | null, T | null, T | null, T | null, T | null];
export type BestdoriSongServerIndex = 0 | 1 | 2 | 3 | 4;
export type BestdoriSongServerName = "jp" | "en" | "tw" | "cn" | "kr";

export interface BestdoriSongResourceUrls {
  server: BestdoriSongServerName;
  audioUrl: string;
  jacketUrl: string;
  mvUrl: string | null;
}

export interface BestdoriBandsAll1Band {
  bandName: BestdoriPerServerValue<string>;
}

export type BestdoriBandsAll1 = Record<string, BestdoriBandsAll1Band>;

export interface BestdoriOfficialChartImportPayload {
  chartId: number;
  difficulty: BestdoriOfficialChartDifficulty;
  chart: unknown;
  songInfo: BestdoriSongInfo;
  bands: BestdoriBandsAll1;
  resources: BestdoriSongResourceUrls;
  metadata: {
    title: string;
    artist: string;
    charter: string;
    difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
    difficultyLevel: string;
    offsetMs: number;
    mvOffsetMs: number;
  };
  audioFileName: string;
}

export interface BestdoriSongAchievement {
  musicId: number;
  achievementType: string;
  rewardType: string;
  rewardId?: number;
  quantity: number;
}

export interface BestdoriSongDifficultyMultiLiveScore {
  musicId: number;
  musicDifficulty: BestdoriOfficialChartDifficulty;
  multiLiveDifficultyId: number;
  scoreS: number;
  scoreA: number;
  scoreB: number;
  scoreC: number;
  multiLiveDifficultyType: string;
  scoreSS: number;
  scoreSSS: number;
}

export interface BestdoriSongDifficulty {
  playLevel: number;
  publishedAt?: BestdoriPerServerValue<string>;
  multiLiveScoreMap?: Record<string, BestdoriSongDifficultyMultiLiveScore>;
  notesQuantity?: number;
  scoreC?: number;
  scoreB?: number;
  scoreA?: number;
  scoreS?: number;
  scoreSS?: number;
}

export interface BestdoriSongBpm {
  bpm: number;
  start: number;
  end: number;
}

export interface BestdoriSongMusicVideo {
  assetBundleName: string;
  musicStartDelayMilliseconds?: number;
  thumbAssetBundleName?: string;
  title?: BestdoriPerServerValue<string>;
  description?: BestdoriPerServerValue<string>;
  startAt?: BestdoriPerServerValue<string>;
  endAt?: BestdoriPerServerValue<string>;
}

export interface BestdoriSongInfo {
  bgmId: string;
  bgmFile: string;
  tag: string;
  bandId: number;
  achievements: BestdoriSongAchievement[];
  jacketImage: string[];
  seq: number;
  musicTitle: BestdoriPerServerValue<string>;
  ruby: BestdoriPerServerValue<string>;
  phonetic: BestdoriPerServerValue<string>;
  lyricist: BestdoriPerServerValue<string>;
  composer: BestdoriPerServerValue<string>;
  arranger: BestdoriPerServerValue<string>;
  howToGet: BestdoriPerServerValue<string>;
  description?: BestdoriPerServerValue<string>;
  publishedAt: BestdoriPerServerValue<string>;
  closedAt: BestdoriPerServerValue<string>;
  difficulty: Record<BestdoriSongDifficultyIndex, BestdoriSongDifficulty>;
  musicVideos?: Record<string, BestdoriSongMusicVideo>;
  musicVideo?: Record<string, BestdoriSongMusicVideo>;
  length: number;
  notes: Partial<Record<BestdoriSongDifficultyIndex, number>>;
  bpm: Partial<Record<BestdoriSongDifficultyIndex, BestdoriSongBpm[]>>;
}

export interface BestdoriPostTag {
  type: string;
  data: string;
}

export interface BestdoriPostAuthor {
  username: string;
  nickname?: string | null;
  titles?: BestdoriUserTitle[] | null;
}

export interface BestdoriPostSongCustom {
  type: "custom";
  audio?: string;
  cover?: string;
}

export interface BestdoriPostSongProvided {
  type: "bandori" | "llsif";
  id: number;
}

export type BestdoriPostSong = BestdoriPostSongCustom | BestdoriPostSongProvided;

export interface BestdoriPostInfo {
  categoryName: string;
  categoryId: string;
  title?: string;
  song?: BestdoriPostSong;
  artists?: string;
  diff?: number;
  level?: number;
  chart?: unknown[];
  content: Array<Record<string, unknown>>;
  time: number;
  author: BestdoriPostAuthor;
  likes: number;
  liked: boolean;
  tags: BestdoriPostTag[];
}

export interface BestdoriPostDetailResponse {
  result: boolean;
  post: BestdoriPostInfo;
}

export interface BestdoriPostTagSearchEntry {
  type: string;
  data: string;
  count: number;
}

export interface BestdoriPostTagSearchResponse {
  result: boolean;
  tags: BestdoriPostTagSearchEntry[];
}

export interface BestdoriPostContentSegment {
  type: string;
  [key: string]: unknown;
}

export interface BestdoriCreateCommunityChartPostPayload {
  title?: string;
  artists?: string;
  diff?: number;
  level?: number;
  chart: unknown;
  content: BestdoriPostContentSegment[];
  song?: BestdoriPostSong;
  tags: BestdoriPostTag[];
  categoryName?: string;
  categoryId?: string;
}

export interface BestdoriCreateCommunityChartPostResponse {
  result?: boolean;
  code?: unknown;
  id?: unknown;
}

export interface BestdoriCommunitySongResourceUrls {
  type: BestdoriPostSong["type"];
  songId: number | null;
  audioUrl: string | null;
  coverUrl: string | null;
}

export interface BestdoriFileUploadPrepareResponse {
  result: boolean;
  code?: unknown;
  hash?: unknown;
}

export interface BestdoriFileUploadResponse {
  result?: boolean;
  code?: unknown;
  hash?: unknown;
}

export interface BestdoriFileUploadStatusResponse {
  result?: boolean;
  code?: unknown;
  hash?: unknown;
  status?: unknown;
}

export interface SonolusUploadLevelParams {
  title: string;
  chart: string;
  bgmFileName: string;
  bgmFileBytes: ArrayBuffer | Uint8Array;
  bgmMimeType?: string;
  difficulty?: number;
  lifetime?: number;
  hidden?: boolean;
}

interface BestdoriLlsifMiscEntry {
  live_icon_asset?: string;
  sound_asset?: string;
}

type BestdoriLlsifMisc = Record<string, BestdoriLlsifMiscEntry>;
type RequestHostScope = "bestdori" | "sonolus";

const BESTDORI_SONG_SERVER_NAME_MAP: Readonly<Record<BestdoriSongServerIndex, BestdoriSongServerName>> = {
  0: "jp",
  1: "en",
  2: "tw",
  3: "cn",
  4: "kr",
};
const BESTDORI_CHART_DIFFICULTY_TO_INDEX: Readonly<Record<BestdoriOfficialChartDifficulty, BestdoriSongDifficultyIndex>> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
};
const BESTDORI_CHART_DIFFICULTY_TO_METADATA: Readonly<
  Record<BestdoriOfficialChartDifficulty, "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL">
> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
  expert: "EXPERT",
  special: "SPECIAL",
};
const BESTDORI_ASSETS_ROOT = "https://bestdori.com/assets";
const BESTDORI_LLSIF_ASSET_ROOT = "https://card.niconi.co.ni";
const BESTDORI_LLSIF_MISC_INDEX = 10;
const BESTDORI_COMMUNITY_DEFAULT_CATEGORY_NAME = "SELF_POST";
const BESTDORI_COMMUNITY_DEFAULT_CATEGORY_ID = "chart";
const BESTDORI_COMMUNITY_POST_REQUIRED_FIELDS = [
  "categoryName",
  "categoryId",
  "title",
  "artists",
  "diff",
  "level",
  "chart",
  "content",
  "song",
  "tags",
] as const;
const BESTDORI_UPLOAD_PREPARE_ENDPOINT = "https://bestdori.com/api/upload/prepare";
const BESTDORI_UPLOAD_ENDPOINT = "https://bestdori.com/api/upload";
export const SONOLUS_TEST_SERVER_ROOT = "https://sonolus.ayachan.fun/test";
const SONOLUS_TEST_LEVELS_ENDPOINT = `${SONOLUS_TEST_SERVER_ROOT}/sonolus/levels`;
export const BESTDORI_DEFAULT_SONG_COVER_URL = defaultCoverImage;
export const BESTDORI_OFFICIAL_CHART_TEAM = "=BANDORI OFFICIAL CHART TEAM=";

function ensureBestdoriBackendAvailable(): void {
  if (!isTauriRuntimeEnvironment()) {
    throw new Error("Bestdori backend is only available in Tauri runtime.");
  }
}

function normalizeRipName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error(`${label} contains invalid characters, only [a-zA-Z0-9_-] is allowed`);
  }
  return trimmed;
}

function buildAssetBase(root: string, ripName: string): string {
  return `${root}/${ripName}_rip`;
}

function isHttpNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /http status 404\b/i.test(message);
}

function normalizeBestdoriOfficialChartDifficulty(
  difficulty: string,
): BestdoriOfficialChartDifficulty {
  const normalized = difficulty.trim().toLowerCase();
  if (
    normalized !== "easy"
    && normalized !== "normal"
    && normalized !== "hard"
    && normalized !== "expert"
    && normalized !== "special"
  ) {
    throw new Error("official difficulty must be one of easy/normal/hard/expert/special");
  }
  return normalized;
}

function normalizeBestdoriSongId(songId: number): number {
  const normalized = Math.trunc(Number(songId));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error("song id must be a positive integer");
  }
  return normalized;
}

function normalizeBestdoriPostId(postId: number): number {
  const normalized = Math.trunc(Number(postId));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error("post id must be a positive integer");
  }
  return normalized;
}

function normalizeBestdoriNonNegativeInteger(value: number, label: string): number {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return normalized;
}

function normalizeBestdoriPostDiff(value: number): number {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 4) {
    throw new Error("post diff must be an integer within [0, 4]");
  }
  return normalized;
}

function normalizeBestdoriPostLevel(value: number): number {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error("post level must be a positive integer");
  }
  return normalized;
}

function normalizeBestdoriFileHash(hash: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("bestdori file hash must be a lowercase SHA-1 hex string");
  }
  return normalized;
}

function normalizeBestdoriUploadFileName(fileName: string): string {
  const normalized = fileName.trim();
  if (!normalized) {
    throw new Error("bestdori upload fileName cannot be empty");
  }
  return normalized;
}

function normalizeBestdoriUploadFileSize(size: number): number {
  const normalized = Math.trunc(Number(size));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("bestdori upload file size must be a positive integer");
  }
  return normalized;
}

function normalizeBestdoriFileBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  return new Uint8Array(value);
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function trimNonEmptyStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureCommunityPostPayloadField(
  payload: Record<string, unknown>,
  field: typeof BESTDORI_COMMUNITY_POST_REQUIRED_FIELDS[number],
): unknown {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    throw new Error(`community post payload missing required field: ${field}`);
  }
  const value = payload[field];
  if (value === undefined || value === null) {
    throw new Error(`community post payload field cannot be null/undefined: ${field}`);
  }
  return value;
}

function validateCommunityPostSongPayload(songValue: unknown): void {
  if (!isRecord(songValue)) {
    throw new Error("community post payload field 'song' must be an object");
  }
  const type = songValue.type;
  if (type === "custom") {
    if (!Object.prototype.hasOwnProperty.call(songValue, "audio") || typeof songValue.audio !== "string") {
      throw new Error("community post payload song.custom.audio must be a string field");
    }
    if (!Object.prototype.hasOwnProperty.call(songValue, "cover") || typeof songValue.cover !== "string") {
      throw new Error("community post payload song.custom.cover must be a string field");
    }
    return;
  }
  if (type === "bandori" || type === "llsif") {
    if (!Object.prototype.hasOwnProperty.call(songValue, "id")) {
      throw new Error(`community post payload song.${type}.id is required`);
    }
    const id = Number(songValue.id);
    if (!Number.isFinite(id) || Math.trunc(id) < 1) {
      throw new Error(`community post payload song.${type}.id must be a positive integer`);
    }
    return;
  }
  throw new Error("community post payload song.type must be one of custom/bandori/llsif");
}

function validateCommunityPostContentPayload(contentValue: unknown): void {
  if (!Array.isArray(contentValue) || contentValue.length <= 0) {
    throw new Error("community post payload field 'content' must be a non-empty array");
  }
  contentValue.forEach((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(`community post payload content[${index}] must be an object`);
    }
    if (typeof segment.type !== "string" || segment.type.trim().length <= 0) {
      throw new Error(`community post payload content[${index}].type must be a non-empty string`);
    }
    Object.entries(segment).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        throw new Error(`community post payload content[${index}].${key} cannot be null/undefined`);
      }
    });
  });
}

function validateCommunityPostTagsPayload(tagsValue: unknown): void {
  if (!Array.isArray(tagsValue)) {
    throw new Error("community post payload field 'tags' must be an array");
  }
  tagsValue.forEach((tag, index) => {
    if (!isRecord(tag)) {
      throw new Error(`community post payload tags[${index}] must be an object`);
    }
    if (typeof tag.type !== "string" || tag.type.trim().length <= 0) {
      throw new Error(`community post payload tags[${index}].type must be a non-empty string`);
    }
    if (typeof tag.data !== "string" || tag.data.trim().length <= 0) {
      throw new Error(`community post payload tags[${index}].data must be a non-empty string`);
    }
  });
}

function validateBestdoriCommunityChartPostRequestPayload(payload: Record<string, unknown>): void {
  BESTDORI_COMMUNITY_POST_REQUIRED_FIELDS.forEach((field) => {
    ensureCommunityPostPayloadField(payload, field);
  });

  const categoryName = ensureCommunityPostPayloadField(payload, "categoryName");
  if (typeof categoryName !== "string" || categoryName.trim().length <= 0) {
    throw new Error("community post payload categoryName must be a non-empty string");
  }
  const categoryId = ensureCommunityPostPayloadField(payload, "categoryId");
  if (typeof categoryId !== "string" || categoryId.trim().length <= 0) {
    throw new Error("community post payload categoryId must be a non-empty string");
  }

  const title = ensureCommunityPostPayloadField(payload, "title");
  if (typeof title !== "string") {
    throw new Error("community post payload title must be a string");
  }
  const artists = ensureCommunityPostPayloadField(payload, "artists");
  if (typeof artists !== "string") {
    throw new Error("community post payload artists must be a string");
  }

  const diff = ensureCommunityPostPayloadField(payload, "diff");
  const diffNumber = Number(diff);
  if (!Number.isFinite(diffNumber) || Math.trunc(diffNumber) < 0 || Math.trunc(diffNumber) > 4) {
    throw new Error("community post payload diff must be an integer within [0, 4]");
  }
  const level = ensureCommunityPostPayloadField(payload, "level");
  const levelNumber = Number(level);
  if (!Number.isFinite(levelNumber) || Math.trunc(levelNumber) < 1) {
    throw new Error("community post payload level must be a positive integer");
  }

  validateCommunityPostContentPayload(ensureCommunityPostPayloadField(payload, "content"));
  validateCommunityPostSongPayload(ensureCommunityPostPayloadField(payload, "song"));
  validateCommunityPostTagsPayload(ensureCommunityPostPayloadField(payload, "tags"));
}

function buildBestdoriLlsifAssetUrl(assetPath: unknown): string | null {
  const normalized = trimNonEmptyStringOrNull(assetPath);
  if (!normalized) {
    return null;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return `${BESTDORI_LLSIF_ASSET_ROOT}/${normalized.replace(/^\/+/, "")}`;
}

function isNonEmptyPerServerString(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveBestdoriSongServerIndex(songInfo: BestdoriSongInfo): BestdoriSongServerIndex {
  const candidates: Array<BestdoriPerServerValue<string> | undefined> = [
    songInfo.publishedAt,
    songInfo.closedAt,
    songInfo.musicTitle,
    songInfo.howToGet,
    songInfo.ruby,
    songInfo.phonetic,
    songInfo.lyricist,
    songInfo.composer,
    songInfo.arranger,
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (let index = 0 as BestdoriSongServerIndex; index <= 4; index = (index + 1) as BestdoriSongServerIndex) {
      if (isNonEmptyPerServerString(candidate[index])) {
        return index;
      }
    }
  }
  throw new Error("unable to resolve song server from song info");
}

function formatBestdoriSongId(songId: number): string {
  return String(songId).padStart(3, "0");
}

function resolveBestdoriSongJacketFolderIndex(songId: number): string {
  const bucket = Math.ceil(songId / 10) * 10;
  return String(bucket).padStart(2, "0");
}

function resolveBestdoriSongJacketImageName(songInfo: BestdoriSongInfo): string {
  if (!Array.isArray(songInfo.jacketImage) || songInfo.jacketImage.length === 0) {
    throw new Error("song info missing jacketImage");
  }
  const value = songInfo.jacketImage[songInfo.jacketImage.length - 1];
  if (!value || typeof value !== "string") {
    throw new Error("song info jacketImage last entry is invalid");
  }
  return value;
}

function resolveBestdoriSongMusicVideos(songInfo: BestdoriSongInfo): Record<string, BestdoriSongMusicVideo> {
  if (songInfo.musicVideos && typeof songInfo.musicVideos === "object") {
    return songInfo.musicVideos;
  }
  if (songInfo.musicVideo && typeof songInfo.musicVideo === "object") {
    return songInfo.musicVideo;
  }
  return {};
}

function resolveFirstNonEmptyPerServerValue(value: BestdoriPerServerValue<string> | undefined): string | null {
  if (!value) {
    return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item === "string") {
      const normalized = item.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return null;
}

function resolveBestdoriSongTitle(songInfo: BestdoriSongInfo): string {
  return resolveFirstNonEmptyPerServerValue(songInfo.musicTitle) ?? "Untitled";
}

function resolveBestdoriBandArtist(songInfo: BestdoriSongInfo, bands: BestdoriBandsAll1): string {
  const bandIdKey = String(Math.trunc(Number(songInfo.bandId)));
  const band = bands[bandIdKey];
  if (band && Array.isArray(band.bandName)) {
    const resolved = resolveFirstNonEmptyPerServerValue(band.bandName);
    if (resolved) {
      return resolved;
    }
  }
  return "Unknown Artist";
}

function resolveBestdoriSongDifficultyLevel(
  songInfo: BestdoriSongInfo,
  difficulty: BestdoriOfficialChartDifficulty,
): string {
  const index = BESTDORI_CHART_DIFFICULTY_TO_INDEX[difficulty];
  const level = songInfo.difficulty?.[index]?.playLevel;
  if (Number.isFinite(level) && Number(level) > 0) {
    return String(Math.round(Number(level)));
  }
  return "1";
}

function resolveBestdoriSongMvOffsetMs(songInfo: BestdoriSongInfo): number {
  const videos = resolveBestdoriSongMusicVideos(songInfo);
  const keys = Object.keys(videos);
  if (keys.length === 0) {
    return 0;
  }
  const latestVideo = videos[keys[keys.length - 1]];
  const rawOffset = Number(latestVideo?.musicStartDelayMilliseconds);
  if (!Number.isFinite(rawOffset)) {
    return 0;
  }
  return Math.round(rawOffset);
}

function resolveBestdoriSongAudioFileName(songId: number, songInfo: BestdoriSongInfo): string {
  const bgmFile = typeof songInfo.bgmFile === "string" ? songInfo.bgmFile.trim() : "";
  if (bgmFile.length > 0) {
    return bgmFile.toLowerCase().endsWith(".mp3") ? bgmFile : `${bgmFile}.mp3`;
  }
  return `bgm${formatBestdoriSongId(songId)}.mp3`;
}

function resolveJudgeSkinFallbackFilenamesOrThrow(ripName: string): string[] {
  const raw = JUDGE_SKIN_FILES_BY_RIP[ripName];
  if (!Array.isArray(raw)) {
    throw new Error(`JudgeSkin filenames not configured for ripName: ${ripName}`);
  }
  const filtered = raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (filtered.length === 0) {
    throw new Error(`JudgeSkin filenames invalid for ripName: ${ripName}`);
  }
  return filtered;
}

async function prepareBestdoriPackage(params: PrepareBestdoriPackageParams): Promise<PreparedBestdoriPackage> {
  ensureBestdoriBackendAvailable();
  return invokeTauriCommand<PreparedBestdoriPackage>("prepare_bestdori_package", {
    params: {
      namespace: params.namespace,
      packageKey: params.packageKey,
      assetBaseUrl: params.assetBaseUrl,
      manifestUrl: params.manifestUrl ?? null,
      fallbackFilenames: params.fallbackFilenames ?? null,
      taskId: params.taskId ?? null,
    },
  });
}

async function readBestdoriTextFile(params: ReadBestdoriFileParams): Promise<string> {
  ensureBestdoriBackendAvailable();
  return invokeTauriCommand<string>("read_bestdori_text_file", { params });
}

async function readBestdoriBinaryFile(params: ReadBestdoriFileParams): Promise<string> {
  ensureBestdoriBackendAvailable();
  return invokeTauriCommand<string>("read_bestdori_binary_file", { params });
}

export async function prepareBestdoriSkinAssets(
  ripName: string,
  operationId?: string,
): Promise<PreparedBestdoriSkinAssets> {
  const normalizedRipName = normalizeRipName(ripName, "ripName");
  const sampleRipName =
    normalizedRipName === HABAHIRO_RIP_NAME ? HABAHIRO_SAMPLE_RIP_NAME : `${normalizedRipName}sample`;
  const [mainPackage, samplePackage] = await Promise.all([
    prepareBestdoriPackage({
      namespace: "noteskin",
      packageKey: normalizedRipName,
      assetBaseUrl: buildAssetBase(BESTDORI_ASSET_ROOT, normalizedRipName),
      manifestUrl: `${BESTDORI_EXPLORER_ROOT}/${normalizedRipName}.json`,
      taskId: operationId ?? null,
    }),
    prepareBestdoriPackage({
      namespace: "noteskin",
      packageKey: sampleRipName,
      assetBaseUrl: buildAssetBase(BESTDORI_ASSET_ROOT, sampleRipName),
      manifestUrl: `${BESTDORI_EXPLORER_ROOT}/${sampleRipName}.json`,
      taskId: operationId ?? null,
    }),
  ]);
  return {
    packageFiles: mainPackage.packageFiles,
    samplePackageFiles: samplePackage.packageFiles,
  };
}

export async function bestdoriLogin(username: string, password: string): Promise<BestdoriUserMeResponse> {
  ensureBestdoriBackendAvailable();
  const normalizedUsername = username.trim();
  const normalizedPassword = password.trim();
  if (!normalizedUsername) {
    throw new Error("username cannot be empty");
  }
  if (!normalizedPassword) {
    throw new Error("password cannot be empty");
  }
  return invokeTauriCommand<BestdoriUserMeResponse>("bestdori_login", {
    username: normalizedUsername,
    password: normalizedPassword,
  });
}

export async function bestdoriGetMe(): Promise<BestdoriUserMeResponse> {
  ensureBestdoriBackendAvailable();
  return invokeTauriCommand<BestdoriUserMeResponse>("bestdori_get_me");
}

async function requestBestdoriJson<T>(
  endpoint: string,
  label: string,
  options?: { hostScope?: RequestHostScope },
): Promise<T> {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    throw new Error(`${label} endpoint is empty`);
  }
  if (isTauriRuntimeEnvironment()) {
    return invokeTauriCommand<T>("bestdori_fetch_json", {
      url: normalizedEndpoint,
      hostScope: options?.hostScope ?? "bestdori",
    });
  }
  const response = await fetch(normalizedEndpoint, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${label} http status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestBestdoriPostJson<T>(
  endpoint: string,
  label: string,
  payload: Record<string, unknown>,
  options?: { hostScope?: RequestHostScope },
): Promise<T> {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    throw new Error(`${label} endpoint is empty`);
  }
  if (isTauriRuntimeEnvironment()) {
    return invokeTauriCommand<T>("bestdori_post_json", {
      url: normalizedEndpoint,
      payload,
      hostScope: options?.hostScope ?? "bestdori",
    });
  }
  const response = await fetch(normalizedEndpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${label} http status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface RequestBestdoriPostMultipartFileParams {
  fieldName: string;
  fileName: string;
  fileBytes: Uint8Array;
  mimeType?: string;
  fields?: Record<string, string>;
  hostScope?: RequestHostScope;
}

async function requestBestdoriPostMultipartFileJson<T>(
  endpoint: string,
  label: string,
  params: RequestBestdoriPostMultipartFileParams,
): Promise<T> {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    throw new Error(`${label} endpoint is empty`);
  }
  if (params.fileBytes.length <= 0) {
    throw new Error(`${label} fileBytes cannot be empty`);
  }

  if (isTauriRuntimeEnvironment()) {
    return invokeTauriCommand<T>("bestdori_post_multipart_file", {
      params: {
        url: normalizedEndpoint,
        fieldName: params.fieldName,
        fileName: params.fileName,
        fileBase64: encodeBytesToBase64(params.fileBytes),
        mimeType: trimNonEmptyStringOrNull(params.mimeType) ?? null,
        fields: params.fields ?? null,
        hostScope: params.hostScope ?? "bestdori",
      },
    });
  }

  const formData = new FormData();
  if (params.fields) {
    for (const [key, value] of Object.entries(params.fields)) {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        continue;
      }
      formData.append(normalizedKey, value);
    }
  }
  const mimeType = trimNonEmptyStringOrNull(params.mimeType);
  const fileBlob = mimeType
    ? new Blob([params.fileBytes], { type: mimeType })
    : new Blob([params.fileBytes]);
  formData.append(params.fieldName, fileBlob, params.fileName);
  const response = await fetch(normalizedEndpoint, {
    method: "POST",
    cache: "no-store",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`${label} http status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestBestdoriBinaryBase64(
  endpoint: string,
  label: string,
  options?: { hostScope?: RequestHostScope },
): Promise<string> {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint) {
    throw new Error(`${label} endpoint is empty`);
  }
  if (isTauriRuntimeEnvironment()) {
    return invokeTauriCommand<string>("bestdori_fetch_binary", {
      url: normalizedEndpoint,
      hostScope: options?.hostScope ?? "bestdori",
    });
  }
  const response = await fetch(normalizedEndpoint, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${label} http status ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export async function fetchBestdoriFileBlob(
  url: string,
  mimeType: string,
  label = "bestdori file",
): Promise<Blob> {
  const base64 = await requestBestdoriBinaryBase64(url, label);
  const buffer = decodeBase64ToArrayBuffer(base64);
  return new Blob([buffer], { type: mimeType });
}

export function buildBestdoriUploadedFileUrl(fileHash: string): string {
  const normalizedHash = normalizeBestdoriFileHash(fileHash);
  return `https://bestdori.com/api/upload/file/${normalizedHash}`;
}

export async function prepareBestdoriFileUpload(
  hash: string,
  size: number,
  options?: { ver?: number },
): Promise<BestdoriFileUploadPrepareResponse> {
  const normalizedHash = normalizeBestdoriFileHash(hash);
  const normalizedSize = normalizeBestdoriUploadFileSize(size);
  const normalizedVersion = normalizeBestdoriNonNegativeInteger(options?.ver ?? 3, "upload version");
  return requestBestdoriPostJson<BestdoriFileUploadPrepareResponse>(
    BESTDORI_UPLOAD_PREPARE_ENDPOINT,
    "bestdori upload prepare",
    {
      ver: normalizedVersion,
      hash: normalizedHash,
      size: normalizedSize,
    },
  );
}

export async function uploadBestdoriFile(
  fileName: string,
  fileBytes: ArrayBuffer | Uint8Array,
  options?: { fieldName?: string; mimeType?: string },
): Promise<BestdoriFileUploadResponse> {
  const normalizedFileName = normalizeBestdoriUploadFileName(fileName);
  const normalizedBytes = normalizeBestdoriFileBytes(fileBytes);
  const fieldName = normalizeBestdoriUploadFileName(options?.fieldName ?? "file");
  return requestBestdoriPostMultipartFileJson<BestdoriFileUploadResponse>(
    BESTDORI_UPLOAD_ENDPOINT,
    "bestdori upload file",
    {
      fieldName,
      fileName: normalizedFileName,
      fileBytes: normalizedBytes,
      mimeType: options?.mimeType,
    },
  );
}

export async function fetchBestdoriFileUploadStatus(hash: string): Promise<BestdoriFileUploadStatusResponse> {
  const normalizedHash = normalizeBestdoriFileHash(hash);
  const endpoint = `https://bestdori.com/api/upload/status/${normalizedHash}`;
  return requestBestdoriJson<BestdoriFileUploadStatusResponse>(endpoint, "bestdori upload status");
}

function normalizeSonolusUploadTitle(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("sonolus level title cannot be empty");
  }
  return normalized;
}

function normalizeSonolusUploadChart(value: string): string {
  if (typeof value !== "string" || value.trim().length <= 0) {
    throw new Error("sonolus level chart cannot be empty");
  }
  return value;
}

function normalizeSonolusUploadDifficulty(value: number | undefined): number {
  const normalized = Math.trunc(Number(value ?? 25));
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("sonolus level difficulty must be a non-negative integer");
  }
  return normalized;
}

function normalizeSonolusUploadLifetime(value: number | undefined): number {
  const normalized = Math.trunc(Number(value ?? 21600));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error("sonolus level lifetime must be a positive integer");
  }
  return normalized;
}

function extractSonolusUploadUid(value: unknown): number {
  const uid = Math.trunc(Number(value));
  if (!Number.isFinite(uid) || uid < 1) {
    throw new Error("sonolus level upload response missing uid");
  }
  return uid;
}

export async function uploadSonolusLevel(params: SonolusUploadLevelParams): Promise<number> {
  const title = normalizeSonolusUploadTitle(params.title);
  const chart = normalizeSonolusUploadChart(params.chart);
  const difficulty = normalizeSonolusUploadDifficulty(params.difficulty);
  const lifetime = normalizeSonolusUploadLifetime(params.lifetime);
  const bgmFileName = normalizeBestdoriUploadFileName(params.bgmFileName);
  const bgmFileBytes = normalizeBestdoriFileBytes(params.bgmFileBytes);
  if (bgmFileBytes.length <= 0) {
    throw new Error("sonolus level bgm file cannot be empty");
  }
  const fields: Record<string, string> = {
    title,
    chart,
    difficulty: String(difficulty),
    lifetime: String(lifetime),
  };
  if (params.hidden === true) {
    fields.hidden = "true";
  }
  const response = await requestBestdoriPostMultipartFileJson<{ uid?: unknown }>(
    SONOLUS_TEST_LEVELS_ENDPOINT,
    "sonolus level upload",
    {
      fieldName: "bgm",
      fileName: bgmFileName,
      fileBytes: bgmFileBytes,
      mimeType: params.bgmMimeType,
      fields,
      hostScope: "sonolus",
    },
  );
  return extractSonolusUploadUid(response.uid);
}

export async function fetchBestdoriOfficialChart(
  chartId: number,
  difficulty: BestdoriOfficialChartDifficulty,
): Promise<unknown> {
  const normalizedChartId = Math.trunc(Number(chartId));
  if (!Number.isFinite(normalizedChartId) || normalizedChartId < 1) {
    throw new Error("official chart id must be a positive integer");
  }
  const normalizedDifficulty = normalizeBestdoriOfficialChartDifficulty(difficulty);
  const endpoint = `https://bestdori.com/api/charts/${normalizedChartId}/${normalizedDifficulty}.json`;
  return requestBestdoriJson<unknown>(endpoint, "bestdori official chart");
}

export async function fetchBestdoriSongInfo(songId: number): Promise<BestdoriSongInfo> {
  const normalizedSongId = normalizeBestdoriSongId(songId);
  const endpoint = `https://bestdori.com/api/songs/${normalizedSongId}.json`;
  return requestBestdoriJson<BestdoriSongInfo>(endpoint, "bestdori song info");
}

export async function fetchBestdoriBandsAll1(): Promise<BestdoriBandsAll1> {
  const endpoint = "https://bestdori.com/api/bands/all.1.json";
  return requestBestdoriJson<BestdoriBandsAll1>(endpoint, "bestdori bands all.1");
}

export async function createBestdoriCommunityChartPost(
  input: BestdoriCreateCommunityChartPostPayload,
): Promise<BestdoriCreateCommunityChartPostResponse> {
  const payload = buildBestdoriCommunityChartPostPayload(input);
  validateBestdoriCommunityChartPostRequestPayload(payload);
  return requestBestdoriPostJson<BestdoriCreateCommunityChartPostResponse>(
    "https://bestdori.com/api/post",
    "bestdori create community chart post",
    payload,
  );
}

export function buildBestdoriCommunityChartPostPayload(
  input: BestdoriCreateCommunityChartPostPayload,
): Record<string, unknown> {
  if (input.chart === undefined || input.chart === null) {
    throw new Error("post chart is required");
  }
  if (!Array.isArray(input.content) || input.content.length <= 0) {
    throw new Error("post content must be a non-empty array");
  }

  const categoryName =
    trimNonEmptyStringOrNull(input.categoryName) ?? BESTDORI_COMMUNITY_DEFAULT_CATEGORY_NAME;
  const categoryId = trimNonEmptyStringOrNull(input.categoryId) ?? BESTDORI_COMMUNITY_DEFAULT_CATEGORY_ID;
  const title = trimNonEmptyStringOrNull(input.title) ?? "";
  const artists = trimNonEmptyStringOrNull(input.artists) ?? "";
  const diff = normalizeBestdoriPostDiff(
    typeof input.diff === "number" && Number.isFinite(input.diff) ? input.diff : 0,
  );
  const level = normalizeBestdoriPostLevel(
    typeof input.level === "number" && Number.isFinite(input.level) ? input.level : 1,
  );
  const song = input.song ?? {
    type: "custom" as const,
    audio: "",
    cover: "",
  };
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const payload: Record<string, unknown> = {
    categoryName,
    categoryId,
    title,
    artists,
    diff,
    level,
    chart: input.chart,
    content: input.content,
    song,
    tags,
  };

  return payload;
}

export async function fetchBestdoriCommunityPostDetails(postId: number): Promise<BestdoriPostDetailResponse> {
  const normalizedPostId = normalizeBestdoriPostId(postId);
  const endpoint = `https://bestdori.com/api/post/details?id=${normalizedPostId}`;
  return requestBestdoriJson<BestdoriPostDetailResponse>(endpoint, "bestdori community post details");
}

export async function fetchBestdoriCommunityPostTags(
  type: string,
  data = "",
  fuzzy = true,
): Promise<BestdoriPostTagSearchResponse> {
  const normalizedType = trimNonEmptyStringOrNull(type);
  if (!normalizedType) {
    throw new Error("community tag type cannot be empty");
  }
  const endpoint = `https://bestdori.com/api/post/tag?type=${encodeURIComponent(normalizedType)}&data=${encodeURIComponent(data)}&fuzzy=${fuzzy ? "true" : "false"}`;
  return requestBestdoriJson<BestdoriPostTagSearchResponse>(endpoint, "bestdori community post tag");
}

export async function fetchBestdoriLlsifMisc(index = BESTDORI_LLSIF_MISC_INDEX): Promise<BestdoriLlsifMisc> {
  const normalizedIndex = normalizeBestdoriNonNegativeInteger(index, "llsif misc index");
  const endpoint = `https://bestdori.com/api/misc/llsif.${normalizedIndex}.json`;
  return requestBestdoriJson<BestdoriLlsifMisc>(endpoint, "bestdori llsif misc");
}

export async function resolveBestdoriCommunitySongResourceUrls(
  song: BestdoriPostSong | null | undefined,
): Promise<BestdoriCommunitySongResourceUrls | null> {
  if (!song) {
    return null;
  }
  if (song.type === "custom") {
    return {
      type: "custom",
      songId: null,
      audioUrl: trimNonEmptyStringOrNull(song.audio),
      coverUrl: trimNonEmptyStringOrNull(song.cover),
    };
  }
  const songId = normalizeBestdoriSongId(song.id);
  if (song.type === "bandori") {
    const songInfo = await fetchBestdoriSongInfo(songId);
    return {
      type: "bandori",
      songId,
      audioUrl: buildBestdoriSongAudioUrl(songId, songInfo),
      coverUrl: await fetchBestdoriSongJacketUrlWithFallback(songId, songInfo),
    };
  }
  const llsifMisc = await fetchBestdoriLlsifMisc();
  const llsifInfo = llsifMisc[String(songId)];
  return {
    type: "llsif",
    songId,
    audioUrl: buildBestdoriLlsifAssetUrl(llsifInfo?.sound_asset),
    coverUrl: buildBestdoriLlsifAssetUrl(llsifInfo?.live_icon_asset),
  };
}

export function resolveBestdoriSongServerName(songInfo: BestdoriSongInfo): BestdoriSongServerName {
  return BESTDORI_SONG_SERVER_NAME_MAP[resolveBestdoriSongServerIndex(songInfo)];
}

export function buildBestdoriSongAudioUrl(songId: number, songInfo: BestdoriSongInfo): string {
  const normalizedSongId = normalizeBestdoriSongId(songId);
  const server = resolveBestdoriSongServerName(songInfo);
  const idPadded = formatBestdoriSongId(normalizedSongId);
  return `${BESTDORI_ASSETS_ROOT}/${server}/sound/bgm${idPadded}_rip/bgm${idPadded}.mp3`;
}

export function buildBestdoriSongJacketUrl(songId: number, songInfo: BestdoriSongInfo): string {
  const normalizedSongId = normalizeBestdoriSongId(songId);
  const server = resolveBestdoriSongServerName(songInfo);
  const jacketImage = resolveBestdoriSongJacketImageName(songInfo);
  const jacketFolderIndex = resolveBestdoriSongJacketFolderIndex(normalizedSongId);
  return `${BESTDORI_ASSETS_ROOT}/${server}/musicjacket/musicjacket${jacketFolderIndex}_rip/assets-star-forassetbundle-startapp-musicjacket-musicjacket${jacketFolderIndex}-${jacketImage}-jacket.png`;
}

export async function fetchBestdoriSongJacketUrlWithFallback(
  songId: number,
  songInfo: BestdoriSongInfo,
): Promise<string> {
  try {
    return buildBestdoriSongJacketUrl(songId, songInfo);
  } catch {
    return BESTDORI_DEFAULT_SONG_COVER_URL;
  }
}

export function buildBestdoriSongMvUrl(songInfo: BestdoriSongInfo): string | null {
  const videos = resolveBestdoriSongMusicVideos(songInfo);
  const keys = Object.keys(videos);
  if (keys.length === 0) {
    return null;
  }
  const musicVideo = keys[keys.length - 1];
  const target = videos[musicVideo];
  if (!target || typeof target.assetBundleName !== "string" || target.assetBundleName.trim().length === 0) {
    return null;
  }
  const server = resolveBestdoriSongServerName(songInfo);
  const assetBundleName = target.assetBundleName.trim();
  return `${BESTDORI_ASSETS_ROOT}/${server}/movie/mv/${musicVideo}_hq_rip/${assetBundleName}_hq.mp4`;
}

export async function fetchBestdoriSongResourceUrls(
  songId: number,
  options?: { songInfo?: BestdoriSongInfo },
): Promise<BestdoriSongResourceUrls> {
  const songInfo = options?.songInfo ?? (await fetchBestdoriSongInfo(songId));
  const server = resolveBestdoriSongServerName(songInfo);
  const audioUrl = buildBestdoriSongAudioUrl(songId, songInfo);
  const jacketUrl = await fetchBestdoriSongJacketUrlWithFallback(songId, songInfo);
  const mvUrl = buildBestdoriSongMvUrl(songInfo);
  return {
    server,
    audioUrl,
    jacketUrl,
    mvUrl,
  };
}

export async function fetchBestdoriOfficialChartImportPayload(
  chartId: number,
  difficulty: BestdoriOfficialChartDifficulty,
): Promise<BestdoriOfficialChartImportPayload> {
  const normalizedChartId = normalizeBestdoriSongId(chartId);
  const normalizedDifficulty = normalizeBestdoriOfficialChartDifficulty(difficulty);
  let chart: unknown;
  try {
    chart = await fetchBestdoriOfficialChart(normalizedChartId, normalizedDifficulty);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`官方谱面获取失败：${message}`);
  }

  let songInfo: BestdoriSongInfo;
  try {
    songInfo = await fetchBestdoriSongInfo(normalizedChartId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`歌曲信息获取失败：${message}`);
  }

  let bands: BestdoriBandsAll1;
  try {
    bands = await fetchBestdoriBandsAll1();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`乐队信息获取失败：${message}`);
  }

  const resources = await fetchBestdoriSongResourceUrls(normalizedChartId, { songInfo });
  const metadataDifficulty = BESTDORI_CHART_DIFFICULTY_TO_METADATA[normalizedDifficulty];
  return {
    chartId: normalizedChartId,
    difficulty: normalizedDifficulty,
    chart,
    songInfo,
    bands,
    resources,
    metadata: {
      title: resolveBestdoriSongTitle(songInfo),
      artist: resolveBestdoriBandArtist(songInfo, bands),
      charter: BESTDORI_OFFICIAL_CHART_TEAM,
      difficulty: metadataDifficulty,
      difficultyLevel: resolveBestdoriSongDifficultyLevel(songInfo, normalizedDifficulty),
      offsetMs: 0,
      mvOffsetMs: resolveBestdoriSongMvOffsetMs(songInfo),
    },
    audioFileName: resolveBestdoriSongAudioFileName(normalizedChartId, songInfo),
  };
}

export async function prepareBestdoriTapseskinAssets(
  ripName: string,
  operationId?: string,
): Promise<PreparedBestdoriTapseskinAssets> {
  const normalizedRipName = normalizeRipName(ripName, "ripName");
  const packageData = await prepareBestdoriPackage({
    namespace: "tapseskin",
    packageKey: normalizedRipName,
    assetBaseUrl: buildAssetBase(BESTDORI_TAPSE_ASSET_ROOT, normalizedRipName),
    manifestUrl: `${BESTDORI_TAPSE_EXPLORER_ROOT}/${normalizedRipName}.json`,
    taskId: operationId ?? null,
  });
  return { packageFiles: packageData.packageFiles };
}

export async function prepareBestdoriFieldSkinAssets(
  ripName: string,
  operationId?: string,
): Promise<PreparedBestdoriFieldSkinAssets> {
  const normalizedRipName = normalizeRipName(ripName, "ripName");
  const packageData = await prepareBestdoriPackage({
    namespace: "fieldskin",
    packageKey: normalizedRipName,
    assetBaseUrl: buildAssetBase(BESTDORI_FIELD_SKIN_ASSET_ROOT, normalizedRipName),
    manifestUrl: `${BESTDORI_FIELD_SKIN_EXPLORER_ROOT}/${normalizedRipName}.json`,
    taskId: operationId ?? null,
  });
  return { packageFiles: packageData.packageFiles };
}

export async function prepareBestdoriBgSkinAssets(
  ripName: string,
  operationId?: string,
): Promise<PreparedBestdoriBgSkinAssets> {
  const normalizedRipName = normalizeRipName(ripName, "ripName");
  const previewRipName = `${normalizedRipName}preview`;
  const mainPackage = await prepareBestdoriPackage({
    namespace: "bgskin",
    packageKey: normalizedRipName,
    assetBaseUrl: buildAssetBase(BESTDORI_BG_SKIN_ASSET_ROOT, normalizedRipName),
    manifestUrl: `${BESTDORI_BG_SKIN_EXPLORER_ROOT}/${normalizedRipName}.json`,
    taskId: operationId ?? null,
  });

  let previewPackageFiles: Record<string, string> | null = null;
  try {
    const previewPackage = await prepareBestdoriPackage({
      namespace: "bgskin",
      packageKey: previewRipName,
      assetBaseUrl: buildAssetBase(BESTDORI_BG_SKIN_ASSET_ROOT, previewRipName),
      manifestUrl: `${BESTDORI_BG_SKIN_EXPLORER_ROOT}/${previewRipName}.json`,
      taskId: operationId ?? null,
    });
    previewPackageFiles = previewPackage.packageFiles;
  } catch (error) {
    if (!isHttpNotFoundError(error)) {
      throw error;
    }
  }

  return {
    packageFiles: mainPackage.packageFiles,
    previewPackageFiles,
  };
}

export async function prepareBestdoriJudgeSkinAssets(
  ripName: string,
  operationId?: string,
): Promise<PreparedBestdoriJudgeSkinAssets> {
  const normalizedRipName = normalizeRipName(ripName, "ripName");
  const fallbackFilenames = resolveJudgeSkinFallbackFilenamesOrThrow(normalizedRipName);
  const packageData = await prepareBestdoriPackage({
    namespace: "judgeskin",
    packageKey: normalizedRipName,
    assetBaseUrl: buildAssetBase(BESTDORI_JUDGE_SKIN_ASSET_ROOT, normalizedRipName),
    fallbackFilenames,
    taskId: operationId ?? null,
  });
  return { packageFiles: packageData.packageFiles };
}

export async function ensureCommonSoundAsset(operationId?: string): Promise<string> {
  const packageData = await prepareBestdoriPackage({
    namespace: "sound-common",
    packageKey: "common_rip",
    assetBaseUrl: BESTDORI_COMMON_SOUND_ROOT,
    fallbackFilenames: [BESTDORI_COMMON_TAP_SKILL_FILE_NAME],
    taskId: operationId ?? null,
  });
  const key = BESTDORI_COMMON_TAP_SKILL_FILE_NAME.toLowerCase();
  const resolved = packageData.packageFiles[key];
  if (!resolved) {
    throw new Error(`Common sound asset missing: ${BESTDORI_COMMON_TAP_SKILL_FILE_NAME}`);
  }
  return resolved;
}

export async function readSkinTextFile(path: string): Promise<string> {
  return readBestdoriTextFile({ namespace: "noteskin", path });
}

export async function readSkinBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "noteskin", path });
}

export async function readSoundBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "tapseskin", path });
}

export async function readCommonSoundBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "sound-common", path });
}

export async function readFieldSkinBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "fieldskin", path });
}

export async function readBgSkinBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "bgskin", path });
}

export async function readJudgeSkinTextFile(path: string): Promise<string> {
  return readBestdoriTextFile({ namespace: "judgeskin", path });
}

export async function readJudgeSkinBinaryFile(path: string): Promise<string> {
  return readBestdoriBinaryFile({ namespace: "judgeskin", path });
}

function resolveMimeTypeByFileName(fileName: string): string | undefined {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (normalized.endsWith(".wav")) {
    return "audio/wav";
  }
  if (normalized.endsWith(".ogg")) {
    return "audio/ogg";
  }
  return undefined;
}

async function binaryBase64ToDataUrl(base64: string, fileName: string): Promise<string> {
  const mimeType = resolveMimeTypeByFileName(fileName);
  return blobToDataUrl(
    new Blob([decodeBase64ToArrayBuffer(base64)], mimeType ? { type: mimeType } : undefined),
  );
}

export async function readSkinBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readSkinBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}

export async function readSoundBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readSoundBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}

export async function readCommonSoundBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readCommonSoundBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}

export async function readFieldSkinBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readFieldSkinBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}

export async function readBgSkinBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readBgSkinBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}

export async function readJudgeSkinBinaryFileAsDataUrl(path: string, fileName: string): Promise<string> {
  const base64 = await readJudgeSkinBinaryFile(path);
  return binaryBase64ToDataUrl(base64, fileName);
}
