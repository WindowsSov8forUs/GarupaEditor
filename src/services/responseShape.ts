/**
 * Strict readers for external JSON responses. A parser reads every field of its data model and
 * throws ResponseShapeError naming the first field that does not fit. Fields a service adds beyond
 * the model are not errors and are not carried; variants the service legitimately returns belong
 * in the model itself.
 */
export class ResponseShapeError extends Error {
  readonly path: string;
  constructor(path: string, expected: string) {
    super(`响应字段 ${path} 不符合数据模型：应为${expected}`);
    this.name = "ResponseShapeError";
    this.path = path;
  }
}

export type Json = Record<string, unknown>;
export type Reader<T> = (value: unknown, path: string) => T;

export const isJsonRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function record(value: unknown, path: string): Json {
  if (!isJsonRecord(value)) throw new ResponseShapeError(path, "对象");
  return value;
}
export function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw new ResponseShapeError(path, "字符串");
  return value;
}
export function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ResponseShapeError(path, "整数");
  return value;
}
export function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ResponseShapeError(path, "有限数值");
  return value;
}
export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ResponseShapeError(path, "布尔值");
  return value;
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ResponseShapeError(path, "数组");
  return value;
}
export function oneOf<const T extends string | number>(value: unknown, path: string, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new ResponseShapeError(path, values.map(item => JSON.stringify(item)).join("、") + " 之一");
  return value as T;
}
/** A key the model allows to be absent; present means present with its type. */
export function optional<T>(value: unknown, path: string, read: Reader<T>): T | undefined {
  return value === undefined ? undefined : read(value, path);
}
export function nullable<T>(value: unknown, path: string, read: Reader<T>): T | null {
  return value === null ? null : read(value, path);
}
export function arrayOf<T>(value: unknown, path: string, read: Reader<T>): T[] {
  return array(value, path).map((item, index) => read(item, `${path}[${index}]`));
}
/** A JSON object used as a map; checkKey rejects keys outside the model (ids, enum names). */
export function recordOf<T>(value: unknown, path: string, read: Reader<T>,
  checkKey?: (key: string, path: string) => void): Record<string, T> {
  const source = record(value, path);
  const result: Record<string, T> = {};
  for (const [key, item] of Object.entries(source)) {
    checkKey?.(key, `${path} 的键 ${JSON.stringify(key)}`);
    result[key] = read(item, `${path}.${key}`);
  }
  return result;
}
/** A map key that is a decimal id. */
export function idKey(key: string, path: string): void {
  if (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key))) throw new ResponseShapeError(path, "十进制整数 ID");
}
