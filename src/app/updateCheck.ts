/*
 * 检查更新: the newest release of the project on GitHub (pre-releases included, as every build so far is one),
 * compared with the running version.
 */

export const PROJECT_REPOSITORY_URL = "https://github.com/WindowsSov8forUs/GarupaEditor";
const RELEASES_API = "https://api.github.com/repos/WindowsSov8forUs/GarupaEditor/releases?per_page=20";

export type ReleaseInfo = { version: string; url: string; publishedAt: string };
export type UpdateCheckResult = { current: string; latest: ReleaseInfo | null; newer: boolean };

type Version = { core: number[]; pre: (number | string)[] };

function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(text.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".").map(part => (/^\d+$/.test(part) ? Number(part) : part)) : [],
  };
}

/** Semantic version order: negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a), right = parseVersion(b);
  if (!left || !right) return a.localeCompare(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = left.core[index]! - right.core[index]!;
    if (difference !== 0) return difference;
  }
  // A release is newer than any of its pre-releases.
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
  for (let index = 0; index < Math.min(left.pre.length, right.pre.length); index += 1) {
    const x = left.pre[index]!, y = right.pre[index]!;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return left.pre.length - right.pre.length;
}

/** How long a successful check is reused before GitHub is asked again (in this run of the app). */
const CHECK_CACHE_MS = 5 * 60 * 1000;
let cachedCheck: { at: number; current: string; result: UpdateCheckResult } | null = null;

/** A failed check, its reason in words for the window (GitHub's status, or no connection). */
export class UpdateCheckError extends Error {}

/**
 * The newest release against `current`. A result from the last few minutes is reused (GitHub limits unauthenticated
 * requests); `force` (重试) always asks again.
 */
export async function checkForUpdate(current: string, signal?: AbortSignal, force = false): Promise<UpdateCheckResult> {
  if (!force && cachedCheck && cachedCheck.current === current && Date.now() - cachedCheck.at < CHECK_CACHE_MS) {
    return cachedCheck.result;
  }
  let response: Response;
  try {
    response = await fetch(RELEASES_API, { signal, cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new UpdateCheckError("无法连接 GitHub");
  }
  if (response.status === 403 || response.status === 429) throw new UpdateCheckError("GitHub 请求受限，请稍后再试");
  if (!response.ok) throw new UpdateCheckError(`GitHub 返回 ${response.status}`);
  const releases = await response.json() as { tag_name?: string; html_url?: string; published_at?: string;
    draft?: boolean }[];
  let latest: ReleaseInfo | null = null;
  for (const release of releases) {
    if (release.draft || !release.tag_name || !parseVersion(release.tag_name)) continue;
    const version = release.tag_name.replace(/^v/, "");
    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { version, url: release.html_url ?? `${PROJECT_REPOSITORY_URL}/releases`, publishedAt: release.published_at ?? "" };
    }
  }
  const result = { current, latest, newer: latest !== null && compareVersions(latest.version, current) > 0 };
  cachedCheck = { at: Date.now(), current, result };
  return result;
}

/** A release's publication date as YYYY-MM-DD (local time); empty when unknown. */
export function releaseDate(publishedAt: string): string {
  const date = new Date(publishedAt);
  if (!publishedAt || Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Opens `url` in the system browser (the WebView's own window outside the app). */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
