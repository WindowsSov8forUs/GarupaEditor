/*
 * The editor's undo and redo history kept across a reload of the page (a development server's full reload, or the
 * WebView's): written to the session's storage as the page goes away, and taken back once, when the same project is
 * restored with the very content the history was left at. A new run of the app starts without history.
 */

const STORAGE_KEY = "garupa-editor.undo-history";
/** The most stored, in characters: the oldest undo steps are left out past it (session storage holds about 5 MB). */
const STORAGE_BUDGET = 3_500_000;

type SavedHistory<T> = { projectId: string; present: T; undo: T[]; redo: T[] };

/** Keeps the history of `projectId` (whose content is now `present`) for the next load of the page. */
export function saveUndoHistory<T>(projectId: string, present: T, undo: readonly T[], redo: readonly T[]): void {
  try {
    if (undo.length === 0 && redo.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const presentText = JSON.stringify(present);
    const redoTexts = redo.map(step => JSON.stringify(step));
    let size = presentText.length + redoTexts.reduce((sum, text) => sum + text.length, 0);
    if (size > STORAGE_BUDGET) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    // The newest undo steps that fit.
    const undoTexts: string[] = [];
    for (let index = undo.length - 1; index >= 0; index -= 1) {
      const text = JSON.stringify(undo[index]);
      if (size + text.length > STORAGE_BUDGET) break;
      size += text.length;
      undoTexts.unshift(text);
    }
    sessionStorage.setItem(STORAGE_KEY, `{"projectId":${JSON.stringify(projectId)},"present":${presentText},`
      + `"undo":[${undoTexts.join(",")}],"redo":[${redoTexts.join(",")}]}`);
  } catch {
    // No storage, or full: the history is not kept.
  }
}

/**
 * The history kept for `projectId` by the last page, if its content then is the same as now (`isPresent`); it is
 * taken only once.
 */
export function takeUndoHistory<T>(projectId: string, isPresent: (present: T) => boolean): { undo: T[]; redo: T[] } | null {
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const saved = JSON.parse(text) as SavedHistory<T>;
    if (saved.projectId !== projectId || !Array.isArray(saved.undo) || !Array.isArray(saved.redo)
      || !isPresent(saved.present)) {
      return null;
    }
    return { undo: saved.undo, redo: saved.redo };
  } catch {
    return null;
  }
}
