"""Compose experimental skin thumbnails from exported skin sprites (requires Pillow).

Usage: python scripts/generate-skin-thumbnails.py manifest.json output-directory
Manifest: a JSON array of {key, fieldDirectory, noteDirectory,
representativeSprite?, thumbnail?}. Paths are relative to the manifest.
The default representative is note_normal_3 (zero-based center lane);
note_flick_3 can be selected for a skin represented by its Flick artwork.

This is an editor composition rule inferred from shared thumbnail structure,
not a recovered original asset-authoring algorithm. Original thumbnails are
used only in the comparison sheet, never as input to the generated artwork.
"""

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance


SIZE = 128
SUPERSAMPLE = 4
RESAMPLE = Image.Resampling.LANCZOS
FIELD_TOP = 23
FIELD_BOTTOM = 92
FIELD_WIDTH = 112
OUTLINE_RADIUS = 3


def resize(image, size):
    # Premultiplied interpolation prevents transparent RGB from bleeding.
    return image.convert("RGBa").resize(size, RESAMPLE).convert("RGBA")


def sprite(directory, name):
    entries = json.loads((directory / ".sprites").read_text(encoding="utf-8-sig"))
    row = next(row["Base"] for row in entries if row["Base"]["m_Name"] == name)
    rect = row["m_Rect"]
    atlas = Image.open(directory / "RhythmGameSprites.png").convert("RGBA")
    x, y, w, h = (round(rect[k]) for k in ("x", "y", "width", "height"))
    result = atlas.crop((x, atlas.height - y - h, x + w, atlas.height - y))
    bounds = result.getchannel("A").point(lambda a: 255 if a >= 8 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"Empty representative sprite: {name}")
    return result.crop(bounds)


def round_dilate(mask, radius):
    """Disk dilation, so thick outlines do not acquire square corners."""
    padded = Image.new("L", (mask.width + 2 * radius, mask.height + 2 * radius))
    padded.paste(mask, (radius, radius))
    horizontal = [padded]
    for dx in range(1, radius + 1):
        row = ImageChops.lighter(horizontal[-1], ImageChops.offset(padded, dx, 0))
        horizontal.append(ImageChops.lighter(row, ImageChops.offset(padded, -dx, 0)))
    result = padded.copy()
    for dy in range(-radius, radius + 1):
        dx = int((radius * radius - dy * dy) ** .5)
        result = ImageChops.lighter(result, ImageChops.offset(horizontal[dx], 0, dy))
    return result.crop((radius, radius, radius + mask.width, radius + mask.height))


def judge_axis(judge):
    """Locate the cross-field stroke, not the top of its protruding markers."""
    alpha = judge.getchannel("A")
    coverage = [sum(a >= 128 for a in alpha.crop((0, y, judge.width, y + 1)).tobytes())
                for y in range(judge.height)]
    peak = max(coverage)
    if peak == 0:
        raise ValueError("Empty judge-line artwork")
    rows = [y + .5 for y, count in enumerate(coverage) if count >= peak * .95]
    return sum(rows) / len(rows)


def thicken_artwork(image, radius):
    """Enlarge existing colored details, without substituting marker shapes."""
    padded = Image.new("RGBA", (image.width + 2 * radius, image.height + 2 * radius))
    padded.alpha_composite(image, (radius, radius))
    result = padded.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            candidate = ImageChops.offset(padded, dx, dy)
            stronger = ImageChops.subtract(candidate.getchannel("A"), result.getchannel("A"))
            stronger = stronger.point(lambda a: 255 if a else 0)
            result = Image.composite(candidate, result, stronger)
    # Preserve original colors/detail at their original location.
    result.alpha_composite(padded)
    return result


def compose(field_directory, note_directory, representative):
    """Preserve source field/judge shapes and place a centered representative."""
    scale = SUPERSAMPLE
    canvas_size = SIZE * scale
    layer = Image.new("RGBA", (canvas_size, canvas_size))
    field = Image.open(field_directory / "bg_line_rhythm.png").convert("RGBA")

    # Retain skin colors/patterns, but strengthen translucent game textures for
    # icon use. This is an illustration treatment, not the live shader equation.
    # The reference's outer bounds INCLUDE its 2-3px outline. Allocate the
    # smaller inner field first; also remove transparent source side margins.
    bottom_band = field.getchannel("A").crop((0, field.height - 8, field.width, field.height))
    bounds = bottom_band.point(lambda a: 255 if a >= 16 else 0).getbbox()
    if bounds is None:
        raise ValueError("Empty lower field artwork")
    field = field.crop((bounds[0], round(field.height * .24), bounds[2], field.height))
    field = resize(field, (FIELD_WIDTH * scale, (FIELD_BOTTOM - FIELD_TOP) * scale))
    alpha = field.getchannel("A").point(lambda a: round(255 * (1 - (1 - a / 255) ** 3)))
    field = ImageEnhance.Brightness(field).enhance(1.65)
    field = ImageEnhance.Color(field).enhance(1.15)
    field.putalpha(alpha)
    floor = Image.new("RGBA", field.size, (30, 33, 42, 255))
    floor.putalpha(alpha.point(lambda a: 255 if a else 0))
    floor.alpha_composite(field)
    field_position = ((SIZE - FIELD_WIDTH) * scale // 2, FIELD_TOP * scale)
    layer.alpha_composite(floor, field_position)

    # Keep each skin's actual marker shapes, spacing and decoration. Crop the
    # central playing-field span, then scale uniformly; do not replace its
    # artwork with rays, circles or a palette-derived generic judge line.
    judge = Image.open(field_directory / "game_play_line.png").convert("RGBA")
    left = round((judge.width - 1160) / 2)
    judge = judge.crop((left, 0, left + 1160, judge.height))
    axis = judge_axis(judge)
    source_height = judge.height
    # Include the later 1px expansion in the shared field-base width. Giving
    # the source line its own wider span creates ledges at both lower corners.
    judge = resize(judge, (floor.width - 2 * scale, round(judge.height * .1 * scale)))
    # The track terminates at the continuous cross-field stroke. Markers may
    # protrude above/below this join; their alpha bounding box is NOT the join.
    judge_y = round(FIELD_BOTTOM * scale - axis * judge.height / source_height)
    # Reference marker bodies are wider than a direct 0.1x texture reduction.
    # A 1px expansion preserves each source motif and its spacing, unlike
    # replacing all skins with hand-drawn seven-dot geometry.
    judge = thicken_artwork(judge, scale)
    layer.alpha_composite(judge, (field_position[0], judge_y - scale))

    note = sprite(note_directory, representative)
    # Common visible-ink box, not atlas dimensions (which contain padding).
    factor = min(84 * scale / note.width, 35 * scale / note.height)
    note = resize(note, (round(note.width * factor), round(note.height * factor)))
    layer.alpha_composite(note, (round((canvas_size - note.width) / 2),
                                round(56 * scale - note.height / 2)))

    # Outline the complete field + judge + representative silhouette once.
    # Keep any white rim present in the source note itself; do not add another
    # rim/shadow over the field where the note overlaps it.
    alpha = layer.getchannel("A")
    outline = Image.new("RGBA", layer.size, (52, 52, 52, 255))
    outline.putalpha(round_dilate(alpha, OUTLINE_RADIUS * scale))
    outline.alpha_composite(layer)
    return resize(outline, (SIZE, SIZE))


def comparison(rows, output):
    cell_width, row_height = 400, 198
    sheet = Image.new("RGB", (3 * cell_width, 38 + row_height * ((len(rows) + 2) // 3)), "#f2f3f5")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), "REFERENCE (left) / GENERATED (right) - same layout for every skin", fill="#343434")
    for index, (key, generated, reference) in enumerate(rows):
        x, y = index % 3 * cell_width, 38 + index // 3 * row_height
        draw.text((x + 16, y + 6), key, fill="#333333")
        for slot, artwork in enumerate((reference, generated)):
            dx, dy = x + 20 + slot * 190, y + 30
            draw.rectangle((dx, dy, dx + 159, dy + 159), fill="white")
            if artwork is None:
                draw.text((dx + 30, dy + 70), "No original icon", fill="#888888")
            else:
                enlarged = resize(artwork.convert("RGBA"), (160, 160))
                sheet.paste(enlarged, (dx, dy), enlarged)
    sheet.save(output / "comparison.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    entries = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    args.output.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in entries:
        key = entry["key"]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", key):
            raise ValueError(f"Invalid output key: {key}")
        resolve = lambda name: args.manifest.parent / entry[name]
        result = compose(resolve("fieldDirectory"), resolve("noteDirectory"),
                         entry.get("representativeSprite", "note_normal_3"))
        result.save(args.output / f"{key}.png")
        reference = Image.open(resolve("thumbnail")) if entry.get("thumbnail") else None
        rows.append((key, result, reference))
    comparison(rows, args.output)
    print(f"Generated {len(rows)} transparent {SIZE}x{SIZE} thumbnails and comparison.png")


if __name__ == "__main__":
    main()
