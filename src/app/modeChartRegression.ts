import type { ChartNote } from "../chartCore";
import type { SlideChain } from "./editorHelpers";

type ChartStateLike = {
  notes: ChartNote[];
  slideChains: SlideChain[];
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
  const { width: _unusedWidth, ...rest } = note;
  return {
    ...rest,
    type: "flick",
    width: 1,
  };
}

export function isChartUsingSpRhythm(input: ChartStateLike): boolean {
  return input.notes.some(
    (note) => note.type === "hidden" || isDirectionalType(note.type),
  );
}

export function isChartUsingHabahiro(input: ChartStateLike): boolean {
  return input.notes.some(
    (note) => !isDirectionalType(note.type) && normalizeNoteWidth(note.width) > 1,
  );
}

/**
 * 去 SP 节奏图示（回退为非 SP 可兼容谱面）
 * 1) DirectionalFlick -> Flick
 * 2) 清除所有 Slide 序列中的 Hidden 节点
 * 3) 若某 Slide 清除后为空（原本全 Hidden），直接删除该 Slide
 */
export function regressChartWithoutSpRhythm(input: ChartStateLike): ChartStateLike {
  const nextNotes = input.notes.map(degradeDirectionalToFlick);
  const noteById = new Map(nextNotes.map((note) => [note.id, note] as const));
  const removedHiddenIdSet = new Set<string>();

  const nextSlideChains: SlideChain[] = [];
  for (const chain of input.slideChains) {
    const keptIds: string[] = [];
    for (const noteId of chain.noteIds) {
      const note = noteById.get(noteId);
      if (!note) {
        continue;
      }
      if (note.type === "hidden") {
        removedHiddenIdSet.add(note.id);
        continue;
      }
      keptIds.push(noteId);
    }

    if (keptIds.length === 0) {
      continue;
    }

    nextSlideChains.push(
      keptIds.length === chain.noteIds.length
        ? chain
        : {
          ...chain,
          noteIds: keptIds,
        },
    );
  }

  return {
    notes: nextNotes.filter((note) => !removedHiddenIdSet.has(note.id)),
    slideChains: nextSlideChains,
  };
}

/**
 * 去 2026 愚人节（habahiro）：将所有非 Directional 音符宽度强制回退为 1。
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
