import jp from "../data/official/schema-jp.json";
import cn from "../data/official/schema-cn.json";
import tw from "../data/official/schema-tw.json";
import en from "../data/official/schema-en.json";
import { ResponseShapeError, array, boolean, finite, idKey, integer, record, string } from "./responseShape";
import type { OfficialServer } from "./officialMusicSources";

/*
 * Decoded original master data (AppGetResponse, SuiteMasterGetResponse), checked against the complete
 * ProtoMember closure of the server's own client model (schema-<server>.json, generated from the reverse
 * artifacts). Each message may carry exactly its declared fields; an absent field is the protobuf default
 * (0, "", false, empty, or null for Nullable), so a field absent from a row is not an error.
 */
type RegionalSchema = { messages: Record<string, Record<string, [name: string, type: string]>> };
type FieldTypes = Map<string, string>;
// The generated JSON is typed by its literal values; the tuple shape is the one the generator writes.
const schemas = { jp, cn, tw, en } as unknown as Record<OfficialServer, RegionalSchema>;
const indexes = new Map<OfficialServer, Map<string, FieldTypes>>(Object.entries(schemas).map(([server, schema]) => [
  server as OfficialServer,
  new Map(Object.entries(schema.messages).map(([type, fields]) =>
    [type, new Map(Object.values(fields).map(([name, fieldType]) => [name, fieldType]))])),
]));

const UINT_MAX = 0xffffffff;
function value(index: Map<string, FieldTypes>, type: string, input: unknown, path: string): void {
  const nullable = /^Nullable<(.+)>$/.exec(type);
  if (nullable) { if (input !== null) value(index, nullable[1]!, input, path); return; }
  const map = /^Dictionary<(\w+), (.+)>$/.exec(type);
  if (map) {
    for (const [key, item] of Object.entries(record(input, path))) {
      if (map[1] === "uint" || map[1] === "ulong") idKey(key, `${path} 的键 ${JSON.stringify(key)}`);
      value(index, map[2]!, item, `${path}.${key}`);
    }
    return;
  }
  if (type.endsWith("[]")) { array(input, path).forEach((item, position) => value(index, type.slice(0, -2), item, `${path}[${position}]`)); return; }
  switch (type) {
    case "string": string(input, path); return;
    case "bool": boolean(input, path); return;
    case "float": finite(input, path); return;
    case "int": { const v = integer(input, path); if (v < -(2 ** 31) || v >= 2 ** 31) throw new ResponseShapeError(path, "int32"); return; }
    case "uint": { const v = integer(input, path); if (v < 0 || v > UINT_MAX) throw new ResponseShapeError(path, "uint32"); return; }
    // 64-bit values can exceed the safe-integer range (open-ended sentinels such as the maximum); a JS number
    // keeps them as integers, with their low bits rounded.
    case "ulong": if (typeof input !== "number" || !Number.isInteger(input) || input < 0) throw new ResponseShapeError(path, "非负整数"); return;
    case "long": if (typeof input !== "number" || !Number.isInteger(input)) throw new ResponseShapeError(path, "整数"); return;
  }
  const fields = index.get(type);
  if (!fields) throw new ResponseShapeError(path, `协议类型 ${type}`);
  for (const [name, item] of Object.entries(record(input, path))) {
    // An in-memory row may hold undefined for an absent field; JSON drops it.
    if (item === undefined) continue;
    const fieldType = fields.get(name);
    if (fieldType === undefined) throw new ResponseShapeError(`${path}.${name}`, `${type} 中声明的字段`);
    value(index, fieldType, item, `${path}.${name}`);
  }
}

/** Throws ResponseShapeError at the first value outside the server's schema for the message. */
export function checkOfficialMasterShape(input: unknown, server: OfficialServer, type: "AppGetResponse" | "SuiteMasterGetResponse", path = "master"): void {
  value(indexes.get(server)!, type, input, path);
}

/**
 * One decoded row of the named message type, for rows kept outside their master (library cache). The
 * row types are identical across the four regional schemas (checked by the reverse artifacts), so the
 * caller names any server whose schema carries the type.
 */
export function checkOfficialMasterRow(input: unknown, server: OfficialServer, type: string, path: string): void {
  const index = indexes.get(server)!;
  if (!index.has(type)) throw new Error(`未知的原作协议类型：${type}`);
  value(index, type, input, path);
}

/** Bumped when the host decoder changes what it returns, so masters stored by an older decoder are fetched again. */
const DECODER_REVISION = "full-closure-2";

/** Fingerprint of the decoder and schema a server's master is decoded with; a stored master from another counts as changed. */
export async function schemaFingerprint(server: OfficialServer): Promise<string> {
  const text = JSON.stringify({ decoder: DECODER_REVISION, schema: schemas[server] });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
