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

export async function checkForUpdate(current: string, signal?: AbortSignal): Promise<UpdateCheckResult> {
  const response = await fetch(RELEASES_API, { signal, cache: "no-store",
    headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
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
  return { current, latest, newer: latest !== null && compareVersions(latest.version, current) > 0 };
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
