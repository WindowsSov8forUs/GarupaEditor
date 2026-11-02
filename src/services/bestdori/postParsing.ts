import {
  ResponseShapeError, array, arrayOf, boolean, finite, integer, nullable, oneOf, optional, record, string,
} from "../responseShape";

/*
 * Bestdori community chart posts, as /api/post/list and /api/post/details return them. Variants
 * come from the Bestdori front end (post composer, post renderer, song resolver) and real
 * responses sampled across the whole chart history (posts 951–263920).
 */

export interface BestdoriUserTitle { id: number; type: string; server: number }
/** nickname and titles are always sent; null when the user has none. */
export interface BestdoriPostAuthor { username: string; nickname: string | null; titles: BestdoriUserTitle[] | null }

/**
 * The chart's song, one of the front end's song sources:
 * - custom: uploaded or linked audio and cover, either may be an empty string;
 * - bandori / original: an official song id (both resolve through songs/all.player);
 * - llsif: a Love Live! School idol festival song id (misc/llsif.10);
 * - osu: an osu! beatmap set id and beatmap id (osu posts date from 2019; e.g. post 1180).
 * The current composer only creates custom, bandori and llsif; original appears only in the resolver.
 */
export type BestdoriPostSong =
  | { type: "custom"; audio: string; cover: string }
  | { type: "bandori" | "original" | "llsif"; id: number }
  | { type: "osu"; id: number; diff: number };
/** A tag on a post; data is the tag text or the stringified id of a song, character, event, card, etc. */
export interface BestdoriPostTag { type: string; data: string }

/**
 * Rich-text segments the composer produces. link target is "url" or "<kind>-single" (song, card,
 * event…); list target is "<kind>-info" with ids; image objects are image URLs.
 */
export type BestdoriPostContentSegment =
  | { type: "text" | "emoji" | "mention"; data: string }
  | { type: "br" }
  | { type: "link"; target: string; data: string }
  | { type: "heading"; data: string; margin: string }
  | { type: "image"; display: number; objects: string[] }
  | { type: "list"; target: string; display: number; objects: number[] };

export const BESTDORI_CHART_DIFFS = [0, 1, 2, 3, 4] as const;
/** SELF_POST/chart, the only category modelled. The list omits chart; details carry the Bestdori v2 chart array. */
export interface BestdoriChartPost {
  categoryName: "SELF_POST"; categoryId: "chart";
  title: string; song: BestdoriPostSong; artists: string;
  diff: typeof BESTDORI_CHART_DIFFS[number]; level: number;
  chart?: unknown[];
  content: BestdoriPostContentSegment[];
  /** Milliseconds since the epoch. */
  time: number;
  author: BestdoriPostAuthor; likes: number; liked: boolean; tags: BestdoriPostTag[];
}
/**
 * Any other category (SELF_POST/text and story, the *_COMMENT categories, …): identified by its
 * category fields and otherwise not read, since it is never a chart.
 */
export interface BestdoriOtherPost { categoryName: string; categoryId: string }
export type BestdoriPostInfo = BestdoriChartPost | BestdoriOtherPost;

export function isBestdoriChartPost(post: BestdoriPostInfo): post is BestdoriChartPost {
  return post.categoryName === "SELF_POST" && post.categoryId === "chart";
}

function parseTitle(value: unknown, path: string): BestdoriUserTitle {
  const title = record(value, path);
  return { id: integer(title.id, `${path}.id`), type: string(title.type, `${path}.type`), server: integer(title.server, `${path}.server`) };
}

export function parseBestdoriPostAuthor(value: unknown, path: string): BestdoriPostAuthor {
  const author = record(value, path);
  return {
    username: string(author.username, `${path}.username`),
    nickname: nullable(author.nickname, `${path}.nickname`, string),
    titles: nullable(author.titles, `${path}.titles`, (v, p) => arrayOf(v, p, parseTitle)),
  };
}

export function parseBestdoriPostSong(value: unknown, path: string): BestdoriPostSong {
  const song = record(value, path);
  const type = oneOf(song.type, `${path}.type`, ["custom", "bandori", "original", "llsif", "osu"]);
  if (type === "custom") return { type, audio: string(song.audio, `${path}.audio`), cover: string(song.cover, `${path}.cover`) };
  const id = integer(song.id, `${path}.id`);
  return type === "osu" ? { type, id, diff: integer(song.diff, `${path}.diff`) } : { type, id };
}

export function parseBestdoriPostTag(value: unknown, path: string): BestdoriPostTag {
  const tag = record(value, path);
  return { type: string(tag.type, `${path}.type`), data: string(tag.data, `${path}.data`) };
}

function parseSegment(value: unknown, path: string): BestdoriPostContentSegment {
  const segment = record(value, path);
  const type = oneOf(segment.type, `${path}.type`, ["text", "emoji", "mention", "br", "link", "heading", "image", "list"]);
  switch (type) {
    case "br": return { type };
    case "text": case "emoji": case "mention": return { type, data: string(segment.data, `${path}.data`) };
    case "link": return { type, target: string(segment.target, `${path}.target`), data: string(segment.data, `${path}.data`) };
    case "heading": return { type, data: string(segment.data, `${path}.data`), margin: string(segment.margin, `${path}.margin`) };
    case "image": return { type, display: integer(segment.display, `${path}.display`), objects: arrayOf(segment.objects, `${path}.objects`, string) };
    case "list": return { type, target: string(segment.target, `${path}.target`), display: integer(segment.display, `${path}.display`),
      objects: arrayOf(segment.objects, `${path}.objects`, integer) };
  }
}

/** A chart post with every field of its model; any other category only by its category fields. */
export function parseBestdoriPostInfo(value: unknown, path = "post"): BestdoriPostInfo {
  const post = record(value, path);
  const categoryName = string(post.categoryName, `${path}.categoryName`);
  const categoryId = string(post.categoryId, `${path}.categoryId`);
  if (categoryName !== "SELF_POST" || categoryId !== "chart") return { categoryName, categoryId };
  return {
    categoryName, categoryId,
    title: string(post.title, `${path}.title`),
    song: parseBestdoriPostSong(post.song, `${path}.song`),
    artists: string(post.artists, `${path}.artists`),
    diff: oneOf(post.diff, `${path}.diff`, BESTDORI_CHART_DIFFS),
    level: finite(post.level, `${path}.level`),
    chart: optional(post.chart, `${path}.chart`, array),
    content: arrayOf(post.content, `${path}.content`, parseSegment),
    time: finite(post.time, `${path}.time`),
    author: parseBestdoriPostAuthor(post.author, `${path}.author`),
    likes: integer(post.likes, `${path}.likes`),
    liked: boolean(post.liked, `${path}.liked`),
    tags: arrayOf(post.tags, `${path}.tags`, parseBestdoriPostTag),
  };
}

/**
 * A missing or removed post answers result false with a code (REQUEST_INVALID). Details carry a
 * chart post's chart, which the list omits.
 */
export type BestdoriPostDetailResponse = { result: true; post: BestdoriPostInfo } | { result: false; code: string };
export function parseBestdoriPostDetailResponse(value: unknown): BestdoriPostDetailResponse {
  const response = record(value, "response");
  if (!boolean(response.result, "response.result")) return { result: false, code: string(response.code, "response.code") };
  const post = parseBestdoriPostInfo(response.post, "response.post");
  if (isBestdoriChartPost(post) && post.chart === undefined) throw new ResponseShapeError("response.post.chart", "数组");
  return { result: true, post };
}

export type BestdoriCommunityListResponse =
  /** pageLength counts every post the page carried, including any left out, for the next offset. */
  | { result: true; count: number; posts: (BestdoriChartPost & { id: number })[]; pageLength: number }
  | { result: false; code: string };
/**
 * Chart posts of a list page. Posts of other categories are skipped; a chart post that fails its
 * model is reported to the caller and left out, not dropped silently.
 */
export function parseBestdoriCommunityListResponse(value: unknown,
  onInvalidPost: (error: ResponseShapeError, index: number) => void): BestdoriCommunityListResponse {
  const response = record(value, "response");
  if (!boolean(response.result, "response.result")) return { result: false, code: string(response.code, "response.code") };
  const count = integer(response.count, "response.count");
  const posts: (BestdoriChartPost & { id: number })[] = [];
  const page = array(response.posts, "response.posts");
  page.forEach((item, index) => {
    const path = `response.posts[${index}]`;
    try {
      const post = parseBestdoriPostInfo(item, path);
      if (isBestdoriChartPost(post)) posts.push({ ...post, id: integer(record(item, path).id, `${path}.id`) });
    } catch (error) {
      if (!(error instanceof ResponseShapeError)) throw error;
      onInvalidPost(error, index);
    }
  });
  return { result: true, count, posts, pageLength: page.length };
}

/** /api/post/tag: tag suggestions with their use counts. */
export interface BestdoriPostTagSearchEntry extends BestdoriPostTag { count: number }
export type BestdoriPostTagSearchResponse = { result: true; tags: BestdoriPostTagSearchEntry[] } | { result: false; code: string };
export function parseBestdoriPostTagSearchResponse(value: unknown): BestdoriPostTagSearchResponse {
  const response = record(value, "response");
  if (!boolean(response.result, "response.result")) return { result: false, code: string(response.code, "response.code") };
  return { result: true, tags: arrayOf(response.tags, "response.tags", (v, p) =>
    ({ ...parseBestdoriPostTag(v, p), count: integer(record(v, p).count, `${p}.count`) })) };
}

/** POST /api/post: the new post's id, or the refusal code. */
export type BestdoriCreatePostResponse = { result: true; id: number } | { result: false; code: string };
export function parseBestdoriCreatePostResponse(value: unknown): BestdoriCreatePostResponse {
  const response = record(value, "response");
  return boolean(response.result, "response.result")
    ? { result: true, id: integer(response.id, "response.id") }
    : { result: false, code: string(response.code, "response.code") };
}

/**
 * Upload responses, per the front end's file picker: prepare answers result true, or false with a
 * code (ALREADY_UPLOADED means the hash is stored); upload answers the stored hash or a code;
 * status answers a status ("not_found", "available", or a processing state), and result false
 * means the status is not known yet and is asked again.
 */
export type BestdoriUploadPrepareResponse = { result: true } | { result: false; code: string };
export type BestdoriUploadResponse = { result: true; hash: string } | { result: false; code: string };
export type BestdoriUploadStatusResponse = { result: true; status: string } | { result: false };
export function parseBestdoriUploadPrepareResponse(value: unknown): BestdoriUploadPrepareResponse {
  const response = record(value, "response");
  return boolean(response.result, "response.result") ? { result: true } : { result: false, code: string(response.code, "response.code") };
}
export function parseBestdoriUploadResponse(value: unknown): BestdoriUploadResponse {
  const response = record(value, "response");
  return boolean(response.result, "response.result")
    ? { result: true, hash: string(response.hash, "response.hash") }
    : { result: false, code: string(response.code, "response.code") };
}
export function parseBestdoriUploadStatusResponse(value: unknown): BestdoriUploadStatusResponse {
  const response = record(value, "response");
  return boolean(response.result, "response.result") ? { result: true, status: string(response.status, "response.status") } : { result: false };
}
