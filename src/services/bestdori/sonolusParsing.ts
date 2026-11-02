import {
  ResponseShapeError, arrayOf, boolean, finite, integer, nullable, oneOf, optional, record, string, type Json, type Reader,
} from "../responseShape";

/*
 * Sonolus server responses (the Ayachan test server), per the Sonolus core type definitions
 * (sonolus-core 7.15: ServerItemList, ServerItemDetails and the item types). Text and Icon values
 * are Sonolus localization keys or literal strings, so both read as strings. Item versions are
 * kept as numbers: a server on another Sonolus release reports its own version, and this reads
 * the fields of the current release.
 */

export interface SonolusSrl { hash?: string | null; url?: string | null }
export interface SonolusTag { title?: string; icon?: string }
export interface SonolusUserItem { name: string; source?: string; title: string; handle?: string; tags: SonolusTag[] }
interface SonolusItemHeader {
  name: string; source?: string; version: number; title: string;
  author: string; authorUser?: SonolusUserItem; tags: SonolusTag[];
}
export interface SonolusSkinItem extends SonolusItemHeader { subtitle: string; thumbnail: SonolusSrl; data: SonolusSrl; texture: SonolusSrl }
export interface SonolusBackgroundItem extends SonolusItemHeader {
  subtitle: string; thumbnail: SonolusSrl; data: SonolusSrl; image: SonolusSrl; configuration: SonolusSrl;
}
export interface SonolusEffectItem extends SonolusItemHeader { subtitle: string; thumbnail: SonolusSrl; data: SonolusSrl; audio: SonolusSrl }
export interface SonolusParticleItem extends SonolusItemHeader { subtitle: string; thumbnail: SonolusSrl; data: SonolusSrl; texture: SonolusSrl }
export interface SonolusEngineItem extends SonolusItemHeader {
  subtitle: string; skin: SonolusSkinItem; background: SonolusBackgroundItem; effect: SonolusEffectItem; particle: SonolusParticleItem;
  thumbnail: SonolusSrl; playData: SonolusSrl; watchData: SonolusSrl; previewData: SonolusSrl; tutorialData: SonolusSrl;
  rom?: SonolusSrl; configuration: SonolusSrl;
}
/** The level's own skin/background/effect/particle, or the engine's default. */
export type SonolusUseItem<T> = { useDefault: true } | { useDefault: false; item: T };
export interface SonolusLevelItem extends SonolusItemHeader {
  rating: number; artists: string; engine: SonolusEngineItem;
  useSkin: SonolusUseItem<SonolusSkinItem>; useBackground: SonolusUseItem<SonolusBackgroundItem>;
  useEffect: SonolusUseItem<SonolusEffectItem>; useParticle: SonolusUseItem<SonolusParticleItem>;
  cover: SonolusSrl; bgm: SonolusSrl; preview?: SonolusSrl; data: SonolusSrl;
}
export interface SonolusPostItem extends SonolusItemHeader { time: number; thumbnail?: SonolusSrl }
export interface SonolusPlaylistItem extends SonolusItemHeader { subtitle: string; levels: SonolusLevelItem[]; thumbnail?: SonolusSrl }
export interface SonolusReplayItem extends SonolusItemHeader { subtitle: string; level: SonolusLevelItem; data: SonolusSrl; configuration: SonolusSrl }
export interface SonolusRoomItem {
  name: string; title: string; subtitle: string; master: string; masterUser?: SonolusUserItem; tags: SonolusTag[];
  cover?: SonolusSrl; bgm?: SonolusSrl; preview?: SonolusSrl;
}

const SRL = (value: unknown, path: string): SonolusSrl => {
  const srl = record(value, path);
  return { hash: optional(srl.hash, `${path}.hash`, (v, p) => nullable(v, p, string)),
    url: optional(srl.url, `${path}.url`, (v, p) => nullable(v, p, string)) };
};
const TAG: Reader<SonolusTag> = (value, path) => {
  const tag = record(value, path);
  return { title: optional(tag.title, `${path}.title`, string), icon: optional(tag.icon, `${path}.icon`, string) };
};
const USER: Reader<SonolusUserItem> = (value, path) => {
  const user = record(value, path);
  return { name: string(user.name, `${path}.name`), source: optional(user.source, `${path}.source`, string),
    title: string(user.title, `${path}.title`), handle: optional(user.handle, `${path}.handle`, string),
    tags: arrayOf(user.tags, `${path}.tags`, TAG) };
};
function header(item: Json, path: string, authorKey = "author"): SonolusItemHeader {
  return { name: string(item.name, `${path}.name`), source: optional(item.source, `${path}.source`, string),
    version: integer(item.version, `${path}.version`), title: string(item.title, `${path}.title`),
    author: string(item[authorKey], `${path}.${authorKey}`), authorUser: optional(item.authorUser, `${path}.authorUser`, USER),
    tags: arrayOf(item.tags, `${path}.tags`, TAG) };
}
/** An item with subtitle and the named resource fields. */
function resourceItem<K extends string>(keys: readonly K[]) {
  return (value: unknown, path: string) => {
    const item = record(value, path);
    const resources = Object.fromEntries(keys.map(key => [key, SRL(item[key], `${path}.${key}`)])) as Record<K, SonolusSrl>;
    return { ...header(item, path), subtitle: string(item.subtitle, `${path}.subtitle`), ...resources };
  };
}
const SKIN: Reader<SonolusSkinItem> = resourceItem(["thumbnail", "data", "texture"]);
const BACKGROUND: Reader<SonolusBackgroundItem> = resourceItem(["thumbnail", "data", "image", "configuration"]);
const EFFECT: Reader<SonolusEffectItem> = resourceItem(["thumbnail", "data", "audio"]);
const PARTICLE: Reader<SonolusParticleItem> = resourceItem(["thumbnail", "data", "texture"]);
const ENGINE: Reader<SonolusEngineItem> = (value, path) => {
  const item = record(value, path);
  return { ...resourceItem(["thumbnail", "playData", "watchData", "previewData", "tutorialData", "configuration"])(item, path),
    skin: SKIN(item.skin, `${path}.skin`), background: BACKGROUND(item.background, `${path}.background`),
    effect: EFFECT(item.effect, `${path}.effect`), particle: PARTICLE(item.particle, `${path}.particle`),
    rom: optional(item.rom, `${path}.rom`, SRL) };
};
function useItem<T>(read: Reader<T>): Reader<SonolusUseItem<T>> {
  return (value, path) => {
    const use = record(value, path);
    return boolean(use.useDefault, `${path}.useDefault`) ? { useDefault: true } : { useDefault: false, item: read(use.item, `${path}.item`) };
  };
}
export const parseSonolusLevelItem: Reader<SonolusLevelItem> = (value, path) => {
  const item = record(value, path);
  return { ...header(item, path), rating: finite(item.rating, `${path}.rating`), artists: string(item.artists, `${path}.artists`),
    engine: ENGINE(item.engine, `${path}.engine`),
    useSkin: useItem(SKIN)(item.useSkin, `${path}.useSkin`), useBackground: useItem(BACKGROUND)(item.useBackground, `${path}.useBackground`),
    useEffect: useItem(EFFECT)(item.useEffect, `${path}.useEffect`), useParticle: useItem(PARTICLE)(item.useParticle, `${path}.useParticle`),
    cover: SRL(item.cover, `${path}.cover`), bgm: SRL(item.bgm, `${path}.bgm`), preview: optional(item.preview, `${path}.preview`, SRL),
    data: SRL(item.data, `${path}.data`) };
};
const POST: Reader<SonolusPostItem> = (value, path) => {
  const item = record(value, path);
  return { ...header(item, path), time: finite(item.time, `${path}.time`), thumbnail: optional(item.thumbnail, `${path}.thumbnail`, SRL) };
};
const PLAYLIST: Reader<SonolusPlaylistItem> = (value, path) => {
  const item = record(value, path);
  return { ...header(item, path), subtitle: string(item.subtitle, `${path}.subtitle`),
    levels: arrayOf(item.levels, `${path}.levels`, parseSonolusLevelItem), thumbnail: optional(item.thumbnail, `${path}.thumbnail`, SRL) };
};
const REPLAY: Reader<SonolusReplayItem> = (value, path) => {
  const item = record(value, path);
  return { ...header(item, path), subtitle: string(item.subtitle, `${path}.subtitle`), level: parseSonolusLevelItem(item.level, `${path}.level`),
    data: SRL(item.data, `${path}.data`), configuration: SRL(item.configuration, `${path}.configuration`) };
};
const ROOM: Reader<SonolusRoomItem> = (value, path) => {
  const item = record(value, path);
  return { name: string(item.name, `${path}.name`), title: string(item.title, `${path}.title`), subtitle: string(item.subtitle, `${path}.subtitle`),
    master: string(item.master, `${path}.master`), masterUser: optional(item.masterUser, `${path}.masterUser`, USER),
    tags: arrayOf(item.tags, `${path}.tags`, TAG), cover: optional(item.cover, `${path}.cover`, SRL),
    bgm: optional(item.bgm, `${path}.bgm`, SRL), preview: optional(item.preview, `${path}.preview`, SRL) };
};

const ITEM_TYPES = ["post", "playlist", "level", "skin", "background", "effect", "particle", "engine", "replay", "room", "user"] as const;
export type SonolusItemType = typeof ITEM_TYPES[number];
const ITEM_READERS: { [K in SonolusItemType]: Reader<unknown> } = {
  post: POST, playlist: PLAYLIST, level: parseSonolusLevelItem, skin: SKIN, background: BACKGROUND, effect: EFFECT,
  particle: PARTICLE, engine: ENGINE, replay: REPLAY, room: ROOM, user: USER,
};

/** A Sonolus server option, discriminated by type. */
export type SonolusServerOption = { query: string; name: string; description?: string; required: boolean } & (
  | { type: "text" | "textArea"; def: string; placeholder: string; limit: number; shortcuts: string[] }
  | { type: "slider"; def: number; min: number; max: number; step: number; unit?: string }
  | { type: "toggle"; def: boolean }
  | { type: "select"; def: string; values: { name: string; title: string }[] }
  | { type: "multi"; def: boolean[]; values: { name: string; title: string }[] }
  | { type: "serverItem"; itemType: SonolusItemType; infoType?: string; def: { address: string; name: string } | null; allowOtherServers: boolean }
  | { type: "serverItems"; itemType: SonolusItemType; infoType?: string; def: { address: string; name: string }[]; allowOtherServers: boolean; limit: number }
  | { type: "collectionItem"; itemType: SonolusItemType }
  | { type: "file"; def: string; validation?: Record<string, string | number> });
export interface SonolusServerForm {
  type: string; title: string; icon?: string; description?: string; help?: string;
  requireConfirmation: boolean; options: SonolusServerOption[];
}
const SIL = (value: unknown, path: string) => {
  const sil = record(value, path);
  return { address: string(sil.address, `${path}.address`), name: string(sil.name, `${path}.name`) };
};
const VALUES = (value: unknown, path: string) => arrayOf(value, path, (v, p) => {
  const entry = record(v, p);
  return { name: string(entry.name, `${p}.name`), title: string(entry.title, `${p}.title`) };
});
const OPTION: Reader<SonolusServerOption> = (value, path) => {
  const option = record(value, path);
  const base = { query: string(option.query, `${path}.query`), name: string(option.name, `${path}.name`),
    description: optional(option.description, `${path}.description`, string), required: boolean(option.required, `${path}.required`) };
  const type = oneOf(option.type, `${path}.type`,
    ["text", "textArea", "slider", "toggle", "select", "multi", "serverItem", "serverItems", "collectionItem", "file"]);
  const itemType = () => oneOf(option.itemType, `${path}.itemType`, ITEM_TYPES);
  switch (type) {
    case "text": case "textArea": return { ...base, type, def: string(option.def, `${path}.def`),
      placeholder: string(option.placeholder, `${path}.placeholder`), limit: integer(option.limit, `${path}.limit`),
      shortcuts: arrayOf(option.shortcuts, `${path}.shortcuts`, string) };
    case "slider": return { ...base, type, def: finite(option.def, `${path}.def`), min: finite(option.min, `${path}.min`),
      max: finite(option.max, `${path}.max`), step: finite(option.step, `${path}.step`), unit: optional(option.unit, `${path}.unit`, string) };
    case "toggle": return { ...base, type, def: boolean(option.def, `${path}.def`) };
    case "select": return { ...base, type, def: string(option.def, `${path}.def`), values: VALUES(option.values, `${path}.values`) };
    case "multi": return { ...base, type, def: arrayOf(option.def, `${path}.def`, boolean), values: VALUES(option.values, `${path}.values`) };
    case "serverItem": return { ...base, type, itemType: itemType(), infoType: optional(option.infoType, `${path}.infoType`, string),
      def: nullable(option.def, `${path}.def`, SIL), allowOtherServers: boolean(option.allowOtherServers, `${path}.allowOtherServers`) };
    case "serverItems": return { ...base, type, itemType: itemType(), infoType: optional(option.infoType, `${path}.infoType`, string),
      def: arrayOf(option.def, `${path}.def`, SIL), allowOtherServers: boolean(option.allowOtherServers, `${path}.allowOtherServers`),
      limit: integer(option.limit, `${path}.limit`) };
    case "collectionItem": return { ...base, type, itemType: itemType() };
    case "file": return { ...base, type, def: string(option.def, `${path}.def`),
      validation: optional(option.validation, `${path}.validation`, (v, p) => {
        const validation = record(v, p);
        const result: Record<string, string | number> = { type: string(validation.type, `${p}.type`) };
        for (const key of ["minSize", "maxSize", "minWidth", "maxWidth", "minHeight", "maxHeight", "minLength", "maxLength"]) {
          const bound = optional(validation[key], `${p}.${key}`, finite);
          if (bound !== undefined) result[key] = bound;
        }
        return result;
      }) };
  }
};
const FORM: Reader<SonolusServerForm> = (value, path) => {
  const form = record(value, path);
  return { type: string(form.type, `${path}.type`), title: string(form.title, `${path}.title`),
    icon: optional(form.icon, `${path}.icon`, string), description: optional(form.description, `${path}.description`, string),
    help: optional(form.help, `${path}.help`, string), requireConfirmation: boolean(form.requireConfirmation, `${path}.requireConfirmation`),
    options: arrayOf(form.options, `${path}.options`, OPTION) };
};

/** GET /sonolus/levels/list: one page of levels. */
export interface SonolusItemList<T> {
  title?: string; pageCount: number; cursor?: string; items: T[];
  searches?: SonolusServerForm[]; quickSearchValues?: string;
}
export interface SonolusItemSection {
  title: string; icon?: string; description?: string; help?: string;
  itemType: SonolusItemType; items: unknown[]; search?: SonolusServerForm; searchValues?: string;
}
/** GET /sonolus/levels/{name}: the level and its page. */
export interface SonolusItemDetails<T> {
  item: T; description?: string; actions: SonolusServerForm[]; hasCommunity: boolean;
  leaderboards: { name: string; title: string; description?: string }[];
  sections: SonolusItemSection[];
}

export function parseSonolusItemList<T>(value: unknown, read: Reader<T>, path = "response"): SonolusItemList<T> {
  const list = record(value, path);
  const pageCount = integer(list.pageCount, `${path}.pageCount`);
  if (pageCount < 0) throw new ResponseShapeError(`${path}.pageCount`, "非负整数");
  return { title: optional(list.title, `${path}.title`, string), pageCount, cursor: optional(list.cursor, `${path}.cursor`, string),
    items: arrayOf(list.items, `${path}.items`, read), searches: optional(list.searches, `${path}.searches`, (v, p) => arrayOf(v, p, FORM)),
    quickSearchValues: optional(list.quickSearchValues, `${path}.quickSearchValues`, string) };
}
export function parseSonolusItemDetails<T>(value: unknown, read: Reader<T>, path = "response"): SonolusItemDetails<T> {
  const details = record(value, path);
  return {
    item: read(details.item, `${path}.item`), description: optional(details.description, `${path}.description`, string),
    actions: arrayOf(details.actions, `${path}.actions`, FORM), hasCommunity: boolean(details.hasCommunity, `${path}.hasCommunity`),
    leaderboards: arrayOf(details.leaderboards, `${path}.leaderboards`, (v, p) => {
      const board = record(v, p);
      return { name: string(board.name, `${p}.name`), title: string(board.title, `${p}.title`),
        description: optional(board.description, `${p}.description`, string) };
    }),
    sections: arrayOf(details.sections, `${path}.sections`, (v, p) => {
      const section = record(v, p);
      const itemType = oneOf(section.itemType, `${p}.itemType`, ITEM_TYPES);
      return { title: string(section.title, `${p}.title`), icon: optional(section.icon, `${p}.icon`, string),
        description: optional(section.description, `${p}.description`, string), help: optional(section.help, `${p}.help`, string),
        itemType, items: arrayOf(section.items, `${p}.items`, ITEM_READERS[itemType]),
        search: optional(section.search, `${p}.search`, FORM), searchValues: optional(section.searchValues, `${p}.searchValues`, string) };
    }),
  };
}

/**
 * POST /sonolus/levels on the Ayachan test server answers 200 with {uid}, the new level's name
 * (decimal, like the names in its level list); its upload page shows the uid as given, so a
 * number or a string is read. Failures are HTTP 400/404/500 with {code, description, detail}.
 */
export function parseAyachanUploadResponse(value: unknown): string {
  const response = record(value, "response");
  const uid = typeof response.uid === "number" ? String(integer(response.uid, "response.uid")) : string(response.uid, "response.uid");
  if (!/^[1-9]\d*$/.test(uid)) throw new ResponseShapeError("response.uid", "正整数编号");
  return uid;
}

/**
 * NotGarupa upload (sonolus-notgarupa-server docs/UPLOAD.md): 200 answers {uid, status}, uid the
 * level's 8-character name and status published, or pending while it waits for review. A failure
 * answers {error}; a body that is not JSON (a proxy's page) reaches here as null.
 */
export type NotGarupaUploadBody = { uid: string; status: "published" | "pending" };
export function parseNotGarupaUploadSuccess(value: unknown): NotGarupaUploadBody {
  const body = record(value, "response");
  const uid = string(body.uid, "response.uid");
  // base32 (a–z, 2–7) of 40 random bits.
  if (!/^[a-z2-7]{8}$/.test(uid)) throw new ResponseShapeError("response.uid", "8 个字符的关卡 ID");
  return { uid, status: oneOf(body.status, "response.status", ["published", "pending"]) };
}
export function parseNotGarupaUploadFailure(value: unknown): { error: string } | null {
  return value === null ? null : { error: string(record(value, "response").error, "response.error") };
}
