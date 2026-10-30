/**
 * Application page stack, like the original ScreenManager: PushUIScreen enters a page and
 * BackUIScreen returns to the one below. Home ("entrance") is the root; the editor is one
 * page entered from it, not the fallback when nothing is open.
 */
export type AppPage = "entrance" | "editor" | "search" | "live" | "song";
export type PageStack = readonly AppPage[];

export const HOME_STACK: PageStack = Object.freeze(["entrance"]);
export const EDITOR_STACK: PageStack = Object.freeze(["entrance", "editor"]);

export const topPage = (stack: PageStack): AppPage => stack[stack.length - 1]!;

export function pushPage(stack: PageStack, page: AppPage): PageStack {
  return topPage(stack) === page ? stack : [...stack, page];
}

/** Song information and live preparation are reached from each other and from the menu
 * as siblings: opening one replaces the other instead of stacking on it. */
export function openDetailPage(stack: PageStack, page: "song" | "live"): PageStack {
  const top = topPage(stack);
  if (top === page) return stack;
  return top === "song" || top === "live" ? [...stack.slice(0, -1), page] : [...stack, page];
}

export function popPage(stack: PageStack): PageStack {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

/** Returns to a page still shown (a cancelled or failed preparation keeps the visible one). */
export function returnToPage(stack: PageStack, page: AppPage): PageStack {
  const index = stack.lastIndexOf(page);
  if (index >= 0) return stack.slice(0, index + 1);
  return page === "entrance" ? HOME_STACK : [...HOME_STACK, page];
}
