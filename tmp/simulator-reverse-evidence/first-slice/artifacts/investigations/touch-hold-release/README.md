# Touch Hold and Release

## Question

After a note owns a finger, how do moved and ended touches complete Long and Slide notes, including directional flicks, intermediate slide nodes, failed releases, and sound/effect cleanup?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

The Long/Slide hold and release section is recoverable to implementation level. Together with `../touch-note-arbitration/` and `../judgement-result-pipeline/`, the confirmed boundary now covers Unity touch begin, finger ownership, move tracking, synthetic and physical release, Long/Slide end judgement, `OneFrameData` production, frame aggregation, and outward callbacks.

The implementation is still reconstructed IL2CPP behavior, not original C#. Metadata supplies method names and signatures; corrected ARM64 ranges and Hex-Rays output supply control flow. Several private fields and note-type enum members retain semantic labels in `pipeline.pseudocode.cs`.

## Button Dispatch

`GamePlayButton.ExecTouchMoved` resolves the finger-owned note and ignores a deactivated note. It invokes the note's virtual `ExecTouchMoved` with the stored begin position, current position, `result = None`, and the button itself. Long and Slide therefore calculate their current release result internally while the finger moves.

`GamePlayButton.ExecTouchEnded` first animates the lane effect off. For a live owned note it calls `CalculateTouchEndedJudge`, then invokes the note's virtual `ExecTouchEnded` with the stored begin position, current position, result, and `JudgeTiming`.

For a non-Slide note, `CalculateTouchEndedJudge` uses the note information field at `+0x5C`, `NoteManager.GetAdjustMusicPos`, `InGameMusicScoreController.CurrentBPM`, and `NoteUtility.JudgeNote` with a one-frame sweet-window argument. For Slide it calls `SlideNoteManager.Judge(CurrentNote.VirtualPosY, out cursor)` and converts the cursor through `NoteUtility.CalculateSlideNoteJudgeTiming`.

## Long Move and Release

`NoteLong.ExecTouchMoved` branches on `InfoData.NoteType`:

| Type values | Move requirement | Emitted after-note type |
| --- | --- | --- |
| `1` | world-distance rate greater than `0.04` | `5` |
| `2`, `3` | required horizontal direction and horizontal rate greater than `0.01` | `6` |
| `4`, `5` | required direction plus a multiple-note-count-scaled distance | `7` |
| other | lane containment at physical release | `2` |

Types `2` and `4` require movement toward increasing screen X; types `3` and `5` require decreasing X. The multiple-direction threshold is `(multipleNoteCount - 1) * 0.01 + 0.01`, in addition to a base horizontal distance greater than `0.01`.

The move path repeatedly calls `GamePlayButton.CalculateTouchEndedJudge`. While no result exists it updates the cached touch origin. Lane containment is tested through `NoteUtility.IsInsideTargetNoteButtons`. A grace field is reset to `8.0` while inside and reduced by frame delta while outside. Completion requires a non-`None` result and positive remaining grace.

Once the movement requirement succeeds, the note records success and can invoke `GamePlayButton.ExecTouchEnded` synthetically. Multiple-direction Long notes also invoke the after-note virtual release before synthesizing the button end.

`NoteLong.ExecTouchEnded` activates then reserves shutdown of the center lane effect, calls `judgeAfterNote`, and fades the held sound. `judgeAfterNote` converts `None` to Miss, forces Miss when the move-success flag is clear, and permits force-perfect modes to override the raw result. It selects after-note type `2`, `5`, `6`, or `7`, builds `OneFrameData`, invokes the judgement callback, finishes the current note, and deactivates the Long instance.

## Slide Move

`NoteSlide.isIntermediateNote` is true only when the current note is a `NoteSlideAfter`-family object and its linked after-node reference is alive.

During a moved touch, an intermediate node calls `SlideNoteManager.Judge` against its current `VirtualPosY`. Accepted Perfect, or accepted Great under the active correction mode, marks and hides the node, writes an intermediate `OneFrameData` entry with game-note type `8`, and advances `CurrentNote`.

For an end node, the move path applies the same `8.0` in-lane grace mechanism as Long and separates note types:

| Type values | Move requirement | OneFrameData type |
| --- | --- | --- |
| `8` | movement rate greater than `0.04` | `5` |
| `9`, `10` | directional horizontal rate greater than `0.01` | `6` |
| `11`, `12` | directional multiple-count threshold | `7` |

Completion additionally requires a valid Slide result, the node at or before `SlideNoteManager.VirtualPerfectLine`, and positive grace. Success sets the move flag, emits `OneFrameData`, performs end-node animation/particle work, deactivates the Slide, and can synthesize `GamePlayButton.ExecTouchEnded`.

## Slide Release and Miss

On physical release, `NoteSlide.ExecTouchEnded` switches the lane effect from the prior target to the current target, fades the slide sound, and skips nodes already marked as consumed.

If the current node is an end note, it obtains the final result from `SlideNoteManager.Judge`, derives slide timing from the cursor, applies force-perfect overrides, calls `afterNoteJudge`, finishes/hides the node, and deactivates the Slide. `afterNoteJudge` maps source types `8`, `9/10`, and `11/12` to game-note types `5`, `6`, and `7`; other cases use type `8`. A missing move-success flag forces the result to Miss for the directional/end branches.

If release occurs without a valid end node, control reaches `onMiss`. It calculates miss damage, divides that damage by five for a non-end `NoteSlideAfter`, stops flash/slide particles when needed, emits the miss, hides the failed node, advances or deactivates the chain, and refreshes target buttons. The release path also clears the note finger owner back to `-1`.

## Slide Judge Table

`SlideNoteManager.Judge` is a separate function at `0x321E828-0x321E9E8`; it was previously hidden between two `NoteSlide` methods when methods were viewed owner-by-owner.

The manager retrieves a version/group-specific list of paired vertical judge records. It searches paired bands from the front and back until `VirtualPosY` lies between the pair's boundaries. It returns the result stored in the matched record and writes a cursor derived from the band's distance from the list center. With no matching band it returns `None` and cursor `0`.

## Confirmed Facts vs Inference

Confirmed:

- all 19 promoted functions match requested and actual IDA boundaries and decompile independently;
- button moved/ended virtual dispatch and release-result recalculation;
- Long and Slide distance constants `0.04`, `0.01`, and lane-grace reset `8.0`;
- directional X comparisons and multiple-count-scaled threshold;
- synthetic button-ended calls after successful moved-touch completion;
- Long after-note type mapping `2/5/6/7` and Slide end mapping `5/6/7/8`;
- Slide intermediate-node direct `OneFrameData` construction;
- non-end Slide-after miss damage division by five;
- sound fade, lane effect, hide/advance/deactivate, and finger-clear operations.

Inferred semantic labels:

- `EndJudgePos` for the note information field at offset `0x5C`;
- `moveGrace`, `moveSucceeded`, and the exact managed names of cached positions;
- user-facing names for numeric source note types `1-5` and `8-12`;
- the record/type names used by the paired vertical table inside `SlideNoteManager.Judge`.

## Boundary Correction

Owner-local metadata adjacency incorrectly suggested that `NoteSlide.isIntermediateNote` ended at `0x321E9E8`. Global RVA ordering proves that `SlideNoteManager.Judge @ 0x321E828-0x321E9E8` is interleaved there, so the corrected `isIntermediateNote` range is `0x321E76C-0x321E828`.

The shared exporter was also hardened for dense adjacent functions. It now establishes all target ownership before analysis, and if an unanalysed range cannot be added directly it accepts only an exact auto-created function or deletes the incorrect automatic range before retrying. This prevents `plan_and_wait` from merging neighboring helpers.

## Open Questions

- Recover the managed enum names for Long types `1-5`, Slide types `8-12`, and emitted game-note types `2/5/6/7/8`.
- Timeout-driven Long/Slide misses and standalone Flick moved paths are now recovered in `../timeout-flick-paths/`.
- Validate the `0.04`, `0.01`, grace, and simultaneous multiple-direction thresholds with a read-only runtime trace or harness.

## Reproduction

Run the corrected exporter against the version-matched database:

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\touch-hold-release\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\touch-hold-release).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```
