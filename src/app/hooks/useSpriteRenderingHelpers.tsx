import { useCallback, useMemo, type CSSProperties, type SyntheticEvent } from "react";
import {
  normalizeRhythmWidth,
  type ChartNote,
  type NoteType,
} from "../../chartCore";
import {
  projectNotePaletteRuntimeAssets,
  projectPlayfieldSpriteRuntimeAssets,
  type SkinNoteType,
} from "../../skinLoader";

type SpriteLayers = {
  base?: string;
  overlay?: string;
  overlayMode: "none" | "flick" | "directional";
};

type SpriteLayerOptions = {
  includeDirectionalOverlay?: boolean;
  includeFlickOverlay?: boolean;
  baseImageType?: SkinNoteType;
  width?: number;
};

type SpriteRuntimeAssets = {
  single?: string;
  single16?: string;
  flick?: string;
  skill?: string;
  slide?: string;
  slideAmong?: string;
  directionalFlickLeft?: string;
  directionalFlickRight?: string;
  flickTop?: string;
  directionalFlickLeftTop?: string;
  directionalFlickRightTop?: string;
  habahiro?: boolean;
  singleByWidth?: Record<number, string>;
  single16ByWidth?: Record<number, string>;
  flickByWidth?: Record<number, string>;
  skillByWidth?: Record<number, string>;
  slideByWidth?: Record<number, string>;
  slideAmongByWidth?: Record<number, string>;
  flickTopByWidth?: Record<number, string>;
};

function resolveBaseSprite(
  runtimeAssets: SpriteRuntimeAssets | null,
  baseKey: SkinNoteType,
  width = 1,
): string | undefined {
  if (!runtimeAssets) {
    return undefined;
  }
  const normalizedWidth = normalizeRhythmWidth(width);
  if (runtimeAssets.habahiro) {
    switch (baseKey) {
      case "single":
        return runtimeAssets.singleByWidth?.[normalizedWidth] ?? runtimeAssets.single;
      case "single16":
        return runtimeAssets.single16ByWidth?.[normalizedWidth] ?? runtimeAssets.single16;
      case "flick":
        return runtimeAssets.flickByWidth?.[normalizedWidth] ?? runtimeAssets.flick;
      case "skill":
        return runtimeAssets.skillByWidth?.[normalizedWidth] ?? runtimeAssets.skill;
      case "slide":
        return runtimeAssets.slideByWidth?.[normalizedWidth] ?? runtimeAssets.slide;
      case "slide_among":
        return runtimeAssets.slideAmongByWidth?.[normalizedWidth] ?? runtimeAssets.slideAmong;
      default:
        break;
    }
  }
  switch (baseKey) {
    case "single":
      return runtimeAssets.single;
    case "single16":
      return runtimeAssets.single16;
    case "flick":
      return runtimeAssets.flick;
    case "skill":
      return runtimeAssets.skill;
    case "slide":
      return runtimeAssets.slide;
    case "slide_among":
      return runtimeAssets.slideAmong;
    case "directional_flick_left":
      return runtimeAssets.directionalFlickLeft;
    case "directional_flick_right":
      return runtimeAssets.directionalFlickRight;
    default:
      return undefined;
  }
}

function isHalfBeatAligned(value: number): boolean {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return true;
  }
  const snapped = Math.round(normalized * 2) / 2;
  return Math.abs(snapped - normalized) <= 1e-6;
}

function createSpriteLayerResolver(runtimeAssets: SpriteRuntimeAssets | null) {
  const getSpriteLayers = (
    type: NoteType,
    options?: SpriteLayerOptions,
  ): SpriteLayers => {
    const includeDirectionalOverlay = options?.includeDirectionalOverlay ?? true;
    const includeFlickOverlay = options?.includeFlickOverlay ?? true;
    const width = options?.width ?? 1;
    const baseKey: SkinNoteType = options?.baseImageType ?? (type === "hidden" ? "single" : type);
    const base = resolveBaseSprite(runtimeAssets, baseKey, width);
    if (!runtimeAssets) {
      return { base: undefined, overlay: undefined, overlayMode: "none" };
    }

    if (type === "flick") {
      const flickTopWidth = (() => {
        const normalizedWidth = normalizeRhythmWidth(width);
        if (normalizedWidth <= 1) {
          return 1;
        }
        if (normalizedWidth === 2) {
          return 2;
        }
        return 3;
      })();
      return {
        base,
        overlay: includeFlickOverlay
          ? (
            runtimeAssets.habahiro
              ? (runtimeAssets.flickTopByWidth?.[flickTopWidth] ?? runtimeAssets.flickTop)
              : runtimeAssets.flickTop
          )
          : undefined,
        overlayMode: includeFlickOverlay ? "flick" : "none",
      };
    }
    if (type === "directional_flick_left") {
      return {
        base,
        overlay: includeDirectionalOverlay
          ? runtimeAssets.directionalFlickLeftTop
          : undefined,
        overlayMode: includeDirectionalOverlay ? "directional" : "none",
      };
    }
    if (type === "directional_flick_right") {
      return {
        base,
        overlay: includeDirectionalOverlay
          ? runtimeAssets.directionalFlickRightTop
          : undefined,
        overlayMode: includeDirectionalOverlay ? "directional" : "none",
      };
    }

    return { base, overlay: undefined, overlayMode: "none" };
  };

  return { getSpriteLayers };
}

function createSpriteRenderers(params: any) {
  const {
    spriteAspectRatios,
    setSpriteAspectRatios,
    DEFAULT_SPRITE_ASPECT_RATIO,
  } = params;

  const rememberSpriteAspectRatio = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const src = image.currentSrc || image.src;
    if (!src) {
      return;
    }

    const ratio = image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 0;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }

    setSpriteAspectRatios((previous: Record<string, number>) => {
      const current = previous[src];
      if (typeof current === "number" && Math.abs(current - ratio) < 1e-6) {
        return previous;
      }
      return { ...previous, [src]: ratio };
    });
  };

  const getSpriteAspectRatio = (
    layers: SpriteLayers,
    fallback = DEFAULT_SPRITE_ASPECT_RATIO,
  ): number => {
    const baseRatio = layers.base ? spriteAspectRatios[layers.base] : undefined;
    if (typeof baseRatio === "number" && baseRatio > 0) {
      return baseRatio;
    }

    const overlayRatio = layers.overlay ? spriteAspectRatios[layers.overlay] : undefined;
    if (typeof overlayRatio === "number" && overlayRatio > 0) {
      return overlayRatio;
    }

    return fallback;
  };

  const renderSpriteStackBase = (
    layers: SpriteLayers,
    label: string,
    className = "note-sprite-stack",
    aspectRatio = DEFAULT_SPRITE_ASPECT_RATIO,
  ) => {
    if (!layers.base && !layers.overlay) {
      return null;
    }

    return (
      <span
        className={`${className}${layers.overlay ? " composite" : ""}`}
        style={{ "--sprite-aspect-ratio": `${aspectRatio}` } as CSSProperties}
      >
        {layers.base && (
          <img
            src={layers.base}
            alt={`${label} base`}
            className="note-sprite-layer layer-base"
            onLoad={rememberSpriteAspectRatio}
          />
        )}
        {layers.overlay && (
          <img
            src={layers.overlay}
            alt={`${label} overlay`}
            className={`note-sprite-layer layer-overlay ${
              layers.overlayMode === "flick" ? "overlay-flick" : ""
            }`}
            onLoad={rememberSpriteAspectRatio}
          />
        )}
      </span>
    );
  };

  const renderDirectionalSpriteBase = (
    type: "directional_flick_left" | "directional_flick_right",
    layers: SpriteLayers,
    spanLanes: number,
    label: string,
    className = "note-directional-stack",
  ) => {
    if (!layers.base && !layers.overlay) {
      return null;
    }

    const laneCount = Math.max(1, Math.round(spanLanes));

    return (
      <span
        className={className}
        style={{ "--directional-span-lanes": `${laneCount}` } as CSSProperties}
      >
        {Array.from({ length: laneCount }, (_, index) => {
          const isHeadSegment = type === "directional_flick_right"
            ? index === laneCount - 1
            : index === 0;

          return (
            <span
              key={`${label}-segment-${index}`}
              className="note-directional-segment"
              style={{ left: `${((index + 0.5) / laneCount) * 100}%` }}
            >
              <span className="note-directional-segment-core">
                {layers.base && (
                  <img
                    src={layers.base}
                    alt={`${label} segment ${index + 1}`}
                    className="note-sprite-layer note-directional-base"
                  />
                )}
                {isHeadSegment && layers.overlay && (
                  <img
                    src={layers.overlay}
                    alt={`${label} head`}
                    className={`note-sprite-layer note-directional-head ${
                      type === "directional_flick_right" ? "head-right" : "head-left"
                    }`}
                  />
                )}
              </span>
            </span>
          );
        })}
      </span>
    );
  };

  return {
    getSpriteAspectRatio,
    renderSpriteStackBase,
    renderDirectionalSpriteBase,
  };
}

export function useNotePaletteSpriteRendering(params: any) {
  const {
    skinAssets,
    spriteAspectRatios,
    setSpriteAspectRatios,
    DEFAULT_SPRITE_ASPECT_RATIO,
  } = params;
  const paletteRuntimeAssets = useMemo(
    () => (skinAssets ? projectNotePaletteRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );
  const { getSpriteLayers } = useMemo(
    () => createSpriteLayerResolver(paletteRuntimeAssets),
    [paletteRuntimeAssets],
  );
  const { getSpriteAspectRatio, renderSpriteStackBase } = useMemo(
    () =>
      createSpriteRenderers({
        spriteAspectRatios,
        setSpriteAspectRatios,
        DEFAULT_SPRITE_ASPECT_RATIO,
      }),
    [DEFAULT_SPRITE_ASPECT_RATIO, setSpriteAspectRatios, spriteAspectRatios],
  );

  const getPaletteSpriteLayers = useCallback(
    (type: NoteType): SpriteLayers =>
      getSpriteLayers(type, {
        includeDirectionalOverlay: false,
        includeFlickOverlay: false,
        width: 1,
      }),
    [getSpriteLayers],
  );

  return useMemo(
    () => ({
      getPaletteSpriteLayers,
      getPaletteSpriteAspectRatio: getSpriteAspectRatio,
      renderPaletteSpriteStack: renderSpriteStackBase,
    }),
    [getPaletteSpriteLayers, getSpriteAspectRatio, renderSpriteStackBase],
  );
}

export function usePlayfieldSpriteRendering(params: any) {
  const {
    skinAssets,
    slideRoleByNoteId,
    isColorAssistEnabled,
    spriteAspectRatios,
    setSpriteAspectRatios,
    DEFAULT_SPRITE_ASPECT_RATIO,
  } = params;
  const playfieldRuntimeAssets = useMemo(
    () => (skinAssets ? projectPlayfieldSpriteRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );
  const { getSpriteLayers } = useMemo(
    () => createSpriteLayerResolver(playfieldRuntimeAssets),
    [playfieldRuntimeAssets],
  );
  const { getSpriteAspectRatio, renderSpriteStackBase, renderDirectionalSpriteBase } =
    useMemo(
      () =>
        createSpriteRenderers({
          spriteAspectRatios,
          setSpriteAspectRatios,
          DEFAULT_SPRITE_ASPECT_RATIO,
        }),
      [DEFAULT_SPRITE_ASPECT_RATIO, setSpriteAspectRatios, spriteAspectRatios],
    );

  const resolvePlacedNoteLayers = useCallback((
    note: ChartNote,
    options?: { beat?: number },
  ): { layers: SpriteLayers } => {
    const role = slideRoleByNoteId.get(note.id);
    const isMiddle = role ? role.length > 2 && role.index > 0 && role.index < role.length - 1 : false;
    const isHeadOrTail = role
      ? role.length === 1 || role.index === 0 || role.index === role.length - 1
      : false;
    const renderBeat = Number.isFinite(options?.beat) ? Number(options?.beat) : note.beat;

    if (note.type === "single" && role) {
      return {
        layers: getSpriteLayers("single", {
          baseImageType: isHeadOrTail ? "slide" : "slide_among",
          width: note.width ?? 1,
        }),
      };
    }

    if (note.type === "flick" && isMiddle) {
      return {
        layers: getSpriteLayers("flick", {
          baseImageType: "slide_among",
          includeFlickOverlay: true,
          width: note.width ?? 1,
        }),
      };
    }

    if (note.type === "skill" && isMiddle) {
      return {
        layers: getSpriteLayers("single", {
          baseImageType: "slide_among",
          includeFlickOverlay: false,
          includeDirectionalOverlay: false,
          width: note.width ?? 1,
        }),
      };
    }

    if (note.type === "single" && isColorAssistEnabled && !isHalfBeatAligned(renderBeat)) {
      return {
        layers: getSpriteLayers("single", {
          baseImageType: "single16",
          includeDirectionalOverlay: false,
          includeFlickOverlay: false,
          width: note.width ?? 1,
        }),
      };
    }

    return { layers: getSpriteLayers(note.type, { width: note.width ?? 1 }) };
  }, [getSpriteLayers, isColorAssistEnabled, slideRoleByNoteId]);

  return useMemo(
    () => ({
      getSpriteLayers,
      getSpriteAspectRatio,
      renderSpriteStack: renderSpriteStackBase,
      renderDirectionalSprite: renderDirectionalSpriteBase,
      resolvePlacedNoteLayers,
    }),
    [
      getSpriteLayers,
      getSpriteAspectRatio,
      renderDirectionalSpriteBase,
      renderSpriteStackBase,
      resolvePlacedNoteLayers,
    ],
  );
}
