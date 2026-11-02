import protocol from "../data/originalOfficialMasterProtocol.json";
import { ResponseShapeError, array, boolean, idKey, integer, record, string } from "./responseShape";

/*
 * Decoded original master data (AppGetResponse, SuiteMasterGetResponse), checked against the same
 * ProtoMember schema the host decoder uses. Each message may carry exactly its schema fields; an
 * absent field is the protobuf default (0, "", false, empty, or null for Nullable). Suite carries
 * only the song-related entries the schema lists.
 */
type FieldSchema = { type: string; name: string };
const schema = protocol.schema as Record<string, Record<string, FieldSchema>>;
const fieldsByName = new Map(Object.entries(schema).map(([type, fields]) =>
  [type, new Map(Object.values(fields).map(field => [field.name, field.type]))]));

const UINT_MAX = 0xffffffff;
function value(type: string, input: unknown, path: string): void {
  const nullable = /^Nullable<(.+)>$/.exec(type);
  if (nullable) { if (input !== null) value(nullable[1]!, input, path); return; }
  const map = /^Dictionary<(\w+), (.+)>$/.exec(type);
  if (map) {
    for (const [key, item] of Object.entries(record(input, path))) {
      if (map[1] === "uint") idKey(key, `${path} 的键 ${JSON.stringify(key)}`);
      value(map[2]!, item, `${path}.${key}`);
    }
    return;
  }
  if (type.endsWith("[]")) { array(input, path).forEach((item, index) => value(type.slice(0, -2), item, `${path}[${index}]`)); return; }
  switch (type) {
    case "string": string(input, path); return;
    case "bool": boolean(input, path); return;
    case "int": { const v = integer(input, path); if (v < -(2 ** 31) || v >= 2 ** 31) throw new ResponseShapeError(path, "int32"); return; }
    case "uint": { const v = integer(input, path); if (v < 0 || v > UINT_MAX) throw new ResponseShapeError(path, "uint32"); return; }
    case "ulong": if (integer(input, path) < 0) throw new ResponseShapeError(path, "非负整数"); return;
  }
  const fields = fieldsByName.get(type);
  if (!fields) throw new ResponseShapeError(path, `协议类型 ${type}`);
  for (const [name, item] of Object.entries(record(input, path))) {
    // An in-memory row may hold undefined for an absent field; JSON drops it.
    if (item === undefined) continue;
    const fieldType = fields.get(name);
    if (fieldType === undefined) throw new ResponseShapeError(`${path}.${name}`, `${type} 中声明的字段`);
    value(fieldType, item, `${path}.${name}`);
  }
}

/** Throws ResponseShapeError at the first value outside the message's schema. */
export function checkOfficialMasterShape(input: unknown, type: "AppGetResponse" | "SuiteMasterGetResponse", path = "master"): void {
  value(type, input, path);
}

/** One decoded row of the named message type, for rows kept outside their master (library cache). */
export function checkOfficialMasterRow(input: unknown, type: string, path: string): void {
  if (!fieldsByName.has(type)) throw new Error(`未知的原作协议类型：${type}`);
  value(type, input, path);
}
