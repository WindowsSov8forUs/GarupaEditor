# Touch-to-Note Arbitration

## Question

How does a Unity touch become a lane press, acquire one playable note, and enter the note-specific judgement code before `NoteFrontBase.judgeFrontNote`?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

This input and arbitration section is recoverable to implementation level. The confirmed chain is:

```text
InputManager.ExecInput
  -> InputManager.inputPlaying
  -> InputManager.inputButton
  -> GamePlayButton.ExecTouchBegan
  -> NoteManager.GetMoveEndTimeNearestZeroNote
  -> NoteUtility.CalcNoteResultType
  -> NoteNormal/NoteLong/NoteSlide.ExecTouchBegan
  -> NoteFrontBase.judgeFrontNote or the slide-node OneFrameData path
```

Together with `../judgement-result-pipeline/`, this closes the ordinary touch-began path from Unity touch enumeration through candidate selection, timing calculation, per-note judgement, frame aggregation, record mutation, sound, and callbacks.

The Long/Slide moved and ended continuation is recovered in `../touch-hold-release/`.

It is not original C# recovery. Names and signatures come from IL2CPP metadata; control flow comes from corrected ARM64 function boundaries and Hex-Rays output. Helper names used in the pseudocode are semantic labels where a managed field or callee name has not yet been recovered.

## Input Dispatch

`InputManager.ExecInput` sends game states `5` and `17` to `inputPlaying` when at least one Unity touch exists. States `4`, `7`, and `15` dispatch to other input-mode handlers outside this investigation.

`inputPlaying` iterates the Unity touch array and reads each touch's `fingerId`, `phase`, and position. On phase `0` (`Began`) it resolves a `GamePlayButton`, stores the button association in a finger-indexed array, and resolves the button to receive the event. Phases `1`, `2`, and `3` reuse the stored association. `inputButton` then performs virtual dispatch:

| Touch phase | Virtual target |
| --- | --- |
| `0` | `ButtonBase.ExecTouchBegan` |
| `1`, `2` | `ButtonBase.ExecTouchMoved` |
| `3` | `ButtonBase.ExecTouchEnded` |

The Unity-object validity check is performed before the virtual call.

## Candidate Arbitration

`GamePlayButton.ExecTouchBegan` returns immediately under AutoPlay. Otherwise it enables lane-touch feedback, increments the tap-effect count, and asks `NoteManager.GetMoveEndTimeNearestZeroNote(buttonType)` for one candidate.

The note manager scans the active-note list at manager offset `0x38`. Every candidate must first pass `NoteBase.IsContainsButton(note, buttonType)`, which is the confirmed wide-lane/covered-button filter.

Non-slide candidates are compared by the absolute distance between `InfoData.AbsolutePos` and the current music position. Slide candidates are compared using their current slide node and `SlideNoteManager.GetNearJudgeLineNote`. If both categories produce a candidate, the manager compares their near-judge-line positions once more and keeps one.

The chosen note is accepted only if it currently has a non-`None` result. Ordinary notes are checked through `NoteUtility.CalcNoteResultType`; the slide-special branch calls `SlideNoteManager.Judge(CurrentNote.VirtualPosY, out cursor)` directly. A `None` result turns the return value into null.

## Finger Ownership

`GamePlayButton.ExecTouchBegan` recalculates the selected note's result and `JudgeTiming`, then checks the note's signed field at offset `0xC0`. A negative value means the note is not owned by another finger.

For an unowned note it stores the touch start position by `fingerId`, writes `fingerId` to the note, records the finger-to-note association, resolves that association, and invokes the note's virtual `ExecTouchBegan(inputPos, result, judgeTiming)`. Long and slide instances additionally set the button's touch state to `2`.

If no candidate exists, the timing result is `None`, or the binding must be cleared, the button removes the finger-to-note association and plays empty-tap feedback for the supported finger range. An already-owned note is not reassigned.

## Note Entry Differences

`NoteNormal.ExecTouchBegan` is only `0x84` bytes. Its exact ARM64 range confirms that a non-`None` result sets a byte in `InfoData`, calls `judgeFrontNote` with note type `0`, and tail-dispatches a post-judge virtual method. Hex-Rays returns no cfunc for this valid range, so the promoted evidence is assembly rather than merged pseudocode.

`NoteLong.ExecTouchBegan` ignores `None`, diverts result `0` to a separate long-note miss path, and rejects a duplicate begin when its internal state is already `2`. It stores the touch position, prepares hold state, calls `judgeFrontNote` with note type `4`, then changes the note touch state to `2`.

`NoteSlide.ExecTouchBegan` is structurally different. One branch calls `judgeFrontNote` with note type `8`, changes state to `2`, selects feedback according to current-node subtype, and advances slide state. Other current-node branches derive node geometry and subtype, call `OneFrameData.Setup` directly with note type `6`, `7`, or `8`, invoke the judgement callback, mark the node, and advance the slide. Slide input therefore does not always pass through `judgeFrontNote` for every intermediate node, although it preserves the same `OneFrameData` contract recovered in the judgement investigation.

## Confirmed Facts vs Inference

Confirmed:

- all eight promoted functions start and end at the requested metadata-adjacent addresses;
- touch phases and their three virtual button entry points;
- finger-indexed button reuse after `Began`;
- `IsContainsButton` filtering, ordinary-vs-slide candidate buckets, and final `None` rejection;
- the signed note ownership check and `fingerId` write at offset `0xC0`;
- Normal, Long, and Slide use judge-note types `0`, `4`, and `8` on their front-judge paths;
- the slide-node branch directly constructs `OneFrameData` with types `6`, `7`, or `8`.

Inferred semantic labels:

- the exact managed names of the finger-indexed button/note arrays and the button state at offset `0x74`;
- the purpose of Normal's `InfoData + 0x14` byte beyond it being set before judgement;
- the user-facing enum names for slide node types `6`, `7`, and `8`;
- helper names such as `PlayEmptyTapFeedback` and `AdvanceSlideState` in `pipeline.pseudocode.cs`.

## Open Questions

- Recover the exact tie behavior when two simultaneous candidates have equal judge-line distance.
- Name the finger association fields and slide node subtype enums from type-layout evidence.
- Validate multi-touch, wide notes, and simultaneous notes with a read-only runtime trace or a standalone harness.

## Evidence Notes

The previous global decompile bundle merged code beyond several real functions. The corrected boundaries stop `NoteLong.ExecTouchBegan` at `playFlashAnimation @ 0x30EC03C`, `NoteSlide.ExecTouchBegan` at `checkEndNote @ 0x321D084`, and `GetMoveEndTimeNearestZeroNote` at `NoteUtility.CalcNoteResultType @ 0x3778260`.

`decompiled/status.tsv` records requested and actual boundaries. Seven functions decompile independently. `NoteNormal.ExecTouchBegan` retains its failed cfunc marker and an exact instruction export, making the failure explicit without losing behavioral evidence.

## Reproduction

Run the boundary exporter against the version-matched IDA database:

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\touch-note-arbitration\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\touch-note-arbitration).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```

An exit code of `1` is expected while the valid Normal range remains an assembly fallback; boundary mismatch and exporter exceptions are reported separately.
