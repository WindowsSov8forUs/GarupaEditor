import {
  GLOBAL_TIMING_GROUP_ID,
  normalizeNoteTimingGroup,
  normalizeTimingGroup,
  type ChartNote,
  type ChartSvEvent,
  type ChartTimingGroupMap,
  type EditorOptionSettings,
} from "../chartCore";
import type { SlideChain } from "./editorHelpers";

export type ChartStateLike = {
  notes: ChartNote[];
  slideChains: SlideChain[];
  svEvents?: ChartSvEvent[];
  timingGroups?: ChartTimingGroupMap;
};

export type SlideNodeRole = "head" | "middle" | "tail";

export type NormalizedSlideBuild = {
  notes: ChartNote[];
  chain: SlideChain | null;
};

function normalizeNoteWidth(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function isDirectionalType(type: ChartNote["type"]): boolean {
  return type === "directional_flick_left" || type === "directional_flick_right";
}

function degradeDirectionalToFlick(note: ChartNote): ChartNote {
  if (!isDirectionalType(note.type)) {
    return {
      ...note,
      width: normalizeNoteWidth(note.width),
    };
  }
  return {
    ...note,
    type: "flick",
    width: 1,
  };
}

type ModeOptionInput = Pick<EditorOptionSettings, "spRhythmNoteEnabled" | "habahiro" | "exGarupaEnabled">;

export function canUseSpRhythm(options: Pick<ModeOptionInput, "spRhythmNoteEnabled">): boolean {
  return options.spRhythmNoteEnabled === true;
}

export function canUseHabahiro(options: Pick<ModeOptionInput, "habahiro">): boolean {
  return options.habahiro === true;
}

export function canUseExGarupa(options: Pick<ModeOptionInput, "exGarupaEnabled">): boolean {
  return options.exGarupaEnabled === true;
}

export function canUseSv(options: Pick<ModeOptionInput, "exGarupaEnabled">): boolean {
  return canUseExGarupa(options);
}

export function canUseTimingGroup(options: Pick<ModeOptionInput, "exGarupaEnabled">): boolean {
  return canUseExGarupa(options);
}

export function normalizeSlideNodeForMode(
  note: ChartNote,
  role: SlideNodeRole,
  exGarupaEnabled: boolean,
): ChartNote {
  if (exGarupaEnabled) {
    return note;
  }

  if (role === "head" && (note.type === "flick" || isDirectionalType(note.type))) {
    return {
      ...note,
      type: "single",
      width: normalizeNoteWidth(note.width),
      timingGroup: undefined,
    };
  }

  if (role === "middle" && note.type !== "single" && note.type !== "hidden") {
    return {
      ...note,
      type: "single",
      width: normalizeNoteWidth(note.width),
      timingGroup: undefined,
    };
  }

  return {
    ...note,
    timingGroup: undefined,
  };
}

export function normalizeSlideBuildForMode(
  notes: ChartNote[],
  chain: SlideChain,
  exGarupaEnabled: boolean,
): NormalizedSlideBuild {
  if (exGarupaEnabled) {
    return {
      notes,
      chain,
    };
  }

  const noteById = new Map(notes.map((note) => [note.id, note] as const));
  const existingIds = chain.noteIds.filter((id) => noteById.has(id));
  const firstVisible = existingIds.findIndex((id) => noteById.get(id)?.type !== "hidden");
  if (firstVisible < 0) {
    return {
      notes,
      chain: null,
    };
  }

  let lastVisible = -1;
  for (let index = existingIds.length - 1; index >= 0; index -= 1) {
    if (noteById.get(existingIds[index])?.type !== "hidden") {
      lastVisible = index;
      break;
    }
  }
  if (lastVisible < firstVisible) {
    return {
      notes,
      chain: null,
    };
  }

  const keptIds = existingIds.slice(firstVisible, lastVisible + 1);
  if (keptIds.filter((id) => noteById.get(id)?.type !== "hidden").length < 2) {
    return {
      notes,
      chain: null,
    };
  }

  const keptIdSet = new Set(keptIds);
  const roleById = new Map<string, SlideNodeRole>();
  keptIds.forEach((id, index) => {
    roleById.set(id, index === 0 ? "head" : index === keptIds.length - 1 ? "tail" : "middle");
  });

  return {
    notes: notes.map((note) => {
      if (!keptIdSet.has(note.id)) {
        return note;
      }
      return normalizeSlideNodeForMode(note, roleById.get(note.id) ?? "middle", false);
    }),
    chain: {
      ...chain,
      noteIds: keptIds,
      timingGroup: normalizeNoteTimingGroup(GLOBAL_TIMING_GROUP_ID),
    },
  };
}

export function isChartUsingSpRhythm(input: ChartStateLike): boolean {
  return input.notes.some(
    (note) => isDirectionalType(note.type),
  );
}

function noteUsesNonGlobalTimingGroup(note: ChartNote): boolean {
  return normalizeTimingGroup(note.timingGroup, GLOBAL_TIMING_GROUP_ID) !== GLOBAL_TIMING_GROUP_ID;
}

function chainUsesNonGlobalTimingGroup(chain: SlideChain): boolean {
  return normalizeTimingGroup(chain.timingGroup, GLOBAL_TIMING_GROUP_ID) !== GLOBAL_TIMING_GROUP_ID;
}

function eventUsesNonGlobalTimingGroup(event: ChartSvEvent): boolean {
  return normalizeTimingGroup(event.timingGroup, GLOBAL_TIMING_GROUP_ID) !== GLOBAL_TIMING_GROUP_ID;
}

function slideChainUsesExGarupa(chain: SlideChain, noteById: Map<string, ChartNote>): boolean {
  const notes = chain.noteIds
    .map((id) => noteById.get(id))
    .filter((note): note is ChartNote => note !== undefined);
  if (notes.length === 0) {
    return false;
  }
  const firstVisibleIndex = notes.findIndex((note) => note.type !== "hidden");
  if (firstVisibleIndex < 0) {
    return true;
  }
  const lastVisibleIndex = notes.map((note) => note.type !== "hidden").lastIndexOf(true);
  if (firstVisibleIndex > 0 || lastVisibleIndex < notes.length - 1) {
    return true;
  }
  const head = notes[firstVisibleIndex];
  if (head && (head.type === "flick" || isDirectionalType(head.type))) {
    return true;
  }
  const middleNotes = notes.slice(firstVisibleIndex + 1, lastVisibleIndex);
  return middleNotes.some((note) => note.type !== "single" && note.type !== "hidden");
}

export function isChartUsingExGarupa(input: ChartStateLike): boolean {
  const noteById = new Map(input.notes.map((note) => [note.id, note] as const));
  return (
    (input.svEvents?.length ?? 0) > 0 ||
    input.notes.some(noteUsesNonGlobalTimingGroup) ||
    input.slideChains.some(chainUsesNonGlobalTimingGroup) ||
    (input.svEvents ?? []).some(eventUsesNonGlobalTimingGroup) ||
    input.slideChains.some((chain) => slideChainUsesExGarupa(chain, noteById))
  );
}

export function isChartUsingHabahiro(input: ChartStateLike): boolean {
  return input.notes.some(
    (note) => !isDirectionalType(note.type) && normalizeNoteWidth(note.width) > 1,
  );
}

/**
 * Regress SP-only chart features back to a standard chart:
 * 1) Directional flick -> flick
 */
export function regressChartWithoutSpRhythm(input: ChartStateLike): ChartStateLike {
  const nextNotes = input.notes.map(degradeDirectionalToFlick);

  return {
    ...input,
    notes: nextNotes,
    slideChains: input.slideChains,
  };
}

function regressExGarupaHead(note: ChartNote): ChartNote {
  if (note.type === "flick" || isDirectionalType(note.type)) {
    return { ...note, type: "single", width: normalizeNoteWidth(note.width), timingGroup: undefined };
  }
  return { ...note, timingGroup: undefined };
}

function regressExGarupaMiddle(note: ChartNote): ChartNote {
  if (note.type === "single" || note.type === "hidden") {
    return { ...note, timingGroup: undefined };
  }
  return { ...note, type: "single", width: normalizeNoteWidth(note.width), timingGroup: undefined };
}

function regressExGarupaTail(note: ChartNote): ChartNote {
  return { ...note, timingGroup: undefined };
}

export function regressChartWithoutExGarupa(input: ChartStateLike): ChartStateLike {
  const originalById = new Map(input.notes.map((note) => [note.id, note] as const));
  const nextNoteById = new Map<string, ChartNote>();
  const keptSlideChains: SlideChain[] = [];

  for (const chain of input.slideChains) {
    const existingIds = chain.noteIds.filter((id) => originalById.has(id));
    let firstVisible = existingIds.findIndex((id) => originalById.get(id)?.type !== "hidden");
    if (firstVisible < 0) {
      continue;
    }
    let lastVisible = -1;
    for (let index = existingIds.length - 1; index >= 0; index -= 1) {
      if (originalById.get(existingIds[index])?.type !== "hidden") {
        lastVisible = index;
        break;
      }
    }
    if (lastVisible < firstVisible) {
      continue;
    }

    const keptIds = existingIds.slice(firstVisible, lastVisible + 1);
    if (keptIds.length < 2) {
      continue;
    }
    keptSlideChains.push({
      ...chain,
      noteIds: keptIds,
      timingGroup: normalizeNoteTimingGroup(GLOBAL_TIMING_GROUP_ID),
    });

    for (let index = 0; index < keptIds.length; index += 1) {
      const id = keptIds[index];
      const note = originalById.get(id);
      if (!note) {
        continue;
      }
      if (index === 0) {
        nextNoteById.set(id, regressExGarupaHead(note));
      } else if (index === keptIds.length - 1) {
        nextNoteById.set(id, regressExGarupaTail(note));
      } else {
        nextNoteById.set(id, regressExGarupaMiddle(note));
      }
    }
  }

  const slideNoteIds = new Set(keptSlideChains.flatMap((chain) => chain.noteIds));
  for (const note of input.notes) {
    if (slideNoteIds.has(note.id)) {
      continue;
    }
    if (note.type === "hidden") {
      continue;
    }
    nextNoteById.set(note.id, { ...note, timingGroup: undefined });
  }

  return {
    ...input,
    notes: input.notes
      .map((note) => nextNoteById.get(note.id))
      .filter((note): note is ChartNote => note !== undefined),
    slideChains: keptSlideChains,
    svEvents: [],
    timingGroups: {
      [GLOBAL_TIMING_GROUP_ID]: { sv: [] },
    },
  };
}

/**
 * Regress habahiro chart style by forcing non-directional note width to 1.
 */
export function regressChartWithoutHabahiro(input: ChartStateLike): ChartStateLike {
  const nextNotes = input.notes.map((note) => {
    if (isDirectionalType(note.type)) {
      return {
        ...note,
        width: normalizeNoteWidth(note.width),
      };
    }
    return {
      ...note,
      width: 1,
    };
  });

  return {
    notes: nextNotes,
    slideChains: input.slideChains,
  };
}
