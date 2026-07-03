interface TtfTable {
  offset: number;
  length: number;
}

interface TtfGlyphBounds {
  minY: number;
  maxY: number;
}

export interface NguiFontMetricApproximation {
  resolveBaseline(fontSize: number): number;
  resolveApproximateCenterPivotCanvasBaseline(widgetHeight: number, fontSize: number): number;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readI16(view: DataView, offset: number): number {
  return view.getInt16(offset, false);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function roundToNearestEven(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) {
    return floor;
  }
  if (fraction > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

function readTableDirectory(view: DataView): Map<string, TtfTable> {
  const tableCount = readU16(view, 4);
  const tables = new Map<string, TtfTable>();
  for (let index = 0; index < tableCount; index += 1) {
    const offset = 12 + (index * 16);
    tables.set(readTag(view, offset), {
      offset: readU32(view, offset + 8),
      length: readU32(view, offset + 12),
    });
  }
  return tables;
}

function requireTable(tables: Map<string, TtfTable>, tag: string): TtfTable {
  const table = tables.get(tag);
  if (!table) {
    throw new Error(`TTF table ${tag} missing`);
  }
  return table;
}

function resolveFormat4GlyphId(view: DataView, cmapOffset: number, codePoint: number): number {
  const subtableCount = readU16(view, cmapOffset + 2);
  let format4Offset = -1;
  for (let index = 0; index < subtableCount; index += 1) {
    const recordOffset = cmapOffset + 4 + (index * 8);
    const platformId = readU16(view, recordOffset);
    const encodingId = readU16(view, recordOffset + 2);
    const subtableOffset = cmapOffset + readU32(view, recordOffset + 4);
    if (readU16(view, subtableOffset) === 4 && (platformId === 3 || platformId === 0)) {
      format4Offset = subtableOffset;
      if (platformId === 3 && encodingId === 1) {
        break;
      }
    }
  }
  if (format4Offset < 0) {
    throw new Error("TTF cmap format 4 missing");
  }

  const segCount = readU16(view, format4Offset + 6) / 2;
  const endCodeOffset = format4Offset + 14;
  const startCodeOffset = endCodeOffset + 2 + (segCount * 2);
  const idDeltaOffset = startCodeOffset + (segCount * 2);
  const idRangeOffsetOffset = idDeltaOffset + (segCount * 2);
  for (let index = 0; index < segCount; index += 1) {
    const endCode = readU16(view, endCodeOffset + (index * 2));
    const startCode = readU16(view, startCodeOffset + (index * 2));
    if (codePoint < startCode || codePoint > endCode) {
      continue;
    }
    const idDelta = readI16(view, idDeltaOffset + (index * 2));
    const idRangeOffset = readU16(view, idRangeOffsetOffset + (index * 2));
    if (idRangeOffset === 0) {
      return (codePoint + idDelta) & 0xffff;
    }
    const glyphIndexOffset = idRangeOffsetOffset + (index * 2) + idRangeOffset + ((codePoint - startCode) * 2);
    const glyphId = readU16(view, glyphIndexOffset);
    return glyphId === 0 ? 0 : (glyphId + idDelta) & 0xffff;
  }
  return 0;
}

function resolveGlyphBounds(
  view: DataView,
  glyf: TtfTable,
  loca: TtfTable,
  glyphId: number,
  indexToLocFormat: number,
): TtfGlyphBounds | null {
  const glyphOffset = indexToLocFormat === 0
    ? readU16(view, loca.offset + (glyphId * 2)) * 2
    : readU32(view, loca.offset + (glyphId * 4));
  const nextGlyphOffset = indexToLocFormat === 0
    ? readU16(view, loca.offset + ((glyphId + 1) * 2)) * 2
    : readU32(view, loca.offset + ((glyphId + 1) * 4));
  if (glyphOffset === nextGlyphOffset) {
    return null;
  }
  const offset = glyf.offset + glyphOffset;
  return {
    minY: readI16(view, offset + 4),
    maxY: readI16(view, offset + 8),
  };
}

export function parseNguiFontMetricApproximation(buffer: ArrayBuffer): NguiFontMetricApproximation {
  const view = new DataView(buffer);
  const tables = readTableDirectory(view);
  const head = requireTable(tables, "head");
  const cmap = requireTable(tables, "cmap");
  const glyf = requireTable(tables, "glyf");
  const loca = requireTable(tables, "loca");
  const unitsPerEm = readU16(view, head.offset + 18);
  const indexToLocFormat = readI16(view, head.offset + 50);
  const parenGlyphId = resolveFormat4GlyphId(view, cmap.offset, ")".codePointAt(0) ?? 0);
  const fallbackGlyphId = resolveFormat4GlyphId(view, cmap.offset, "A".codePointAt(0) ?? 0);
  const parenBounds = resolveGlyphBounds(view, glyf, loca, parenGlyphId, indexToLocFormat);
  const fallbackBounds = resolveGlyphBounds(view, glyf, loca, fallbackGlyphId, indexToLocFormat);
  if (!parenBounds && !fallbackBounds) {
    throw new Error("TTF glyph bounds missing");
  }

  const resolveBaseline = (fontSize: number): number => {
    const scale = fontSize / unitsPerEm;
    const sourceBounds = parenBounds && roundToNearestEven(parenBounds.maxY * scale) !== 0
      ? parenBounds
      : fallbackBounds;
    if (!sourceBounds) {
      return 0;
    }
    // Source-backed fragment: NGUIText.Update(bool) requests CharacterInfo
    // for ")" first, falls back to "A" if maxY is 0, then stores:
    // round(((fontSize - maxY) + minY) * 0.5 + maxY).
    // Boundary: these values come from TTF glyph bounds as a documented
    // font-data approximation. The Unity native CharacterInfo values are not
    // recovered from IL2CPP C# decompilation.
    const maxY = roundToNearestEven(sourceBounds.maxY * scale);
    const minY = roundToNearestEven(sourceBounds.minY * scale);
    return roundToNearestEven((((fontSize - maxY) + minY) * 0.5) + maxY);
  };

  return {
    resolveBaseline,
    resolveApproximateCenterPivotCanvasBaseline(widgetHeight: number, fontSize: number): number {
      // Approximation boundary: this applies the recovered NGUI baseline
      // fragment to TTF-derived bounds, then places the font-size box in the
      // Rank UILabel's center-pivot widget. It is not an exact replacement for
      // Unity native TextRenderingPrivate CharacterInfo output.
      return roundToNearestEven(((widgetHeight - fontSize) * 0.5) + resolveBaseline(fontSize));
    },
  };
}

export async function loadNguiFontMetricApproximation(fontUrl: string): Promise<NguiFontMetricApproximation> {
  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`font fetch failed: ${response.status}`);
  }
  return parseNguiFontMetricApproximation(await response.arrayBuffer());
}
