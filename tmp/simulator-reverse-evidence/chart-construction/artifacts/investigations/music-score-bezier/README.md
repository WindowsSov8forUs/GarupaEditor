# Music Score Bezier Conversion

## Question

How does `MusicScoreBezierConverter.Convert` expand control-note BMS input
before `NoteDataBMSBuilder` parses ordinary score lines?

## Result

The version-matched IL2CPP metadata identifies twenty converter methods from
`Convert` at `0x367E500` through the constructor at `0x36838EC`. The corrected
exports in `decompiled/` use adjacent metadata RVAs rather than the polluted
global bundle slices.

The primary batch currently has nineteen independent C functions plus an exact
ARM64 fallback for `Convert`, all with matching requested/actual boundaries.
Thirty compiler-generated predicates, selectors, comparisons, and
display-class constructors are independently exported under
`decompiled_helpers/`. Ten `MusicScoreHeaderParser` methods and fifteen
`MusicScoreParseUtility` / `NoteData` methods are separately exported under
`decompiled_header/` and `decompiled_text/`; all 55 auxiliary boundaries are
Hex-Rays C with no fallback or boundary mismatch.

`NoteManager..cctor` fixes `MUSIC_BAR_DIVISION_COUNT` at `192`. The converter
samples each quadratic segment at `i / 200` for `i = 1..199`, quantizes absolute
positions to `192 >> 6 == 3`, and excludes only samples quantized to the source
start or end. Repeated internal quantized positions are retained at this stage.

Lane positions use the same quadratic Bezier. `BezierNoteTempData` rounds the
lane midpoint-to-even, stores the truncated fractional difference times `100`,
and maps lanes `0..6` to keys `36, 31, 32, 33, 34, 35, 38`. The generated WAV
name is `slide_a` or `slide_b`, optionally followed by `_LSxx` or `_RSxx`.

## Sequence and Output Rules

`createBezierNotes(List)` scans adjacent three-note windows. A window expands
only when the first and third WAVs normalize to the same Slide A/B family and
the middle WAV is one of the eight `cont_bezier_*` / `cont_force_*` controls.
The exact fever, skill, lane-change, and `.wav` decoration removal chain is now
implemented by the backend-neutral prototype.

Before window expansion, force-front controls move before the first earlier
Slide note, while force-back controls move after the last later Slide note.
`convertToMusicScoreLines` groups notes by `#bar lane:` prefix, expands each
group to its maximum reduced denominator, and emits `00` for empty slots.

Raw segment samples are grouped by `(AbsolutePos, IsSlideGroupA)`. Each group
is replaced by one reconstructed temporary note at the average
`LaneAbsolutePos`. The converter then removes a middle point when three
consecutive `DiffVolume` values match or when adjacent `atan2` directions in
the `DiffVolume`/absolute-position plane differ by less than `2°`. Consecutive
removals keep the last retained point as their anchor; surviving points sort by
`DiffVolume` before conversion to `NoteData`.

Multi-range conversion materializes width `2..N` support lanes from the
retained edge. Right-control curves subtract lane offsets and left-control
curves add them. Existing notes at the same line prefix, absolute position, and
bar are not duplicated.

The executable implementation and confirmed constants are recorded in
`../runtime-integration-prototype/music_score_bezier_conversion.json`.

## Header and Text Pipeline

`MusicScoreHeaderParser.Parse` reads primary `#WAVxx` entries, detects
`#HABAHIRO`, and preserves nonnumeric source lines. `ReParse` rebuilds the
primary dictionary, inserts 200 additive WAV entries after the original WAV
block, removes all eight control-WAV declarations, and preserves the remaining
source chart. Primary WAVs take precedence over additive WAVs during lookup.

The generated keys cover `0S..25`, `27..3K`, `3M..4Z`, and `51..6E` for
`slide_a_LS`, `slide_a_RS`, `slide_b_LS`, and `slide_b_RS` respectively. Each
range contains suffixes `01..50`, allocated in per-suffix A-left, A-right,
B-left, B-right order.

`MusicScoreParseUtility.GetAllNoteData` parses two-character cells, skips
`00`, calculates `192 * numerator / denominator + 192 * bar`, and maps the
three lane-key families `11..18`, `31..38`, and `51..58` to the seven gameplay
lanes plus the `-1` control lane. Normal charts split Slide A, Slide B, and
default notes. Multi-range charts additionally merge consecutive same-position
Slide lanes into the left note's width before Bezier expansion.

The backend-neutral `convert_bezier_music_score_text` entry now executes this
whole header-to-expanded-BMS path. Seven text-level tests cover header parse,
reparse, NoteData position/lane mapping, no-control behavior, generated header
and body output, multi-range source-lane merging, and support-lane expansion.
The exact evidence is recorded in
`../runtime-integration-prototype/music_score_header_text_conversion.json`.

## Remaining Boundary

- The normal Poppin' Shuffle Special and multi-range Miracle April Fool
  production charts are both field-closed against independent Bestdori
  oracles. Remaining work begins downstream at lane-change/additional-type
  consumers and endpoint-aware synchronization rather than score conversion.

## Reproduction

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path export_corrected_pipeline.py).Path) $((Resolve-Path .).Path)\decompiled" `
  ..\..\..\samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64

& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path export_helper_pipeline.py).Path) $((Resolve-Path .).Path)\decompiled_helpers" `
  ..\..\..\samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64

& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path export_header_pipeline.py).Path) $((Resolve-Path .).Path)\decompiled_header" `
  ..\..\..\samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64

& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path export_text_pipeline.py).Path) $((Resolve-Path .).Path)\decompiled_text" `
  ..\..\..\samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64

python validate_production_bms.py
python validate_production_habahiro_bms.py
```
